import { useId, useState, type PointerEvent } from 'react';
import { fill, useI18n } from '../i18n/context';
import type { Value } from '../lib/spots';
import { usePreferences } from '../lib/preferences';
import { formatHour } from '../lib/time';
import { speedIn } from '../lib/units';
import { minutes } from '../lib/days';

/**
 * One day of wind at a spot, one axis (knots or Beaufort): the forecast of the day before
 * (D-1, dashed), the latest forecast (D0), the station's observations and, as a band over the
 * session's hours, the wind the rider perceived. Colors from the validated categorical palette
 * (slots 1–4, CSS variables `--series-*`); a legend always, a crosshair with every value, and a
 * table view (the light-mode aqua and yellow need it: below 3:1 contrast).
 */
export interface WindChartProps {
  hours: string[];
  forecastD1?: Value[];
  forecastD0?: Value[];
  observed?: Value[];
  perceived?: { knots: number; start: string; end: string }[];
  /** Small version for board cards: no axis labels, no table toggle */
  compact?: boolean;
  title?: string;
}

type SeriesKey = 'd1' | 'd0' | 'observed';

const WIDTH = 640;

export function WindChart({
  hours,
  forecastD1 = [],
  forecastD0 = [],
  observed = [],
  perceived = [],
  compact = false,
  title,
}: WindChartProps) {
  const { t } = useI18n();
  const { unit } = usePreferences();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const id = useId();

  const height = compact ? 110 : 220;
  const pad = compact
    ? { top: 8, right: 8, bottom: 18, left: 26 }
    : { top: 12, right: 12, bottom: 28, left: 40 };
  const plotW = WIDTH - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const shown = (v: Value) => (v === null ? null : speedIn(v, unit));

  const series: { key: SeriesKey; label: string; values: Value[] }[] = (
    [
      { key: 'd0', label: t.chart.forecastD0, values: forecastD0 },
      { key: 'observed', label: t.chart.observed, values: observed },
      { key: 'd1', label: t.chart.forecastD1, values: forecastD1 },
    ] as const
  ).filter((s) => s.values.some((v) => v !== null));

  const all = [...series.flatMap((s) => s.values), ...perceived.map((p) => p.knots)]
    .filter((v): v is number => v !== null)
    .map((v) => speedIn(v, unit));
  const step = unit === 'beaufort' ? 2 : 5;
  const max = Math.max(step * 2, Math.ceil(Math.max(0, ...all) / step) * step);
  const n = Math.max(hours.length, 1);
  const x = (i: number) => pad.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  // Session times (local) on the hours axis: hour index + minutes
  const xAt = (time: string) => {
    const m = minutes(time);
    const first = Number(formatHour(hours[0] ?? new Date().toISOString()));
    return x(Math.min(n - 1, Math.max(0, (m - first * 60) / 60)));
  };

  const path = (values: Value[]) =>
    values
      .map((v, i) => {
        const s = shown(v);
        if (s === null) return '';
        const prev = i > 0 ? values[i - 1] : null;
        return `${prev === null || i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(s).toFixed(1)}`;
      })
      .join(' ');

  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  const unitLabel = unit === 'beaufort' ? t.units.beaufortShort : t.units.knotsShort;
  const hourLabels = hours
    .map((h, i) => ({ i, label: formatHour(h) }))
    .filter((h) => Number(h.label) % (compact ? 6 : 3) === 0);

  function onMove(event: PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * WIDTH;
    const i = Math.round(((px - pad.left) / plotW) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  }

  const perceivedAt = (i: number) =>
    perceived.find((p) => {
      const hour = Number(formatHour(hours[i]));
      return hour * 60 >= minutes(p.start) - 59 && hour * 60 < minutes(p.end);
    });

  const empty = series.length === 0 && perceived.length === 0;

  return (
    <figure
      className={compact ? 'wind-chart compact' : 'wind-chart'}
      aria-labelledby={title ? `${id}-title` : undefined}
    >
      {title && (
        <figcaption id={`${id}-title`} className="chart-title">
          {title}
        </figcaption>
      )}
      <ul className="chart-legend">
        {series.map((s) => (
          <li key={s.key}>
            <svg width="18" height="8" aria-hidden="true">
              <line x1="1" y1="4" x2="17" y2="4" className={`line-${s.key}`} />
            </svg>
            {s.label}
          </li>
        ))}
        {perceived.length > 0 && (
          <li>
            <svg width="18" height="8" aria-hidden="true">
              <rect x="1" y="1" width="16" height="6" rx="2" className="band-perceived" />
            </svg>
            {t.chart.perceived}
          </li>
        )}
      </ul>
      {empty ? (
        <p className="muted">{t.chart.noData}</p>
      ) : table && !compact ? (
        <div className="table-wrap">
          <table className="chart-table">
            <thead>
              <tr>
                <th>{t.forecast.hour}</th>
                {series.map((s) => (
                  <th key={s.key}>{`${s.label} (${unitLabel})`}</th>
                ))}
                {perceived.length > 0 && <th>{`${t.chart.perceived} (${unitLabel})`}</th>}
              </tr>
            </thead>
            <tbody>
              {hours.map((h, i) => (
                <tr key={h}>
                  <td>{formatHour(h)}</td>
                  {series.map((s) => (
                    <td key={s.key}>{shown(s.values[i] ?? null) ?? t.common.none}</td>
                  ))}
                  {perceived.length > 0 && (
                    <td>{(perceivedAt(i) && shown(perceivedAt(i)!.knots)) ?? t.common.none}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-plot">
          <svg
            viewBox={`0 0 ${WIDTH} ${height}`}
            role="img"
            aria-label={title ?? t.chart.label}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          >
            {ticks.map((v) => (
              <g key={v}>
                <line x1={pad.left} x2={WIDTH - pad.right} y1={y(v)} y2={y(v)} className="grid" />
                {!compact || v === max ? (
                  <text
                    x={pad.left - 6}
                    y={y(v)}
                    className="axis-label"
                    textAnchor="end"
                    dominantBaseline="central"
                  >
                    {v}
                  </text>
                ) : null}
              </g>
            ))}
            {hourLabels.map((h) => (
              <text key={h.i} x={x(h.i)} y={height - 6} className="axis-label" textAnchor="middle">
                {h.label}
              </text>
            ))}
            {perceived.map((p, i) => {
              const s = speedIn(p.knots, unit);
              return (
                <rect
                  key={i}
                  x={xAt(p.start)}
                  y={y(s) - 3}
                  width={Math.max(4, xAt(p.end) - xAt(p.start))}
                  height={6}
                  rx={3}
                  className="band-perceived"
                />
              );
            })}
            {series.map((s) => (
              <path key={s.key} d={path(s.values)} className={`line-${s.key}`} fill="none" />
            ))}
            {hover !== null && (
              <g>
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={pad.top}
                  y2={pad.top + plotH}
                  className="crosshair"
                />
                {series.map((s) => {
                  const v = shown(s.values[hover] ?? null);
                  return v === null ? null : (
                    <circle key={s.key} cx={x(hover)} cy={y(v)} r={4} className={`dot-${s.key}`} />
                  );
                })}
              </g>
            )}
          </svg>
          {hover !== null && (
            <div
              className="chart-tooltip"
              role="status"
              style={{ left: `${(x(hover) / WIDTH) * 100}%` }}
            >
              <strong>{formatHour(hours[hover])}:00</strong>
              {series.map((s) => {
                const v = shown(s.values[hover] ?? null);
                return (
                  <span key={s.key} className="tooltip-row">
                    <svg width="12" height="6" aria-hidden="true">
                      <line x1="0" y1="3" x2="12" y2="3" className={`line-${s.key}`} />
                    </svg>
                    <strong>{v ?? t.common.none}</strong> {unitLabel} {s.label}
                  </span>
                );
              })}
              {perceivedAt(hover) && (
                <span className="tooltip-row">
                  <strong>{shown(perceivedAt(hover)!.knots)}</strong> {unitLabel}{' '}
                  {t.chart.perceived}
                </span>
              )}
            </div>
          )}
        </div>
      )}
      {!compact && !empty && (
        <button type="button" className="link" onClick={() => setTable(!table)}>
          {table ? t.chart.showChart : t.chart.showTable}
        </button>
      )}
      {compact && !empty && (
        <span className="sr-only">{fill(t.chart.max, { max, unit: unitLabel })}</span>
      )}
    </figure>
  );
}
