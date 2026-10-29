import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { SpotList } from '../components/SpotList';
import { SpotMap, type Bounds } from '../components/SpotMap';
import { useI18n } from '../i18n/context';
import { apiGet } from '../lib/api';
import { sortSpots } from '../lib/geo';
import { DESKTOP_QUERY, useGeolocation, useMediaQuery } from '../lib/hooks';
import type { SpotSummary } from '../lib/spots';

type State = { status: 'loading' } | { status: 'error' } | { status: 'ok'; spots: SpotSummary[] };

const inBounds = (s: SpotSummary, b: Bounds) =>
  s.lat >= b.south && s.lat <= b.north && s.lon >= b.west && s.lon <= b.east;

/**
 * Mobile: the spot list (favorites, then by distance) with a map tab. Desktop: a full-screen
 * map with a side list of the spots in the visible area.
 */
export function HomePage() {
  const { t } = useI18n();
  const [state, setState] = useState<State>({ status: 'loading' });
  const position = useGeolocation();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'map' ? 'map' : 'list';
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  useEffect(() => {
    apiGet<SpotSummary[]>('/spots')
      .then((spots) => setState({ status: 'ok', spots }))
      .catch(() => setState({ status: 'error' }));
  }, []);

  const sorted = useMemo(
    () => (state.status === 'ok' ? sortSpots(state.spots, position) : []),
    [state, position],
  );
  const onBoundsChange = useCallback((b: Bounds) => setBounds(b), []);

  if (state.status === 'loading') return <p className="page">{t.common.loading}</p>;
  if (state.status === 'error') return <p className="page error">{t.common.loadError}</p>;
  if (sorted.length === 0) {
    return (
      <article className="page">
        <h1>{t.home.title}</h1>
        <p className="muted">{t.home.empty}</p>
      </article>
    );
  }

  const order = <p className="muted list-order">{position ? t.home.byDistance : t.home.byName}</p>;

  if (desktop) {
    const visible = bounds ? sorted.filter((s) => inBounds(s, bounds)) : sorted;
    return (
      <div className="home-desktop">
        <aside className="home-side">
          <h1>{t.home.title}</h1>
          {order}
          {visible.length === 0 ? (
            <p className="muted">{t.home.emptyInView}</p>
          ) : (
            <SpotList
              spots={visible}
              position={position}
              highlighted={highlighted}
              onHover={setHighlighted}
            />
          )}
        </aside>
        <SpotMap
          spots={sorted}
          onBoundsChange={onBoundsChange}
          highlighted={highlighted}
          onHover={setHighlighted}
        />
      </div>
    );
  }

  return (
    <article className="page home-mobile">
      <div className="page-head">
        <h1>{t.home.title}</h1>
        <div className="tabs" role="tablist">
          {(['list', 'map'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              className={view === v ? 'tab active' : 'tab'}
              onClick={() => setParams(v === 'map' ? { view: 'map' } : {}, { replace: true })}
            >
              {t.home[v]}
            </button>
          ))}
        </div>
      </div>
      {view === 'map' ? (
        <div className="map-mobile">
          <SpotMap spots={sorted} />
        </div>
      ) : (
        <>
          {order}
          <SpotList spots={sorted} position={position} />
        </>
      )}
    </article>
  );
}
