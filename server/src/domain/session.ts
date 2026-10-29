import { FIRST_ARCHIVED_DATE, isDate, parseTime } from './day.js';
import type { Issue } from './spot.js';
import { localDate } from './time.js';

export const SPORTS = ['kite', 'foil', 'wing', 'windsurf', 'other'] as const;
export const GUSTINESS = ['steady', 'gusty', 'very_gusty'] as const;
export const SEA_STATES = ['flat', 'chop', 'waves'] as const;
export const VISIBILITIES = ['group', 'private'] as const;

export type Sport = (typeof SPORTS)[number];

/** What a rider logs about an outing (the spot and the Day are set by the server). */
export interface SessionFields {
  date: string;
  /** Local time "HH:mm" */
  start: string;
  end: string;
  sport: Sport;
  /** Kite or wing size, m² */
  size: number | null;
  board: string;
  /** Wind estimated by the rider, knots */
  perceivedWind: number | null;
  gustiness: (typeof GUSTINESS)[number] | null;
  seaState: (typeof SEA_STATES)[number] | null;
  rating: number;
  comment: string;
  visibility: (typeof VISIBILITIES)[number];
}

/**
 * Checks a session sent by the client, like `parseSpot()`: all required fields for a new one,
 * only the fields sent with `partial`. Dates from 2024 (the forecast archive) to today.
 */
export function parseSession(
  body: Record<string, unknown>,
  { partial = false, now = new Date() }: { partial?: boolean; now?: Date } = {},
): { fields: Partial<SessionFields>; issues: Issue[] } {
  const fields: Partial<SessionFields> = {};
  const issues: Issue[] = [];
  const has = (key: string) => body[key] !== undefined;
  const fail = (field: string, code = 'INVALID') => issues.push({ code, field });

  if (has('date') || !partial) {
    if (!isDate(body.date)) fail('date', 'REQUIRED');
    else if (body.date > localDate(now) || body.date < FIRST_ARCHIVED_DATE)
      fail('date', 'OUT_OF_RANGE');
    else fields.date = body.date;
  }

  for (const key of ['start', 'end'] as const) {
    if (has(key) || !partial) {
      if (parseTime(body[key]) === null) fail(key, 'REQUIRED');
      else fields[key] = body[key] as string;
    }
  }
  if (fields.start && fields.end && parseTime(fields.end)! <= parseTime(fields.start)!) {
    fail('end', 'BEFORE_START');
  }

  const choice = <K extends keyof SessionFields>(
    key: K,
    options: readonly string[],
    required = false,
  ) => {
    if (!has(key) && partial) return;
    const value = body[key];
    if ((value === undefined || value === null || value === '') && !required) {
      (fields as Record<string, unknown>)[key] = null;
    } else if (options.includes(value as string)) {
      (fields as Record<string, unknown>)[key] = value;
    } else fail(key, required && !value ? 'REQUIRED' : 'INVALID');
  };
  choice('sport', SPORTS, true);
  choice('gustiness', GUSTINESS);
  choice('seaState', SEA_STATES);

  const number = (key: 'size' | 'perceivedWind', max: number) => {
    if (!has(key) && partial) return;
    const value = body[key];
    if (value === undefined || value === null || value === '') fields[key] = null;
    else if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max) {
      fields[key] = Math.round(value * 10) / 10;
    } else fail(key);
  };
  number('size', 30);
  number('perceivedWind', 80);

  if (has('rating') || !partial) {
    if (
      !Number.isInteger(body.rating) ||
      (body.rating as number) < 1 ||
      (body.rating as number) > 5
    ) {
      fail('rating', 'REQUIRED');
    } else fields.rating = body.rating as number;
  }

  for (const [key, max] of [
    ['board', 100],
    ['comment', 2000],
  ] as const) {
    if (has(key)) {
      if (typeof body[key] !== 'string') fail(key);
      else if ((body[key] as string).length > max) fail(key, 'TOO_LONG');
      else fields[key] = (body[key] as string).trim();
    } else if (!partial) fields[key] = '';
  }

  if (has('visibility')) {
    if (!VISIBILITIES.includes(body.visibility as 'group')) fail('visibility');
    else fields.visibility = body.visibility as SessionFields['visibility'];
  } else if (!partial) fields.visibility = 'group';

  return { fields, issues };
}
