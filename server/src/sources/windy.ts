import { fetchJson, SourceError, toKnots } from './http.js';
import type { StationCheck, StationInfo, StationReading } from './types.js';

/**
 * Windy Stations API v2 (https://stations.windy.com), with a free API key (`WINDY_API_KEY`).
 * Only personal stations their owners share under an open license are reachable; observations
 * go back at most 7 days. Speeds come in m/s, times in milliseconds.
 *
 * The open-data list has no search by position, only pages of the whole catalogue: the app
 * keeps the Italian part of it in the database (`windyStations`) and filters by distance there.
 * Never use Windy's Point Forecast API (its free key returns random data).
 */
const BASE_URL = 'https://stations.windy.com/api/v2/opendata';
/** History Windy serves, minus a margin (it refuses a start exactly 7 days ago). */
const MAX_HISTORY_MS = 7 * 24 * 60 * 60 * 1000 - 10 * 60 * 1000;

interface StationModel {
  id: string;
  name: string;
  lat: number;
  lon: number;
  is_online?: boolean;
  last_observation_time?: string;
}

interface ListResponse {
  data: StationModel[];
  pagination: { page: number; totalPages: number };
}

interface ObservationResponse {
  header: StationModel;
  data?: { ts: number[]; wind?: number[]; wind_gust?: number[]; wind_dir?: number[] };
}

export interface WindyStationSummary extends StationInfo {
  online: boolean;
}

const info = (s: StationModel): StationInfo => ({
  source: 'windy',
  stationId: s.id,
  name: s.name,
  lat: s.lat,
  lon: s.lon,
});

export function createWindy(apiKey: string | undefined) {
  async function get<T>(path: string) {
    if (!apiKey) throw new SourceError('windy', 0, 'WINDY_API_KEY is not set');
    const { status, body } = await fetchJson<T>('windy', `${BASE_URL}${path}`, {
      headers: { 'windy-api-key': apiKey },
    });
    return { status, body };
  }

  /** One page (zero-based) of the open-data catalogue. */
  async function listPage(page: number) {
    const { status, body } = await get<ListResponse>(`/station?page=${page}`);
    if (status !== 200 || !Array.isArray(body?.data)) {
      throw new SourceError('windy', status, `station list HTTP ${status}`);
    }
    return {
      stations: body.data.map((s): WindyStationSummary => ({
        ...info(s),
        online: s.is_online ?? false,
      })),
      totalPages: body.pagination?.totalPages ?? 0,
    };
  }

  /**
   * Readings from `from`, oldest first; the latest only without it. Windy refuses a start
   * 7 days ago or more, so an older one is moved just inside the limit.
   */
  async function observations(stationId: string, from?: Date, now = new Date()) {
    const earliest = now.getTime() - MAX_HISTORY_MS;
    const query = from
      ? `fromTs=${Math.floor(Math.max(from.getTime(), earliest) / 1000)}`
      : 'latestLimit=1';
    const { status, body } = await get<ObservationResponse>(
      `/station/${encodeURIComponent(stationId)}/observation?${query}`,
    );
    if (status === 403 || status === 404) return null;
    if (status !== 200 || !body?.header) {
      throw new SourceError('windy', status, `observations HTTP ${status}`);
    }
    const d = body.data;
    const readings: StationReading[] = (d?.ts ?? []).map((ts, i) => ({
      time: new Date(ts).toISOString(),
      wind: d?.wind?.[i] == null ? null : toKnots.fromMs(d.wind[i]),
      gust: d?.wind_gust?.[i] == null ? null : toKnots.fromMs(d.wind_gust[i]),
      dir: d?.wind_dir?.[i] ?? null,
    }));
    readings.sort((a, b) => a.time.localeCompare(b.time));
    return { station: info(body.header), readings };
  }

  async function check(stationId: string): Promise<StationCheck> {
    try {
      const result = await observations(stationId);
      if (!result) return { usable: false, reason: 'not_available' };
      const latest = result.readings.at(-1);
      if (!latest) return { usable: false, reason: 'no_data', station: result.station };
      if (latest.wind === null || latest.dir === null) {
        return { usable: false, reason: 'no_wind', station: result.station, latest };
      }
      return { usable: true, station: result.station, latest };
    } catch {
      return { usable: false, reason: 'error' };
    }
  }

  async function history(stationId: string, from: Date, to: Date) {
    const result = await observations(stationId, from);
    if (!result) return null;
    return result.readings.filter((r) => {
      const t = Date.parse(r.time);
      return t >= from.getTime() && t < to.getTime();
    });
  }

  return { configured: Boolean(apiKey), listPage, observations, check, history };
}

export type Windy = ReturnType<typeof createWindy>;
