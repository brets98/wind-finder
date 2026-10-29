import { Link } from 'react-router';
import { useI18n } from '../i18n/context';
import type { Session } from '../lib/days';
import { Speed } from './wind';

/** One session in a line: rider, time, rating, gear, perceived wind, comment. */
export function SessionSummary({
  session: s,
  showDate = false,
}: {
  session: Session;
  showDate?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="session-summary">
      <div className="session-head">
        <strong>{s.rider.name}</strong>
        <span className="muted">
          {showDate && `${s.date} · `}
          {s.start}–{s.end}
        </span>
        <span className="stars" aria-label={`${t.session.rating}: ${s.rating}/5`}>
          {'★'.repeat(s.rating)}
          {'☆'.repeat(5 - s.rating)}
        </span>
        {s.visibility === 'private' && <span className="badge">{t.session.privateBadge}</span>}
        {s.isOwn && (
          <Link to={`/sessions/${s.id}/edit`} className="session-edit">
            {t.common.edit}
          </Link>
        )}
      </div>
      <div className="muted">
        {t.session.sports[s.sport]}
        {s.size !== null && ` ${s.size} m²`}
        {s.board && ` · ${s.board}`}
        {s.perceivedWind !== null && (
          <>
            {' · '}
            {t.chart.perceived} <Speed knots={s.perceivedWind} />
          </>
        )}
        {s.gustiness && ` · ${t.session.gustinessValues[s.gustiness]}`}
        {s.seaState && ` · ${t.water[s.seaState]}`}
      </div>
      {s.comment && <p className="session-comment">{s.comment}</p>}
    </div>
  );
}
