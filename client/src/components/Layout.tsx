import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useI18n } from '../i18n/context';
import { authClient } from '../lib/auth-client';
import { usePreferences } from '../lib/preferences';
import { UNITS, type Unit } from '../lib/units';
import { LanguageSwitch } from './LanguageSwitch';

interface Props {
  user: { name: string; surname: string; email: string; role?: string | null };
}

/** Signed-in layout: menu on the left (a collapsible bar on phones), page on the right. */
export function Layout({ user }: Props) {
  const { t } = useI18n();
  const { unit, setUnit } = usePreferences();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = user.role === 'admin';
  const [menuOpen, setMenuOpen] = useState(false);
  // The desktop home page is a full-screen map
  const fullBleed = location.pathname === '/';

  async function signOut() {
    await authClient.signOut();
    navigate('/');
  }

  const close = () => setMenuOpen(false);

  return (
    <div className="layout">
      <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
        <div className="sidebar-top">
          <div className="brand">{t.app.name}</div>
          <button
            type="button"
            className="secondary menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="main-menu"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {t.common.menu}
          </button>
        </div>
        <div className="sidebar-body" id="main-menu">
          <nav aria-label={t.menu.label}>
            <NavLink to="/" end onClick={close}>
              {t.menu.home}
            </NavLink>
            <NavLink to="/board" onClick={close}>
              {t.menu.board}
            </NavLink>
            {isAdmin && (
              <>
                <NavLink to="/admin/spots" onClick={close}>
                  {t.menu.adminSpots}
                </NavLink>
                <NavLink to="/admin/settings" onClick={close}>
                  {t.menu.settings}
                </NavLink>
                <NavLink to="/admin/invites" onClick={close}>
                  {t.menu.invites}
                </NavLink>
                <NavLink to="/admin/users" onClick={close}>
                  {t.menu.users}
                </NavLink>
              </>
            )}
            <NavLink to="/account/password" onClick={close}>
              {t.menu.changePassword}
            </NavLink>
            <NavLink to="/about" onClick={close}>
              {t.menu.about}
            </NavLink>
          </nav>
          <div className="sidebar-footer">
            <span className="user-name">{`${user.name} ${user.surname}`.trim()}</span>
            <span className="user-email">{user.email}</span>
            <label className="unit-switch">
              {t.units.label}
              <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {t.units[u]}
                  </option>
                ))}
              </select>
            </label>
            <LanguageSwitch />
            <button type="button" className="secondary" onClick={signOut}>
              {t.menu.signOut}
            </button>
          </div>
        </div>
      </aside>
      <main className={fullBleed ? 'content full-bleed' : 'content'}>
        <Outlet />
      </main>
    </div>
  );
}
