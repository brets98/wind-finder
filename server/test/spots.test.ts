import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FavoritesModel } from '../src/models/favorite.js';
import { SpotModel } from '../src/models/spot.js';
import { createTestApp, signUp, type TestApp } from './app.js';
import { useTestDatabase } from './db.js';
import { on, stubFetch } from './fetch.js';
import { marine, openMeteo } from './sources-stubs.js';

const admin = { name: 'Luca', surname: 'Admin', email: 'admin@example.com' };
const mario = { name: 'Mario', surname: 'Rossi', email: 'mario@example.com' };

const sottomarina = {
  name: 'Sottomarina',
  lat: 45.2,
  lon: 12.31,
  type: 'sea' as const,
  status: 'verified' as const,
  goodDirections: [{ from: 30, to: 120 }],
  avoidDirections: [{ from: 240, to: 300 }],
};

describe('spots API', () => {
  useTestDatabase();

  let t: TestApp;
  beforeEach(() => {
    t = createTestApp();
    stubFetch(openMeteo(), marine());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function asAdmin() {
    return (await signUp(t, admin, { role: 'admin' })).agent;
  }

  describe('admin management', () => {
    it('creates a spot, filling defaults', async () => {
      const agent = await asAdmin();

      const res = await agent
        .post('/api/spots')
        .send({ name: 'Garda', lat: 45.87, lon: 10.88, type: 'lake' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        id: expect.any(String),
        name: 'Garda',
        status: 'to_verify',
        goodDirections: [],
        station: null,
        isStudySpot: false,
        isFavorite: false,
      });
    });

    it('refuses an invalid spot with issue codes', async () => {
      const agent = await asAdmin();

      const res = await agent.post('/api/spots').send({ name: '', lat: 100, lon: 0 });

      expect(res.status).toBe(400);
      expect(res.body.issues).toEqual([
        { code: 'REQUIRED', field: 'name' },
        { code: 'INVALID', field: 'location' },
        { code: 'REQUIRED', field: 'type' },
      ]);
    });

    it('edits a spot, and forgets its forecast models when it moves', async () => {
      const agent = await asAdmin();
      const spot = await SpotModel.create({ ...sottomarina, forecastModels: ['icon_d2'] });

      const verified = await agent.patch(`/api/spots/${spot.id}`).send({ notes: 'Corridor north' });
      expect(verified.body).toMatchObject({ notes: 'Corridor north', forecastModels: ['icon_d2'] });

      const moved = await agent.patch(`/api/spots/${spot.id}`).send({ lat: 45.19, lon: 12.3 });
      expect(moved.body).toMatchObject({ lat: 45.19, forecastModels: [] });
    });

    it('deletes a spot and removes it from favorites', async () => {
      const agent = await asAdmin();
      const spot = await SpotModel.create(sottomarina);
      await agent.put(`/api/spots/${spot.id}/favorite`);

      expect((await agent.delete(`/api/spots/${spot.id}`)).status).toBe(204);
      expect(await SpotModel.countDocuments()).toBe(0);
      expect((await FavoritesModel.findOne())?.spotIds).toEqual([]);
    });

    it('is forbidden for regular users', async () => {
      const { agent } = await signUp(t, mario);
      const spot = await SpotModel.create(sottomarina);

      expect((await agent.post('/api/spots').send(sottomarina)).status).toBe(403);
      expect((await agent.patch(`/api/spots/${spot.id}`).send({ name: 'x' })).status).toBe(403);
      expect((await agent.delete(`/api/spots/${spot.id}`)).status).toBe(403);
      expect((await agent.post('/api/spots/import-osm')).status).toBe(403);
      expect((await agent.get(`/api/spots/${spot.id}/station-suggestions`)).status).toBe(403);
      expect(
        (await agent.put(`/api/spots/${spot.id}/stations`).send({ station: null })).status,
      ).toBe(403);
    });
  });

  describe('list', () => {
    it('shows regular users only verified spots, by name, with favorites and indicators', async () => {
      const admin = await asAdmin();
      await SpotModel.create([
        sottomarina,
        { ...sottomarina, name: 'Albarella' },
        { ...sottomarina, name: 'Unchecked', status: 'to_verify' },
      ]);
      const { agent } = await signUp(t, mario);
      const albarella = (await SpotModel.findOne({ name: 'Albarella' }))!;
      await agent.put(`/api/spots/${albarella.id}/favorite`);

      const res = await agent.get('/api/spots');

      expect(res.status).toBe(200);
      expect(res.body.map((s: { name: string }) => s.name)).toEqual(['Albarella', 'Sottomarina']);
      // 18 kn from 60° all day, in every model
      expect(res.body[0]).toMatchObject({
        isFavorite: true,
        today: 'yes',
        tomorrow: 'yes',
        live: null,
      });
      expect(res.body[1]).toMatchObject({ isFavorite: false });
      expect((await admin.get('/api/spots')).body).toHaveLength(3);
    });

    it('says no good wind when the wind blows from a direction to avoid', async () => {
      stubFetch(openMeteo({ dir: 270 }), marine());
      await SpotModel.create(sottomarina);
      const { agent } = await signUp(t, mario);

      const [spot] = (await agent.get('/api/spots')).body;

      expect(spot).toMatchObject({ today: 'no', tomorrow: 'no' });
    });

    it('probes once which models cover each spot and caches the forecasts', async () => {
      const fetchMock = stubFetch(
        openMeteo({ uncovered: ['icon_d2', 'meteoswiss_icon_ch1'] }),
        marine(),
      );
      await SpotModel.create([sottomarina, { ...sottomarina, name: 'Albarella', lat: 45.07 }]);
      const { agent } = await signUp(t, mario);

      await agent.get('/api/spots');
      await agent.get('/api/spots');

      const spot = await SpotModel.findOne({ name: 'Sottomarina' });
      expect(spot?.forecastModels).toEqual([
        'italia_meteo_arpae_icon_2i',
        'meteofrance_arome_france_hd',
        'ecmwf_ifs',
        'gfs_seamless',
      ]);
      // One probe and one forecast call for both spots; the second list comes from the cache
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const forecastCall = new URL(fetchMock.mock.calls[1][0] as string);
      expect(forecastCall.searchParams.get('models')).not.toContain('icon_d2');
    });

    it('still lists spots when Open-Meteo is down', async () => {
      stubFetch(on('https://api.open-meteo.com/', { status: 503, body: {} }));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await SpotModel.create(sottomarina);
      const { agent } = await signUp(t, mario);

      const res = await agent.get('/api/spots');

      expect(res.status).toBe(200);
      expect(res.body[0]).toMatchObject({ name: 'Sottomarina', today: null, tomorrow: null });
    });
  });

  describe('spot page', () => {
    it('returns the spot, hiding spots to verify from regular users', async () => {
      const spot = await SpotModel.create(sottomarina);
      const hidden = await SpotModel.create({ ...sottomarina, status: 'to_verify' });
      const { agent } = await signUp(t, mario);

      expect((await agent.get(`/api/spots/${spot.id}`)).body).toMatchObject({
        name: 'Sottomarina',
        isFavorite: false,
      });
      expect((await agent.get(`/api/spots/${hidden.id}`)).status).toBe(404);
      expect((await agent.get('/api/spots/not-an-id')).status).toBe(404);
    });

    it('returns every model with its good hours, waves and the indicator of each day', async () => {
      const spot = await SpotModel.create(sottomarina);
      const { agent } = await signUp(t, mario);

      const res = await agent.get(`/api/spots/${spot.id}/forecast`);

      expect(res.status).toBe(200);
      expect(res.body.goodWind).toEqual({ minKnots: 14, minHours: 3 });
      expect(
        res.body.models.map((m: { model: string; group: string }) => [m.model, m.group]),
      ).toEqual([
        ['italia_meteo_arpae_icon_2i', 'high_res'],
        ['meteofrance_arome_france_hd', 'high_res'],
        ['icon_d2', 'high_res'],
        ['meteoswiss_icon_ch1', 'high_res'],
        ['ecmwf_ifs', 'global'],
        ['gfs_seamless', 'global'],
      ]);
      expect(res.body.models[0].good.every(Boolean)).toBe(true);
      expect(res.body.marine.waveHeight).toEqual([0.6]);
      expect(res.body.days[0]).toEqual({ date: expect.any(String), indicator: 'yes' });
    });

    it('has no waves for lake spots', async () => {
      const spot = await SpotModel.create({ ...sottomarina, type: 'lake' });
      const { agent } = await signUp(t, mario);

      expect((await agent.get(`/api/spots/${spot.id}/forecast`)).body.marine).toBeNull();
    });

    it('adds and removes a favorite, idempotently', async () => {
      const spot = await SpotModel.create(sottomarina);
      const { agent } = await signUp(t, mario);

      expect((await agent.put(`/api/spots/${spot.id}/favorite`)).status).toBe(204);
      await agent.put(`/api/spots/${spot.id}/favorite`);
      expect((await agent.get(`/api/spots/${spot.id}`)).body.isFavorite).toBe(true);

      expect((await agent.delete(`/api/spots/${spot.id}/favorite`)).status).toBe(204);
      expect((await agent.get(`/api/spots/${spot.id}`)).body.isFavorite).toBe(false);
    });
  });
});
