import { Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { useI18n } from './i18n/context';
import { authClient } from './lib/auth-client';
import { PreferencesProvider } from './components/PreferencesProvider';
import { AboutPage } from './pages/AboutPage';
import { AdminSpotsPage } from './pages/admin/AdminSpotsPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { SpotEditPage } from './pages/admin/SpotEditPage';
import { AuthPage } from './pages/AuthPage';
import { BoardPage } from './pages/BoardPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { HomePage } from './pages/HomePage';
import { InvitesPage } from './pages/InvitesPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SessionFormPage } from './pages/SessionFormPage';
import { SpotPage } from './pages/SpotPage';
import { UsersPage } from './pages/UsersPage';

export function App() {
  const { t } = useI18n();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <main className="card">{t.common.loading}</main>;
  }

  if (!session) {
    return (
      <Routes>
        <Route path="reset-password" element={<ResetPasswordPage />} />
        {/* Sign-in page, shown for every page: there is no public content */}
        <Route path="*" element={<AuthPage />} />
      </Routes>
    );
  }

  const { user } = session;
  const isAdmin = user.role === 'admin';
  return (
    <PreferencesProvider>
      <Routes>
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="sign-in" element={<Navigate to="/" replace />} />
        <Route element={<Layout user={user} />}>
          <Route index element={<HomePage />} />
          <Route path="spots/:id" element={<SpotPage isAdmin={isAdmin} />} />
          <Route path="spots/:id/sessions/new" element={<SessionFormPage />} />
          <Route path="sessions/:sessionId/edit" element={<SessionFormPage />} />
          <Route path="board" element={<BoardPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="account/password" element={<ChangePasswordPage email={user.email} />} />
          {isAdmin && (
            <>
              <Route path="admin/spots" element={<AdminSpotsPage />} />
              <Route path="admin/spots/new" element={<SpotEditPage />} />
              <Route path="admin/spots/:id" element={<SpotEditPage />} />
              <Route path="admin/settings" element={<SettingsPage />} />
              <Route path="admin/invites" element={<InvitesPage />} />
              <Route path="admin/users" element={<UsersPage />} />
            </>
          )}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </PreferencesProvider>
  );
}
