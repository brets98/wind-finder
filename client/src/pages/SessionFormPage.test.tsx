import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../lib/days';
import { stubApi } from '../test/fetch';
import { SessionFormPage } from './SessionFormPage';

const spot = { id: 's1', name: 'Sottomarina' };

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="spots/:id/sessions/new" element={<SessionFormPage />} />
        <Route path="sessions/:sessionId/edit" element={<SessionFormPage />} />
        <Route path="spots/:id" element={<h1>Spot page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

const fill = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('SessionFormPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('logs a session and goes back to the spot', async () => {
    const fetchMock = stubApi(
      ['GET', '/api/spots/s1', { body: spot }],
      ['POST', '/api/sessions', { status: 201, body: {} }],
    );
    renderAt('/spots/s1/sessions/new');

    expect(
      await screen.findByRole('heading', { name: 'Log a session at Sottomarina' }),
    ).toBeInTheDocument();
    fill('Date', '2026-10-28');
    fill('Start', '13:00');
    fill('End', '16:30');
    fill('Kite / wing size (m²)', '9,5');
    fill('Perceived wind (knots)', '18');
    fill('Gustiness', 'gusty');
    fireEvent.click(screen.getByLabelText('4 out of 5'));
    fireEvent.click(screen.getByLabelText('Only me'));
    fireEvent.click(screen.getByRole('button', { name: 'Save session' }));

    expect(await screen.findByRole('heading', { name: 'Spot page' })).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls.find(
      ([url, i]) => url === '/api/sessions' && i?.method === 'POST',
    )!;
    expect(JSON.parse(String(init!.body))).toMatchObject({
      spotId: 's1',
      date: '2026-10-28',
      start: '13:00',
      end: '16:30',
      sport: 'kite',
      size: 9.5,
      perceivedWind: 18,
      gustiness: 'gusty',
      seaState: null,
      rating: 4,
      visibility: 'private',
    });
  });

  it('shows the issues the server finds, next to their fields', async () => {
    stubApi(
      ['GET', '/api/spots/s1', { body: spot }],
      [
        'POST',
        '/api/sessions',
        {
          status: 400,
          body: {
            issues: [
              { code: 'BEFORE_START', field: 'end' },
              { code: 'REQUIRED', field: 'rating' },
            ],
          },
        },
      ],
    );
    renderAt('/spots/s1/sessions/new');

    fireEvent.click(await screen.findByRole('button', { name: 'Save session' }));

    expect(await screen.findByText('Must be after the start.')).toBeInTheDocument();
    expect(screen.getByText('Required.')).toBeInTheDocument();
  });

  it('edits and deletes your own session', async () => {
    const session: Partial<Session> = {
      id: 'x1',
      spotId: 's1',
      date: '2026-10-28',
      start: '13:00',
      end: '16:00',
      sport: 'wing',
      size: 5,
      board: '',
      perceivedWind: null,
      gustiness: null,
      seaState: 'chop',
      rating: 3,
      comment: 'ok',
      visibility: 'group',
    };
    const fetchMock = stubApi(
      ['GET', '/api/sessions/x1', { body: session }],
      ['GET', '/api/spots/s1', { body: spot }],
      ['DELETE', '/api/sessions/x1', { status: 204 }],
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAt('/sessions/x1/edit');

    expect(
      await screen.findByRole('heading', { name: 'Edit session at Sottomarina' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Sport')).toHaveValue('wing');
    expect(screen.getByLabelText('Sea state')).toHaveValue('chop');

    fireEvent.click(screen.getByRole('button', { name: 'Delete session' }));

    expect(await screen.findByRole('heading', { name: 'Spot page' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/sessions/x1', { method: 'DELETE' });
  });
});
