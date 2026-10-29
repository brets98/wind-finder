import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BoardSession } from '../lib/days';
import { stubApi } from '../test/fetch';
import { BoardPage } from './BoardPage';

const hours = Array.from({ length: 24 }, (_, i) =>
  new Date(Date.UTC(2026, 9, 27, 23 + i)).toISOString(),
);

const card = (id: string, rider: string, extra: Partial<BoardSession> = {}): BoardSession => ({
  id,
  spotId: 's1',
  dayId: 'd1',
  rider: { id: rider.toLowerCase(), name: rider },
  isOwn: false,
  date: '2026-10-28',
  start: '13:00',
  end: '16:00',
  sport: 'kite',
  size: 9,
  board: '',
  perceivedWind: 18,
  gustiness: null,
  seaState: null,
  rating: 4,
  comment: '',
  visibility: 'group',
  spot: { id: 's1', name: 'Sottomarina', type: 'sea' },
  chart: {
    hours,
    model: 'icon_d2',
    forecastD1: hours.map(() => 12),
    forecastD0: hours.map(() => 16),
    observed: hours.map(() => 19),
  },
  ...extra,
});

const filters = {
  spots: [{ id: 's1', name: 'Sottomarina' }],
  riders: [
    { id: 'anna', name: 'Anna Bianchi' },
    { id: 'mario', name: 'Mario Rossi' },
  ],
};

describe('BoardPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the group sessions as cards with spot, rider, gear and a small chart', async () => {
    stubApi(
      ['GET', '/api/sessions/filters', { body: filters }],
      [
        'GET',
        '/api/sessions?offset=0',
        {
          body: {
            sessions: [
              card('a', 'Anna Bianchi'),
              card('b', 'Mario Rossi', { isOwn: true, visibility: 'private' }),
            ],
            hasMore: false,
          },
        },
      ],
    );
    render(
      <MemoryRouter>
        <BoardPage />
      </MemoryRouter>,
    );

    const first = (await screen.findByText('Anna Bianchi', { selector: 'strong' })).closest('li')!;
    expect(within(first).getByRole('link', { name: 'Sottomarina' })).toHaveAttribute(
      'href',
      '/spots/s1',
    );
    expect(within(first).getByText(/Kite 9 m²/)).toBeInTheDocument();
    expect(within(first).getByRole('figure', { name: 'ICON-D2 (DWD, 2 km)' })).toBeInTheDocument();

    const own = screen.getByText('Mario Rossi', { selector: 'strong' }).closest('li')!;
    expect(within(own).getByText('Private')).toBeInTheDocument();
    expect(within(own).getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/sessions/b/edit',
    );
    expect(within(first).queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('filters by rider and loads more', async () => {
    const fetchMock = stubApi(
      ['GET', '/api/sessions/filters', { body: filters }],
      [
        'GET',
        '/api/sessions?offset=0',
        { body: { sessions: [card('a', 'Anna Bianchi')], hasMore: true } },
      ],
      [
        'GET',
        '/api/sessions?offset=1',
        { body: { sessions: [card('c', 'Mario Rossi')], hasMore: false } },
      ],
      [
        'GET',
        '/api/sessions?offset=0&userId=mario',
        { body: { sessions: [card('c', 'Mario Rossi')], hasMore: false } },
      ],
    );
    render(
      <MemoryRouter>
        <BoardPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Mario Rossi', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();

    fireEvent.change(await screen.findByLabelText('Rider'), { target: { value: 'mario' } });

    await vi.waitFor(() =>
      expect(screen.queryByText('Anna Bianchi', { selector: 'strong' })).not.toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/sessions?offset=0&userId=mario', undefined);
  });
});
