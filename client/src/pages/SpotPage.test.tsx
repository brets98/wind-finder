import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreferencesContext } from '../lib/preferences';
import type { Live, Spot, SpotForecast } from '../lib/spots';
import type { Unit } from '../lib/units';
import { stubApi } from '../test/fetch';
import { SpotPage } from './SpotPage';

const sottomarina: Spot = {
  id: 's1',
  name: 'Sottomarina',
  lat: 45.2,
  lon: 12.31,
  region: 'Veneto',
  type: 'sea',
  status: 'verified',
  goodDirections: [{ from: 30, to: 120 }],
  avoidDirections: [{ from: 240, to: 300 }],
  water: 'chop',
  level: null,
  season: '',
  notes: 'Launch north of the pier',
  station: null,
  backupStation: null,
  isStudySpot: true,
  isFavorite: false,
};

const station = {
  source: 'windy' as const,
  stationId: 'pws-1',
  name: 'Chioggia pier',
  lat: 45.21,
  lon: 12.3,
  distanceKm: 1.4,
  notes: '',
};

/** Hourly from the current hour for 3 days: 18 kn from 60° (good), 6 kn from 270° otherwise. */
function forecast(): SpotForecast {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const times = Array.from({ length: 72 }, (_, i) =>
    new Date(start.getTime() + i * 3600_000).toISOString(),
  );
  const model = (name: string, group: 'high_res' | 'global', good: boolean) => ({
    model: name,
    group,
    speed: times.map(() => (good ? 18 : 6)),
    gust: times.map(() => (good ? 24 : 9)),
    dir: times.map(() => (good ? 60 : 270)),
    good: times.map(() => good),
  });
  return {
    times,
    models: [model('icon_d2', 'high_res', true), model('ecmwf_ifs', 'global', false)],
    marine: {
      times,
      waveHeight: times.map(() => 0.8),
      wavePeriod: times.map(() => 4),
      waveDir: times.map(() => 90),
    },
    goodWind: { minKnots: 14, minHours: 3 },
    days: [],
  };
}

function renderSpot({
  spot = sottomarina,
  live = null as Live | null,
  unit = 'knots' as Unit,
} = {}) {
  const fetchMock = stubApi(
    ['GET', '/api/spots/s1', { body: spot }],
    ['GET', '/api/spots/s1/forecast', { body: forecast() }],
    ['GET', '/api/spots/s1/live', { body: live }],
    ['PUT', '/api/spots/s1/favorite', { status: 204 }],
  );
  render(
    <PreferencesContext.Provider value={{ unit, setUnit: () => {} }}>
      <MemoryRouter initialEntries={['/spots/s1']}>
        <Routes>
          <Route path="spots/:id" element={<SpotPage isAdmin={false} />} />
        </Routes>
      </MemoryRouter>
    </PreferencesContext.Provider>,
  );
  return fetchMock;
}

describe('SpotPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the header with directions, rose and notes', async () => {
    renderSpot();

    expect(await screen.findByRole('heading', { name: 'Sottomarina' })).toBeInTheDocument();
    expect(screen.getByText('NNE–ESE (30°–120°)')).toBeInTheDocument();
    expect(screen.getByText('WSW–WNW (240°–300°)')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Good directions: NNE–ESE/ })).toBeInTheDocument();
    expect(screen.getByText('Launch north of the pier')).toBeInTheDocument();
    expect(screen.getByText('Study spot')).toBeInTheDocument();
    expect(screen.queryByText(/mostly thermal/)).not.toBeInTheDocument();
  });

  it('says there is no live panel without a station', async () => {
    renderSpot();
    expect(
      await screen.findByText('No weather station is associated with this spot.'),
    ).toBeInTheDocument();
  });

  it('shows the live reading with station, distance and source', async () => {
    renderSpot({
      live: {
        station,
        reading: {
          time: new Date(Date.now() - 12 * 60_000).toISOString(),
          wind: 16.4,
          gust: 21.2,
          dir: 60,
        },
        usingBackup: false,
        stale: false,
      },
    });

    const panel = (await screen.findByRole('heading', { name: 'Live wind' })).parentElement!;
    expect(await within(panel).findByText('16')).toBeInTheDocument();
    expect(within(panel).getByText('21')).toBeInTheDocument();
    expect(within(panel).getByText(/ENE 60°/)).toBeInTheDocument();
    expect(within(panel).getByText('Updated 12 min ago')).toBeInTheDocument();
    expect(
      within(panel).getByText(
        /Station Chioggia pier, 1.4 km from the spot · Source: Windy stations/,
      ),
    ).toBeInTheDocument();
  });

  it('flags stale data and the use of the backup station', async () => {
    renderSpot({
      live: {
        station,
        reading: {
          time: new Date(Date.now() - 5 * 3600_000).toISOString(),
          wind: 8,
          gust: null,
          dir: 90,
        },
        usingBackup: true,
        stale: true,
      },
    });

    expect(await screen.findByText(/showing the backup station/)).toBeInTheDocument();
    expect(screen.getByText('Old data: last reading 5 h ago.')).toBeInTheDocument();
  });

  it('shows the high-resolution models with good hours, and the global ones on request', async () => {
    renderSpot();

    expect(
      await screen.findByRole('rowheader', { name: 'ICON-D2 (DWD, 2 km)' }),
    ).toBeInTheDocument();
    const row = screen.getByRole('rowheader', { name: 'ICON-D2 (DWD, 2 km)' }).closest('tr')!;
    expect(row.querySelectorAll('td.good').length).toBeGreaterThan(0);
    expect(screen.queryByRole('rowheader', { name: 'ECMWF IFS (9 km)' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show global models' }));

    const global = screen.getByRole('rowheader', { name: 'ECMWF IFS (9 km)' }).closest('tr')!;
    expect(global.querySelectorAll('td.good')).toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'Waves' })).toBeInTheDocument();
  });

  it('shows speeds in Beaufort when chosen', async () => {
    renderSpot({ unit: 'beaufort' });

    const row = (await screen.findByRole('rowheader', { name: 'ICON-D2 (DWD, 2 km)' })).closest(
      'tr',
    )!;
    // 18 kn is force 5, 24 kn gusts force 6
    expect(row.querySelector('.cell-speed')).toHaveTextContent('5');
    expect(row.querySelector('.cell-gust')).toHaveTextContent('6');
  });

  it('has no waves on lakes and explains that lake forecasts are indicative', async () => {
    renderSpot({ spot: { ...sottomarina, type: 'lake' } });

    expect(await screen.findByText(/mostly thermal and local/)).toBeInTheDocument();
  });

  it('adds the spot to favorites', async () => {
    const fetchMock = renderSpot();

    fireEvent.click(await screen.findByRole('button', { name: '☆ Add to favorites' }));

    expect(
      await screen.findByRole('button', { name: '★ Remove from favorites' }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/spots/s1/favorite',
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});
