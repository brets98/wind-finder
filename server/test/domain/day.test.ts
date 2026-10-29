import { describe, expect, it } from 'vitest';
import {
  estimateDayBytes,
  hourlyObserved,
  isDate,
  isDayOver,
  meanDirection,
  observedReachable,
  parseTime,
} from '../../src/domain/day.js';
import { parseSession } from '../../src/domain/session.js';

describe('days', () => {
  it('recognizes real calendar dates', () => {
    expect(isDate('2026-10-29')).toBe(true);
    expect(isDate('2026-02-30')).toBe(false);
    expect(isDate('29/10/2026')).toBe(false);
    expect(isDate(20261029)).toBe(false);
  });

  it('knows when a local day is over and how long its observations stay reachable', () => {
    const now = new Date('2026-10-29T10:00:00Z');
    expect(isDayOver('2026-10-28', now)).toBe(true);
    expect(isDayOver('2026-10-29', now)).toBe(false);
    // 23:30 UTC is already the 30th in Italy
    expect(isDayOver('2026-10-29', new Date('2026-10-29T23:30:00Z'))).toBe(true);

    expect(observedReachable('2026-10-23', now)).toBe(true);
    expect(observedReachable('2026-10-22', now)).toBe(false);
  });

  it('averages directions across north', () => {
    expect(meanDirection([350, 10])).toBe(0);
    expect(meanDirection([80, 100])).toBe(90);
    expect(meanDirection([])).toBeNull();
    expect(meanDirection([0, 180])).toBeNull();
  });

  it('sums readings up per hour: mean wind, highest gust, mean direction', () => {
    const hours = [
      '2026-10-29T10:00:00.000Z',
      '2026-10-29T11:00:00.000Z',
      '2026-10-29T12:00:00.000Z',
    ];
    const readings = [
      { time: '2026-10-29T10:00:00.000Z', wind: 12, gust: 18, dir: 50 },
      { time: '2026-10-29T10:30:00.000Z', wind: 15, gust: 21, dir: 70 },
      { time: '2026-10-29T10:50:00.000Z', wind: null, gust: null, dir: null },
      { time: '2026-10-29T12:10:00.000Z', wind: 9, gust: null, dir: 80 },
      { time: '2026-10-29T13:00:00.000Z', wind: 30, gust: 40, dir: 80 },
    ];

    expect(hourlyObserved(hours, readings)).toEqual({
      wind: [13.5, null, 9],
      gust: [21, null, null],
      dir: [60, null, 80],
    });
  });

  it('parses local times', () => {
    expect(parseTime('09:30')).toBe(570);
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('9:30')).toBeNull();
  });

  it('keeps a full Day under 20 kB', () => {
    expect(estimateDayBytes()).toBeLessThan(20_000);
  });
});

describe('parseSession', () => {
  const now = new Date('2026-10-29T15:00:00Z');
  const valid = { date: '2026-10-29', start: '13:00', end: '16:30', sport: 'kite', rating: 4 };

  it('fills defaults for a new session', () => {
    expect(parseSession(valid, { now })).toEqual({
      fields: {
        ...valid,
        size: null,
        board: '',
        perceivedWind: null,
        gustiness: null,
        seaState: null,
        comment: '',
        visibility: 'group',
      },
      issues: [],
    });
  });

  it('keeps every optional field when valid', () => {
    const { fields, issues } = parseSession(
      {
        ...valid,
        size: 9,
        board: ' Twin tip 138 ',
        perceivedWind: 18.25,
        gustiness: 'gusty',
        seaState: 'chop',
        comment: 'Bora kicked in at 14',
        visibility: 'private',
      },
      { now },
    );

    expect(issues).toEqual([]);
    expect(fields).toMatchObject({
      size: 9,
      board: 'Twin tip 138',
      perceivedWind: 18.3,
      visibility: 'private',
    });
  });

  it('reports each invalid field with a code', () => {
    const { issues } = parseSession(
      {
        date: '2026-10-30',
        start: '16:00',
        end: '15:00',
        sport: 'surf',
        rating: 6,
        size: -1,
        gustiness: 'calm',
      },
      { now },
    );

    expect(issues).toEqual([
      { code: 'OUT_OF_RANGE', field: 'date' },
      { code: 'BEFORE_START', field: 'end' },
      { code: 'INVALID', field: 'sport' },
      { code: 'INVALID', field: 'gustiness' },
      { code: 'INVALID', field: 'size' },
      { code: 'REQUIRED', field: 'rating' },
    ]);
  });

  it('refuses dates before the forecast archive', () => {
    expect(parseSession({ ...valid, date: '2023-12-31' }, { now }).issues).toEqual([
      { code: 'OUT_OF_RANGE', field: 'date' },
    ]);
  });

  it('checks only the fields sent when partial', () => {
    expect(parseSession({ rating: 5 }, { partial: true, now })).toEqual({
      fields: { rating: 5 },
      issues: [],
    });
  });
});
