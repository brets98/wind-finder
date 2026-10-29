import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, localDate, localHours } from '../src/domain/time.js';
import { DayModel } from '../src/models/day.js';
import { SessionModel } from '../src/models/session.js';
import { SpotModel } from '../src/models/spot.js';
import { createTestApp, signUp, type TestApp } from './app.js';
import { useTestDatabase } from './db.js';
import { on, stubFetch } from './fetch.js';
import { marine, openMeteo, previousRuns, windyHistory } from './sources-stubs.js';

const mario = { name: 'Mario', surname: 'Rossi', email: 'mario@example.com' };
const anna = { name: 'Anna', surname: 'Bianchi', email: 'anna@example.com' };

const station = (source: 'windy' | 'meteonetwork', stationId: string) => ({
  source,
  stationId,
  name: `Station ${stationId}`,
  lat: 45.21,
  lon: 12.3,
  distanceKm: 1.4,
  notes: '',
});

const sottomarina = {
  name: 'Sottomarina',
  lat: 45.2,
  lon: 12.31,
  type: 'sea' as const,
  status: 'verified' as const,
  goodDirections: [{ from: 30, to: 120 }],
  forecastModels: ['icon_d2', 'ecmwf_ifs'],
  station: station('windy', 'near'),
};

const today = () => localDate(new Date());
const yesterday = () => addDays(today(), -1);

/** Stubs every source for `date`: forecasts, waves and Windy readings all day long. */
function stubSources(date: string, extra: Parameters<typeof stubFetch> = []) {
  const hours = localHours(date);
  const from = new Date(hours[0]);
  const to = new Date(new Date(hours.at(-1)!).getTime() + 3_600_000);
  return stubFetch(...extra, previousRuns(), marine(), openMeteo(), windyHistory('near', from, to));
}

describe('days', () => {
  useTestDatabase();

  let t: TestApp;
  beforeEach(() => {
    t = createTestApp();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('save this day', () => {
    it('saves a past day whole: both runs of every model, waves and every station reading', async () => {
      const spot = await SpotModel.create(sottomarina);
      stubSources(yesterday());
      const { agent } = await signUp(t, mario);

      const res = await agent.post(`/api/spots/${spot.id}/days`).send({ date: yesterday() });

      expect(res.status).toBe(201);
      const day = res.body;
      expect(day).toMatchObject({ date: yesterday(), reasons: ['manual'], forecastsFinal: true });
      expect(day.hours.length).toBeGreaterThanOrEqual(23);
      expect(
        day.forecasts.map((f: { model: string; run: string }) => `${f.model}/${f.run}`),
      ).toEqual(['icon_d2/d1', 'ecmwf_ifs/d1', 'icon_d2/d0', 'ecmwf_ifs/d0']);
      const d1 = day.forecasts[0];
      expect(d1.speed).toHaveLength(day.hours.length);
      expect(d1.speed[0]).toBe(12);
      expect(day.forecasts[2].speed[0]).toBe(18);
      expect(day.marine.waveHeight).toHaveLength(day.hours.length);
      expect(day.observed).toMatchObject({
        status: 'ok',
        final: true,
        usedBackup: false,
        station: { source: 'windy', stationId: 'near', name: 'Station near' },
      });
      expect(day.observed.readings).toHaveLength(day.hours.length * 6);
      expect(day.observed.hourly.wind[0]).toBe(15);
    });

    it('keeps one Day per spot and date, adding reasons', async () => {
      const spot = await SpotModel.create(sottomarina);
      stubSources(yesterday());
      const { agent } = await signUp(t, mario);

      await agent.post(`/api/spots/${spot.id}/days`).send({ date: yesterday() });
      await agent.post(`/api/spots/${spot.id}/days`).send({ date: yesterday() });

      expect(await DayModel.countDocuments()).toBe(1);
      expect((await DayModel.findOne())?.reasons).toEqual(['manual']);
    });

    it('keeps today open: forecasts not final yet, observations partial', async () => {
      const spot = await SpotModel.create(sottomarina);
      stubSources(today());
      const { agent } = await signUp(t, mario);

      const { body } = await agent.post(`/api/spots/${spot.id}/days`).send({});

      expect(body).toMatchObject({ date: today(), forecastsFinal: false });
      expect(body.observed).toMatchObject({ status: 'partial', final: false });
    });

    it('stores missing data as missing, never invented', async () => {
      const spot = await SpotModel.create({ ...sottomarina, type: 'lake' });
      stubSources(yesterday(), [previousRuns({ noD1: ['icon_d2'] })]);
      const { agent } = await signUp(t, mario);

      const { body } = await agent.post(`/api/spots/${spot.id}/days`).send({ date: yesterday() });

      const d1 = body.forecasts.find(
        (f: { model: string; run: string }) => f.model === 'icon_d2' && f.run === 'd1',
      );
      expect(d1.speed.every((v: number | null) => v === null)).toBe(true);
      expect(body.marine).toBeNull();
    });

    it('says why there are no observations', async () => {
      const bare = await SpotModel.create({ ...sottomarina, name: 'Bare', station: null });
      const mn = await SpotModel.create({
        ...sottomarina,
        name: 'MN',
        station: station('meteonetwork', 'vnt100'),
      });
      stubSources(yesterday());
      const { agent } = await signUp(t, mario);

      const noStation = await agent.post(`/api/spots/${bare.id}/days`).send({ date: yesterday() });
      expect(noStation.body.observed).toMatchObject({
        status: 'unavailable',
        reason: 'no_station',
      });

      const noHistory = await agent.post(`/api/spots/${mn.id}/days`).send({ date: yesterday() });
      expect(noHistory.body.observed).toMatchObject({
        status: 'unavailable',
        reason: 'no_history',
      });

      const old = addDays(today(), -10);
      stubSources(old);
      const tooOld = await agent.post(`/api/spots/${mn.id}/days`).send({ date: old });
      expect(tooOld.body.observed).toMatchObject({
        status: 'unavailable',
        reason: 'too_old',
        final: true,
      });
    });

    it('uses the backup station when the main one has no readings, and says so', async () => {
      const spot = await SpotModel.create({
        ...sottomarina,
        station: station('windy', 'dead'),
        backupStation: station('windy', 'near'),
      });
      stubSources(yesterday(), [
        on('https://stations.windy.com/api/v2/opendata/station/dead/', { status: 404, body: {} }),
      ]);
      const { agent } = await signUp(t, mario);

      const { body } = await agent.post(`/api/spots/${spot.id}/days`).send({ date: yesterday() });

      expect(body.observed).toMatchObject({
        status: 'ok',
        usedBackup: true,
        station: { stationId: 'near' },
      });
    });

    it('still saves the Day when Open-Meteo is down, to complete it later', async () => {
      const spot = await SpotModel.create(sottomarina);
      stubSources(yesterday(), [
        on('https://previous-runs-api.open-meteo.com/', { status: 503, body: {} }),
      ]);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { agent } = await signUp(t, mario);

      const { body } = await agent.post(`/api/spots/${spot.id}/days`).send({ date: yesterday() });

      expect(body).toMatchObject({
        forecasts: [],
        forecastsFinal: false,
        observed: { status: 'ok' },
      });
    });

    it('refuses future dates and dates before the forecast archive', async () => {
      const spot = await SpotModel.create(sottomarina);
      const { agent } = await signUp(t, mario);

      expect(
        (await agent.post(`/api/spots/${spot.id}/days`).send({ date: addDays(today(), 1) })).status,
      ).toBe(400);
      expect(
        (await agent.post(`/api/spots/${spot.id}/days`).send({ date: '2023-12-31' })).status,
      ).toBe(400);
      expect(
        (await agent.post(`/api/spots/${spot.id}/days`).send({ date: 'yesterday' })).status,
      ).toBe(400);
    });
  });

  describe('reading Days', () => {
    it('completes a partial Day again when it is read later', async () => {
      const spot = await SpotModel.create(sottomarina);
      const fetchMock = stubSources(today());
      const { agent } = await signUp(t, mario);
      const { body } = await agent.post(`/api/spots/${spot.id}/days`).send({});
      const calls = fetchMock.mock.calls.length;

      // Read again at once: too soon to ask the sources again
      await agent.get(`/api/days/${body.id}`);
      expect(fetchMock.mock.calls.length).toBe(calls);

      await DayModel.updateOne({}, { filledAt: new Date(Date.now() - 31 * 60_000) });
      const again = await agent.get(`/api/days/${body.id}`);

      expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
      expect(again.body).toMatchObject({ spot: { name: 'Sottomarina' }, sessions: [] });
    });

    it('lists the spot history, newest first, with each Day’s visible sessions', async () => {
      const spot = await SpotModel.create(sottomarina);
      stubSources(yesterday());
      const { agent } = await signUp(t, mario);
      await agent.post(`/api/spots/${spot.id}/days`).send({ date: yesterday() });
      stubSources(today());
      await agent.post('/api/sessions').send({
        spotId: spot.id,
        date: today(),
        start: '00:00',
        end: '00:30',
        sport: 'kite',
        rating: 4,
      });

      const { body } = await agent.get(`/api/spots/${spot.id}/days`);

      expect(body.map((d: { date: string }) => d.date)).toEqual([today(), yesterday()]);
      expect(body[0]).toMatchObject({
        reasons: ['session'],
        sessions: [{ rider: { name: 'Mario Rossi' }, rating: 4 }],
      });
      expect(body[1]).toMatchObject({
        reasons: ['manual'],
        observedStatus: 'ok',
        maxObserved: 15,
        sessions: [],
      });
    });
  });
});

describe('sessions', () => {
  useTestDatabase();

  let t: TestApp;
  beforeEach(() => {
    t = createTestApp();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const session = (spotId: string, extra: Record<string, unknown> = {}) => ({
    spotId,
    date: yesterday(),
    start: '13:00',
    end: '16:00',
    sport: 'kite',
    size: 9,
    perceivedWind: 17,
    gustiness: 'gusty',
    seaState: 'chop',
    rating: 4,
    comment: 'Bora',
    ...extra,
  });

  it('stores outings apart from Better Auth sign-in sessions', async () => {
    expect(SessionModel.collection.collectionName).toBe('outings');
  });

  it('logs a session with its Day; two riders the same day share one Day', async () => {
    const spot = await SpotModel.create(sottomarina);
    stubSources(yesterday());
    const { agent: m } = await signUp(t, mario);
    const { agent: a } = await signUp(t, anna);

    const res = await m.post('/api/sessions').send(session(spot.id));
    await a.post('/api/sessions').send(session(spot.id, { start: '14:00', rating: 5 }));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      rider: { name: 'Mario Rossi' },
      isOwn: true,
      size: 9,
      visibility: 'group',
    });
    expect(await DayModel.countDocuments()).toBe(1);
    const day = await DayModel.findOne();
    expect(day?.reasons).toEqual(['session']);
    expect((await SessionModel.find()).every((s) => String(s.dayId) === day!.id)).toBe(true);
  });

  it('refuses an invalid session or a spot the user cannot see', async () => {
    const spot = await SpotModel.create(sottomarina);
    const hidden = await SpotModel.create({ ...sottomarina, status: 'to_verify' });
    const { agent } = await signUp(t, mario);

    const invalid = await agent
      .post('/api/sessions')
      .send(session(spot.id, { rating: 0, end: '12:00' }));
    expect(invalid.status).toBe(400);
    expect(invalid.body.issues).toEqual([
      { code: 'BEFORE_START', field: 'end' },
      { code: 'REQUIRED', field: 'rating' },
    ]);
    expect((await agent.post('/api/sessions').send(session(hidden.id))).status).toBe(404);
  });

  it('shows the board newest first, filterable by spot and rider, with a small chart', async () => {
    const spot = await SpotModel.create(sottomarina);
    const garda = await SpotModel.create({ ...sottomarina, name: 'Garda', type: 'lake' });
    stubSources(yesterday());
    const { agent: m, id: marioId } = await signUp(t, mario);
    const { agent: a } = await signUp(t, anna);
    await m.post('/api/sessions').send(session(spot.id, { start: '10:00', end: '12:00' }));
    await a.post('/api/sessions').send(session(spot.id, { start: '14:00' }));
    await a.post('/api/sessions').send(session(garda.id, { start: '15:00' }));

    const all = (await m.get('/api/sessions')).body;
    expect(all.sessions.map((s: { start: string }) => s.start)).toEqual([
      '15:00',
      '14:00',
      '10:00',
    ]);
    expect(all.hasMore).toBe(false);
    expect(all.sessions[1]).toMatchObject({
      spot: { name: 'Sottomarina' },
      rider: { name: 'Anna Bianchi' },
      isOwn: false,
    });
    expect(all.sessions[1].chart).toMatchObject({ model: 'icon_d2' });
    expect(all.sessions[1].chart.forecastD0[0]).toBe(18);
    expect(all.sessions[1].chart.forecastD1[0]).toBe(12);
    expect(all.sessions[1].chart.observed[0]).toBe(15);

    const bySpot = (await m.get(`/api/sessions?spotId=${garda.id}`)).body.sessions;
    expect(bySpot).toHaveLength(1);
    const byRider = (await m.get(`/api/sessions?userId=${marioId}`)).body.sessions;
    expect(byRider.map((s: { start: string }) => s.start)).toEqual(['10:00']);

    const filters = (await m.get('/api/sessions/filters')).body;
    expect(filters).toEqual({
      spots: [
        { id: garda.id, name: 'Garda' },
        { id: spot.id, name: 'Sottomarina' },
      ],
      riders: [
        { id: expect.any(String), name: 'Anna Bianchi' },
        { id: marioId, name: 'Mario Rossi' },
      ],
    });
    expect(JSON.stringify(filters)).not.toContain('@');
  });

  it('shows private sessions only to their owner', async () => {
    const spot = await SpotModel.create(sottomarina);
    stubSources(yesterday());
    const { agent: m } = await signUp(t, mario);
    const { agent: a } = await signUp(t, anna, { role: 'admin' });
    const { body: own } = await m
      .post('/api/sessions')
      .send(session(spot.id, { visibility: 'private' }));

    expect((await m.get('/api/sessions')).body.sessions).toHaveLength(1);
    expect((await m.get(`/api/sessions/${own.id}`)).status).toBe(200);

    // Not even an admin sees it
    expect((await a.get('/api/sessions')).body.sessions).toHaveLength(0);
    expect((await a.get(`/api/sessions/${own.id}`)).status).toBe(404);
    expect((await a.get(`/api/spots/${spot.id}/days`)).body[0].sessions).toHaveLength(0);
    expect((await a.get(`/api/days/${own.dayId}`)).body.sessions).toHaveLength(0);
    expect((await a.get('/api/sessions/filters')).body.riders).toEqual([]);
  });

  it('lets only the rider edit or delete a session; a new date moves it to that Day', async () => {
    const spot = await SpotModel.create(sottomarina);
    stubSources(yesterday());
    const { agent: m } = await signUp(t, mario);
    const { agent: a } = await signUp(t, anna);
    const { body } = await m.post('/api/sessions').send(session(spot.id));

    expect((await a.patch(`/api/sessions/${body.id}`).send({ rating: 1 })).status).toBe(403);
    expect((await a.delete(`/api/sessions/${body.id}`)).status).toBe(403);

    const edited = await m
      .patch(`/api/sessions/${body.id}`)
      .send({ rating: 5, comment: 'Even better' });
    expect(edited.body).toMatchObject({ rating: 5, comment: 'Even better', size: 9 });
    expect((await m.patch(`/api/sessions/${body.id}`).send({ end: '12:00' })).status).toBe(400);

    const earlier = addDays(today(), -2);
    stubSources(earlier);
    const moved = await m.patch(`/api/sessions/${body.id}`).send({ date: earlier });
    expect(moved.body.date).toBe(earlier);
    expect(moved.body.dayId).not.toBe(body.dayId);
    expect(await DayModel.countDocuments()).toBe(2);

    expect((await m.delete(`/api/sessions/${body.id}`)).status).toBe(204);
    expect(await SessionModel.countDocuments()).toBe(0);
    // The Days stay: their data is worth keeping
    expect(await DayModel.countDocuments()).toBe(2);
  });
});
