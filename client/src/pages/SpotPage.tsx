import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ForecastView } from '../components/ForecastTable';
import { LivePanel } from '../components/LivePanel';
import { CompassRose } from '../components/wind';
import { useI18n } from '../i18n/context';
import { apiDelete, apiGet, apiPut, ApiError } from '../lib/api';
import type { Spot, SpotForecast } from '../lib/spots';
import { compassPoint } from '../lib/units';

type Load<T> =
  { status: 'loading' } | { status: 'error'; notFound?: boolean } | { status: 'ok'; data: T };

export function SpotPage({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useI18n();
  const { id } = useParams();
  const [spot, setSpot] = useState<Load<Spot>>({ status: 'loading' });
  const [forecast, setForecast] = useState<Load<SpotForecast>>({ status: 'loading' });

  useEffect(() => {
    apiGet<Spot>(`/spots/${id}`)
      .then((data) => setSpot({ status: 'ok', data }))
      .catch((err) =>
        setSpot({ status: 'error', notFound: err instanceof ApiError && err.status === 404 }),
      );
    apiGet<SpotForecast>(`/spots/${id}/forecast`)
      .then((data) => setForecast({ status: 'ok', data }))
      .catch(() => setForecast({ status: 'error' }));
  }, [id]);

  if (spot.status === 'loading') return <p className="page">{t.common.loading}</p>;
  if (spot.status === 'error') {
    return (
      <article className="page">
        <p className="error">{spot.notFound ? t.spot.notFound : t.common.loadError}</p>
        <Link to="/">{t.spot.back}</Link>
      </article>
    );
  }

  const s = spot.data;
  async function toggleFavorite() {
    const next = !s.isFavorite;
    setSpot({ status: 'ok', data: { ...s, isFavorite: next } });
    try {
      if (next) await apiPut(`/spots/${s.id}/favorite`, {});
      else await apiDelete(`/spots/${s.id}/favorite`);
    } catch {
      setSpot({ status: 'ok', data: { ...s, isFavorite: !next } });
    }
  }

  const sectors = (list: Spot['goodDirections']) =>
    list
      .map((x) => `${compassPoint(x.from)}–${compassPoint(x.to)} (${x.from}°–${x.to}°)`)
      .join(', ');

  return (
    <article className="page spot-page">
      <Link to="/" className="back-link">
        {t.spot.back}
      </Link>
      <header className="spot-header">
        <div className="spot-title">
          <h1>{s.name}</h1>
          <p className="spot-meta">
            {t.spotType[s.type]}
            {s.region && ` · ${s.region}`}
            {s.status === 'to_verify' && (
              <span className="badge badge-warn">{t.spotStatus.to_verify}</span>
            )}
            {s.isStudySpot && <span className="badge">{t.spot.studySpot}</span>}
          </p>
          <div className="spot-actions">
            <button
              type="button"
              className={s.isFavorite ? 'secondary active' : 'secondary'}
              aria-pressed={s.isFavorite}
              onClick={toggleFavorite}
            >
              {s.isFavorite ? `★ ${t.spot.unfavorite}` : `☆ ${t.spot.favorite}`}
            </button>
            {isAdmin && (
              <Link to={`/admin/spots/${s.id}`} className="button secondary">
                {t.common.edit}
              </Link>
            )}
          </div>
        </div>
        <CompassRose good={s.goodDirections} avoid={s.avoidDirections} />
      </header>

      <dl className="spot-facts">
        <div>
          <dt>{t.spot.goodDirections}</dt>
          <dd>{s.goodDirections.length ? sectors(s.goodDirections) : t.spot.noDirections}</dd>
        </div>
        {s.avoidDirections.length > 0 && (
          <div>
            <dt>{t.spot.avoidDirections}</dt>
            <dd>{sectors(s.avoidDirections)}</dd>
          </div>
        )}
        {s.water && (
          <div>
            <dt>{t.spot.water}</dt>
            <dd>{t.water[s.water]}</dd>
          </div>
        )}
        {s.level && (
          <div>
            <dt>{t.spot.level}</dt>
            <dd>{t.level[s.level]}</dd>
          </div>
        )}
        {s.season && (
          <div>
            <dt>{t.spot.season}</dt>
            <dd>{s.season}</dd>
          </div>
        )}
      </dl>
      {s.notes && <p className="spot-notes">{s.notes}</p>}
      {s.type === 'lake' && <p className="note">{t.spot.lakeNote}</p>}

      <LivePanel spotId={s.id} />

      {forecast.status === 'loading' && <p>{t.common.loading}</p>}
      {forecast.status === 'error' && <p className="error">{t.forecast.error}</p>}
      {forecast.status === 'ok' && <ForecastView forecast={forecast.data} />}
    </article>
  );
}
