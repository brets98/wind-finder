import { describe, expect, it } from 'vitest';
import {
  inAnySector,
  inSector,
  isValidSector,
  normalizeDegrees,
} from '../../src/domain/directions.js';

describe('direction sectors', () => {
  it('includes both ends of a sector', () => {
    const northWest = { from: 270, to: 340 };
    expect(inSector(270, northWest)).toBe(true);
    expect(inSector(300, northWest)).toBe(true);
    expect(inSector(340, northWest)).toBe(true);
    expect(inSector(341, northWest)).toBe(false);
    expect(inSector(90, northWest)).toBe(false);
  });

  it('wraps through north', () => {
    const north = { from: 340, to: 20 };
    expect(inSector(350, north)).toBe(true);
    expect(inSector(0, north)).toBe(true);
    expect(inSector(360, north)).toBe(true);
    expect(inSector(20, north)).toBe(true);
    expect(inSector(180, north)).toBe(false);
  });

  it('checks a list of sectors', () => {
    const sectors = [
      { from: 30, to: 70 },
      { from: 100, to: 140 },
    ];
    expect(inAnySector(45, sectors)).toBe(true);
    expect(inAnySector(120, sectors)).toBe(true);
    expect(inAnySector(90, sectors)).toBe(false);
    expect(inAnySector(90, [])).toBe(false);
  });

  it('normalizes degrees', () => {
    expect(normalizeDegrees(360)).toBe(0);
    expect(normalizeDegrees(-10)).toBe(350);
    expect(normalizeDegrees(725)).toBe(5);
  });

  it('accepts whole degrees from 0 to 359 only', () => {
    expect(isValidSector({ from: 0, to: 359 })).toBe(true);
    expect(isValidSector({ from: 360, to: 10 })).toBe(false);
    expect(isValidSector({ from: -5, to: 10 })).toBe(false);
    expect(isValidSector({ from: 10.5, to: 20 })).toBe(false);
    expect(isValidSector({ from: NaN, to: 20 })).toBe(false);
  });
});
