import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { CompassRose } from '../../components/wind';
import { fill, useI18n } from '../../i18n/context';
import { ApiError, apiGet, apiPatch, apiPost } from '../../lib/api';
import type { Sector, Spot } from '../../lib/spots';
import { StationsPanel } from './StationsPanel';

type Form = Pick<
  Spot,
  | 'name'
  | 'region'
  | 'type'
  | 'status'
  | 'goodDirections'
  | 'avoidDirections'
  | 'water'
  | 'level'
  | 'season'
  | 'notes'
  | 'isStudySpot'
> & { lat: string; lon: string };

const EMPTY: Form = {
  name: '',
  lat: '',
  lon: '',
  region: '',
  type: 'sea',
  status: 'to_verify',
  goodDirections: [],
  avoidDirections: [],
  water: null,
  level: null,
  season: '',
  notes: '',
  isStudySpot: false,
};

const toForm = (s: Spot): Form => ({ ...s, lat: String(s.lat), lon: String(s.lon) });

type Issues = Record<string, string>;

/** Admin: create a spot (`/admin/spots/new`) or edit one, including its stations. */
export function SpotEditPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === undefined;
  const [spot, setSpot] = useState<Spot | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [loadError, setLoadError] = useState(false);
  const [issues, setIssues] = useState<Issues>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) return;
    apiGet<Spot>(`/spots/${id}`)
      .then((s) => {
        setSpot(s);
        setForm(toForm(s));
      })
      .catch(() => setLoadError(true));
  }, [id, isNew]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setIssues({});
    setMessage('');
    setError('');
    const body = {
      ...form,
      lat: Number(form.lat.replace(',', '.')),
      lon: Number(form.lon.replace(',', '.')),
    };
    try {
      if (isNew) {
        const created = await apiPost<Spot>('/spots', body);
        navigate(`/admin/spots/${created.id}`, { replace: true });
      } else {
        const saved = await apiPatch<Spot>(`/spots/${id}`, body);
        setSpot(saved);
        setForm(toForm(saved));
        setMessage(t.common.saved);
      }
    } catch (err) {
      const list =
        err instanceof ApiError
          ? (err.body.issues as { code: string; field?: string }[])
          : undefined;
      if (list?.length) {
        setIssues(
          Object.fromEntries(list.map((i) => [i.field ?? '', t.admin.issues[i.code] ?? i.code])),
        );
      } else {
        setError(t.common.saveError);
      }
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <p className="page error">{t.spot.notFound}</p>;
  if (!isNew && !spot) return <p className="page">{t.common.loading}</p>;

  const issue = (field: string) =>
    issues[field] && <span className="field-error">{issues[field]}</span>;

  return (
    <article className="page narrow-wide">
      <Link to="/admin/spots" className="back-link">
        ← {t.admin.spotsTitle}
      </Link>
      <h1>{isNew ? t.admin.createTitle : fill(t.admin.editTitle, { name: spot!.name })}</h1>

      <form onSubmit={onSubmit} className="spot-form" noValidate>
        <label>
          {t.admin.name}
          <input value={form.name} onChange={(e) => set('name', e.target.value)} required />
          {issue('name')}
        </label>
        <div className="row">
          <label>
            {t.admin.lat}
            <input
              inputMode="decimal"
              value={form.lat}
              onChange={(e) => set('lat', e.target.value)}
            />
          </label>
          <label>
            {t.admin.lon}
            <input
              inputMode="decimal"
              value={form.lon}
              onChange={(e) => set('lon', e.target.value)}
            />
          </label>
        </div>
        {issue('location')}
        <div className="row">
          <label>
            {t.admin.type}
            <select value={form.type} onChange={(e) => set('type', e.target.value as Form['type'])}>
              <option value="sea">{t.spotType.sea}</option>
              <option value="lake">{t.spotType.lake}</option>
            </select>
          </label>
          <label>
            {t.admin.status}
            <select
              value={form.status}
              onChange={(e) => set('status', e.target.value as Form['status'])}
            >
              <option value="to_verify">{t.spotStatus.to_verify}</option>
              <option value="verified">{t.spotStatus.verified}</option>
            </select>
          </label>
        </div>
        <label>
          {t.spot.region}
          <input value={form.region} onChange={(e) => set('region', e.target.value)} />
        </label>

        <div className="sectors-block">
          <div>
            <SectorsField
              label={t.spot.goodDirections}
              sectors={form.goodDirections}
              onChange={(v) => set('goodDirections', v)}
            />
            {issue('goodDirections')}
            <SectorsField
              label={t.spot.avoidDirections}
              sectors={form.avoidDirections}
              onChange={(v) => set('avoidDirections', v)}
            />
            {issue('avoidDirections')}
            <p className="muted">{t.admin.sectorHint}</p>
          </div>
          <CompassRose good={form.goodDirections} avoid={form.avoidDirections} size={120} />
        </div>

        <div className="row">
          <label>
            {t.spot.water}
            <select
              value={form.water ?? ''}
              onChange={(e) => set('water', (e.target.value || null) as Form['water'])}
            >
              <option value="">{t.admin.notSet}</option>
              {(['flat', 'chop', 'waves'] as const).map((w) => (
                <option key={w} value={w}>
                  {t.water[w]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.spot.level}
            <select
              value={form.level ?? ''}
              onChange={(e) => set('level', (e.target.value || null) as Form['level'])}
            >
              <option value="">{t.admin.notSet}</option>
              {(['beginner', 'intermediate', 'advanced'] as const).map((l) => (
                <option key={l} value={l}>
                  {t.level[l]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          {t.spot.season}
          <input value={form.season} onChange={(e) => set('season', e.target.value)} />
        </label>
        <label>
          {t.spot.notes}
          <textarea rows={4} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.isStudySpot}
            onChange={(e) => set('isStudySpot', e.target.checked)}
          />
          {t.spot.studySpot}
        </label>
        <p className="muted">{t.admin.studySpotHint}</p>

        {error && <p className="error">{error}</p>}
        {message && <p className="message">{message}</p>}
        <button type="submit" disabled={busy}>
          {t.common.save}
        </button>
      </form>

      {spot && <StationsPanel spot={spot} onChange={setSpot} />}
    </article>
  );
}

function SectorsField({
  label,
  sectors,
  onChange,
}: {
  label: string;
  sectors: Sector[];
  onChange: (sectors: Sector[]) => void;
}) {
  const { t } = useI18n();
  const update = (i: number, key: keyof Sector, value: string) =>
    onChange(sectors.map((s, j) => (j === i ? { ...s, [key]: Number(value) } : s)));
  return (
    <fieldset className="sectors">
      <legend>{label}</legend>
      {sectors.map((s, i) => (
        <div key={i} className="sector-row">
          <label>
            {t.admin.from}
            <input
              type="number"
              min={0}
              max={359}
              value={s.from}
              onChange={(e) => update(i, 'from', e.target.value)}
            />
          </label>
          <label>
            {t.admin.to}
            <input
              type="number"
              min={0}
              max={359}
              value={s.to}
              onChange={(e) => update(i, 'to', e.target.value)}
            />
          </label>
          <button
            type="button"
            className="secondary danger"
            aria-label={t.admin.removeSector}
            onClick={() => onChange(sectors.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="link"
        onClick={() => onChange([...sectors, { from: 0, to: 45 }])}
      >
        + {t.admin.addSector}
      </button>
    </fieldset>
  );
}
