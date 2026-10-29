import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { fill, useI18n } from '../i18n/context';
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from '../lib/api';
import { GUSTINESS, SEA_STATES, SPORTS, type Session } from '../lib/days';
import type { Spot } from '../lib/spots';
import { localDate } from '../lib/time';

interface Form {
  date: string;
  start: string;
  end: string;
  sport: Session['sport'];
  size: string;
  board: string;
  perceivedWind: string;
  gustiness: string;
  seaState: string;
  rating: number;
  comment: string;
  visibility: Session['visibility'];
}

const blank = (): Form => ({
  date: localDate(new Date()),
  start: '',
  end: '',
  sport: 'kite',
  size: '',
  board: '',
  perceivedWind: '',
  gustiness: '',
  seaState: '',
  rating: 0,
  comment: '',
  visibility: 'group',
});

const toForm = (s: Session): Form => ({
  ...s,
  size: s.size === null ? '' : String(s.size),
  perceivedWind: s.perceivedWind === null ? '' : String(s.perceivedWind),
  gustiness: s.gustiness ?? '',
  seaState: s.seaState ?? '',
});

const number = (value: string) => (value.trim() === '' ? null : Number(value.replace(',', '.')));

/**
 * Logs a session (`/spots/:id/sessions/new`) or edits one (`/sessions/:sessionId/edit`).
 * Saving also saves the whole Day, which can take a few seconds.
 */
export function SessionFormPage() {
  const { t } = useI18n();
  const { id: spotParam, sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (sessionId) {
          const s = await apiGet<Session>(`/sessions/${sessionId}`);
          setSession(s);
          setForm(toForm(s));
          setSpot(await apiGet<Spot>(`/spots/${s.spotId}`));
        } else {
          setSpot(await apiGet<Spot>(`/spots/${spotParam}`));
        }
      } catch {
        setError(t.common.loadError);
      }
    })();
  }, [sessionId, spotParam, t]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!spot) return;
    setBusy(true);
    setIssues({});
    setError('');
    const body = {
      ...form,
      spotId: spot.id,
      size: number(form.size),
      perceivedWind: number(form.perceivedWind),
      gustiness: form.gustiness || null,
      seaState: form.seaState || null,
    };
    try {
      if (session) await apiPatch(`/sessions/${session.id}`, body);
      else await apiPost('/sessions', body);
      navigate(`/spots/${spot.id}`);
    } catch (err) {
      const list =
        err instanceof ApiError
          ? (err.body.issues as { code: string; field?: string }[])
          : undefined;
      if (list?.length) {
        setIssues(
          Object.fromEntries(list.map((i) => [i.field ?? '', t.session.issues[i.code] ?? i.code])),
        );
      } else setError(t.common.saveError);
      setBusy(false);
    }
  }

  async function remove() {
    if (!session || !spot || !window.confirm(t.session.confirmDelete)) return;
    try {
      await apiDelete(`/sessions/${session.id}`);
      navigate(`/spots/${spot.id}`);
    } catch {
      setError(t.common.saveError);
    }
  }

  if (!spot)
    return (
      <p className="page">{error ? <span className="error">{error}</span> : t.common.loading}</p>
    );
  const issue = (field: string) =>
    issues[field] && <span className="field-error">{issues[field]}</span>;

  return (
    <article className="page narrow-wide">
      <Link to={`/spots/${spot.id}`} className="back-link">
        ← {spot.name}
      </Link>
      <h1>{fill(session ? t.session.editTitle : t.session.newTitle, { spot: spot.name })}</h1>
      <form onSubmit={onSubmit} className="spot-form" noValidate>
        <div className="row">
          <label>
            {t.session.date}
            <input
              type="date"
              value={form.date}
              max={localDate(new Date())}
              min="2024-01-01"
              onChange={(e) => set('date', e.target.value)}
            />
            {issue('date')}
          </label>
          <label>
            {t.session.start}
            <input type="time" value={form.start} onChange={(e) => set('start', e.target.value)} />
            {issue('start')}
          </label>
          <label>
            {t.session.end}
            <input type="time" value={form.end} onChange={(e) => set('end', e.target.value)} />
            {issue('end')}
          </label>
        </div>
        <div className="row">
          <label>
            {t.session.sport}
            <select
              value={form.sport}
              onChange={(e) => set('sport', e.target.value as Form['sport'])}
            >
              {SPORTS.map((s) => (
                <option key={s} value={s}>
                  {t.session.sports[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.session.size}
            <input
              inputMode="decimal"
              value={form.size}
              onChange={(e) => set('size', e.target.value)}
            />
            {issue('size')}
          </label>
          <label>
            {t.session.board}
            <input value={form.board} onChange={(e) => set('board', e.target.value)} />
          </label>
        </div>
        <div className="row">
          <label>
            {t.session.perceivedWind}
            <input
              inputMode="decimal"
              value={form.perceivedWind}
              onChange={(e) => set('perceivedWind', e.target.value)}
            />
            {issue('perceivedWind')}
          </label>
          <label>
            {t.session.gustiness}
            <select value={form.gustiness} onChange={(e) => set('gustiness', e.target.value)}>
              <option value="">{t.session.notSet}</option>
              {GUSTINESS.map((g) => (
                <option key={g} value={g}>
                  {t.session.gustinessValues[g]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.session.seaState}
            <select value={form.seaState} onChange={(e) => set('seaState', e.target.value)}>
              <option value="">{t.session.notSet}</option>
              {SEA_STATES.map((s) => (
                <option key={s} value={s}>
                  {t.water[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="rating">
          <legend>{t.session.rating}</legend>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="star">
              <input
                type="radio"
                name="rating"
                value={n}
                aria-label={fill(t.session.ratingValue, { n })}
                checked={form.rating === n}
                onChange={() => set('rating', n)}
              />
              <span aria-hidden="true">{n <= form.rating ? '★' : '☆'}</span>
            </label>
          ))}
          {issue('rating')}
        </fieldset>
        <label>
          {t.session.comment}
          <textarea
            rows={3}
            value={form.comment}
            onChange={(e) => set('comment', e.target.value)}
          />
        </label>
        <fieldset className="choice">
          <legend>{t.session.visibility}</legend>
          {(['group', 'private'] as const).map((v) => (
            <label key={v} className="checkbox">
              <input
                type="radio"
                name="visibility"
                checked={form.visibility === v}
                onChange={() => set('visibility', v)}
              />
              {t.session[v]}
            </label>
          ))}
        </fieldset>
        {error && <p className="error">{error}</p>}
        <div className="header-actions">
          <button type="submit" disabled={busy}>
            {busy ? t.session.saving : t.session.save}
          </button>
          {session && (
            <button type="button" className="secondary danger" onClick={remove}>
              {t.session.delete}
            </button>
          )}
        </div>
      </form>
    </article>
  );
}
