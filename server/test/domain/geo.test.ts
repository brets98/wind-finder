import { describe, expect, it } from 'vitest';
import { distanceKm, isInItaly, isValidLatLon } from '../../src/domain/geo.js';

const sottomarina = { lat: 45.2, lon: 12.31 };
const chioggia = { lat: 45.218, lon: 12.279 };

describe('geo', () => {
  it('measures distances in km with one decimal', () => {
    expect(distanceKm(sottomarina, chioggia)).toBe(3.1);
    expect(distanceKm(sottomarina, sottomarina)).toBe(0);
    // Milan to Rome is about 477 km
    expect(distanceKm({ lat: 45.4642, lon: 9.19 }, { lat: 41.9028, lon: 12.4964 })).toBeCloseTo(
      477,
      -1,
    );
  });

  it('validates coordinates', () => {
    expect(isValidLatLon(sottomarina)).toBe(true);
    expect(isValidLatLon({ lat: 91, lon: 0 })).toBe(false);
    expect(isValidLatLon({ lat: 0, lon: -181 })).toBe(false);
    expect(isValidLatLon({ lat: NaN, lon: 0 })).toBe(false);
  });

  it('tells points in Italy and its seas from the rest', () => {
    expect(isInItaly(sottomarina)).toBe(true);
    expect(isInItaly({ lat: 37.85, lon: 12.45 })).toBe(true); // Lo Stagnone, Sicily
    expect(isInItaly({ lat: 50.08, lon: 14.42 })).toBe(false); // Prague
  });
});
