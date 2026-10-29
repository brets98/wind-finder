import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SpotSummary } from '../lib/spots';
import { stubApi } from '../test/fetch';
import { HomePage } from './HomePage';

// Leaflet needs a real browser: the map is tested by hand
vi.mock('../components/SpotMap', () => ({
  SpotMap: ({ spots }: { spots: SpotSummary[] }) => (
    <div data-testid="map">{spots.map((s) => s.name).join(', ')}</div>
  ),
}));

const spot = (name: string, extra: Partial<SpotSummary> = {}): SpotSummary => ({
  id: name.toLowerCase(),
  name,
  lat: 45,
  lon: 12,
  type: 'sea',
  status: 'verified',
  region: '',
  isFavorite: false,
  today: null,
  tomorrow: null,
  live: null,
  ...extra,
});

function renderHome() {
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

describe('HomePage (mobile)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists favorites first, then the others by name without a position', async () => {
    stubApi([
      'GET',
      '/api/spots',
      {
        body: [
          spot('Sottomarina', { today: 'yes', tomorrow: 'maybe' }),
          spot('Albarella'),
          spot('Garda', { isFavorite: true, type: 'lake' }),
        ],
      },
    ]);

    renderHome();

    const favorites = await screen.findByRole('heading', { name: 'Favorites' });
    expect(within(favorites.parentElement!).getByText('Garda')).toBeInTheDocument();
    const others = screen.getByRole('heading', { name: 'Other spots' }).parentElement!;
    expect(
      within(others)
        .getAllByRole('link')
        .map((l) => l.getAttribute('href')),
    ).toEqual(['/spots/albarella', '/spots/sottomarina']);
    expect(screen.getByText(/Sorted by name/)).toBeInTheDocument();
    expect(screen.getByTitle('Today: Good wind')).toBeInTheDocument();
    expect(screen.getByTitle('Tomorrow: Maybe')).toBeInTheDocument();
  });

  it('shows the live wind when the list has it', async () => {
    stubApi([
      'GET',
      '/api/spots',
      {
        body: [
          spot('Sottomarina', {
            live: {
              time: new Date().toISOString(),
              wind: 17.6,
              gust: 22,
              dir: 60,
              source: 'windy',
            },
          }),
        ],
      },
    ]);

    renderHome();

    expect(await screen.findByText('18')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'ENE' })).toBeInTheDocument();
  });

  it('switches to the map tab', async () => {
    stubApi(['GET', '/api/spots', { body: [spot('Sottomarina')] }]);
    renderHome();

    fireEvent.click(await screen.findByRole('tab', { name: 'Map' }));

    expect(screen.getByTestId('map')).toHaveTextContent('Sottomarina');
  });

  it('says when there are no spots, or they cannot be loaded', async () => {
    stubApi(['GET', '/api/spots', { body: [] }]);
    renderHome();
    expect(await screen.findByText('No spots yet.')).toBeInTheDocument();
  });
});
