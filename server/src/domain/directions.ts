/**
 * A range of wind directions (where the wind comes FROM), clockwise from `from` to `to`,
 * in whole degrees 0–359. 350→20 wraps through north; from === to is a single direction.
 */
export interface Sector {
  from: number;
  to: number;
}

export function isValidSector(sector: Sector): boolean {
  const ok = (deg: number) => Number.isInteger(deg) && deg >= 0 && deg < 360;
  return ok(sector.from) && ok(sector.to);
}

/** 360 → 0, -10 → 350. */
export function normalizeDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function inSector(direction: number, { from, to }: Sector): boolean {
  const d = normalizeDegrees(direction);
  return from <= to ? d >= from && d <= to : d >= from || d <= to;
}

export function inAnySector(direction: number, sectors: Sector[]): boolean {
  return sectors.some((s) => inSector(direction, s));
}

const COMPASS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
];

/** 16-point compass name of a direction in degrees (as `compassPoint()` in the client). */
export function compassPoint(degrees: number): string {
  return COMPASS[Math.round(normalizeDegrees(degrees) / 22.5) % 16];
}
