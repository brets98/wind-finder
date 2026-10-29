import { vi } from 'vitest';

// Used by tests via vi.mock('…/lib/auth-client')
export const authClient = {
  useSession: vi.fn(),
  signIn: { email: vi.fn(), social: vi.fn() },
  signUp: { email: vi.fn() },
  signOut: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  changePassword: vi.fn(),
  listAccounts: vi.fn(),
};
