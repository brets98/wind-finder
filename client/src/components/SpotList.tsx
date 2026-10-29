import { Link } from 'react-router';
import { fill, useI18n } from '../i18n/context';
import { distanceKm, type LatLon } from '../lib/geo';
import type { SpotSummary } from '../lib/spots';
import { DirectionArrow, IndicatorBadge, Speed } from './wind';

interface Props {
  spots: SpotSummary[];
  position: LatLon | null;
  /** Element id of a row to highlight (hovered on the map) */
  highlighted?: string | null;
  onHover?: (id: string | null) => void;
}

/** Spot rows, already sorted; favorites and the others under their own heading. */
export function SpotList({ spots, position, highlighted, onHover }: Props) {
  const { t } = useI18n();
  const favorites = spots.filter((s) => s.isFavorite);
  const others = spots.filter((s) => !s.isFavorite);

  const section = (title: string, list: SpotSummary[]) =>
    list.length > 0 && (
      <section className="spot-section">
        <h2>{title}</h2>
        <ul className="spot-list">
          {list.map((spot) => (
            <SpotRow
              key={spot.id}
              spot={spot}
              position={position}
              highlighted={highlighted === spot.id}
              onHover={onHover}
            />
          ))}
        </ul>
      </section>
    );

  return (
    <>
      {section(t.home.favorites, favorites)}
      {section(favorites.length ? t.home.others : t.home.title, others)}
    </>
  );
}

function SpotRow({
  spot,
  position,
  highlighted,
  onHover,
}: {
  spot: SpotSummary;
  position: LatLon | null;
  highlighted: boolean;
  onHover?: (id: string | null) => void;
}) {
  const { t } = useI18n();
  return (
    <li
      className={highlighted ? 'spot-row highlighted' : 'spot-row'}
      onMouseEnter={() => onHover?.(spot.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <Link to={`/spots/${spot.id}`} className="spot-link">
        <span className="spot-main">
          <span className="spot-name">
            {spot.isFavorite && (
              <span className="favorite-star" aria-label={t.home.favorites}>
                ★{' '}
              </span>
            )}
            {spot.name}
          </span>
          <span className="spot-meta">
            {t.spotType[spot.type]}
            {position &&
              ` · ${fill(t.home.kmAway, { km: Math.round(distanceKm(position, spot)) })}`}
            {spot.status === 'to_verify' && (
              <span className="badge badge-warn">{t.spotStatus.to_verify}</span>
            )}
          </span>
        </span>
        <span className="spot-indicators">
          <IndicatorBadge value={spot.today} label={t.indicator.today} />
          <IndicatorBadge value={spot.tomorrow} label={t.indicator.tomorrow} />
        </span>
        {spot.live && (
          <span className="spot-live" title={t.home.live}>
            <DirectionArrow degrees={spot.live.dir} /> <Speed knots={spot.live.wind} />
          </span>
        )}
      </Link>
    </li>
  );
}
