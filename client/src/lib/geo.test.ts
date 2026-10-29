import { describe, expect, it } from 'vitest';
import { distanceKm, sortSpots } from './geo';

const spot = (name: string, lat: number, lon: number, isFavorite = false) => ({
  name,
  lat,
  lon,
  isFavorite,
});

describe('geo', () => {
  it('measures distances in km', () => {
    expect(distanceKm({ lat: 45.4642, lon: 9.19 }, { lat: 41.9028, lon: 12.4964 })).toBeCloseTo(
      477,
      -1,
    );
  });

  it('lists favorites first, then the others by distance from the user', () => {
    const venice = { lat: 45.44, lon: 12.33 };
    const spots = [
      spot('Porto Pollo', 41.19, 9.3),
      spot('Garda', 45.87, 10.88, true),
      spot('Sottomarina', 45.2, 12.31),
      spot('Lo Stagnone', 37.85, 12.45, true),
    ];

    expect(sortSpots(spots, venice).map((s) => s.name)).toEqual([
      'Garda',
      'Lo Stagnone',
      'Sottomarina',
      'Porto Pollo',
    ]);
  });

  it('sorts by name when the position is unknown', () => {
    const spots = [
      spot('Sottomarina', 45.2, 12.31),
      spot('Garda', 45.87, 10.88),
      spot('Zoe', 0, 0, true),
    ];

    expect(sortSpots(spots, null).map((s) => s.name)).toEqual(['Zoe', 'Garda', 'Sottomarina']);
  });
});
