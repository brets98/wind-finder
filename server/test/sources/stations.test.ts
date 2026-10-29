import { afterEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter, toKnots } from '../../src/sources/http.js';
import { createMeteoNetwork } from '../../src/sources/meteonetwork.js';
import { fetchKiteSpots } from '../../src/sources/overpass.js';
import { createWindy } from '../../src/sources/windy.js';
import { on, stubFetch } from '../fetch.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MeteoNetwork adapter', () => {
  const mn = createMeteoNetwork('test-token');
  const realtime = {
    observation_time_utc: '2026-10-29 08:30:00',
    name: 'Mantova - Borgochiesanuova',
    station_code: 'lmb015',
    latitude: '45.15',
    longitude: '10.79',
    wind_speed: '18.52',
    wind_gust: '27.78',
    wind_direction_degree: '45',
  };

  it('reads the latest reading in knots, with the token and a real User-Agent', async () => {
    const fetchMock = stubFetch(
      on('https://api.meteonetwork.it/v3/data-realtime/lmb015', { body: [realtime] }),
    );

    expect(await mn.check('lmb015')).toEqual({
      usable: true,
      station: {
        source: 'meteonetwork',
        stationId: 'lmb015',
        name: 'Mantova - Borgochiesanuova',
        lat: 45.15,
        lon: 10.79,
      },
      latest: { time: '2026-10-29T08:30:00.000Z', wind: 10, gust: 15, dir: 45 },
    });
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers['User-Agent']).toMatch(/WindFinder/);
  });

  it('treats "no results / license does not allow" as a station that is not usable', async () => {
    stubFetch(
      on('https://api.meteonetwork.it/v3/data-realtime/vnt326', {
        body: {
          error: true,
          status_code: 204,
          message:
            'No results found or the weather station license does not allow the distribution of weather data',
        },
      }),
    );

    expect(await mn.check('vnt326')).toEqual({ usable: false, reason: 'not_available' });
  });

  it('flags a station without an anemometer', async () => {
    stubFetch(
      on('https://api.meteonetwork.it/', {
        body: [{ ...realtime, wind_speed: null, wind_direction_degree: '' }],
      }),
    );

    expect(await mn.check('lmb015')).toMatchObject({
      usable: false,
      reason: 'no_wind',
      station: { name: 'Mantova - Borgochiesanuova' },
    });
  });

  it('reports errors and a missing token without throwing', async () => {
    stubFetch(
      on('https://api.meteonetwork.it/', { status: 500, body: { error: true, status_code: 500 } }),
    );
    expect(await mn.check('lmb015')).toEqual({ usable: false, reason: 'error' });
    expect(await createMeteoNetwork(undefined).check('lmb015')).toEqual({
      usable: false,
      reason: 'error',
    });
  });
});

describe('Windy adapter', () => {
  const windy = createWindy('test-key');
  const header = {
    id: 'pws-1',
    name: 'Sottomarina beach',
    lat: 45.19,
    lon: 12.31,
    is_online: true,
  };

  it('reads observations in knots, oldest first, with the API key', async () => {
    const fetchMock = stubFetch(
      on('https://stations.windy.com/api/v2/opendata/station/pws-1/observation', {
        body: {
          header,
          data: {
            ts: [1793263200000, 1793262600000],
            wind: [5.144, 4],
            wind_gust: [7.2, 6],
            wind_dir: [60, 55],
          },
        },
      }),
    );

    const result = await windy.observations('pws-1', new Date('2026-10-28T00:00:00Z'));

    expect(result?.readings).toEqual([
      { time: '2026-10-29T08:30:00.000Z', wind: 7.8, gust: 11.7, dir: 55 },
      { time: '2026-10-29T08:40:00.000Z', wind: 10, gust: 14, dir: 60 },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url as string).searchParams.get('fromTs')).toBe('1793145600');
    expect((init?.headers as Record<string, string>)['windy-api-key']).toBe('test-key');
  });

  it('checks a station with its latest reading', async () => {
    stubFetch(
      on('https://stations.windy.com/api/v2/opendata/station/pws-1/observation?latestLimit=1', {
        body: { header, data: { ts: [1793263200000], wind: [5.144], wind_dir: [60] } },
      }),
    );

    expect(await windy.check('pws-1')).toEqual({
      usable: true,
      station: {
        source: 'windy',
        stationId: 'pws-1',
        name: 'Sottomarina beach',
        lat: 45.19,
        lon: 12.31,
      },
      latest: { time: '2026-10-29T08:40:00.000Z', wind: 10, gust: null, dir: 60 },
    });
  });

  it('flags stations that are not open, have no readings or no wind', async () => {
    stubFetch(
      on('https://stations.windy.com/api/v2/opendata/station/closed/', { status: 404, body: {} }),
      on('https://stations.windy.com/api/v2/opendata/station/empty/', {
        body: { header, data: { ts: [] } },
      }),
      on('https://stations.windy.com/api/v2/opendata/station/temp-only/', {
        body: { header, data: { ts: [1793263200000] } },
      }),
    );

    expect(await windy.check('closed')).toEqual({ usable: false, reason: 'not_available' });
    expect(await windy.check('empty')).toMatchObject({ usable: false, reason: 'no_data' });
    expect(await windy.check('temp-only')).toMatchObject({ usable: false, reason: 'no_wind' });
  });

  it('lists a page of the open-data catalogue', async () => {
    stubFetch(
      on('https://stations.windy.com/api/v2/opendata/station?page=2', {
        body: {
          data: [header],
          pagination: { page: 2, pageSize: 100, totalPages: 5, offset: 200, totalItems: 501 },
        },
      }),
    );

    expect(await windy.listPage(2)).toEqual({
      stations: [
        {
          source: 'windy',
          stationId: 'pws-1',
          name: 'Sottomarina beach',
          lat: 45.19,
          lon: 12.31,
          online: true,
        },
      ],
      totalPages: 5,
    });
  });
});

describe('Overpass adapter', () => {
  it('returns kite spots at their center, with stable OSM ids', async () => {
    const fetchMock = stubFetch(
      on('https://overpass-api.de/api/interpreter', {
        body: {
          elements: [
            {
              type: 'node',
              id: 1,
              lat: 41.19,
              lon: 9.3,
              tags: { name: 'Porto Pollo', sport: 'kitesurfing' },
            },
            {
              type: 'way',
              id: 2,
              center: { lat: 45.8, lon: 10.84 },
              tags: { sport: 'kiteboarding' },
            },
            { type: 'relation', id: 3, tags: { name: 'No geometry' } },
          ],
        },
      }),
    );

    expect(await fetchKiteSpots()).toEqual([
      { osmId: 'node/1', name: 'Porto Pollo', lat: 41.19, lon: 9.3 },
      { osmId: 'way/2', name: '', lat: 45.8, lon: 10.84 },
    ]);
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('kitesurfing%7Ckiteboarding');
  });
});

describe('http helpers', () => {
  it('converts speeds to knots', () => {
    expect(toKnots.fromMs(10)).toBe(19.4);
    expect(toKnots.fromKmh(18.52)).toBe(10);
  });

  it('waits when the rate limit is reached', async () => {
    let now = 0;
    const waits: number[] = [];
    const limiter = new RateLimiter(
      2,
      60_000,
      () => now,
      async (ms) => {
        waits.push(ms);
        now += ms;
      },
    );

    for (let i = 0; i < 3; i++) {
      await limiter.run(async () => {
        now += 1000;
      });
    }

    expect(waits).toEqual([58_000]);
  });
});
