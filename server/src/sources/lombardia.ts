import { distanceKm } from '../domain/geo.js';
import { fetchJson, num, solarToUtc, toKnots, utcToSolar } from './http.js';
import type { StationAdapter, StationCheck, StationInfo, StationReading } from './types.js';

/**
 * ARPA Lombardia's weather sensors on Open Data Lombardia (Socrata API), public domain (CC0).
 * The registry (`nf78-nj6b`) lists each sensor with its station and position; the data
 * (`647i-nhxk`) holds the current month's readings every 10 minutes, in solar time (UTC+1
 * all year). Wind: "Velocità Vento" (m/s; operator 1 = mean, 3 = maximum, i.e. the gust)
 * and "Direzione Vento" (degrees; 777/7777 = calm, 888/8888 = variable). -9999 = missing;
 * states VA/VV are valid, the others are dropped. Station ids are the registry's
 * `idstazione` (573 = Colico, Lake Como).
 *
 * Anonymous requests are throttled quickly, so requests are few: the registry is cached for a
 * day, and station checks share one request for the last 3 hours of every wind sensor, reused
 * for 5 minutes. A free app token (`LOMBARDIA_APP_TOKEN`, from an Open Data Lombardia account)
 * adds headroom.
 */
const BASE_URL = 'https://www.dati.lombardia.it/resource';
const REGISTRY = 'nf78-nj6b';
const DATA = '647i-nhxk';
const LIST_TTL_MS = 24 * 60 * 60 * 1000;
const CHECK_HOURS = 3;
/** The last hours of every wind sensor are fetched in one request and reused this long. */
const RECENT_TTL_MS = 5 * 60 * 1000;

interface Sensor {
  idsensore: string;
  tipologia: string;
  idstazione: string;
  nomestazione: string;
  lat: string;
  lng: string;
}

interface Row {
  idsensore: string;
  data: string;
  valore: string;
  idoperatore: string;
  stato: string;
}

interface Station extends StationInfo {
  speedSensor: string;
  dirSensor: string | null;
}

const MISSING = new Set([-9999]);
const CALM_OR_VARIABLE = new Set([777, 7777, 888, 8888]);
const VALID = new Set(['VA', 'VV']);

export function createLombardia(appToken?: string): StationAdapter & { configured: boolean } {
  let list: { at: number; stations: Station[] } | null = null;
  let recent: { at: number; rows: Promise<Row[]> } | null = null;

  async function query<T>(dataset: string, params: Record<string, string>) {
    const { status, body } = await fetchJson<T>(
      'lombardia',
      `${BASE_URL}/${dataset}.json?${new URLSearchParams(params)}`,
      { headers: appToken ? { 'X-App-Token': appToken } : {} },
    );
    if (status !== 200) throw new Error(`lombardia: HTTP ${status}`);
    return body;
  }

  async function stations() {
    if (list && Date.now() - list.at < LIST_TTL_MS) return list.stations;
    const sensors = await query<Sensor[]>(REGISTRY, {
      $where: "storico='N' AND tipologia in('Velocità Vento','Direzione Vento')",
      $limit: '2000',
    });
    const byStation = new Map<string, Station>();
    for (const s of sensors) {
      const lat = num(s.lat);
      const lon = num(s.lng);
      if (lat === null || lon === null) continue;
      const station = byStation.get(s.idstazione) ?? {
        source: 'lombardia' as const,
        stationId: s.idstazione,
        name: s.nomestazione,
        lat,
        lon,
        speedSensor: '',
        dirSensor: null,
      };
      if (s.tipologia === 'Velocità Vento') station.speedSensor = s.idsensore;
      else station.dirSensor = s.idsensore;
      byStation.set(s.idstazione, station);
    }
    const parsed = [...byStation.values()].filter((s) => s.speedSensor);
    list = { at: Date.now(), stations: parsed };
    return parsed;
  }

  /** Rows of the given sensors from `from` (only the current month is available). */
  function rowsOf(sensorIds: string[], from: Date, limit: number) {
    return query<Row[]>(DATA, {
      $where: `idsensore in(${sensorIds.map((id) => `'${id}'`).join(',')}) AND data >= '${utcToSolar(from)}'`,
      $order: 'data',
      $limit: String(limit),
    });
  }

  /** The last hours of every wind sensor, shared by all checks for 5 minutes. */
  async function recentRows() {
    if (!recent || Date.now() - recent.at > RECENT_TTL_MS) {
      const all = await stations();
      const ids = all.flatMap((s) =>
        [s.speedSensor, s.dirSensor].filter((id): id is string => !!id),
      );
      const rows = rowsOf(ids, new Date(Date.now() - CHECK_HOURS * 3_600_000), 50_000);
      recent = { at: Date.now(), rows };
      rows.catch(() => {
        recent = null;
      });
    }
    return recent.rows;
  }

  /**
   * The station's wind readings: the last hours from the shared request (`'recent'`), or
   * from an instant with a request of its own.
   */
  async function readings(stationId: string, from: Date | 'recent') {
    const station = (await stations()).find((s) => s.stationId === stationId);
    if (!station) return null;
    const ids = [station.speedSensor, station.dirSensor].filter((id): id is string => !!id);
    const rows =
      from === 'recent'
        ? (await recentRows()).filter((r) => ids.includes(r.idsensore))
        : await rowsOf(ids, from, 5000);
    const byTime = new Map<string, StationReading>();
    for (const r of rows) {
      const value = num(r.valore);
      if (value === null || MISSING.has(value) || !VALID.has(r.stato)) continue;
      const time = solarToUtc(r.data);
      const reading = byTime.get(time) ?? { time, wind: null, gust: null, dir: null };
      if (r.idsensore === station.speedSensor) {
        if (r.idoperatore === '3') reading.gust = toKnots.fromMs(value);
        else reading.wind = toKnots.fromMs(value);
      } else if (r.idoperatore !== '3' && !CALM_OR_VARIABLE.has(value)) {
        // Direction comes with operator 3 too (with the gust): keep the mean direction only
        reading.dir = value;
      }
      byTime.set(time, reading);
    }
    const info: StationInfo = {
      source: 'lombardia',
      stationId,
      name: station.name,
      lat: station.lat,
      lon: station.lon,
    };
    return {
      info,
      readings: [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time)),
    };
  }

  async function check(stationId: string): Promise<StationCheck> {
    try {
      const result = await readings(stationId, 'recent');
      if (!result) return { usable: false, reason: 'not_available' };
      const latest = result.readings.findLast((r) => r.wind !== null);
      if (!latest) return { usable: false, reason: 'no_data', station: result.info };
      // Calm or variable leaves no direction: the vane works if a recent reading has one
      if (!result.readings.some((r) => r.dir !== null)) {
        return { usable: false, reason: 'no_wind', station: result.info, latest };
      }
      return { usable: true, station: result.info, latest };
    } catch {
      return { usable: false, reason: 'error' };
    }
  }

  async function history(stationId: string, from: Date, to: Date) {
    const result = await readings(stationId, from);
    if (!result) return null;
    return result.readings.filter((r) => Date.parse(r.time) < to.getTime());
  }

  async function nearby(point: { lat: number; lon: number }, radiusKm: number) {
    return (await stations())
      .filter((s) => distanceKm(point, s) <= radiusKm)
      .map(({ speedSensor: _s, dirSensor: _d, ...info }) => info);
  }

  return { configured: Boolean(appToken), check, history, nearby };
}
