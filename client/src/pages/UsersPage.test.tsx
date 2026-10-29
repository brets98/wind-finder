import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UsersPage } from './UsersPage';

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
}

describe('UsersPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists the users', async () => {
    mockFetch(200, [
      {
        id: '1',
        name: 'Mario',
        surname: 'Rossi',
        email: 'mario@example.com',
        role: 'admin',
        emailVerified: true,
        createdAt: '2026-10-09T10:00:00.000Z',
      },
      {
        id: '2',
        name: 'Anna',
        surname: 'Bianchi',
        email: 'anna@example.com',
        role: 'user',
        emailVerified: false,
        createdAt: '2026-10-09T11:00:00.000Z',
      },
    ]);

    render(<UsersPage />);

    expect(await screen.findByText('mario@example.com')).toBeInTheDocument();
    expect(screen.getByText('anna@example.com')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(fetch).toHaveBeenCalledWith('/api/users', undefined);
  });

  it('explains when the user is not an admin', async () => {
    mockFetch(403, { error: 'Forbidden' });

    render(<UsersPage />);

    expect(await screen.findByText(/Only administrators/)).toBeInTheDocument();
  });
});
