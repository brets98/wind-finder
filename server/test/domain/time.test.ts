import { describe, expect, it } from 'vitest';
import { addDays, localDate } from '../../src/domain/time.js';

describe('local dates in Europe/Rome', () => {
  it('gives the Italian date of a UTC instant', () => {
    // 23:30 UTC is already the next day in Italy (UTC+1 in winter, +2 in summer)
    expect(localDate('2026-01-15T23:30:00Z')).toBe('2026-01-16');
    expect(localDate('2026-07-15T21:59:00Z')).toBe('2026-07-15');
    expect(localDate('2026-07-15T22:00:00Z')).toBe('2026-07-16');
    expect(localDate(new Date('2026-10-29T10:00:00Z'))).toBe('2026-10-29');
  });

  it('adds days across months and years', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
