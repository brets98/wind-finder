import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/context';
import { apiGet, apiPatch } from '../lib/api';
import { disablePush, enablePush, pushState, type PushState } from '../lib/push';

/** The user's notifications: push on this device, and the evening email. */
export function NotificationsPage() {
  const { t } = useI18n();
  const [push, setPush] = useState<PushState | null>(null);
  const [email, setEmail] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    pushState()
      .then(setPush)
      .catch(() => setPush('unsupported'));
    apiGet<{ email: boolean }>('/me/preferences')
      .then((prefs) => setEmail(prefs.email))
      .catch(() => setError(t.common.loadError));
  }, [t]);

  async function changePush(action: () => Promise<PushState>) {
    setBusy(true);
    setError('');
    try {
      setPush(await action());
    } catch {
      setError(t.notifications.pushError);
    } finally {
      setBusy(false);
    }
  }

  async function changeEmail(next: boolean) {
    setEmail(next);
    setError('');
    try {
      await apiPatch('/me/preferences', { email: next });
    } catch {
      setEmail(!next);
      setError(t.common.saveError);
    }
  }

  const pushNote: Partial<Record<PushState, string>> = {
    on: t.notifications.pushOn,
    off: t.notifications.pushOff,
    denied: t.notifications.pushDenied,
    unsupported: t.notifications.pushUnsupported,
    'ios-install': t.notifications.iosInstall,
    'server-off': t.notifications.pushServerOff,
  };

  return (
    <article className="page narrow">
      <h1>{t.notifications.title}</h1>
      <p className="muted">{t.notifications.intro}</p>

      <h2>{t.notifications.push}</h2>
      {push === null ? (
        <p>{t.common.loading}</p>
      ) : (
        <>
          <p>{pushNote[push]}</p>
          {push === 'off' && (
            <button type="button" disabled={busy} onClick={() => changePush(enablePush)}>
              {t.notifications.enablePush}
            </button>
          )}
          {push === 'on' && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => changePush(disablePush)}
            >
              {t.notifications.disablePush}
            </button>
          )}
        </>
      )}

      <h2>{t.notifications.email}</h2>
      {email === null ? (
        !error && <p>{t.common.loading}</p>
      ) : (
        <label className="checkbox">
          <input type="checkbox" checked={email} onChange={(e) => changeEmail(e.target.checked)} />
          {t.notifications.emailOn}
        </label>
      )}

      {error && <p className="error">{error}</p>}
    </article>
  );
}
