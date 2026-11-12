import { localDate, localTime } from './time.js';

/**
 * When a job runs: once a day at a local time (Europe/Rome), or every `everyMs`. A daily job
 * the server missed (it was down) still runs when the server is back, within `graceMinutes`
 * of its time when set (a late notification is worse than none), otherwise until midnight.
 */
export type Schedule =
  | { at: string; graceMinutes?: number }
  | { everyMs: number };

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Whether a job last run at `lastRunAt` (null: never) is due at `now`. */
export function isDue(schedule: Schedule, lastRunAt: Date | null, now: Date): boolean {
  if ('everyMs' in schedule) {
    return !lastRunAt || now.getTime() - lastRunAt.getTime() >= schedule.everyMs;
  }
  if (lastRunAt && localDate(lastRunAt) === localDate(now)) return false;
  const late = minutes(localTime(now)) - minutes(schedule.at);
  return late >= 0 && (schedule.graceMinutes === undefined || late <= schedule.graceMinutes);
}

/** "HH:mm", 00:00 to 23:59. */
export const isClockTime = (value: unknown): value is string =>
  typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
