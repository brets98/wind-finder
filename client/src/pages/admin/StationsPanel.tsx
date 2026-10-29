import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Direction, Speed } from '../../components/wind';
import { fill, useI18n } from '../../i18n/context';
import { ApiError, apiGet, apiPost, apiPut } from '../../lib/api';
import type { Spot, StationCandidate, StationRef } from '../../lib/spots';
import { age } from '../../lib/time';

type Slot = 'station' | 'backupStation';

interface Catalogue {
  stations: number;
  syncedAt: string | null;
}

/**
 * Admin: the spot's main and backup stations. Windy stations within 20 km are suggested
 * (from the local copy of Windy's catalogue); MeteoNetwork stations are checked by code.
 */
export function StationsPanel({ spot, onChange }: { spot: Spot; onChange: (spot: Spot) => void }) {
  const { t, locale } = useI18n();
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [suggestions, setSuggestions] = useState<StationCandidate[] | null>(null);
  const [showUnusable, setShowUnusable] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [code, setCode] = useState('');
  const [checked, setChecked] = useState<StationCandidate | null>(null);
  const [error, setError] = useState('');

  const loadSuggestions = useCallback(() => {
    apiGet<StationCandidate[]>(`/spots/${spot.id}/station-suggestions`)
      .then(setSuggestions)
      .catch(() => setSuggestions([]));
  }, [spot.id]);

  useEffect(() => {
    apiGet<Catalogue>('/settings/windy-catalogue')
      .then(setCatalogue)
      .catch(() => {});
    loadSuggestions();
  }, [loadSuggestions]);

  async function sync() {
    setSyncing(true);
    setError('');
    try {
      const result = await apiPost<{ stations: number; syncedAt: string }>(
        '/settings/windy-catalogue/sync',
      );
      setCatalogue(result);
      setSuggestions(null);
      loadSuggestions();
    } catch {
      setError(t.admin.stations.syncFailed);
    } finally {
      setSyncing(false);
    }
  }

  async function assign(
    slot: Slot,
    station: Pick<StationRef, 'source' | 'stationId'> | null,
    notes = '',
  ) {
    setError('');
    try {
      const body = {
        [slot]: station && { source: station.source, stationId: station.stationId, notes },
      };
      onChange(await apiPut<Spot>(`/spots/${spot.id}/stations`, body));
    } catch (err) {
      const notFound =
        err instanceof ApiError &&
        (err.body.issues as { code: string }[] | undefined)?.[0]?.code === 'STATION_NOT_FOUND';
      setError(notFound ? t.admin.stations.notFound : t.common.saveError);
    }
  }

  async function checkCode(event: FormEvent) {
    event.preventDefault();
    setChecked(null);
    setError('');
    try {
      const query = new URLSearchParams({ source: 'meteonetwork', stationId: code.trim() });
      setChecked(await apiGet<StationCandidate>(`/spots/${spot.id}/station-check?${query}`));
    } catch {
      setError(t.admin.stations.reasons.error);
    }
  }

  const visible = (suggestions ?? []).filter((s) => showUnusable || s.usable);

  return (
    <section className="panel stations-panel" aria-labelledby="stations-title">
      <h2 id="stations-title">{t.admin.stations.title}</h2>
      {error && <p className="error">{error}</p>}

      {(['station', 'backupStation'] as const).map((slot) => (
        <Assigned
          // Remounted with the saved station, so the notes field starts from it
          key={`${slot}:${spot[slot]?.stationId}:${spot[slot]?.notes}`}
          label={slot === 'station' ? t.admin.stations.main : t.admin.stations.backup}
          station={spot[slot]}
          onClear={() => assign(slot, null)}
          onSaveNotes={(notes) => spot[slot] && assign(slot, spot[slot], notes)}
        />
      ))}

      <h3>{t.admin.stations.suggestions}</h3>
      <p className="muted">
        {catalogue?.syncedAt
          ? fill(t.admin.stations.catalogue, {
              count: catalogue.stations,
              date: new Date(catalogue.syncedAt).toLocaleDateString(locale),
            })
          : t.admin.stations.catalogueNever}{' '}
        <button type="button" className="link" onClick={sync} disabled={syncing}>
          {syncing ? t.admin.stations.syncing : t.admin.stations.syncCatalogue}
        </button>
      </p>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={showUnusable}
          onChange={(e) => setShowUnusable(e.target.checked)}
        />
        {t.admin.stations.showUnusable}
      </label>
      {suggestions === null ? (
        <p>{t.common.loading}</p>
      ) : visible.length === 0 ? (
        <p className="muted">{t.admin.stations.noSuggestions}</p>
      ) : (
        <ul className="candidates">
          {visible.map((c) => (
            <Candidate key={c.stationId} candidate={c} onAssign={(slot) => assign(slot, c)} />
          ))}
        </ul>
      )}

      <h3>{t.admin.stations.meteonetwork}</h3>
      <p className="muted">{t.admin.stations.meteonetworkHint}</p>
      <form className="inline-form" onSubmit={checkCode}>
        <label>
          {t.admin.stations.code}
          <input value={code} onChange={(e) => setCode(e.target.value)} required />
        </label>
        <button type="submit" className="secondary">
          {t.admin.stations.check}
        </button>
      </form>
      {checked && (
        <ul className="candidates">
          <Candidate candidate={checked} onAssign={(slot) => assign(slot, checked)} />
        </ul>
      )}
    </section>
  );
}

function Assigned({
  label,
  station,
  onClear,
  onSaveNotes,
}: {
  label: string;
  station: StationRef | null;
  onClear: () => void;
  onSaveNotes: (notes: string) => void;
}) {
  const { t } = useI18n();
  const [notes, setNotes] = useState(station?.notes ?? '');
  return (
    <div className="assigned">
      <strong>{label}:</strong>{' '}
      {station ? (
        <>
          {station.name} · {t.sources[station.source]} ·{' '}
          {fill(t.admin.stations.distance, { km: station.distanceKm })}{' '}
          <button type="button" className="link danger" onClick={onClear}>
            {t.admin.stations.clear}
          </button>
          <div className="inline-form">
            <label>
              {t.admin.stations.notes}
              <input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <button type="button" className="secondary" onClick={() => onSaveNotes(notes)}>
              {t.admin.stations.saveNotes}
            </button>
          </div>
        </>
      ) : (
        <span className="muted">{t.admin.noStation}</span>
      )}
    </div>
  );
}

function Candidate({
  candidate: c,
  onAssign,
}: {
  candidate: StationCandidate;
  onAssign: (slot: Slot) => void;
}) {
  const { t } = useI18n();
  return (
    <li className={c.usable ? 'candidate' : 'candidate unusable'}>
      <div>
        <strong>{c.name ?? c.stationId}</strong> · {t.sources[c.source]}
        {c.distanceKm !== undefined &&
          ` · ${fill(t.admin.stations.distance, { km: c.distanceKm })}`}
      </div>
      {c.latest && (
        <div className="muted">
          {fill(t.admin.stations.lastReading, { age: age(c.latest.time, t) })}:{' '}
          <Speed knots={c.latest.wind} />, <Direction degrees={c.latest.dir} />
        </div>
      )}
      {c.reason && <div className="muted">{t.admin.stations.reasons[c.reason]}</div>}
      {c.name && (
        <div className="candidate-actions">
          <button type="button" className="secondary" onClick={() => onAssign('station')}>
            {t.admin.stations.setMain}
          </button>
          <button type="button" className="secondary" onClick={() => onAssign('backupStation')}>
            {t.admin.stations.setBackup}
          </button>
        </div>
      )}
    </li>
  );
}
