import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/context';
import { ApiError, apiGet } from '../lib/api';

interface User {
  id: string;
  name: string;
  surname: string;
  email: string;
  role: string;
  emailVerified: boolean;
  createdAt: string;
}

type State =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; users: User[] };

export function UsersPage() {
  const { t, locale } = useI18n();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    apiGet<User[]>('/users')
      .then((users) => setState({ status: 'ok', users }))
      .catch((err: unknown) =>
        setState({
          status: 'error',
          message:
            err instanceof ApiError && err.status === 403 ? t.users.adminOnly : t.users.loadFailed,
        }),
      );
  }, [t]);

  return (
    <article className="page">
      <h1>{t.users.title}</h1>
      {state.status === 'loading' && <p>{t.common.loading}</p>}
      {state.status === 'error' && <p className="error">{state.message}</p>}
      {state.status === 'ok' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t.users.name}</th>
                <th>{t.users.surname}</th>
                <th>{t.users.email}</th>
                <th>{t.users.role}</th>
                <th>{t.users.verified}</th>
                <th>{t.users.joined}</th>
              </tr>
            </thead>
            <tbody>
              {state.users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.surname}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>{user.emailVerified ? t.users.yes : t.users.no}</td>
                  <td>{new Date(user.createdAt).toLocaleDateString(locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
