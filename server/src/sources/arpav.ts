import { distanceKm } from '../domain/geo.js';
import { fetchText, num } from './http.js';
import type { StationAdapter, StationCheck, StationInfo, StationReading } from './types.js';

/**
 * ARPAV, the Veneto regional environmental agency: its meteorological stations as public XML
 * files (https://meteo.arpa.veneto.it/?page=xml), data under CC BY 4.0 (as stated in each
 * file), no key. One file per station with the last ~2 days every 30 minutes; wind speed
 * (`VVENTO`, m/s, at 10 m) and direction (`DVENTO`), no gusts. Data are not validated.
 * Times are in "solar time" (UTC+1 all year). Files are ISO-8859-1. Station ids are ARPAV's
 * `IDSTAZ` (e.g. 168, Chioggia - Sant'Anna).
 */
const BASE_URL = 'https://meteo.arpa.veneto.it/meteo/dati_meteo/xml';
/** The station list changes rarely: reloaded once a day. */
const LIST_TTL_MS = 24 * 60 * 60 * 1000;

const tag = (xml: string, name: string) =>
  xml
    .match(new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`))?.[1]
    ?.trim();

/** "202610291100" in solar time (UTC+1) → ISO UTC */
function instant(value: string): string {
  const [y, mo, d, h, mi] = [0, 4, 6, 8, 10].map((i, k) => Number(value.slice(i, i + (k ? 2 : 4))));
  return new Date(Date.UTC(y, mo - 1, d, h - 1, mi)).toISOString();
}

/** A sensor's values by instant, for the sensor of `type` (e.g. VVENTO). */
function sensor(xml: string, type: string): Map<string, number | null> | null {
  const block = xml
    .split('<SENSORE>')
    .slice(1)
    .find((s) => tag(s, 'TYPE') === type);
  if (!block) return null;
  const values = new Map<string, number | null>();
  for (const m of block.matchAll(/<DATI ISTANTE="(\d{12})"><VM>([^<]*)<\/VM>/g)) {
    values.set(instant(m[1]), num(m[2]));
  }
  return values;
}

const msToKnots = (ms: number) => Math.round(ms * 1.943844 * 10) / 10;

export function createArpav(): StationAdapter {
  let list: { at: number; stations: (StationInfo & { file: string })[] } | null = null;

  async function stations() {
    if (list && Date.now() - list.at < LIST_TTL_MS) return list.stations;
    const { status, text } = await fetchText('arpav', `${BASE_URL}/stazioni.xml`, {
      encoding: 'iso-8859-1',
    });
    if (status !== 200) throw new Error(`arpav: station list HTTP ${status}`);
    const parsed = text
      .split('<STAZIONE>')
      .slice(1)
      .flatMap((block) => {
        const id = tag(block, 'IDSTAZ');
        const lat = num(tag(block, 'Y'));
        const lon = num(tag(block, 'X'));
        const file = tag(block, 'LINKSTAZ');
        if (!id || lat === null || lon === null || !file) return [];
        return [
          {
            source: 'arpav' as const,
            stationId: id,
            name: tag(block, 'NOME') ?? id,
            lat,
            lon,
            file,
          },
        ];
      });
    list = { at: Date.now(), stations: parsed };
    return parsed;
  }

  /** Every wind reading in the station's file (about 2 days), oldest first. */
  async function readings(stationId: string) {
    const station = (await stations()).find((s) => s.stationId === stationId);
    if (!station) return null;
    const { status, text } = await fetchText('arpav', `${BASE_URL}/${station.file}`, {
      encoding: 'iso-8859-1',
    });
    if (status !== 200) throw new Error(`arpav: HTTP ${status}`);
    const speed = sensor(text, 'VVENTO');
    const dir = sensor(text, 'DVENTO');
    const info: StationInfo = {
      source: 'arpav',
      stationId,
      name: station.name,
      lat: station.lat,
      lon: station.lon,
    };
    if (!speed) return { info, readings: [] as StationReading[], hasWind: false };
    const list: StationReading[] = [...speed]
      .map(([time, ms]) => ({
        time,
        wind: ms === null ? null : msToKnots(ms),
        gust: null,
        dir: dir?.get(time) ?? null,
      }))
      .sort((a, b) => a.time.localeCompare(b.time));
    return { info, readings: list, hasWind: true };
  }

  async function check(stationId: string): Promise<StationCheck> {
    try {
      const result = await readings(stationId);
      if (!result) return { usable: false, reason: 'not_available' };
      const latest = result.readings.findLast((r) => r.wind !== null);
      if (!result.hasWind) return { usable: false, reason: 'no_wind', station: result.info };
      if (!latest) return { usable: false, reason: 'no_data', station: result.info };
      if (latest.dir === null)
        return { usable: false, reason: 'no_wind', station: result.info, latest };
      return { usable: true, station: result.info, latest };
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
    return (await stations())
      .filter((s) => distanceKm(point, s) <= radiusKm)
      .map(({ file: _file, ...info }) => info);
  }

  return { check, history, nearby };
}
