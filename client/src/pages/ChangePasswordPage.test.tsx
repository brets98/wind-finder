import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authClient } from '../lib/auth-client';
import { ChangePasswordPage } from './ChangePasswordPage';

vi.mock('../lib/auth-client');

const mocked = vi.mocked(authClient, { deep: true });

function withAccounts(...providerIds: string[]) {
  mocked.listAccounts.mockResolvedValue({
    data: providerIds.map((providerId) => ({ providerId })),
    error: null,
  } as never);
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('ChangePasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('changes the password', async () => {
    withAccounts('credential', 'google');
    mocked.changePassword.mockResolvedValue({ data: {}, error: null } as never);
    render(<ChangePasswordPage email="mario@example.com" />);

    await screen.findByLabelText('Current password');
    fill('Current password', 'old');
    fill('New password', 'a-brand-new-password');
    fill('Confirm new password', 'a-brand-new-password');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Your password has been changed.')).toBeInTheDocument();
    expect(mocked.changePassword).toHaveBeenCalledWith({
      currentPassword: 'old',
      newPassword: 'a-brand-new-password',
      revokeOtherSessions: true,
    });
  });

  it('rejects mismatched new passwords without calling the server', async () => {
    withAccounts('credential');
    render(<ChangePasswordPage email="mario@example.com" />);

    await screen.findByLabelText('Current password');
    fill('Current password', 'old');
    fill('New password', 'a-brand-new-password');
    fill('Confirm new password', 'something-else-entirely');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('The new passwords do not match.')).toBeInTheDocument();
    expect(mocked.changePassword).not.toHaveBeenCalled();
  });

  it('shows the server error, e.g. a wrong current password', async () => {
    withAccounts('credential');
    mocked.changePassword.mockResolvedValue({
      data: null,
      error: { status: 400, message: 'Invalid password' },
    } as never);
    render(<ChangePasswordPage email="mario@example.com" />);

    await screen.findByLabelText('Current password');
    fill('Current password', 'wrong');
    fill('New password', 'a-brand-new-password');
    fill('Confirm new password', 'a-brand-new-password');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Invalid password')).toBeInTheDocument();
  });

  it('offers Google-only users a link to set a password', async () => {
    withAccounts('google');
    mocked.requestPasswordReset.mockResolvedValue({ data: {}, error: null } as never);
    render(<ChangePasswordPage email="mario@example.com" />);

    fireEvent.click(await screen.findByRole('button', { name: /Email me a link/ }));

    expect(await screen.findByText('We sent a link to mario@example.com.')).toBeInTheDocument();
    expect(mocked.requestPasswordReset).toHaveBeenCalledWith({
      email: 'mario@example.com',
      redirectTo: '/reset-password',
    });
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
  });
});
