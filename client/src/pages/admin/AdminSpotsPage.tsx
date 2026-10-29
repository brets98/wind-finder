import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { fill, useI18n } from '../../i18n/context';
import { apiDelete, apiGet, apiPost } from '../../lib/api';
import type { SpotSummary } from '../../lib/spots';

type State = { status: 'loading' } | { status: 'error' } | { status: 'ok'; spots: SpotSummary[] };

/** Admin: every spot (to verify first), OSM import, create and delete. */
export function AdminSpotsPage() {
  const { t } = useI18n();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function load() {
    return apiGet<SpotSummary[]>('/spots')
      .then((spots) => setState({ status: 'ok', spots }))
      .catch(() => setState({ status: 'error' }));
  }

  useEffect(() => {
    load();
  }, []);

  async function importOsm() {
    setImporting(true);
    setMessage('');
    setError('');
    try {
      const result = await apiPost<{ found: number; created: number }>('/spots/import-osm');
      setMessage(fill(t.admin.imported, result));
      await load();
    } catch {
      setError(t.admin.importFailed);
    } finally {
      setImporting(false);
    }
  }

  async function remove(spot: SpotSummary) {
    if (state.status !== 'ok' || !window.confirm(fill(t.admin.confirmDelete, { name: spot.name })))
      return;
    try {
      await apiDelete(`/spots/${spot.id}`);
      setState({ status: 'ok', spots: state.spots.filter((s) => s.id !== spot.id) });
    } catch {
      setError(t.common.saveError);
    }
  }

  const spots =
    state.status === 'ok'
      ? [...state.spots].sort(
          (a, b) =>
            Number(a.status === 'verified') - Number(b.status === 'verified') ||
            a.name.localeCompare(b.name),
        )
      : [];

  return (
    <article className="page">
      <div className="page-head">
        <h1>{t.admin.spotsTitle}</h1>
        <div className="header-actions">
          <button type="button" className="secondary" onClick={importOsm} disabled={importing}>
            {importing ? t.admin.importing : t.admin.importOsm}
          </button>
          <Link to="/admin/spots/new" className="button">
            {t.admin.newSpot}
          </Link>
        </div>
      </div>
      {message && <p className="message">{message}</p>}
      {error && <p className="error">{error}</p>}
      {state.status === 'loading' && <p>{t.common.loading}</p>}
      {state.status === 'error' && <p className="error">{t.common.loadError}</p>}
      {state.status === 'ok' && spots.length === 0 && <p className="muted">{t.home.empty}</p>}
      {spots.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t.admin.name}</th>
                <th>{t.admin.type}</th>
                <th>{t.admin.status}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {spots.map((spot) => (
                <tr key={spot.id}>
                  <td>
                    <Link to={`/spots/${spot.id}`}>{spot.name}</Link>
                  </td>
                  <td>{t.spotType[spot.type]}</td>
                  <td>
                    <span className={spot.status === 'verified' ? 'badge' : 'badge badge-warn'}>
                      {t.spotStatus[spot.status]}
                    </span>
                  </td>
                  <td className="row-actions">
                    <Link to={`/admin/spots/${spot.id}`} className="button secondary">
                      {t.common.edit}
                    </Link>{' '}
                    <button
                      type="button"
                      className="secondary danger"
                      aria-label={`${t.common.delete} ${spot.name}`}
                      onClick={() => remove(spot)}
                    >
                      {t.common.delete}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
