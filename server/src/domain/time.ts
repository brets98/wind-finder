/** The app's local time zone: dates of days and sessions are local dates here. */
export const TIME_ZONE = 'Europe/Rome';

const dateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Local date (YYYY-MM-DD) in Europe/Rome of an instant. */
export function localDate(instant: Date | string): string {
  return dateFormat.format(typeof instant === 'string' ? new Date(instant) : instant);
}

/** YYYY-MM-DD plus `days` (calendar arithmetic, no time zone involved). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The start (UTC) of every hour of a local date: 24, or 23/25 when the clocks change. */
export function localHours(date: string): string[] {
  const hours: string[] = [];
  const first = Date.parse(`${addDays(date, -1)}T00:00:00Z`);
  for (let i = 0; i < 72; i++) {
    const instant = new Date(first + i * 3_600_000);
    if (localDate(instant) === date) hours.push(instant.toISOString());
  }
  return hours;
}
