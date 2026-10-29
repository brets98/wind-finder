import { describe, expect, it } from 'vitest';
import { compassPoint, knotsToBeaufort, speedIn } from './units';

describe('units', () => {
  it.each([
    [0, 0],
    [0.4, 0],
    [1, 1],
    [3.4, 1],
    [3.5, 2],
    [6, 2],
    [7, 3],
    [10, 3],
    [11, 4],
    [14, 4],
    [16, 4],
    [17, 5],
    [21, 5],
    [22, 6],
    [27, 6],
    [28, 7],
    [34, 8],
    [41, 9],
    [48, 10],
    [56, 11],
    [63, 11],
    [64, 12],
    [90, 12],
  ])('%s knots is Beaufort %s', (knots, force) => {
    expect(knotsToBeaufort(knots)).toBe(force);
  });

  it('shows speeds in the chosen unit', () => {
    expect(speedIn(14.6, 'knots')).toBe(15);
    expect(speedIn(14.6, 'beaufort')).toBe(4);
  });

  it('names compass points', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(359)).toBe('N');
    expect(compassPoint(45)).toBe('NE');
    expect(compassPoint(60)).toBe('ENE');
    expect(compassPoint(270)).toBe('W');
    expect(compassPoint(-90)).toBe('W');
  });
});
