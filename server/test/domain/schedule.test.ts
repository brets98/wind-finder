import { describe, expect, it } from 'vitest';
import { isClockTime, isDue } from '../../src/domain/schedule.js';

// 2026-11-12 is winter time: 19:00 in Rome is 18:00 UTC
const at = (utc: string) => new Date(`2026-11-12T${utc}:00Z`);

describe('job schedules', () => {
  it('runs a daily job once, from its local time on', () => {
    const daily = { at: '19:00' };
    expect(isDue(daily, null, at('17:59'))).toBe(false);
    expect(isDue(daily, null, at('18:00'))).toBe(true);
    expect(isDue(daily, at('18:00'), at('18:01'))).toBe(false);
    // Run yesterday: due again today
    expect(isDue(daily, new Date('2026-11-11T18:00:00Z'), at('18:00'))).toBe(true);
  });

  it('runs a missed daily job late, but only within its grace time when it has one', () => {
    expect(isDue({ at: '00:30' }, null, at('21:00'))).toBe(true);
    expect(isDue({ at: '19:00', graceMinutes: 120 }, null, at('20:00'))).toBe(true);
    expect(isDue({ at: '19:00', graceMinutes: 120 }, null, at('20:01'))).toBe(false);
  });

  it('compares the run with the local date, not the UTC one', () => {
    // 23:30 UTC on the 12th is 00:30 on the 13th in Rome: a new day
    expect(isDue({ at: '00:30' }, at('00:00'), at('23:30'))).toBe(true);
  });

  it('runs an interval job when the interval has passed', () => {
    const hourly = { everyMs: 3_600_000 };
    expect(isDue(hourly, null, at('10:00'))).toBe(true);
    expect(isDue(hourly, at('10:00'), at('10:59'))).toBe(false);
    expect(isDue(hourly, at('10:00'), at('11:00'))).toBe(true);
  });

  it('accepts clock times from 00:00 to 23:59', () => {
    expect(isClockTime('19:00')).toBe(true);
    expect(isClockTime('00:00')).toBe(true);
    expect(isClockTime('24:00')).toBe(false);
    expect(isClockTime('9:00')).toBe(false);
    expect(isClockTime(1900)).toBe(false);
  });
});
