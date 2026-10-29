import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DayDetail, DaySummary, Session } from '../lib/days';
import { stubApi } from '../test/fetch';
import { SpotHistory } from './SpotHistory';

const hours = Array.from({ length: 24 }, (_, i) =>
  new Date(Date.UTC(2026, 9, 27, 23 + i)).toISOString(),
);
const flat = (v: number | null) => hours.map(() => v);

const session: Session = {
  id: 'x1',
  spotId: 's1',
  dayId: 'd1',
  rider: { id: 'u2', name: 'Anna Bianchi' },
  isOwn: false,
  date: '2026-10-28',
  start: '13:00',
  end: '16:00',
  sport: 'kite',
  size: 9,
  board: 'Twin tip',
  perceivedWind: 18,
  gustiness: 'gusty',
  seaState: 'chop',
  rating: 4,
  comment: 'Bora kicked in at 14',
  visibility: 'group',
};

const summary: DaySummary = {
  id: 'd1',
  date: '2026-10-28',
  reasons: ['session', 'manual'],
  observedStatus: 'ok',
  maxObserved: 21,
  sessions: [session],
};

const day: DayDetail = {
  id: 'd1',
  spotId: 's1',
  date: '2026-10-28',
  reasons: ['session'],
  hours,
  forecasts: [
    { model: 'icon_d2', run: 'd1', speed: flat(12), gust: flat(null), dir: flat(60) },
    { model: 'icon_d2', run: 'd0', speed: flat(16), gust: flat(null), dir: flat(60) },
    { model: 'ecmwf_ifs', run: 'd0', speed: flat(10), gust: flat(null), dir: flat(60) },
  ],
  forecastsFinal: true,
  marine: null,
  observed: {
    status: 'ok',
    reason: null,
    station: { source: 'windy', stationId: 'pws-1', name: 'Chioggia pier', distanceKm: 1.4 },
    usedBackup: true,
    final: true,
    hourly: { wind: flat(19), gust: flat(null), dir: flat(70) },
  },
  sessions: [session],
};

function renderHistory() {
  render(
    <MemoryRouter>
      <SpotHistory spotId="s1" version={0} />
    </MemoryRouter>,
  );
}

describe('SpotHistory', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists saved days and opens one: forecast vs observed vs perceived, with its sessions', async () => {
    stubApi(
      ['GET', '/api/spots/s1/days', { body: [summary] }],
      ['GET', '/api/days/d1', { body: day }],
    );
    renderHistory();

    const row = await screen.findByRole('button', { name: /Session · Saved by hand/ });
    expect(row).toHaveTextContent('Max observed 21 kn');
    fireEvent.click(row);

    const chart = await screen.findByRole('figure', { name: 'Wind over the day' });
    const legend = within(chart)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(legend).toEqual([
      'Forecast (latest run)',
      'Observed',
      'Forecast of the day before',
      'Perceived',
    ]);
    expect(
      screen.getByText(/Observed at Chioggia pier \(1.4 km\), the backup station/),
    ).toBeInTheDocument();
    expect(screen.getByText('Anna Bianchi')).toBeInTheDocument();
    expect(screen.getByText('Bora kicked in at 14')).toBeInTheDocument();
    expect(screen.getByLabelText('Model')).toHaveValue('icon_d2');
  });

  it('offers the chart as a table, per model', async () => {
    stubApi(
      ['GET', '/api/spots/s1/days', { body: [summary] }],
      ['GET', '/api/days/d1', { body: day }],
    );
    renderHistory();
    fireEvent.click(await screen.findByRole('button', { name: /Session/ }));

    fireEvent.click(await screen.findByRole('button', { name: 'Show as table' }));
    const firstRow = screen.getAllByRole('row')[1];
    // 13:00–16:00 session: perceived only in those hours
    expect(
      within(firstRow)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['00', '16', '19', '12', '—']);

    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'ecmwf_ifs' } });
    expect(within(screen.getAllByRole('row')[1]).getAllByRole('cell')[1]).toHaveTextContent('10');
  });

  it('explains missing observations', async () => {
    stubApi(
      ['GET', '/api/spots/s1/days', { body: [{ ...summary, sessions: [] }] }],
      [
        'GET',
        '/api/days/d1',
        {
          body: {
            ...day,
            sessions: [],
            forecastsFinal: false,
            observed: {
              ...day.observed,
              status: 'unavailable',
              reason: 'no_history',
              station: null,
              hourly: { wind: flat(null), gust: [], dir: [] },
            },
          },
        },
      ],
    );
    renderHistory();
    fireEvent.click(await screen.findByRole('button', { name: /Session/ }));

    expect(await screen.findByText(/this station keeps no history/)).toBeInTheDocument();
    expect(screen.getByText(/forecasts will be completed later/)).toBeInTheDocument();
  });

  it('says when nothing is saved yet', async () => {
    stubApi(['GET', '/api/spots/s1/days', { body: [] }]);
    renderHistory();
    expect(await screen.findByText(/No saved days yet/)).toBeInTheDocument();
  });
});
