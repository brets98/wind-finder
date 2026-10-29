import { Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { useI18n } from './i18n/context';
import { authClient } from './lib/auth-client';
import { AuthPage } from './pages/AuthPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { HomePage } from './pages/HomePage';
import { InvitesPage } from './pages/InvitesPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
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
  return (
    <Routes>
      <Route path="reset-password" element={<ResetPasswordPage />} />
      <Route path="sign-in" element={<Navigate to="/" replace />} />
      <Route element={<Layout user={user} />}>
        <Route index element={<HomePage />} />
        <Route path="admin/invites" element={<InvitesPage />} />
        <Route path="admin/users" element={<UsersPage />} />
        <Route path="account/password" element={<ChangePasswordPage email={user.email} />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
