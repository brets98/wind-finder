import { useEffect, useState, type FormEvent } from 'react';
import { fill, useI18n } from '../i18n/context';
import { authClient } from '../lib/auth-client';

interface Props {
  email: string;
}

export function ChangePasswordPage({ email }: Props) {
  const { t } = useI18n();
  // Accounts created with Google have no password until they set one
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);

  useEffect(() => {
    authClient.listAccounts().then(({ data }) => {
      setHasPassword(Boolean(data?.some((account) => account.providerId === 'credential')));
    });
  }, []);

  return (
    <article className="page narrow">
      <h1>{t.password.title}</h1>
      {hasPassword === null && <p>{t.common.loading}</p>}
      {hasPassword === true && <ChangePasswordForm />}
      {hasPassword === false && <SetPassword email={email} />}
    </article>
  );
}

function ChangePasswordForm() {
  const { t } = useI18n();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const currentPassword = String(form.get('currentPassword'));
    const newPassword = String(form.get('newPassword'));
    setError('');
    setMessage('');

    if (newPassword !== form.get('confirmPassword')) {
      setError(t.password.mismatch);
      return;
    }

    setBusy(true);
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: form.get('revokeOtherSessions') === 'on',
    });
    setBusy(false);

    if (error) {
      setError(error.message ?? t.password.changeFailed);
    } else {
      formElement.reset();
      setMessage(t.password.changed);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <label>
        {t.password.current}
        <input name="currentPassword" type="password" required autoComplete="current-password" />
      </label>
      <label>
        {t.password.new}
        <input
          name="newPassword"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
        />
      </label>
      <label>
        {t.password.confirm}
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
        />
      </label>
      <label className="checkbox">
        <input name="revokeOtherSessions" type="checkbox" defaultChecked />
        {t.password.revokeOthers}
      </label>
      {error && <p className="error">{error}</p>}
      {message && <p className="message">{message}</p>}
      <button type="submit" disabled={busy}>
        {t.password.submit}
      </button>
    </form>
  );
}

function SetPassword({ email }: { email: string }) {
  const { t } = useI18n();
  const [sent, setSent] = useState(false);

  async function sendLink() {
    await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
    setSent(true);
  }

  return (
    <>
      <p>{t.password.googleOnly}</p>
      {sent ? (
        <p className="message">{fill(t.password.linkSent, { email })}</p>
      ) : (
        <button type="button" onClick={sendLink}>
          {t.password.sendLink}
        </button>
      )}
    </>
  );
}
