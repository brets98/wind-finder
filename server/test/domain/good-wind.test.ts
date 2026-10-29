import { describe, expect, it } from 'vitest';
import {
  dayIndicator,
  DEFAULT_GOOD_WIND,
  goodHours,
  isGoodHour,
  longestRun,
} from '../../src/domain/good-wind.js';
import type { Forecast, ModelSeries } from '../../src/sources/types.js';

// Bora at Sottomarina: good from NE-E, offshore from W
const spot = { goodDirections: [{ from: 30, to: 120 }], avoidDirections: [{ from: 240, to: 300 }] };

describe('good wind', () => {
  it('needs enough wind from a good direction', () => {
    expect(isGoodHour(14, 60, spot, DEFAULT_GOOD_WIND)).toBe(true);
    expect(isGoodHour(13.9, 60, spot, DEFAULT_GOOD_WIND)).toBe(false);
    expect(isGoodHour(20, 180, spot, DEFAULT_GOOD_WIND)).toBe(false);
    expect(isGoodHour(null, 60, spot, DEFAULT_GOOD_WIND)).toBe(false);
    expect(isGoodHour(20, null, spot, DEFAULT_GOOD_WIND)).toBe(false);
  });

  it('never counts a direction to avoid, even inside a good sector', () => {
    const overlapping = {
      goodDirections: [{ from: 200, to: 320 }],
      avoidDirections: [{ from: 250, to: 270 }],
    };
    expect(isGoodHour(20, 220, overlapping, DEFAULT_GOOD_WIND)).toBe(true);
    expect(isGoodHour(20, 260, overlapping, DEFAULT_GOOD_WIND)).toBe(false);
  });

  it('flags each hour and finds the longest good run', () => {
    const flags = goodHours(
      { speed: [15, 16, 10, 18, 19, 20], dir: [60, 60, 60, 90, 90, 90] },
      spot,
      DEFAULT_GOOD_WIND,
    );
    expect(flags).toEqual([true, true, false, true, true, true]);
    expect(longestRun(flags)).toBe(3);
    expect(longestRun([])).toBe(0);
  });
});

describe('day indicator', () => {
  // 24 hours of 2026-10-30 in Italy (UTC+1): 2026-10-29T23:00Z → 2026-10-30T22:00Z
  const times = Array.from({ length: 30 }, (_, i) =>
    new Date(Date.UTC(2026, 9, 29, 23 + i)).toISOString(),
  );
  const date = '2026-10-30';

  /** A model with `good` hours of 18 kn from 60° starting at 10:00 local, calm otherwise. */
  function model(name: string, good: number, length = times.length): ModelSeries {
    const speed = times.map((_, i) => (i >= 10 && i < 10 + good ? 18 : 5));
    return {
      model: name,
      speed: speed.map((s, i) => (i < length ? s : null)),
      gust: speed.map(() => null),
      dir: speed.map(() => 60),
    };
  }

  const forecast = (...models: ModelSeries[]): Forecast => ({ times, models });

  it('says yes when at least half of the models predict good wind', () => {
    expect(
      dayIndicator(
        forecast(model('a', 4), model('b', 3), model('c', 0)),
        date,
        spot,
        DEFAULT_GOOD_WIND,
      ),
    ).toBe('yes');
    expect(
      dayIndicator(forecast(model('a', 4), model('b', 0)), date, spot, DEFAULT_GOOD_WIND),
    ).toBe('yes');
  });

  it('says maybe when only a minority does, no when none does', () => {
    expect(
      dayIndicator(
        forecast(model('a', 4), model('b', 2), model('c', 0)),
        date,
        spot,
        DEFAULT_GOOD_WIND,
      ),
    ).toBe('maybe');
    expect(
      dayIndicator(forecast(model('a', 2), model('b', 0)), date, spot, DEFAULT_GOOD_WIND),
    ).toBe('no');
  });

  it('respects the editable thresholds', () => {
    const strict = { minKnots: 20, minHours: 3 };
    expect(dayIndicator(forecast(model('a', 6)), date, spot, strict)).toBe('no');
    expect(dayIndicator(forecast(model('a', 2)), date, spot, { minKnots: 14, minHours: 2 })).toBe(
      'yes',
    );
  });

  it('ignores models with no data for that day, and says nothing without any', () => {
    // Model b's run ends before that day
    expect(
      dayIndicator(forecast(model('a', 4), model('b', 4, 1)), date, spot, DEFAULT_GOOD_WIND),
    ).toBe('yes');
    expect(dayIndicator(forecast(model('b', 4, 1)), date, spot, DEFAULT_GOOD_WIND)).toBeNull();
    expect(dayIndicator(forecast(model('a', 4)), '2026-11-05', spot, DEFAULT_GOOD_WIND)).toBeNull();
  });

  it('says nothing for a spot without good directions', () => {
    const noDirections = { goodDirections: [], avoidDirections: [] };
    expect(dayIndicator(forecast(model('a', 4)), date, noDirections, DEFAULT_GOOD_WIND)).toBeNull();
  });
});
