import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsModel } from '../src/models/settings.js';
import { SpotModel } from '../src/models/spot.js';
import { WindyStationModel } from '../src/models/windy-station.js';
import { createTestApp, signUp, type TestApp } from './app.js';
import { useTestDatabase } from './db.js';
import { on, stubFetch, type FakeHandler } from './fetch.js';
import { otherStations } from './sources-stubs.js';

const admin = { name: 'Luca', surname: 'Admin', email: 'admin@example.com' };
const mario = { name: 'Mario', surname: 'Rossi', email: 'mario@example.com' };
const sottomarina = {
  name: 'Sottomarina',
  lat: 45.2,
  lon: 12.31,
  type: 'sea' as const,
  status: 'verified' as const,
};

const minutesAgo = (m: number) => Date.now() - m * 60_000;

/** A Windy open-data station answering with one reading `age` minutes old (or no wind). */
function windyStation(
  id: string,
  lat: number,
  lon: number,
  age: number,
  wind: number | null = 6,
): FakeHandler {
  return on(`https://stations.windy.com/api/v2/opendata/station/${id}/observation`, {
    body: {
      header: { id, name: `Windy ${id}`, lat, lon },
      data: {
        ts: [minutesAgo(age)],
        wind: wind === null ? [] : [wind],
        wind_dir: wind === null ? [] : [70],
      },
    },
  });
}

function meteoNetwork(code: string, body: unknown): FakeHandler {
  return on(`https://api.meteonetwork.it/v3/data-realtime/${code}`, { body });
}

const mnReading = (code: string, lat: string, lon: string, age: number) => [
  {
    station_code: code,
    name: `MN ${code}`,
    latitude: lat,
    longitude: lon,
    observation_time_utc: new Date(minutesAgo(age)).toISOString().slice(0, 19).replace('T', ' '),
    wind_speed: '27.78',
    wind_gust: '37.04',
    wind_direction_degree: '45',
  },
];

describe('stations', () => {
  useTestDatabase();

  let t: TestApp;
  beforeEach(() => {
    t = createTestApp();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function asAdmin() {
    return (await signUp(t, admin, { role: 'admin' })).agent;
  }

  it('syncs the Italian part of the Windy catalogue, page by page', async () => {
    const agent = await asAdmin();
    await WindyStationModel.create({ stationId: 'gone', name: 'Removed', lat: 45, lon: 12 });
    stubFetch(
      on('https://stations.windy.com/api/v2/opendata/station?page=0', {
        body: {
          data: [
            { id: 'it-1', name: 'Chioggia', lat: 45.21, lon: 12.28, is_online: true },
            { id: 'cz-1', name: 'Prague', lat: 50.08, lon: 14.42, is_online: true },
          ],
          pagination: { page: 0, totalPages: 2 },
        },
      }),
      on('https://stations.windy.com/api/v2/opendata/station?page=1', {
        body: {
          data: [{ id: 'it-2', name: 'Garda', lat: 45.87, lon: 10.88 }],
          pagination: { page: 1, totalPages: 2 },
        },
      }),
    );

    const res = await agent.post('/api/settings/windy-catalogue/sync');

    expect(res.body).toMatchObject({ pages: 2, stations: 2 });
    expect((await WindyStationModel.find().sort({ stationId: 1 })).map((s) => s.stationId)).toEqual(
      ['it-1', 'it-2'],
    );
    expect((await agent.get('/api/settings/windy-catalogue')).body).toEqual({
      stations: 2,
      syncedAt: expect.any(String),
    });
  });

  it('suggests usable Windy stations within 20 km by distance, with the reason for the others', async () => {
    const agent = await asAdmin();
    const spot = await SpotModel.create(sottomarina);
    await WindyStationModel.create([
      { stationId: 'near', name: 'Near', lat: 45.21, lon: 12.3 },
      { stationId: 'old', name: 'Old', lat: 45.22, lon: 12.31 },
      { stationId: 'calm', name: 'No anemometer', lat: 45.25, lon: 12.31 },
      { stationId: 'far', name: 'Venice', lat: 45.44, lon: 12.33 },
    ]);
    stubFetch(
      ...otherStations(),
      windyStation('near', 45.21, 12.3, 10),
      windyStation('old', 45.22, 12.31, 5 * 60),
      windyStation('calm', 45.25, 12.31, 10, null),
    );

    const res = await agent.get(`/api/spots/${spot.id}/station-suggestions`);

    expect(
      res.body.map((s: { stationId: string; usable: boolean; reason: string | null }) => [
        s.stationId,
        s.usable,
        s.reason,
      ]),
    ).toEqual([
      ['near', true, null],
      ['old', false, 'stale'],
      ['calm', false, 'no_wind'],
    ]);
    expect(res.body[0]).toMatchObject({
      source: 'windy',
      distanceKm: 1.4,
      latest: { wind: 11.7, dir: 70 },
    });
  });

  it('suggests stations from every searchable source together, nearest first', async () => {
    const agent = await asAdmin();
    const spot = await SpotModel.create(sottomarina);
    await WindyStationModel.create({ stationId: 'near', name: 'Near', lat: 45.21, lon: 12.3 });
    const solarNow = new Date(Math.floor(Date.now() / 1_800_000) * 1_800_000 + 3_600_000)
      .toISOString()
      .slice(0, 16)
      .replace(/[-T:]/g, '');
    stubFetch(
      ...otherStations({
        metar: [{ icaoId: 'LIPZ', site: 'Venice/Polo Arpt', lat: 45.32, lon: 12.33 }],
        arpav:
          "<STAZIONE><IDSTAZ>168</IDSTAZ><NOME><![CDATA[Chioggia - Sant'Anna]]></NOME><X>12.276</X><Y>45.146</Y><LINKSTAZ>0168.xml</LINKSTAZ></STAZIONE>",
      }),
      windyStation('near', 45.21, 12.3, 10),
      on('https://aviationweather.gov/api/data/metar', {
        body: [
          {
            icaoId: 'LIPZ',
            obsTime: Math.floor(Date.now() / 1000) - 600,
            wdir: 90,
            wspd: 8,
            lat: 45.32,
            lon: 12.33,
            name: 'Venice/Polo Arpt, VE, IT',
          },
        ],
      }),
      (url) =>
        url.toString().endsWith('/0168.xml')
          ? {
              raw: Buffer.from(
                `<CONTENITORE><SENSORE><TYPE>VVENTO</TYPE><DATI ISTANTE="${solarNow}"><VM>4.0</VM></DATI></SENSORE><SENSORE><TYPE>DVENTO</TYPE><DATI ISTANTE="${solarNow}"><VM>60</VM></DATI></SENSORE></CONTENITORE>`,
                'latin1',
              ),
            }
          : undefined,
    );

    const res = await agent.get(`/api/spots/${spot.id}/station-suggestions`);

    expect(
      res.body.map((s: { source: string; name: string; usable: boolean }) => [
        s.source,
        s.name,
        s.usable,
      ]),
    ).toEqual([
      ['windy', 'Windy near', true],
      ['arpav', "Chioggia - Sant'Anna", true],
      ['metar', 'Venice/Polo Arpt (METAR LIPZ)', true],
    ]);
  });

  it('checks a MeteoNetwork station typed by code, including one that is not usable', async () => {
    const agent = await asAdmin();
    const spot = await SpotModel.create(sottomarina);
    stubFetch(
      meteoNetwork('vnt100', mnReading('vnt100', '45.19', '12.30', 10)),
      meteoNetwork('vnt326', { error: true, status_code: 204, message: 'No results found' }),
    );

    const ok = await agent.get(
      `/api/spots/${spot.id}/station-check?source=meteonetwork&stationId=vnt100`,
    );
    expect(ok.body).toMatchObject({
      source: 'meteonetwork',
      name: 'MN vnt100',
      distanceKm: 1.4,
      usable: true,
      latest: { wind: 15, gust: 20, dir: 45 },
    });

    const blocked = await agent.get(
      `/api/spots/${spot.id}/station-check?source=meteonetwork&stationId=vnt326`,
    );
    expect(blocked.body).toEqual({
      source: 'meteonetwork',
      stationId: 'vnt326',
      usable: false,
      reason: 'not_available',
    });

    expect(
      (await agent.get(`/api/spots/${spot.id}/station-check?source=holfuy&stationId=x`)).status,
    ).toBe(400);
  });

  it('associates main and backup stations, storing source, id, position and distance', async () => {
    const agent = await asAdmin();
    const spot = await SpotModel.create(sottomarina);
    stubFetch(
      windyStation('near', 45.21, 12.3, 10),
      meteoNetwork('vnt100', mnReading('vnt100', '45.19', '12.30', 10)),
    );

    const res = await agent.put(`/api/spots/${spot.id}/stations`).send({
      station: { source: 'windy', stationId: 'near', notes: ' On the pier ' },
      backupStation: { source: 'meteonetwork', stationId: 'vnt100' },
    });

    expect(res.status).toBe(200);
    expect(res.body.station).toEqual({
      source: 'windy',
      stationId: 'near',
      name: 'Windy near',
      lat: 45.21,
      lon: 12.3,
      distanceKm: 1.4,
      notes: 'On the pier',
    });
    expect(res.body.backupStation).toMatchObject({ source: 'meteonetwork', stationId: 'vnt100' });

    const removed = await agent.put(`/api/spots/${spot.id}/stations`).send({ backupStation: null });
    expect(removed.body).toMatchObject({ station: { stationId: 'near' }, backupStation: null });
  });

  it('refuses a station its source does not know', async () => {
    const agent = await asAdmin();
    const spot = await SpotModel.create(sottomarina);
    stubFetch(on('https://stations.windy.com/', { status: 404, body: {} }));

    const res = await agent
      .put(`/api/spots/${spot.id}/stations`)
      .send({ station: { source: 'windy', stationId: 'nope' } });

    expect(res.status).toBe(400);
    expect(res.body.issues).toEqual([{ code: 'STATION_NOT_FOUND', field: 'station' }]);
  });

  describe('live panel', () => {
    const ref = (source: 'windy' | 'meteonetwork', stationId: string) => ({
      source,
      stationId,
      name: stationId,
      lat: 45.2,
      lon: 12.3,
      distanceKm: 1,
      notes: '',
    });

    it('shows the main station reading, and nothing for a spot without a station', async () => {
      const spot = await SpotModel.create({ ...sottomarina, station: ref('windy', 'near') });
      const bare = await SpotModel.create({ ...sottomarina, name: 'Bare' });
      stubFetch(windyStation('near', 45.21, 12.3, 10));
      const { agent } = await signUp(t, mario);

      const res = await agent.get(`/api/spots/${spot.id}/live`);

      expect(res.body).toMatchObject({
        station: { stationId: 'near' },
        reading: { wind: 11.7, dir: 70 },
        usingBackup: false,
        stale: false,
      });
      expect((await agent.get(`/api/spots/${bare.id}/live`)).body).toBeNull();
    });

    it('falls back to the backup station when the main one is stale, and says so', async () => {
      const spot = await SpotModel.create({
        ...sottomarina,
        station: ref('windy', 'old'),
        backupStation: ref('meteonetwork', 'vnt100'),
      });
      stubFetch(
        windyStation('old', 45.22, 12.31, 5 * 60),
        meteoNetwork('vnt100', mnReading('vnt100', '45.19', '12.30', 10)),
      );
      const { agent } = await signUp(t, mario);

      const res = await agent.get(`/api/spots/${spot.id}/live`);

      expect(res.body).toMatchObject({
        station: { stationId: 'vnt100' },
        reading: { wind: 15 },
        usingBackup: true,
        stale: false,
      });
    });

    it('flags stale data when no station has a recent reading', async () => {
      const spot = await SpotModel.create({ ...sottomarina, station: ref('windy', 'old') });
      stubFetch(windyStation('old', 45.22, 12.31, 5 * 60));
      const { agent } = await signUp(t, mario);

      const res = await agent.get(`/api/spots/${spot.id}/live`);

      expect(res.body).toMatchObject({
        station: { stationId: 'old' },
        reading: { wind: 11.7 },
        stale: true,
      });
    });

    it('reuses a recent reading instead of calling the station again', async () => {
      const spot = await SpotModel.create({ ...sottomarina, station: ref('windy', 'near') });
      const fetchMock = stubFetch(windyStation('near', 45.21, 12.3, 10));
      const { agent } = await signUp(t, mario);

      await agent.get(`/api/spots/${spot.id}/live`);
      await agent.get(`/api/spots/${spot.id}/live`);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});

describe('OSM import', () => {
  useTestDatabase();

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates new spots to verify, guessing sea or lake, without duplicating or bringing back deleted ones', async () => {
    const t = createTestApp();
    const { agent } = await signUp(t, admin, { role: 'admin' });
    stubFetch(
      on('https://overpass-api.de/', {
        body: {
          elements: [
            { type: 'node', id: 1, lat: 41.19, lon: 9.3, tags: { name: 'Porto Pollo' } },
            { type: 'way', id: 2, center: { lat: 45.87, lon: 10.88 }, tags: {} },
            { type: 'node', id: 3, lat: 44.07, lon: 12.57, tags: { name: 'Rimini shop' } },
          ],
        },
      }),
      (url) => {
        if (!url.toString().startsWith('https://marine-api.open-meteo.com/')) return undefined;
        const lats = url.searchParams.get('latitude')!.split(',').map(Number);
        return {
          body: lats.map((lat) => ({
            hourly: { time: [0], wave_height: [lat === 45.87 ? null : 0.5] },
          })),
        };
      },
    );

    const first = await agent.post('/api/spots/import-osm');
    expect(first.body).toEqual({ found: 3, created: 3 });
    const spots = await SpotModel.find().sort({ osmId: 1 });
    expect(spots.map((s) => [s.osmId, s.name, s.type, s.status])).toEqual([
      ['node/1', 'Porto Pollo', 'sea', 'to_verify'],
      ['node/3', 'Rimini shop', 'sea', 'to_verify'],
      ['way/2', 'OSM way/2', 'lake', 'to_verify'],
    ]);

    // The admin renames one and deletes the shop
    await agent.patch(`/api/spots/${spots[0].id}`).send({ name: 'Porto Pollo (Sardinia)' });
    await agent.delete(`/api/spots/${spots[1].id}`);

    const again = await agent.post('/api/spots/import-osm');
    expect(again.body).toEqual({ found: 3, created: 0 });
    expect(await SpotModel.countDocuments()).toBe(2);
    expect((await SpotModel.findOne({ osmId: 'node/1' }))?.name).toBe('Porto Pollo (Sardinia)');
    expect((await SettingsModel.findOne())?.ignoredOsmIds).toEqual(['node/3']);
  });
});

describe('settings and preferences', () => {
  useTestDatabase();

  it('lets everyone read the good-wind definition and only the admin change it', async () => {
    const t = createTestApp();
    const { agent: adminAgent } = await signUp(t, admin, { role: 'admin' });
    const { agent } = await signUp(t, mario);

    expect((await agent.get('/api/settings')).body).toEqual({
      goodWind: { minKnots: 14, minHours: 3 },
    });
    expect(
      (await agent.patch('/api/settings').send({ goodWind: { minKnots: 12, minHours: 2 } })).status,
    ).toBe(403);

    const changed = await adminAgent
      .patch('/api/settings')
      .send({ goodWind: { minKnots: 12, minHours: 2 } });
    expect(changed.body).toEqual({ goodWind: { minKnots: 12, minHours: 2 } });

    const invalid = await adminAgent
      .patch('/api/settings')
      .send({ goodWind: { minKnots: 0, minHours: 2.5 } });
    expect(invalid.status).toBe(400);
    expect(invalid.body.issues).toEqual([
      { code: 'INVALID', field: 'minKnots' },
      { code: 'INVALID', field: 'minHours' },
    ]);
  });

  it('keeps each user their own unit, knots by default', async () => {
    const t = createTestApp();
    const { agent } = await signUp(t, mario);
    const { agent: other } = await signUp(t, admin);

    expect((await agent.get('/api/me/preferences')).body).toEqual({ unit: 'knots' });
    expect((await agent.patch('/api/me/preferences').send({ unit: 'beaufort' })).body).toEqual({
      unit: 'beaufort',
    });
    expect((await agent.get('/api/me/preferences')).body).toEqual({ unit: 'beaufort' });
    expect((await other.get('/api/me/preferences')).body).toEqual({ unit: 'knots' });
    expect((await agent.patch('/api/me/preferences').send({ unit: 'mph' })).status).toBe(400);
  });
});
