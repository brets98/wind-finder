import { fetchJson, num, RateLimiter, toKnots } from './http.js';
import type { StationCheck, StationReading } from './types.js';

/**
 * MeteoNetwork (https://www.meteonetwork.it), Italian amateur station network, data under
 * CC-BY 4.0. API v3 with a free STANDARD token (`METEONETWORK_TOKEN`, from POST /v3/login; it
 * never expires). With that token there is no search by position and no history (both need a
 * BULK token): the admin enters a station code, and the app keeps its own readings.
 *
 * Limits: 1 request per second, one at a time; data-realtime at most 5 requests per minute.
 */
const BASE_URL = 'https://api.meteonetwork.it/v3';

interface Realtime {
  observation_time_utc?: string;
  name?: string;
  station_code?: string;
  latitude?: string;
  longitude?: string;
  wind_speed?: string | null;
  wind_gust?: string | null;
  wind_direction_degree?: string | number | null;
}

interface ErrorBody {
  error?: boolean;
  status_code?: number;
  message?: string;
}

/** "2020-06-22 08:29:00" (UTC) → ISO */
const utc = (time: string) => new Date(`${time.replace(' ', 'T')}Z`).toISOString();

/**
 * The station's latest reading. "No results" (code 204, also returned when the station's
 * license doesn't allow distributing its data) means the station is not usable, not an error.
 *
 * Wind speeds are in km/h (to be confirmed against real data once a token is available).
 */
export function createMeteoNetwork(
  token: string | undefined,
  limiter = new RateLimiter(5, 60_000),
) {
  async function check(stationId: string): Promise<StationCheck> {
    if (!token) return { usable: false, reason: 'error' };
    let response;
    try {
      response = await limiter.run(() =>
        fetchJson<Realtime[] | ErrorBody>(
          'meteonetwork',
          `${BASE_URL}/data-realtime/${encodeURIComponent(stationId)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );
    } catch {
      return { usable: false, reason: 'error' };
    }
    const { status, body } = response;

    const error = !Array.isArray(body) ? body : null;
    if (status === 204 || error?.status_code === 204 || (Array.isArray(body) && !body.length)) {
      return { usable: false, reason: 'not_available' };
    }
    if (status !== 200 || error?.error || !Array.isArray(body)) {
      return { usable: false, reason: 'error' };
    }

    const r = body[0];
    const lat = num(r.latitude);
    const lon = num(r.longitude);
    if (lat === null || lon === null || !r.observation_time_utc) {
      return { usable: false, reason: 'no_data' };
    }
    const station = {
      source: 'meteonetwork' as const,
      stationId: r.station_code ?? stationId,
      name: r.name ?? stationId,
      lat,
      lon,
    };
    const speed = num(r.wind_speed);
    const gust = num(r.wind_gust);
    const latest: StationReading = {
      time: utc(r.observation_time_utc),
      wind: speed === null ? null : toKnots.fromKmh(speed),
      gust: gust === null ? null : toKnots.fromKmh(gust),
      dir: num(r.wind_direction_degree),
    };
    if (latest.wind === null || latest.dir === null) {
      return { usable: false, reason: 'no_wind', station, latest };
    }
    return { usable: true, station, latest };
  }

  return { configured: Boolean(token), check };
}

export type MeteoNetwork = ReturnType<typeof createMeteoNetwork>;
