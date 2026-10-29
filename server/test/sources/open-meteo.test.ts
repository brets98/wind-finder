import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchForecast,
  fetchForecasts,
  fetchMarine,
  probeModels,
} from '../../src/sources/open-meteo.js';
import { on, stubFetch } from '../fetch.js';

const sottomarina = { lat: 45.2, lon: 12.31 };
const t0 = Date.UTC(2026, 9, 29, 0) / 1000;
const time = [t0, t0 + 3600, t0 + 7200];

describe('Open-Meteo adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests several models in knots and keeps each one separate', async () => {
    const fetchMock = stubFetch(
      on('https://api.open-meteo.com/v1/forecast', {
        body: {
          hourly: {
            time,
            wind_speed_10m_icon_d2: [10.5, 12, null],
            wind_gusts_10m_icon_d2: [15, 18, null],
            wind_direction_10m_icon_d2: [60, 70, null],
            wind_speed_10m_gfs_seamless: [9, 11, 13],
            wind_gusts_10m_gfs_seamless: [12, 14, 17],
            wind_direction_10m_gfs_seamless: [55, 65, 75],
          },
        },
      }),
    );

    const forecast = await fetchForecast(sottomarina, ['icon_d2', 'gfs_seamless'], 3);

    expect(forecast).toEqual({
      times: ['2026-10-29T00:00:00.000Z', '2026-10-29T01:00:00.000Z', '2026-10-29T02:00:00.000Z'],
      models: [
        { model: 'icon_d2', speed: [10.5, 12, null], gust: [15, 18, null], dir: [60, 70, null] },
        { model: 'gfs_seamless', speed: [9, 11, 13], gust: [12, 14, 17], dir: [55, 65, 75] },
      ],
    });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      latitude: '45.2',
      longitude: '12.31',
      models: 'icon_d2,gfs_seamless',
      wind_speed_unit: 'kn',
      forecast_days: '3',
      timeformat: 'unixtime',
      timezone: 'GMT',
    });
  });

  it('reads the unsuffixed variables of a single model', async () => {
    stubFetch(
      on('https://api.open-meteo.com/', {
        body: {
          hourly: {
            time,
            wind_speed_10m: [1, 2, 3],
            wind_gusts_10m: [],
            wind_direction_10m: [0, 0, 0],
          },
        },
      }),
    );

    const forecast = await fetchForecast(sottomarina, ['ecmwf_ifs'], 1);

    expect(forecast.models).toEqual([
      { model: 'ecmwf_ifs', speed: [1, 2, 3], gust: [], dir: [0, 0, 0] },
    ]);
  });

  it('keeps only the models that return data at the point', async () => {
    stubFetch(
      on('https://api.open-meteo.com/', {
        // AROME all null, icon_d2 and the Swiss model left out: outside their domains
        body: {
          hourly: {
            time,
            wind_speed_10m_italia_meteo_arpae_icon_2i: [5, 6, 7],
            wind_speed_10m_meteofrance_arome_france_hd: [null, null, null],
            wind_speed_10m_ecmwf_ifs: [5, 6, 7],
            wind_speed_10m_gfs_seamless: [5, null, 7],
          },
        },
      }),
    );

    expect(await probeModels({ lat: 37.85, lon: 12.45 })).toEqual([
      'italia_meteo_arpae_icon_2i',
      'ecmwf_ifs',
      'gfs_seamless',
    ]);
  });

  it('fetches several points with the same models in one call, in order', async () => {
    const hourly = (speed: number) => ({
      hourly: {
        time,
        wind_speed_10m_ecmwf_ifs: [speed, speed, speed],
        wind_speed_10m_gfs_seamless: [1, 1, 1],
      },
    });
    const fetchMock = stubFetch(
      on('https://api.open-meteo.com/', { body: [hourly(10), hourly(20)] }),
    );

    const [a, b] = await fetchForecasts(
      [sottomarina, { lat: 41.18, lon: 9.32 }],
      ['ecmwf_ifs', 'gfs_seamless'],
    );

    expect(a.models[0].speed).toEqual([10, 10, 10]);
    expect(b.models[0].speed).toEqual([20, 20, 20]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get('latitude')).toBe('45.2,41.18');
    expect(url.searchParams.get('longitude')).toBe('12.31,9.32');
  });

  it('fails on an Open-Meteo error', async () => {
    stubFetch(
      on('https://api.open-meteo.com/', {
        status: 400,
        body: { error: true, reason: 'Invalid model' },
      }),
    );

    await expect(fetchForecast(sottomarina, ['nope'])).rejects.toThrow('Invalid model');
  });

  it('reads waves from the Marine API', async () => {
    stubFetch(
      on('https://marine-api.open-meteo.com/v1/marine', {
        body: {
          hourly: {
            time,
            wave_height: [0.5, 0.7, null],
            wave_period: [4, 4.5, null],
            wave_direction: [80, 85, null],
          },
        },
      }),
    );

    const marine = await fetchMarine(sottomarina, 3);

    expect(marine).toMatchObject({
      waveHeight: [0.5, 0.7, null],
      wavePeriod: [4, 4.5, null],
      waveDir: [80, 85, null],
    });
    expect(marine.times).toHaveLength(3);
  });
});
