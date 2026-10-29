import { useEffect, useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n/context';
import { apiGet, apiPatch } from '../../lib/api';

interface Settings {
  goodWind: { minKnots: number; minHours: number };
}

/** Admin: global settings (the good-wind definition; notification times come in Phase 3). */
export function SettingsPage() {
  const { t } = useI18n();
  const [form, setForm] = useState<{ minKnots: string; minHours: string } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet<Settings>('/settings')
      .then((s) =>
        setForm({ minKnots: String(s.goodWind.minKnots), minHours: String(s.goodWind.minHours) }),
      )
      .catch(() => setError(t.common.loadError));
  }, [t]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setMessage('');
    setError('');
    try {
      await apiPatch('/settings', {
        goodWind: { minKnots: Number(form.minKnots), minHours: Number(form.minHours) },
      });
      setMessage(t.common.saved);
    } catch {
      setError(t.common.saveError);
    }
  }

  return (
    <article className="page narrow">
      <h1>{t.settings.title}</h1>
      {!form && !error && <p>{t.common.loading}</p>}
      {form && (
        <form onSubmit={onSubmit}>
          <h2>{t.settings.goodWind}</h2>
          <p className="muted">{t.settings.goodWindHint}</p>
          <label>
            {t.settings.minKnots}
            <input
              type="number"
              min={1}
              max={60}
              step="0.5"
              value={form.minKnots}
              onChange={(e) => setForm({ ...form, minKnots: e.target.value })}
            />
          </label>
          <label>
            {t.settings.minHours}
            <input
              type="number"
              min={1}
              max={24}
              value={form.minHours}
              onChange={(e) => setForm({ ...form, minHours: e.target.value })}
            />
          </label>
          <button type="submit">{t.common.save}</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
      {message && <p className="message">{message}</p>}
    </article>
  );
}
