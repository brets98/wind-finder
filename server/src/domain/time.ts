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
