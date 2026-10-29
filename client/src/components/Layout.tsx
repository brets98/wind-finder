import { NavLink, Outlet, useNavigate } from 'react-router';
import { useI18n } from '../i18n/context';
import { authClient } from '../lib/auth-client';
import { LanguageSwitch } from './LanguageSwitch';

interface Props {
  user: { name: string; surname: string; email: string; role?: string | null };
}

export function Layout({ user }: Props) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const isAdmin = user.role === 'admin';

  async function signOut() {
    await authClient.signOut();
    navigate('/');
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">{t.app.name}</div>
        <nav aria-label={t.menu.label}>
          <NavLink to="/" end>
            {t.menu.home}
          </NavLink>
          {isAdmin && <NavLink to="/admin/invites">{t.menu.invites}</NavLink>}
          {isAdmin && <NavLink to="/admin/users">{t.menu.users}</NavLink>}
          <NavLink to="/account/password">{t.menu.changePassword}</NavLink>
        </nav>
        <div className="sidebar-footer">
          <span className="user-name">{`${user.name} ${user.surname}`.trim()}</span>
          <span className="user-email">{user.email}</span>
          <LanguageSwitch />
          <button type="button" className="secondary" onClick={signOut}>
            {t.menu.signOut}
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
