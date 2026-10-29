import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { LanguageProvider } from './i18n/LanguageProvider';
import { authClient } from './lib/auth-client';

vi.mock('./lib/auth-client');

const mocked = vi.mocked(authClient, { deep: true });

function renderAt(path: string) {
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </LanguageProvider>,
  );
}

function signedOut() {
  mocked.useSession.mockReturnValue({ data: null, isPending: false } as never);
}

function signedInAs(role: string) {
  mocked.useSession.mockReturnValue({
    data: { user: { name: 'Mario', surname: 'Rossi', email: 'mario@example.com', role } },
    isPending: false,
  } as never);
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillSignUp() {
  fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
  fill('Name', 'Mario');
  fill('Surname', 'Rossi');
  fill('Email', 'mario@example.com');
  fill('Password', 'correct-horse-battery');
  fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('[]', { status: 200 }))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  describe('signed out', () => {
    it('shows the sign-in form on every page, with no menu', () => {
      signedOut();
      renderAt('/admin/invites');

      expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    });

    it('signs up with name and surname, saying it is by invitation, then asks to verify', async () => {
      signedOut();
      mocked.signUp.email.mockResolvedValue({ data: {}, error: null } as never);
      renderAt('/sign-in');

      fillSignUp();

      expect(screen.getByText(/by invitation only/)).toBeInTheDocument();
      expect(await screen.findByText(/Check your inbox/)).toBeInTheDocument();
      expect(mocked.signUp.email).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Mario', surname: 'Rossi', email: 'mario@example.com' }),
      );
    });

    it('explains a sign-up refused because the email was not invited', async () => {
      signedOut();
      mocked.signUp.email.mockResolvedValue({
        data: null,
        error: { status: 403, code: 'not_invited', message: 'This email has not been invited' },
      } as never);
      renderAt('/sign-in');

      fillSignUp();

      expect(await screen.findByText(/has not been invited/)).toBeInTheDocument();
      expect(screen.queryByText(/Check your inbox/)).not.toBeInTheDocument();
    });

    it('explains a Google sign-in refused because the email was not invited', () => {
      signedOut();
      renderAt('/sign-in?error=not_invited');

      expect(screen.getByText(/has not been invited/)).toBeInTheDocument();
    });

    it('tells unverified users to check their email', async () => {
      signedOut();
      mocked.signIn.email.mockResolvedValue({
        data: null,
        error: { status: 403, message: 'Email not verified' },
      } as never);
      renderAt('/sign-in');

      fill('Email', 'mario@example.com');
      fill('Password', 'correct-horse-battery');
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

      expect(await screen.findByText(/verify your email first/)).toBeInTheDocument();
    });
  });

  describe('signed in', () => {
    it('shows the home page with the menu and the current user', () => {
      signedInAs('user');
      renderAt('/');

      expect(screen.getByRole('heading', { name: 'Spots' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Change password' })).toBeInTheDocument();
      expect(screen.getByText('Mario Rossi')).toBeInTheDocument();
      expect(document.documentElement.lang).toBe('en');
    });

    it('has no language switch while the app is English only', () => {
      signedInAs('user');
      renderAt('/');

      expect(screen.queryByLabelText('Language')).not.toBeInTheDocument();
    });

    it('hides the admin menu items from regular users', () => {
      signedInAs('user');
      renderAt('/');

      expect(screen.queryByRole('link', { name: 'Invites' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
    });

    it('shows the Invites and Users menu items to admins', () => {
      signedInAs('admin');
      renderAt('/');

      expect(screen.getByRole('link', { name: 'Invites' })).toHaveAttribute(
        'href',
        '/admin/invites',
      );
      expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/admin/users');
    });

    it('shows a not-found page for unknown paths', () => {
      signedInAs('user');
      renderAt('/nope');

      expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    });

    it('signs out', () => {
      signedInAs('user');
      mocked.signOut.mockResolvedValue({} as never);
      renderAt('/');

      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

      expect(mocked.signOut).toHaveBeenCalled();
    });
  });
});
