import { APP_NAME } from '../config.js';
import { compassPoint } from '../domain/directions.js';
import type { DayOutlook, MeasuredWind } from '../domain/notifications.js';
import { formatSpeed } from '../domain/units.js';
import type { Unit } from '../models/preferences.js';

/** What a user's notifications say about one favorite spot. */
export interface SpotNews {
  id: string;
  name: string;
  /** Good wind measured today, with the station's name */
  measured: (MeasuredWind & { station: string }) | null;
  outlook: DayOutlook[];
}

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** "Sat 14 Nov" for a local date. */
export const shortDate = (date: string) => dateFormat.format(new Date(`${date}T12:00:00Z`));

/**
 * The daily push: every favorite spot where most models agree on good wind ("yes") in the
 * next days, in one notification; null when there is none.
 */
export function pushMessage(spots: SpotNews[], appUrl: string) {
  const ahead = spots
    .map((s) => ({ ...s, dates: s.outlook.filter((d) => d.indicator === 'yes') }))
    .filter((s) => s.dates.length > 0);
  if (ahead.length === 0) return null;
  return {
    title: 'Good wind ahead',
    body: ahead
      .map((s) => `${s.name}: ${s.dates.map((d) => shortDate(d.date)).join(', ')}`)
      .join(' · '),
    url: ahead.length === 1 ? `${appUrl}/spots/${ahead[0].id}` : `${appUrl}/`,
    spots: ahead.map((s) => s.name),
  };
}

/**
 * The evening email: good wind measured today, then good wind forecast in the next days,
 * each section only when it has something; null when both are empty.
 */
export function emailMessage(
  user: { name: string },
  spots: SpotNews[],
  unit: Unit,
  appUrl: string,
) {
  const today = spots.filter((s) => s.measured);
  const next = spots.filter((s) => s.outlook.length > 0);
  if (today.length === 0 && next.length === 0) return null;

  const lines = [`Hi ${user.name},`, ''];
  if (today.length > 0) {
    lines.push('Good wind today, measured by the stations:');
    for (const s of today) {
      const m = s.measured!;
      const dir = m.dir === null ? '' : ` from ${compassPoint(m.dir)}`;
      lines.push(
        `- ${s.name}: ${m.from}–${m.to}, up to ${formatSpeed(m.maxWind, unit)}${dir} (${m.station})`,
      );
    }
    lines.push('');
  }
  if (next.length > 0) {
    lines.push('Good wind forecast in the next days (yes: most models agree; maybe: some do):');
    for (const s of next) {
      const days = s.outlook.map((d) => `${shortDate(d.date)} ${d.indicator}`).join(', ');
      lines.push(`- ${s.name}: ${days}`);
    }
    lines.push('');
  }
  lines.push(`Open ${APP_NAME}: ${appUrl}/`, `Change your notifications: ${appUrl}/notifications`);

  const names = [...new Set([...today, ...next].map((s) => s.name))];
  return {
    subject: `Good wind: ${names.join(', ')}`,
    text: lines.join('\n'),
    spots: names,
  };
}
