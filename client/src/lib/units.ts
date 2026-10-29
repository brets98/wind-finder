export const UNITS = ['knots', 'beaufort'] as const;
export type Unit = (typeof UNITS)[number];

/**
 * Lowest whole knots of each Beaufort force 1–12 (WMO): force 1 from 1 kn, 2 from 4 kn, …,
 * 12 from 64 kn. Speeds are rounded to whole knots first.
 */
const BEAUFORT_FROM_KNOTS = [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64];

export function knotsToBeaufort(knots: number): number {
  const kn = Math.round(knots);
  return BEAUFORT_FROM_KNOTS.filter((min) => kn >= min).length;
}

/** A speed (stored in knots) as a number in the chosen unit, rounded for display. */
export function speedIn(knots: number, unit: Unit): number {
  return unit === 'beaufort' ? knotsToBeaufort(knots) : Math.round(knots);
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

/** 16-point compass name of a direction in degrees (where the wind comes from). */
export function compassPoint(degrees: number): string {
  const i = Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS[i];
}
