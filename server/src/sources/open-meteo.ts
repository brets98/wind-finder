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

async function getHourly(url: string, params: Record<string, string | number>) {
  const query = new URLSearchParams(
    Object.entries({ ...params, timeformat: 'unixtime', timezone: 'GMT' }).map(([k, v]) => [
      k,
      String(v),
    ]),
  );
  const { status, body } = await fetchJson<HourlyResponse>('open-meteo', `${url}?${query}`);
  if (status !== 200 || body?.error || !body?.hourly) {
    throw new SourceError('open-meteo', status, body?.reason ?? `HTTP ${status}`);
  }
  const { time, ...series } = body.hourly;
  return {
    times: time.map((t) => new Date(t * 1000).toISOString()),
    series: series as Record<string, Value[]>,
  };
}

const values = (list: unknown[] | undefined, length: number): Value[] =>
  list ? list.map(num) : Array<Value>(length).fill(null);

/** Hourly wind (knots) for each model, from today (UTC) for `days` days. */
export async function fetchForecast(
  { lat, lon }: { lat: number; lon: number },
  models: readonly string[],
  days = FORECAST_DAYS,
): Promise<Forecast> {
  if (models.length === 0) return { times: [], models: [] };
  const { times, series } = await getHourly(FORECAST_URL, {
    latitude: lat,
    longitude: lon,
    hourly: WIND_VARIABLES.join(','),
    wind_speed_unit: 'kn',
    models: models.join(','),
    forecast_days: days,
  });
  // With a single model Open-Meteo doesn't add the suffix
  const key = (variable: string, model: string) =>
    models.length === 1 ? variable : `${variable}_${model}`;

  return {
    times,
    models: models
      .filter((model) => series[key('wind_speed_10m', model)])
      .map((model) => ({
        model,
        speed: values(series[key('wind_speed_10m', model)], times.length),
        gust: values(series[key('wind_gusts_10m', model)], times.length),
        dir: values(series[key('wind_direction_10m', model)], times.length),
      })),
  };
}

/** The candidate models that cover a point: those returning at least some data there. */
export async function probeModels(point: { lat: number; lon: number }): Promise<ForecastModel[]> {
  const forecast = await fetchForecast(
    point,
    FORECAST_MODELS.map((m) => m.id),
    3,
  );
  return FORECAST_MODELS.map((m) => m.id).filter((id) =>
    forecast.models.some((m) => m.model === id && m.speed.some((v) => v !== null)),
  );
}

/** Waves (sea spots only), hourly from today (UTC). */
export async function fetchMarine(
  { lat, lon }: { lat: number; lon: number },
  days = FORECAST_DAYS,
): Promise<MarineForecast> {
  const { times, series } = await getHourly(MARINE_URL, {
    latitude: lat,
    longitude: lon,
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
