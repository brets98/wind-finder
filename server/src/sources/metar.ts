import { distanceKm } from '../domain/geo.js';
import { boundingBox, fetchJson, num } from './http.js';
import type { StationAdapter, StationCheck, StationInfo, StationReading } from './types.js';

/**
 * Airport weather reports (METAR) from NOAA's Aviation Weather Center
 * (https://aviationweather.gov/data/api/), US government data in the public domain, no key.
 * Italian airports report every 30 minutes: wind in knots and degrees, gusts only when
 * significant, "VRB" (variable, stored as a null direction) in light winds. 7 days of history.
 * Station ids are ICAO codes (e.g. LIPZ, Venice). The service asks for at most 100 requests
 * a minute and a descriptive User-Agent (`fetchJson` sends it).
 */
const BASE_URL = 'https://aviationweather.gov/api/data';
const MAX_HISTORY_HOURS = 168;
/** Reports of the last hours checked to tell a working station */
const CHECK_HOURS = 3;

interface Metar {
  icaoId: string;
  obsTime: number;
  wdir?: number | string | null;
  wspd?: number | null;
  wgst?: number | null;
  lat: number;
  lon: number;
  name?: string;
}

interface StationInfoResponse {
  icaoId: string | null;
  site: string;
  lat: number;
  lon: number;
  siteType?: string[];
}

const reading = (m: Metar): StationReading => ({
  time: new Date(m.obsTime * 1000).toISOString(),
  wind: num(m.wspd),
  gust: num(m.wgst),
  dir: typeof m.wdir === 'number' ? m.wdir : null,
});

/** "Venice/Polo Arpt, VE, IT" → "Venice/Polo Arpt (METAR LIPZ)" */
const stationName = (m: Pick<Metar, 'icaoId' | 'name'>) =>
  `${(m.name ?? m.icaoId).split(',')[0].trim()} (METAR ${m.icaoId})`;

export function createMetar(): StationAdapter {
  async function reports(stationId: string, hours: number): Promise<Metar[]> {
    const query = new URLSearchParams({
      ids: stationId.toUpperCase(),
      format: 'json',
      hours: String(Math.min(MAX_HISTORY_HOURS, Math.max(1, Math.ceil(hours)))),
    });
    const { status, body } = await fetchJson<Metar[] | null>('metar', `${BASE_URL}/metar?${query}`);
    if (status === 204 || body === null) return [];
    if (status !== 200 || !Array.isArray(body)) throw new Error(`metar: HTTP ${status}`);
    return [...body].sort((a, b) => a.obsTime - b.obsTime);
  }

  async function check(stationId: string): Promise<StationCheck> {
    let list: Metar[];
    try {
      list = await reports(stationId, CHECK_HOURS);
    } catch {
      return { usable: false, reason: 'error' };
    }
    const last = list.at(-1);
    if (!last) return { usable: false, reason: 'no_data' };
    const station: StationInfo = {
      source: 'metar',
      stationId: last.icaoId,
      name: stationName(last),
      lat: last.lat,
      lon: last.lon,
    };
    const latest = reading(last);
    // A light variable wind ("VRB") has no direction: the anemometer still works if any recent
    // report has one, or the wind is calm
    const hasDirection = list.some((m) => typeof m.wdir === 'number');
    if (latest.wind === null || !hasDirection) {
      return { usable: false, reason: 'no_wind', station, latest };
    }
    return { usable: true, station, latest };
  }

  async function history(stationId: string, from: Date, to: Date) {
    const list = await reports(stationId, (Date.now() - from.getTime()) / 3_600_000 + 1);
    if (list.length === 0) return null;
    return list
      .filter((m) => m.obsTime * 1000 >= from.getTime() && m.obsTime * 1000 < to.getTime())
      .map(reading);
  }

  async function nearby(point: { lat: number; lon: number }, radiusKm: number) {
    const b = boundingBox(point, radiusKm);
    const query = new URLSearchParams({
      bbox: [b.minLat, b.minLon, b.maxLat, b.maxLon].map((v) => v.toFixed(3)).join(','),
      format: 'json',
    });
    const { status, body } = await fetchJson<StationInfoResponse[] | null>(
      'metar',
      `${BASE_URL}/stationinfo?${query}`,
    );
    if (status !== 200 || !Array.isArray(body)) return [];
    return body
      .filter((s) => s.icaoId && s.siteType?.includes('METAR'))
      .filter((s) => distanceKm(point, s) <= radiusKm)
      .map((s): StationInfo => ({
        source: 'metar',
        stationId: s.icaoId!,
        name: stationName({ icaoId: s.icaoId!, name: s.site }),
        lat: s.lat,
        lon: s.lon,
      }));
  }

  return { check, history, nearby };
}
