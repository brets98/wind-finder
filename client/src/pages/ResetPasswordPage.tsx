import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { useI18n } from '../i18n/context';
import { authClient } from '../lib/auth-client';

export function ResetPasswordPage() {
  const { t } = useI18n();
  const token = new URLSearchParams(window.location.search).get('token');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const newPassword = String(new FormData(event.currentTarget).get('password'));
    const { error } = await authClient.resetPassword({ newPassword, token: token! });
    if (error) {
      setError(error.message ?? t.password.resetFailed);
    } else {
      setDone(true);
    }
  }

  return (
    <main className="card">
      <div className="page-head">
        <h1>{t.app.name}</h1>
        <LanguageSwitch />
      </div>
      <h2>{t.password.chooseNew}</h2>
      {!token ? (
        <p className="error">{t.password.invalidLink}</p>
      ) : done ? (
        <p className="message">{t.password.changed}</p>
      ) : (
        <form onSubmit={onSubmit}>
          <label>
            {t.password.new}
            <input
              name="password"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit">{t.password.save}</button>
        </form>
      )}
      <Link to="/sign-in">{t.password.backToSignIn}</Link>
    </main>
  );
}
