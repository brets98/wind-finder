import type { StationReading, Value } from '../sources/types.js';
import { addDays, localDate } from './time.js';

/** Why a Day was saved; a Day can have several. */
export const DAY_REASONS = ['auto_forecast', 'auto_observed', 'manual', 'session'] as const;
export type DayReason = (typeof DAY_REASONS)[number];

/** Forecasts archived by Open-Meteo's Previous Runs API start here. */
export const FIRST_ARCHIVED_DATE = '2024-01-01';

/** Windy keeps 7 days of observations; MeteoNetwork (STANDARD token) none. */
export const OBSERVED_HISTORY_DAYS = 7;

export const isDate = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

/** Whether the local day (Europe/Rome) is over at `now`. */
export function isDayOver(date: string, now = new Date()): boolean {
  return localDate(now) > date;
}

/** Whether a station can still give a date's observations (history kept 7 days). */
export function observedReachable(date: string, now = new Date()): boolean {
  return date >= addDays(localDate(now), -OBSERVED_HISTORY_DAYS + 1);
}

/** Mean of the angles in degrees (wind directions), or null. */
export function meanDirection(degrees: number[]): Value {
  if (degrees.length === 0) return null;
  const rad = (d: number) => (d * Math.PI) / 180;
  const x = degrees.reduce((sum, d) => sum + Math.cos(rad(d)), 0);
  const y = degrees.reduce((sum, d) => sum + Math.sin(rad(d)), 0);
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) return null;
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The station's readings summed up per hour of the day: mean wind, highest gust and mean
 * direction of the readings in [hour, hour + 1h); null for hours without readings.
 */
export function hourlyObserved(hours: string[], readings: StationReading[]) {
  const start = hours.map((h) => new Date(h).getTime());
  const buckets = hours.map(() => [] as StationReading[]);
  for (const r of readings) {
    const t = new Date(r.time).getTime();
    const i = start.findIndex((s) => t >= s && t < s + 3_600_000);
    if (i >= 0) buckets[i].push(r);
  }
  const numbers = (list: Value[]) => list.filter((v): v is number => v !== null);
  return {
    wind: buckets.map((b) => {
      const w = numbers(b.map((r) => r.wind));
      return w.length ? round1(w.reduce((a, c) => a + c, 0) / w.length) : null;
    }),
    gust: buckets.map((b) => {
      const g = numbers(b.map((r) => r.gust));
      return g.length ? Math.max(...g) : null;
    }),
    dir: buckets.map((b) => meanDirection(numbers(b.map((r) => r.dir)))),
  };
}

/** "HH:mm" (local time) to minutes after midnight, or null. */
export function parseTime(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  return h < 24 && m < 60 ? h * 60 + m : null;
}

/**
 * Rough storage size of a Day in BSON: each array element is about 12 bytes (type, index key,
 * double). 6 models × 2 runs × 3 series × 24 h + 144 readings × 4 + waves ≈ 18 kB.
 */
export function estimateDayBytes({
  hours = 24,
  modelRuns = 12,
  readings = 144,
  marine = true,
} = {}) {
  const elements = modelRuns * 3 * hours + readings * 4 + (marine ? 3 * hours : 0) + hours;
  return elements * 12 + 1024;
}
