import { inAnySector, type Sector } from './directions.js';
import { localDate } from './time.js';
import type { Forecast, ModelSeries, Value } from '../sources/types.js';

/**
 * The app-wide definition of "good wind": at least `minKnots` from one of the spot's good
 * directions (and none of its directions to avoid) for at least `minHours` consecutive hours.
 * Used everywhere (list indicators, study days, notifications): keep it in this one place.
 */
export interface GoodWindSettings {
  minKnots: number;
  minHours: number;
}

export const DEFAULT_GOOD_WIND: GoodWindSettings = { minKnots: 14, minHours: 3 };

export interface SpotDirections {
  goodDirections: Sector[];
  avoidDirections: Sector[];
}

export function isGoodHour(
  speed: Value,
  dir: Value,
  spot: SpotDirections,
  settings: GoodWindSettings,
): boolean {
  if (speed === null || dir === null) return false;
  return (
    speed >= settings.minKnots &&
    inAnySector(dir, spot.goodDirections) &&
    !inAnySector(dir, spot.avoidDirections)
  );
}

/** For each hour of a series, whether the wind is good. */
export function goodHours(
  series: Pick<ModelSeries, 'speed' | 'dir'>,
  spot: SpotDirections,
  settings: GoodWindSettings,
): boolean[] {
  return series.speed.map((speed, i) => isGoodHour(speed, series.dir[i], spot, settings));
}

export function longestRun(flags: boolean[]): number {
  let best = 0;
  let run = 0;
  for (const flag of flags) {
    run = flag ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/**
 * yes: at least half of the models with data for that day predict good wind; maybe: at least
 * one does; no: none does; null: no model has data for that day.
 */
export type Indicator = 'yes' | 'maybe' | 'no';

/** The good-wind indicator for a local date (Europe/Rome), across the forecast's models. */
export function dayIndicator(
  forecast: Forecast,
  date: string,
  spot: SpotDirections,
  settings: GoodWindSettings,
): Indicator | null {
  if (spot.goodDirections.length === 0) return null;
  const hours = forecast.times.flatMap((t, i) => (localDate(t) === date ? [i] : []));

  let withData = 0;
  let good = 0;
  for (const model of forecast.models) {
    const speed = hours.map((i) => model.speed[i] ?? null);
    const dir = hours.map((i) => model.dir[i] ?? null);
    // A model whose run ends early that day can't tell
    if (speed.filter((s) => s !== null).length < settings.minHours) continue;
    withData++;
    if (longestRun(goodHours({ speed, dir }, spot, settings)) >= settings.minHours) good++;
  }

  if (withData === 0) return null;
  if (good === 0) return 'no';
  return good * 2 >= withData ? 'yes' : 'maybe';
}
