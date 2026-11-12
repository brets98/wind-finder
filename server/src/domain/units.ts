import type { Unit } from '../models/preferences.js';

/**
 * Lowest whole knots of each Beaufort force 1–12 (WMO), as `knotsToBeaufort()` in the client:
 * speeds are rounded to whole knots first.
 */
const BEAUFORT_FROM_KNOTS = [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64];

export function knotsToBeaufort(knots: number): number {
  const kn = Math.round(knots);
  return BEAUFORT_FROM_KNOTS.filter((min) => kn >= min).length;
}

/** A speed (knots) in the user's unit, for emails: "18 kn" or "Force 5". */
export function formatSpeed(knots: number, unit: Unit): string {
  return unit === 'beaufort' ? `Force ${knotsToBeaufort(knots)}` : `${Math.round(knots)} kn`;
}
