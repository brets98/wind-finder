import { useI18n } from '../i18n/context';
import type { Indicator, Sector } from '../lib/spots';
import { usePreferences } from '../lib/preferences';
import { compassPoint, speedIn } from '../lib/units';

/** A speed in the user's unit, e.g. "15 kn" or "4 Bft"; a dash when missing. */
export function Speed({ knots, unitLabel = true }: { knots: number | null; unitLabel?: boolean }) {
  const { t } = useI18n();
  const { unit } = usePreferences();
  if (knots === null) return <>{t.common.none}</>;
  const short = unit === 'beaufort' ? t.units.beaufortShort : t.units.knotsShort;
  return (
    <>
      {speedIn(knots, unit)}
      {unitLabel && <span className="unit"> {short}</span>}
    </>
  );
}

/**
 * An arrow pointing where the wind goes (so a north wind points down), with the compass
 * point of where it comes from as its label.
 */
export function DirectionArrow({ degrees, size = 16 }: { degrees: number | null; size?: number }) {
  if (degrees === null) return null;
  return (
    <svg
      className="direction-arrow"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={compassPoint(degrees)}
      style={{ transform: `rotate(${degrees + 180}deg)` }}
    >
      <path d="M12 2 L19 20 L12 15 L5 20 Z" fill="currentColor" />
    </svg>
  );
}

/** Where the wind comes from, as arrow plus compass point and degrees. */
export function Direction({ degrees }: { degrees: number | null }) {
  const { t } = useI18n();
  if (degrees === null) return <>{t.common.none}</>;
  return (
    <span className="direction">
      <DirectionArrow degrees={degrees} /> {compassPoint(degrees)} {Math.round(degrees)}°
    </span>
  );
}

export function IndicatorBadge({ value, label }: { value: Indicator | null; label?: string }) {
  const { t } = useI18n();
  const text = value ? t.indicator[value] : t.indicator.unknown;
  return (
    <span
      className={`indicator indicator-${value ?? 'unknown'}`}
      title={label ? `${label}: ${text}` : text}
    >
      {label && <span className="indicator-label">{label}</span>}
      <span className="indicator-dot" aria-hidden="true" />
      <span className="sr-only">{text}</span>
    </span>
  );
}

/** Points on a circle of radius r around (50, 50), 0° at the top, clockwise. */
function polar(deg: number, r: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [50 + r * Math.cos(rad), 50 + r * Math.sin(rad)];
}

function sectorPath({ from, to }: Sector, r: number) {
  const span = (to - from + 360) % 360 || 360;
  if (span >= 360) return `M50 ${50 - r} A${r} ${r} 0 1 1 49.99 ${50 - r} Z`;
  const [x1, y1] = polar(from, r);
  const [x2, y2] = polar(from + span, r);
  return `M50 50 L${x1} ${y1} A${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
}

/** A small wind rose: good directions in green, directions to avoid in red. */
export function CompassRose({
  good,
  avoid,
  size = 96,
}: {
  good: Sector[];
  avoid: Sector[];
  size?: number;
}) {
  const { t } = useI18n();
  const label = [
    `${t.spot.goodDirections}: ${good.map((s) => `${compassPoint(s.from)}–${compassPoint(s.to)}`).join(', ') || t.common.none}`,
    avoid.length
      ? `${t.spot.avoidDirections}: ${avoid.map((s) => `${compassPoint(s.from)}–${compassPoint(s.to)}`).join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('. ');
  return (
    <svg
      className="compass-rose"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={label}
    >
      <circle cx="50" cy="50" r="40" className="rose-ring" />
      {good.map((s, i) => (
        <path key={`g${i}`} d={sectorPath(s, 40)} className="rose-good" />
      ))}
      {avoid.map((s, i) => (
        <path key={`a${i}`} d={sectorPath(s, 40)} className="rose-avoid" />
      ))}
      {['N', 'E', 'S', 'W'].map((p, i) => {
        const [x, y] = polar(i * 90, 47);
        return (
          <text
            key={p}
            x={x}
            y={y}
            className="rose-label"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {p}
          </text>
        );
      })}
    </svg>
  );
}
