import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { SessionSummary } from '../components/SessionSummary';
import { WindChart } from '../components/WindChart';
import { useI18n } from '../i18n/context';
import { apiGet } from '../lib/api';
import type { BoardSession } from '../lib/days';
import { formatDay } from '../lib/time';

interface Filters {
  spots: { id: string; name: string }[];
  riders: { id: string; name: string }[];
}

/** The group's sessions, newest first, filterable by spot and rider (`?spot=…&rider=…`). */
export function BoardPage() {
  const { t, locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const spot = params.get('spot') ?? '';
  const rider = params.get('rider') ?? '';
  const [filters, setFilters] = useState<Filters>({ spots: [], riders: [] });
  const [sessions, setSessions] = useState<BoardSession[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiGet<Filters>('/sessions/filters')
      .then(setFilters)
      .catch(() => {});
  }, []);

  const load = useCallback(
    (offset: number) => {
      const query = new URLSearchParams({ offset: String(offset) });
      if (spot) query.set('spotId', spot);
      if (rider) query.set('userId', rider);
      return apiGet<{ sessions: BoardSession[]; hasMore: boolean }>(`/sessions?${query}`).then(
        (page) => {
          setSessions((list) =>
            offset === 0 ? page.sessions : [...(list ?? []), ...page.sessions],
          );
          setHasMore(page.hasMore);
          setError(false);
        },
        () => setError(true),
      );
    },
    [spot, rider],
  );

  useEffect(() => {
    load(0);
  }, [load]);

  function setFilter(key: 'spot' | 'rider', value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setSessions(null);
    setParams(next, { replace: true });
  }

  return (
    <article className="page">
      <h1>{t.board.title}</h1>
      <div className="filters">
        <label>
          {t.board.spot}
          <select value={spot} onChange={(e) => setFilter('spot', e.target.value)}>
            <option value="">{t.board.allSpots}</option>
            {filters.spots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.board.rider}
          <select value={rider} onChange={(e) => setFilter('rider', e.target.value)}>
            <option value="">{t.board.allRiders}</option>
            {filters.riders.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="error">{t.common.loadError}</p>}
      {!sessions && !error && <p>{t.common.loading}</p>}
      {sessions?.length === 0 && <p className="muted">{t.board.empty}</p>}
      <ul className="board">
        {sessions?.map((s) => (
          <li key={s.id} className="board-card">
            <div className="board-card-head">
              {s.spot ? <Link to={`/spots/${s.spot.id}`}>{s.spot.name}</Link> : null}
              <span className="muted">{formatDay(s.date, locale)}</span>
            </div>
            <SessionSummary session={s} />
            {s.chart && (
              <WindChart
                compact
                hours={s.chart.hours}
                forecastD1={s.chart.forecastD1}
                forecastD0={s.chart.forecastD0}
                observed={s.chart.observed}
                perceived={
                  s.perceivedWind === null
                    ? []
                    : [{ knots: s.perceivedWind, start: s.start, end: s.end }]
                }
                title={s.chart.model ? (t.models[s.chart.model] ?? s.chart.model) : undefined}
              />
            )}
          </li>
        ))}
      </ul>
      {hasMore && sessions && (
        <button type="button" className="secondary" onClick={() => load(sessions.length)}>
          {t.board.more}
        </button>
      )}
    </article>
  );
}
