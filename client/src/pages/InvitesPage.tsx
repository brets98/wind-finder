import { useEffect, useState, type FormEvent } from 'react';
import { fill, useI18n } from '../i18n/context';
import { ApiError, apiDelete, apiGet, apiPost } from '../lib/api';

interface Invite {
  id: string;
  email: string;
  registered: boolean;
  createdAt: string;
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; invites: Invite[] };

/** Admin: the email addresses allowed to register. */
export function InvitesPage() {
  const { t, locale } = useI18n();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet<Invite[]>('/invites')
      .then((invites) => setState({ status: 'ok', invites }))
      .catch((err: unknown) =>
        setState({
          status: 'error',
          message:
            err instanceof ApiError && err.status === 403
              ? t.invites.adminOnly
              : t.common.loadError,
        }),
      );
  }, [t]);

  /** The message for the server's first issue code, or a generic one. */
  function messageFor(err: unknown) {
    const code = err instanceof ApiError && (err.body.issues as { code: string }[])?.[0]?.code;
    return (
      (code && t.invites.issues[code as keyof typeof t.invites.issues]) || t.invites.saveFailed
    );
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status !== 'ok') return;
    setError('');
    setBusy(true);
    try {
      const invite = await apiPost<Invite>('/invites', { email });
      const invites = [...state.invites, { ...invite, registered: false }];
      setState({ status: 'ok', invites: invites.sort((a, b) => a.email.localeCompare(b.email)) });
      setEmail('');
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(invite: Invite) {
    if (state.status !== 'ok') return;
    if (!window.confirm(fill(t.invites.confirmRemove, { email: invite.email }))) return;
    setError('');
    try {
      await apiDelete(`/invites/${invite.id}`);
      setState({ status: 'ok', invites: state.invites.filter((i) => i.id !== invite.id) });
    } catch (err) {
      setError(messageFor(err));
    }
  }

  return (
    <article className="page">
      <h1>{t.invites.title}</h1>
      {state.status === 'loading' && <p>{t.common.loading}</p>}
      {state.status === 'error' && <p className="error">{state.message}</p>}
      {state.status === 'ok' && (
        <>
          <p className="muted">{t.invites.intro}</p>
          <form className="inline-form" onSubmit={add}>
            <label>
              {t.invites.email}
              <input
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button type="submit" disabled={busy}>
              {t.common.add}
            </button>
          </form>
          {error && <p className="error">{error}</p>}
          {state.invites.length === 0 ? (
            <p>{t.invites.empty}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t.invites.email}</th>
                    <th>{t.invites.registered}</th>
                    <th>{t.invites.added}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {state.invites.map((invite) => (
                    <tr key={invite.id}>
                      <td>{invite.email}</td>
                      <td>{invite.registered ? t.common.yes : t.common.no}</td>
                      <td>{new Date(invite.createdAt).toLocaleDateString(locale)}</td>
                      <td className="row-actions">
                        <button
                          type="button"
                          className="secondary danger"
                          aria-label={fill(t.invites.remove, { email: invite.email })}
                          onClick={() => remove(invite)}
                        >
                          {t.common.remove}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </article>
  );
}
