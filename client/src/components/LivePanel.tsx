import { useEffect, useState } from 'react';
import { fill, useI18n } from '../i18n/context';
import { apiGet } from '../lib/api';
import type { Live } from '../lib/spots';
import { age } from '../lib/time';
import { Direction, Speed } from './wind';

/** Reloaded this often while the page is open (readings arrive every ~10 minutes). */
const REFRESH_MS = 5 * 60_000;

type State = { status: 'loading' } | { status: 'error' } | { status: 'ok'; live: Live | null };

/** The latest reading of the spot's station: wind, gust, direction, where and how old. */
export function LivePanel({ spotId }: { spotId: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    const load = () =>
      apiGet<Live | null>(`/spots/${spotId}/live`)
        .then((live) => active && setState({ status: 'ok', live }))
        .catch(() => active && setState({ status: 'error' }));
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [spotId]);

  return (
    <section className="panel live-panel" aria-labelledby="live-title">
      <h2 id="live-title">{t.live.title}</h2>
      {state.status === 'loading' && <p>{t.common.loading}</p>}
      {state.status === 'error' && <p className="error">{t.live.error}</p>}
      {state.status === 'ok' && !state.live && <p className="muted">{t.live.noStation}</p>}
      {state.status === 'ok' && state.live && <Reading live={state.live} />}
    </section>
  );
}

function Reading({ live }: { live: Live }) {
  const { t } = useI18n();
  const { reading, station } = live;
  return (
    <>
      {live.usingBackup && <p className="warning">{t.live.usingBackup}</p>}
      {!reading ? (
        <p className="muted">{t.live.noReading}</p>
      ) : (
        <>
          {live.stale && (
            <p className="warning">{fill(t.live.stale, { age: age(reading.time, t) })}</p>
          )}
          <dl className={live.stale ? 'live-values stale' : 'live-values'}>
            <div>
              <dt>{t.live.wind}</dt>
              <dd className="big">
                <Speed knots={reading.wind} />
              </dd>
            </div>
            <div>
              <dt>{t.live.gust}</dt>
              <dd className="big">
                <Speed knots={reading.gust} />
              </dd>
            </div>
            <div>
              <dt>{t.live.direction}</dt>
              <dd className="big">
                <Direction degrees={reading.dir} />
              </dd>
            </div>
          </dl>
          {!live.stale && (
            <p className="muted">{fill(t.live.updated, { age: age(reading.time, t) })}</p>
          )}
        </>
      )}
      <p className="muted">
        {fill(t.live.station, { name: station.name, km: station.distanceKm })} ·{' '}
        {fill(t.live.source, { source: t.sources[station.source] })}
      </p>
    </>
  );
}
