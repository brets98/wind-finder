import { fetchJson, num, SourceError } from './http.js';
import type { Forecast, MarineForecast, Value } from './types.js';

/**
 * Open-Meteo (https://open-meteo.com), free for non-commercial use, no key.
 * Several models are requested in one call and kept separate: the response names each
 * variable `<variable>_<model>`. A model whose domain doesn't cover the point is left out of
 * the response or comes back all null, which `probeModels()` uses to pick a spot's models.
 */

export type ModelGroup = 'high_res' | 'global';

/** Candidate models, checked against the API on 2026-10-29. */
export const FORECAST_MODELS = [
  { id: 'italia_meteo_arpae_icon_2i', group: 'high_res' }, // ~2 km, 3 days, Italy
  { id: 'meteofrance_arome_france_hd', group: 'high_res' }, // 1.5 km, ~2 days, France & surroundings
  { id: 'icon_d2', group: 'high_res' }, // ~2 km, ~2 days, Central Europe
  { id: 'meteoswiss_icon_ch1', group: 'high_res' }, // ~1 km, ~1.5 days, Alps (northern lakes)
  { id: 'ecmwf_ifs', group: 'global' }, // IFS HRES 9 km, 15 days
  { id: 'gfs_seamless', group: 'global' }, // GFS, 16 days
] as const satisfies readonly { id: string; group: ModelGroup }[];

export type ForecastModel = (typeof FORECAST_MODELS)[number]['id'];

export function modelGroup(model: string): ModelGroup | undefined {
  return FORECAST_MODELS.find((m) => m.id === model)?.group;
}

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';

export const FORECAST_DAYS = 7;
const WIND_VARIABLES = ['wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m'] as const;

interface HourlyResponse {
  error?: boolean;
  reason?: string;
  hourly?: { time: number[] } & Record<string, Value[] | number[]>;
}

type Point = { lat: number; lon: number };

/** One call for one or more points; Open-Meteo answers an array, in order, for several. */
async function getHourly(url: string, points: Point[], params: Record<string, string | number>) {
  const query = new URLSearchParams(
    Object.entries({
      latitude: points.map((p) => p.lat).join(','),
      longitude: points.map((p) => p.lon).join(','),
      ...params,
      timeformat: 'unixtime',
      timezone: 'GMT',
    }).map(([k, v]) => [k, String(v)]),
  );
  const { status, body } = await fetchJson<HourlyResponse | HourlyResponse[]>(
    'open-meteo',
    `${url}?${query}`,
  );
  const list = Array.isArray(body) ? body : [body];
  const failed = !Array.isArray(body) && body?.error;
  if (status !== 200 || failed || list.length !== points.length || list.some((b) => !b?.hourly)) {
    throw new SourceError(
      'open-meteo',
      status,
      (!Array.isArray(body) && body?.reason) || `HTTP ${status}`,
    );
  }
  return list.map((b) => {
    const { time, ...series } = b.hourly!;
    return {
      times: time.map((t) => new Date(t * 1000).toISOString()),
      series: series as Record<string, Value[]>,
    };
  });
}

const values = (list: unknown[] | undefined, length: number): Value[] =>
  list ? list.map(num) : Array<Value>(length).fill(null);

/** Points per call when fetching many spots at once (keeps the URL short). */
const MAX_POINTS = 50;

/**
 * Hourly wind (knots) for each model, from today (UTC) for `days` days, for several points
 * that use the same models, in as few calls as possible. Results are in the order of `points`.
 */
export async function fetchForecasts(
  points: Point[],
  models: readonly string[],
  days = FORECAST_DAYS,
): Promise<Forecast[]> {
  if (models.length === 0) return points.map(() => ({ times: [], models: [] }));
  // With a single model Open-Meteo doesn't add the suffix
  const key = (variable: string, model: string) =>
    models.length === 1 ? variable : `${variable}_${model}`;

  const results: Forecast[] = [];
  for (let i = 0; i < points.length; i += MAX_POINTS) {
    const responses = await getHourly(FORECAST_URL, points.slice(i, i + MAX_POINTS), {
      hourly: WIND_VARIABLES.join(','),
      wind_speed_unit: 'kn',
      models: models.join(','),
      forecast_days: days,
    });
    for (const { times, series } of responses) {
      results.push({
        times,
        models: models
          .filter((model) => series[key('wind_speed_10m', model)])
          .map((model) => ({
            model,
            speed: values(series[key('wind_speed_10m', model)], times.length),
            gust: values(series[key('wind_gusts_10m', model)], times.length),
            dir: values(series[key('wind_direction_10m', model)], times.length),
          })),
      });
    }
  }
  return results;
}

export async function fetchForecast(
  point: Point,
  models: readonly string[],
  days = FORECAST_DAYS,
): Promise<Forecast> {
  const [forecast] = await fetchForecasts([point], models, days);
  return forecast;
}

/** The candidate models that cover a point: those returning at least some data there. */
export async function probeModels(point: Point): Promise<ForecastModel[]> {
  const [models] = await probeModelsMany([point]);
  return models;
}

/** Waves (sea spots only), hourly from today (UTC). */
export async function fetchMarine(point: Point, days = FORECAST_DAYS): Promise<MarineForecast> {
  const [{ times, series }] = await getHourly(MARINE_URL, [point], {
    hourly: 'wave_height,wave_period,wave_direction',
    forecast_days: days,
  });
  return {
    times,
    waveHeight: values(series.wave_height, times.length),
    wavePeriod: values(series.wave_period, times.length),
    waveDir: values(series.wave_direction, times.length),
  };
}

/**
 * Whether the Marine API has waves at each point: it has none on lakes and inland, which
 * tells sea spots from lake spots when importing (the admin checks it when verifying).
 */
export async function hasMarineData(points: Point[]): Promise<boolean[]> {
  const results: boolean[] = [];
  for (let i = 0; i < points.length; i += MAX_POINTS) {
    const responses = await getHourly(MARINE_URL, points.slice(i, i + MAX_POINTS), {
      hourly: 'wave_height',
      forecast_days: 1,
    });
    results.push(
      ...responses.map(({ series }) => (series.wave_height ?? []).some((v) => v !== null)),
    );
  }
  return results;
}

/** For several points at once: the candidate models covering each one. */
export async function probeModelsMany(points: Point[]): Promise<ForecastModel[][]> {
  const ids = FORECAST_MODELS.map((m) => m.id);
  const forecasts = await fetchForecasts(points, ids, 3);
  return forecasts.map((forecast) =>
    ids.filter((id) =>
      forecast.models.some((m) => m.model === id && m.speed.some((v) => v !== null)),
    ),
  );
}
