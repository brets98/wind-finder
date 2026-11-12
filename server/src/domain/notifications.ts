import { hourlyObserved, meanDirection } from './day.js';
import {
  dayIndicator,
  goodHours,
  type GoodWindSettings,
  type SpotDirections,
} from './good-wind.js';
import { addDays, localTime } from './time.js';
import type { Forecast, StationReading } from '../sources/types.js';

/** Notifications look at tomorrow and the two days after: the high-resolution models' range. */
export const OUTLOOK_DAYS = 3;

export const outlookDates = (today: string) =>
  Array.from({ length: OUTLOOK_DAYS }, (_, i) => addDays(today, i + 1));

export interface DayOutlook {
  date: string;
  indicator: 'yes' | 'maybe';
}

/** The dates with good wind forecast ("yes" or "maybe"), in order. */
export function forecastOutlook(
  forecast: Forecast,
  dates: string[],
  spot: SpotDirections,
  settings: GoodWindSettings,
): DayOutlook[] {
  return dates.flatMap((date) => {
    const indicator = dayIndicator(forecast, date, spot, settings);
    return indicator === 'yes' || indicator === 'maybe' ? [{ date, indicator }] : [];
  });
}

export interface MeasuredWind {
  /** Local times ("HH:mm") of the start and end of the good hours */
  from: string;
  to: string;
  /** Highest hourly mean in those hours, knots */
  maxWind: number;
  dir: number | null;
}

/**
 * The good wind a station measured in a day so far: the longest run of good hours (hourly
 * means, as for study days), when it lasts the minimum hours; null otherwise.
 */
export function measuredGoodWind(
  hours: string[],
  readings: StationReading[],
  spot: SpotDirections,
  settings: GoodWindSettings,
): MeasuredWind | null {
  const observed = hourlyObserved(hours, readings);
  const good = goodHours({ speed: observed.wind, dir: observed.dir }, spot, settings);
  let best = { start: 0, length: 0 };
  let start = 0;
  good.forEach((isGood, i) => {
    if (!isGood) start = i + 1;
    else if (i - start + 1 > best.length) best = { start, length: i - start + 1 };
  });
  if (best.length < settings.minHours) return null;

  const run = (values: (number | null)[]) =>
    values.slice(best.start, best.start + best.length).filter((v): v is number => v !== null);
  const end = new Date(new Date(hours[best.start + best.length - 1]).getTime() + 3_600_000);
  return {
    from: localTime(hours[best.start]),
    to: localTime(end),
    maxWind: Math.max(...run(observed.wind)),
    dir: meanDirection(run(observed.dir)),
  };
}
