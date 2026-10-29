import { Fragment, useState } from 'react';
import { fill, useI18n } from '../i18n/context';
import type { Indicator, ModelForecast, SpotForecast } from '../lib/spots';
import { formatDay, formatHour, localDate } from '../lib/time';
import { DirectionArrow, IndicatorBadge, Speed } from './wind';

/** Background shade of a wind speed (knots), from calm to strong. */
function speedClass(knots: number | null): string {
  if (knots === null) return 'ws-none';
  if (knots < 8) return 'ws-0';
  if (knots < 12) return 'ws-1';
  if (knots < 16) return 'ws-2';
  if (knots < 20) return 'ws-3';
  if (knots < 25) return 'ws-4';
  return 'ws-5';
}

interface Column {
  index: number;
  time: string;
  date: string;
}

/** Hour columns from now on, `step` hours apart, for `days` local days. */
function columns(times: string[], days: number, step: number, now = new Date()): Column[] {
  const today = localDate(now);
  const dates = [...new Set(times.map((t) => localDate(t)))]
    .filter((d) => d >= today)
    .slice(0, days);
  const startHour = now.getTime() - 60 * 60_000;
  return times.flatMap((time, index) => {
    const date = localDate(time);
    const ms = new Date(time).getTime();
    const hour = Number(formatHour(time));
    if (!dates.includes(date) || ms < startHour || hour % step !== 0) return [];
    return [{ index, time, date }];
  });
}

function Table({
  forecast,
  models,
  cols,
}: {
  forecast: SpotForecast;
  models: ModelForecast[];
  cols: Column[];
}) {
  const { t, locale } = useI18n();
  const indicators = new Map<string, Indicator | null>(
    forecast.days.map((d) => [d.date, d.indicator]),
  );
  const days = [...new Set(cols.map((c) => c.date))].map((date) => ({
    date,
    span: cols.filter((c) => c.date === date).length,
  }));
  // A model's run can end before the table does: drop its empty trailing columns
  const hasData = (m: ModelForecast) => cols.some((c) => m.speed[c.index] !== null);

  return (
    <div className="table-wrap forecast-wrap">
      <table className="forecast">
        <thead>
          <tr>
            <th className="sticky" />
            {days.map((d) => (
              <th key={d.date} colSpan={d.span} className="day-head">
                {formatDay(d.date, locale)}{' '}
                <IndicatorBadge value={indicators.get(d.date) ?? null} />
              </th>
            ))}
          </tr>
          <tr>
            <th className="sticky">{t.forecast.hour}</th>
            {cols.map((c) => (
              <th key={c.index} className={formatHour(c.time) === '00' ? 'hour day-start' : 'hour'}>
                {formatHour(c.time)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.filter(hasData).map((m) => (
            <tr key={m.model}>
              <th className="sticky model-name" scope="row">
                {t.models[m.model] ?? m.model}
              </th>
              {cols.map((c) => {
                const speed = m.speed[c.index];
                const good = m.good[c.index];
                return (
                  <td
                    key={c.index}
                    className={`cell ${speedClass(speed)}${good ? ' good' : ''}${formatHour(c.time) === '00' ? ' day-start' : ''}`}
                  >
                    {speed !== null && (
                      <>
                        <DirectionArrow degrees={m.dir[c.index]} size={14} />
                        <span className="cell-speed">
                          <Speed knots={speed} unitLabel={false} />
                        </span>
                        <span className="cell-gust">
                          <Speed knots={m.gust[c.index]} unitLabel={false} />
                        </span>
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Waves({ forecast }: { forecast: SpotForecast }) {
  const { t, locale } = useI18n();
  const marine = forecast.marine!;
  const cols = columns(marine.times, 7, 3);
  const days = [...new Set(cols.map((c) => c.date))].map((date) => ({
    date,
    span: cols.filter((c) => c.date === date).length,
  }));
  const fmt = (v: number | null, digits = 1) => (v === null ? t.common.none : v.toFixed(digits));
  const rows: [string, (i: number) => React.ReactNode][] = [
    [t.forecast.waveHeight, (i) => fmt(marine.waveHeight[i])],
    [t.forecast.wavePeriod, (i) => fmt(marine.wavePeriod[i], 0)],
    [t.forecast.waveDirection, (i) => <DirectionArrow degrees={marine.waveDir[i]} size={14} />],
  ];
  return (
    <section className="panel" aria-labelledby="waves-title">
      <h2 id="waves-title">{t.forecast.waves}</h2>
      <div className="table-wrap forecast-wrap">
        <table className="forecast">
          <thead>
            <tr>
              <th className="sticky" />
              {days.map((d) => (
                <th key={d.date} colSpan={d.span} className="day-head">
                  {formatDay(d.date, locale)}
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky">{t.forecast.hour}</th>
              {cols.map((c) => (
                <th key={c.index} className="hour">
                  {formatHour(c.time)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, cell]) => (
              <tr key={label}>
                <th className="sticky model-name" scope="row">
                  {label}
                </th>
                {cols.map((c) => (
                  <td key={c.index} className="cell">
                    {cell(c.index)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Models side by side: the high-resolution ones hour by hour for 3 days, the global ones
 * (collapsible) every 3 hours for 7 days. Good hours are highlighted; gusts in small print.
 */
export function ForecastView({ forecast }: { forecast: SpotForecast }) {
  const { t } = useI18n();
  const [showGlobal, setShowGlobal] = useState(false);
  const highRes = forecast.models.filter((m) => m.group === 'high_res');
  const global = forecast.models.filter((m) => m.group === 'global');

  if (forecast.models.length === 0) return <p className="muted">{t.forecast.noModels}</p>;

  return (
    <>
      <section className="panel" aria-labelledby="forecast-title">
        <h2 id="forecast-title">{t.forecast.title}</h2>
        <p className="muted">
          {fill(t.forecast.goodHint, {
            knots: forecast.goodWind.minKnots,
            hours: forecast.goodWind.minHours,
          })}
        </p>
        {highRes.length > 0 && (
          <Fragment>
            <h3>{t.forecast.highRes}</h3>
            <Table forecast={forecast} models={highRes} cols={columns(forecast.times, 3, 1)} />
          </Fragment>
        )}
        {global.length > 0 && (
          <>
            <button
              type="button"
              className="secondary"
              aria-expanded={showGlobal}
              onClick={() => setShowGlobal(!showGlobal)}
            >
              {showGlobal ? t.forecast.hideGlobal : t.forecast.showGlobal}
            </button>
            {showGlobal && (
              <>
                <h3>{t.forecast.global}</h3>
                <Table forecast={forecast} models={global} cols={columns(forecast.times, 7, 3)} />
              </>
            )}
          </>
        )}
      </section>
      {forecast.marine && <Waves forecast={forecast} />}
    </>
  );
}
