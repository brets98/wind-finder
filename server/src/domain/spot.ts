import { isValidSector, type Sector } from './directions.js';
import { isValidLatLon } from './geo.js';

export const SPOT_TYPES = ['sea', 'lake'] as const;
export const SPOT_STATUSES = ['to_verify', 'verified'] as const;
export const WATER_TYPES = ['flat', 'chop', 'waves'] as const;
export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;

export type SpotType = (typeof SPOT_TYPES)[number];
export type SpotStatus = (typeof SPOT_STATUSES)[number];
export type WaterType = (typeof WATER_TYPES)[number];
export type Level = (typeof LEVELS)[number];

/** The fields of a spot the admin edits directly (stations have their own route). */
export interface SpotFields {
  name: string;
  lat: number;
  lon: number;
  region: string;
  type: SpotType;
  status: SpotStatus;
  goodDirections: Sector[];
  avoidDirections: Sector[];
  water: WaterType | null;
  level: Level | null;
  season: string;
  notes: string;
  isStudySpot: boolean;
}

export interface Issue {
  code: string;
  field?: string;
}

const MAX_NAME = 100;
const MAX_TEXT = 2000;

/**
 * Checks a spot sent by the client. With `partial`, only the fields present are checked and
 * returned (PATCH); otherwise the required ones must be there and the rest get defaults.
 */
export function parseSpot(
  body: Record<string, unknown>,
  { partial = false }: { partial?: boolean } = {},
): { fields: Partial<SpotFields>; issues: Issue[] } {
  const fields: Partial<SpotFields> = {};
  const issues: Issue[] = [];
  const has = (key: string) => body[key] !== undefined;
  const fail = (field: string, code = 'INVALID') => issues.push({ code, field });

  if (has('name') || !partial) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) fail('name', 'REQUIRED');
    else if (name.length > MAX_NAME) fail('name', 'TOO_LONG');
    else fields.name = name;
  }

  if (has('lat') || has('lon') || !partial) {
    const lat = Number(body.lat);
    const lon = Number(body.lon);
    if (!has('lat') || !has('lon') || !isValidLatLon({ lat, lon })) fail('location');
    else Object.assign(fields, { lat, lon });
  }

  if (has('type') || !partial) {
    if (!SPOT_TYPES.includes(body.type as SpotType)) fail('type', 'REQUIRED');
    else fields.type = body.type as SpotType;
  }

  if (has('status')) {
    if (!SPOT_STATUSES.includes(body.status as SpotStatus)) fail('status');
    else fields.status = body.status as SpotStatus;
  } else if (!partial) fields.status = 'to_verify';

  for (const key of ['goodDirections', 'avoidDirections'] as const) {
    if (has(key)) {
      const sectors = parseSectors(body[key]);
      if (!sectors) fail(key);
      else fields[key] = sectors;
    } else if (!partial) fields[key] = [];
  }

  const choice = <T extends string>(key: 'water' | 'level', options: readonly T[]) => {
    if (has(key)) {
      const value = body[key];
      if (value === null || value === '') fields[key] = null;
      else if (options.includes(value as T)) (fields as Record<string, unknown>)[key] = value;
      else fail(key);
    } else if (!partial) fields[key] = null;
  };
  choice('water', WATER_TYPES);
  choice('level', LEVELS);

  for (const key of ['region', 'season', 'notes'] as const) {
    if (has(key)) {
      if (typeof body[key] !== 'string') fail(key);
      else if ((body[key] as string).length > MAX_TEXT) fail(key, 'TOO_LONG');
      else fields[key] = (body[key] as string).trim();
    } else if (!partial) fields[key] = '';
  }

  if (has('isStudySpot')) {
    if (typeof body.isStudySpot !== 'boolean') fail('isStudySpot');
    else fields.isStudySpot = body.isStudySpot;
  } else if (!partial) fields.isStudySpot = false;

  return { fields, issues };
}

function parseSectors(value: unknown): Sector[] | null {
  if (!Array.isArray(value) || value.length > 8) return null;
  const sectors = value.map((s) => ({ from: Number(s?.from), to: Number(s?.to) }));
  return sectors.every(isValidSector) ? sectors : null;
}
