import { fill, type I18n } from '../i18n/context';

/** Dates and times are shown in Italian time, wherever the user is. */
export const TIME_ZONE = 'Europe/Rome';

const dateKey = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Local date (YYYY-MM-DD) in Europe/Rome of an instant. */
export function localDate(iso: string | Date): string {
  return dateKey.format(typeof iso === 'string' ? new Date(iso) : iso);
}

/** The hour (00–23) in Europe/Rome. */
export function formatHour(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: TIME_ZONE, hour: '2-digit' });
}

export function formatTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale, {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** A local date (YYYY-MM-DD) as e.g. "Thu 30 Oct". */
export function formatDay(date: string, locale: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** "5 min ago", "3 h ago"… */
export function age(iso: string, t: I18n['t'], now = new Date()): string {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return t.time.justNow;
  if (minutes < 60) return fill(t.time.minutesAgo, { n: minutes });
  if (minutes < 48 * 60) return fill(t.time.hoursAgo, { n: Math.round(minutes / 60) });
  return fill(t.time.daysAgo, { n: Math.round(minutes / 1440) });
}
