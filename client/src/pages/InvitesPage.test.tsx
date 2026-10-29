import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvitesPage } from './InvitesPage';

const zoe = {
  id: '2',
  email: 'zoe@example.com',
  registered: false,
  createdAt: '2026-10-29T10:00:00.000Z',
};
const admin = { ...zoe, id: '1', email: 'admin@example.com', registered: true };

/** Answers each call with the next response, in order. */
function mockFetch(...responses: [status: number, body?: unknown][]) {
  const fetchMock = vi.fn();
  for (const [status, body] of responses) {
    fetchMock.mockResolvedValueOnce(
      new Response(body === undefined ? null : JSON.stringify(body), { status }),
    );
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('InvitesPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lists the invites, saying which ones already have an account', async () => {
    mockFetch([200, [admin, zoe]]);

    render(<InvitesPage />);

    const row = (await screen.findByText('zoe@example.com')).closest('tr')!;
    expect(within(row).getByText('No')).toBeInTheDocument();
    const adminRow = screen.getByText('admin@example.com').closest('tr')!;
    expect(within(adminRow).getByText('Yes')).toBeInTheDocument();
  });

  it('adds an invite and keeps the list in email order', async () => {
    const fetchMock = mockFetch([200, [zoe]], [201, { ...admin, registered: undefined }]);
    render(<InvitesPage />);
    await screen.findByText('zoe@example.com');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await screen.findByText('admin@example.com');
    const emails = screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.firstChild?.textContent);
    expect(emails).toEqual(['admin@example.com', 'zoe@example.com']);
    expect(fetchMock).toHaveBeenLastCalledWith('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com' }),
    });
    expect(screen.getByLabelText('Email')).toHaveValue('');
  });

  it('explains a refused invite with the message for its issue code', async () => {
    mockFetch(
      [200, [zoe]],
      [409, { error: 'Already invited', issues: [{ code: 'ALREADY_INVITED' }] }],
    );
    render(<InvitesPage />);
    await screen.findByText('zoe@example.com');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'zoe@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByText('This email address is already invited.')).toBeInTheDocument();
  });

  it('removes an invite after confirmation', async () => {
    const fetchMock = mockFetch([200, [admin, zoe]], [204]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<InvitesPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove zoe@example.com' }));

    expect(window.confirm).toHaveBeenCalledWith('Remove the invite for zoe@example.com?');
    await vi.waitFor(() => expect(screen.queryByText('zoe@example.com')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenLastCalledWith('/api/invites/2', { method: 'DELETE' });
  });

  it('explains when the user is not an admin', async () => {
    mockFetch([403, { error: 'Forbidden' }]);

    render(<InvitesPage />);

    expect(await screen.findByText(/Only administrators/)).toBeInTheDocument();
  });
});
