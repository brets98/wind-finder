import { distanceKm } from '../domain/geo.js';
import { fetchText, num, solarToUtc, toKnots } from './http.js';
import type { StationAdapter, StationCheck, StationInfo, StationReading } from './types.js';

/**
 * Meteotrentino (Provincia autonoma di Trento): its automatic stations' recent data, open
 * under CC BY 4.0 (dataset "Dati recenti delle stazioni meteorologiche automatiche" on
 * dati.trentino.it), no key. `listaStazioni` lists every station (closed ones have a `fine`
 * date); `ultimiDatiStazione?codice=T0193` gives a station's data since midnight of the day
 * before: wind every 15 minutes, mean `v` and maximum `vmax` (the gust) in m/s, direction `d`
 * in degrees. Times are in solar time (UTC+1 all year). Not validated. Station ids are the
 * codes (T0193 = Torbole, Lake Garda).
 */
const BASE_URL = 'https://dati.meteotrentino.it/service.asmx';
const LIST_TTL_MS = 24 * 60 * 60 * 1000;

const tag = (xml: string, name: string) =>
  xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim();

export function createMeteotrentino(): StationAdapter {
  let list: { at: number; stations: StationInfo[] } | null = null;

  async function stations() {
    if (list && Date.now() - list.at < LIST_TTL_MS) return list.stations;
    const { status, text } = await fetchText('meteotrentino', `${BASE_URL}/listaStazioni`);
    if (status !== 200) throw new Error(`meteotrentino: station list HTTP ${status}`);
    const parsed = [...text.matchAll(/<anagrafica>([\s\S]*?)<\/anagrafica>/g)].flatMap(
      ([, block]) => {
        const code = tag(block, 'codice');
        const lat = num(tag(block, 'latitudine'));
        const lon = num(tag(block, 'longitudine'));
        // Closed stations have an end date
        if (!code || lat === null || lon === null || tag(block, 'fine')) return [];
        return [
          {
            source: 'meteotrentino' as const,
            stationId: code,
            name: tag(block, 'nome') ?? code,
            lat,
            lon,
          },
        ];
      },
    );
    list = { at: Date.now(), stations: parsed };
    return parsed;
  }

  async function readings(stationId: string) {
    const station = (await stations()).find((s) => s.stationId === stationId);
    if (!station) return null;
    const { status, text } = await fetchText(
      'meteotrentino',
      `${BASE_URL}/ultimiDatiStazione?codice=${encodeURIComponent(stationId)}`,
    );
    if (status !== 200) throw new Error(`meteotrentino: HTTP ${status}`);
    const winds = text.match(/<venti>([\s\S]*?)<\/venti>/)?.[1];
    if (!winds) return { station, readings: [] as StationReading[], hasWind: false };
    const list = [...winds.matchAll(/<vento_al_suolo[^>]*>([\s\S]*?)<\/vento_al_suolo>/g)].flatMap(
      ([, block]) => {
        const time = tag(block, 'data');
        if (!time) return [];
        const v = num(tag(block, 'v'));
        const vmax = num(tag(block, 'vmax'));
        return [
          {
            time: solarToUtc(time),
            wind: v === null ? null : toKnots.fromMs(v),
            gust: vmax === null ? null : toKnots.fromMs(vmax),
            dir: num(tag(block, 'd')),
          },
        ];
      },
    );
    list.sort((a, b) => a.time.localeCompare(b.time));
    return { station, readings: list, hasWind: true };
  }

  async function check(stationId: string): Promise<StationCheck> {
    try {
      const result = await readings(stationId);
      if (!result) return { usable: false, reason: 'not_available' };
      if (!result.hasWind) return { usable: false, reason: 'no_wind', station: result.station };
      const latest = result.readings.findLast((r) => r.wind !== null);
      if (!latest) return { usable: false, reason: 'no_data', station: result.station };
      if (latest.dir === null) {
        return { usable: false, reason: 'no_wind', station: result.station, latest };
      }
      return { usable: true, station: result.station, latest };
    } catch {
      return { usable: false, reason: 'error' };
    }
  }

  async function history(stationId: string, from: Date, to: Date) {
    const result = await readings(stationId);
    if (!result) return null;
    return result.readings.filter((r) => {
      const t = Date.parse(r.time);
      return t >= from.getTime() && t < to.getTime();
    });
  }

  async function nearby(point: { lat: number; lon: number }, radiusKm: number) {
    return (await stations()).filter((s) => distanceKm(point, s) <= radiusKm);
  }

  return { check, history, nearby };
}
