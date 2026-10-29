import { useEffect, useState } from 'react';
import { fill, useI18n } from '../i18n/context';
import { apiGet } from '../lib/api';
import type { DayDetail, DaySummary } from '../lib/days';
import { formatDay } from '../lib/time';
import { SessionSummary } from './SessionSummary';
import { WindChart } from './WindChart';
import { Speed } from './wind';

/**
 * The spot's saved Days, newest first. Opening one loads it whole: forecast (D-1 and D0 of a
 * chosen model) vs observed vs perceived, and its sessions. `version` reloads the list.
 */
export function SpotHistory({ spotId, version }: { spotId: string; version: number }) {
  const { t, locale } = useI18n();
  const [days, setDays] = useState<DaySummary[] | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    apiGet<DaySummary[]>(`/spots/${spotId}/days`)
      .then((list) => {
        setDays(list);
        setError(false);
      })
      .catch(() => setError(true));
  }, [spotId, version]);

  return (
    <section className="panel" aria-labelledby="history-title">
      <h2 id="history-title">{t.day.history}</h2>
      {error && <p className="error">{t.common.loadError}</p>}
      {!days && !error && <p>{t.common.loading}</p>}
      {days?.length === 0 && <p className="muted">{t.day.noHistory}</p>}
      {days && days.length > 0 && (
        <ul className="history">
          {days.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className="history-row"
                aria-expanded={open === d.id}
                onClick={() => setOpen(open === d.id ? null : d.id)}
              >
                <span className="history-date">{formatDay(d.date, locale)}</span>
                <span className="muted">{d.reasons.map((r) => t.day.reasons[r]).join(' · ')}</span>
                {d.maxObserved !== null && (
                  <span className="muted">
                    {fill(t.day.maxObserved, { wind: '' })}
                    <Speed knots={d.maxObserved} />
                  </span>
                )}
                {d.sessions.length > 0 && (
                  <span className="badge">{`${d.sessions.length} ${t.day.sessions.toLowerCase()}`}</span>
                )}
              </button>
              {open === d.id && <DayView dayId={d.id} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DayView({ dayId }: { dayId: string }) {
  const { t } = useI18n();
  const [day, setDay] = useState<DayDetail | null>(null);
  const [error, setError] = useState(false);
  const [model, setModel] = useState('');

  useEffect(() => {
    apiGet<DayDetail>(`/days/${dayId}`)
      .then((d) => {
        setDay(d);
        setModel(
          d.forecasts.find((f) => f.run === 'd0' && f.speed.some((v) => v !== null))?.model ?? '',
        );
      })
      .catch(() => setError(true));
  }, [dayId]);

  if (error) return <p className="error">{t.common.loadError}</p>;
  if (!day) return <p>{t.common.loading}</p>;

  const models = [...new Set(day.forecasts.map((f) => f.model))];
  const series = (run: 'd0' | 'd1') =>
    day.forecasts.find((f) => f.model === model && f.run === run)?.speed ?? [];
  const o = day.observed;

  return (
    <div className="day-view">
      {models.length > 1 && (
        <label className="inline-label">
          {t.chart.model}{' '}
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {models.map((m) => (
              <option key={m} value={m}>
                {t.models[m] ?? m}
              </option>
            ))}
          </select>
        </label>
      )}
      <WindChart
        hours={day.hours}
        forecastD1={series('d1')}
        forecastD0={series('d0')}
        observed={o.hourly.wind}
        perceived={(day.sessions ?? []).flatMap((s) =>
          s.perceivedWind === null ? [] : [{ knots: s.perceivedWind, start: s.start, end: s.end }],
        )}
        title={t.chart.label}
      />
      <p className="muted">
        {o.station
          ? fill(t.day.observedFrom, {
              name: o.station.name,
              km: o.station.distanceKm,
              backup: o.usedBackup ? t.day.backupNote : '',
            })
          : null}
        {o.status === 'partial' && ` ${t.day.observedPartial}`}
        {o.status === 'unavailable' && o.reason && t.day.observedReasons[o.reason]}
      </p>
      {!day.forecastsFinal && <p className="muted">{t.day.forecastsPending}</p>}
      {(day.sessions ?? []).length > 0 && (
        <div className="day-sessions">
          <h3>{t.day.sessions}</h3>
          {day.sessions!.map((s) => (
            <SessionSummary key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}
