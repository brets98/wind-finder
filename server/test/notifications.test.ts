import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localDate, localHours } from '../src/domain/time.js';
import { NotificationLogModel } from '../src/models/notification.js';
import { PushSubscriptionModel } from '../src/models/push-subscription.js';
import { SpotModel } from '../src/models/spot.js';
import { createTestApp, GONE_ENDPOINT, signUp, type TestApp } from './app.js';
import { useTestDatabase } from './db.js';
import { stubFetch } from './fetch.js';
import { marine, openMeteo, windyHistory } from './sources-stubs.js';

const mario = { name: 'Mario', surname: 'Rossi', email: 'mario@example.com' };
const anna = { name: 'Anna', surname: 'Bianchi', email: 'anna@example.com' };

const spot = (fields: Record<string, unknown> = {}) =>
  SpotModel.create({
    name: 'Sottomarina',
    lat: 45.2,
    lon: 12.31,
    type: 'sea',
    status: 'verified',
    goodDirections: [{ from: 30, to: 120 }],
    forecastModels: ['icon_d2', 'ecmwf_ifs'],
    station: {
      source: 'windy',
      stationId: 'near',
      name: 'Chioggia',
      lat: 45.21,
      lon: 12.3,
      distanceKm: 1.4,
      notes: '',
    },
    ...fields,
  });

const subscription = (endpoint = 'https://push.example.com/phone') => ({
  endpoint,
  keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
});

// Late in the evening of today, so that the station has a whole day of readings
const hours = localHours(localDate(new Date()));
const evening = new Date(new Date(hours.at(-1)!).getTime() + 50 * 60_000);

/** Forecasts at `forecast` knots and, today, Windy readings at `stationMs` m/s. */
function stubSources({ forecast = 18, stationMs = 3 } = {}) {
  stubFetch(
    openMeteo({ speed: forecast }),
    marine(),
    windyHistory('near', new Date(hours[0]), evening, stationMs),
  );
}

describe('notifications', () => {
  useTestDatabase();

  let t: TestApp;
  beforeEach(() => {
    t = createTestApp();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** A signed-up user with `spotId` as favorite and, optionally, a subscribed device. */
  async function rider(user: typeof mario, spotId: string, { device = true } = {}) {
    const signedUp = await signUp(t, user);
    await signedUp.agent.put(`/api/spots/${spotId}/favorite`).expect(204);
    if (device) await signedUp.agent.post('/api/push/subscriptions').send(subscription());
    return signedUp;
  }

  describe('devices', () => {
    it('gives the public key and saves, moves and removes a device', async () => {
      const { agent, id } = await signUp(t, mario);
      expect((await agent.get('/api/push/key')).body).toEqual({
        publicKey: 'test-vapid-public-key',
      });

      expect((await agent.post('/api/push/subscriptions').send(subscription())).status).toBe(201);
      expect(await PushSubscriptionModel.findOne()).toMatchObject({ userId: id });

      // Anna signs in on the same browser: the device is hers now
      const other = await signUp(t, anna);
      await other.agent.post('/api/push/subscriptions').send(subscription()).expect(201);
      expect(await PushSubscriptionModel.countDocuments()).toBe(1);
      expect(await PushSubscriptionModel.findOne()).toMatchObject({ userId: other.id });

      // Mario can't remove Anna's device
      await agent.delete('/api/push/subscriptions').send({ endpoint: subscription().endpoint });
      expect(await PushSubscriptionModel.countDocuments()).toBe(1);
      await other.agent
        .delete('/api/push/subscriptions')
        .send({ endpoint: subscription().endpoint })
        .expect(204);
      expect(await PushSubscriptionModel.countDocuments()).toBe(0);
    });

    it('refuses an invalid subscription', async () => {
      const { agent } = await signUp(t, mario);
      for (const body of [
        {},
        { endpoint: 'http://push.example.com/x', keys: subscription().keys },
        { endpoint: subscription().endpoint, keys: { p256dh: 'x' } },
      ]) {
        expect((await agent.post('/api/push/subscriptions').send(body)).status).toBe(400);
      }
    });
  });

  describe('preferences and settings', () => {
    it('keeps the evening email on by default, and lets the user turn it off', async () => {
      const { agent } = await signUp(t, mario);
      expect((await agent.get('/api/me/preferences')).body).toEqual({ unit: 'knots', email: true });
      const res = await agent.patch('/api/me/preferences').send({ email: false });
      expect(res.body).toEqual({ unit: 'knots', email: false });
      expect((await agent.patch('/api/me/preferences').send({ email: 'no' })).status).toBe(400);
    });

    it('lets only the admin change the notification times', async () => {
      const admin = await signUp(t, anna, { role: 'admin' });
      const user = await signUp(t, mario);
      expect((await user.agent.get('/api/settings')).body.notifications).toEqual({
        pushAt: '19:00',
        emailAt: '19:00',
      });

      const times = { notifications: { pushAt: '18:30', emailAt: '20:00' } };
      expect((await user.agent.patch('/api/settings').send(times)).status).toBe(403);
      const res = await admin.agent.patch('/api/settings').send(times);
      expect(res.body).toMatchObject({ ...times, goodWind: { minKnots: 10, minHours: 1 } });

      const bad = await admin.agent
        .patch('/api/settings')
        .send({ notifications: { pushAt: '25:00', emailAt: '20:00' } });
      expect(bad.status).toBe(400);
      expect(bad.body.issues).toEqual([{ code: 'INVALID', field: 'pushAt' }]);
    });
  });

  describe('push', () => {
    it('sends one push per day grouping the favorite spots with good wind ahead', async () => {
      const a = await spot();
      const b = await spot({ name: 'Torbole', lat: 45.87, lon: 10.88, type: 'lake' });
      const { agent } = await rider(mario, a.id);
      await agent.put(`/api/spots/${b.id}/favorite`).expect(204);
      stubSources({ forecast: 18 });

      expect(await t.notifications.sendPush(evening)).toEqual({ sent: 1 });
      expect(t.pushes).toHaveLength(1);
      const push = t.pushes[0];
      expect(push.title).toBe('Good wind ahead');
      expect(push.body).toMatch(/^Sottomarina: \w{3} \d+ \w{3}, .+ · Torbole: /);
      expect(push.url).toBe('http://localhost:3000/');

      // Once a day: a second run sends nothing
      expect(await t.notifications.sendPush(evening)).toEqual({ sent: 0 });
      expect(await NotificationLogModel.countDocuments({ channel: 'push' })).toBe(1);
    });

    it('stays quiet without good wind, without favorites or without a device', async () => {
      const a = await spot();
      await rider(mario, a.id);
      await rider(anna, a.id, { device: false });
      stubSources({ forecast: 8 });
      expect(await t.notifications.sendPush(evening)).toEqual({ sent: 0 });
      expect(t.pushes).toHaveLength(0);
    });

    it('forgets devices the push service says are gone', async () => {
      const a = await spot();
      const { agent } = await rider(mario, a.id, { device: false });
      await agent.post('/api/push/subscriptions').send(subscription(GONE_ENDPOINT));
      stubSources({ forecast: 18 });

      expect(await t.notifications.sendPush(evening)).toEqual({ sent: 0 });
      expect(await PushSubscriptionModel.countDocuments()).toBe(0);
      // Nothing delivered: nothing logged
      expect(await NotificationLogModel.countDocuments()).toBe(0);
    });

    it('never tells a user about a spot still to verify', async () => {
      const a = await spot();
      await rider(mario, a.id);
      await SpotModel.updateOne({ _id: a._id }, { status: 'to_verify' });
      stubSources({ forecast: 18 });
      expect(await t.notifications.sendPush(evening)).toEqual({ sent: 0 });
    });
  });

  describe('evening email', () => {
    it('reports the good wind measured today and forecast in the next days', async () => {
      const a = await spot();
      await rider(mario, a.id, { device: false });
      stubSources({ forecast: 18, stationMs: 8 });
      t.mails.length = 0;

      expect(await t.notifications.sendEmails(evening)).toEqual({ sent: 1 });
      const [mail] = t.mails;
      expect(mail).toMatchObject({ to: mario.email, subject: 'Good wind: Sottomarina' });
      expect(mail.text).toContain('Hi Mario,');
      expect(mail.text).toMatch(
        /- Sottomarina: \d\d:\d\d–\d\d:\d\d, up to 16 kn from ENE \(Chioggia\)/,
      );
      expect(mail.text).toMatch(/- Sottomarina: \w{3} \d+ \w{3} yes, /);
      expect(mail.text).toContain('http://localhost:3000/notifications');

      expect(await t.notifications.sendEmails(evening)).toEqual({ sent: 0 });
    });

    it('shows speeds in the user\u2019s unit and leaves out empty sections', async () => {
      const a = await spot();
      const { agent } = await rider(mario, a.id, { device: false });
      await agent.patch('/api/me/preferences').send({ unit: 'beaufort' });
      stubSources({ forecast: 8, stationMs: 8 });
      t.mails.length = 0;

      await t.notifications.sendEmails(evening);
      expect(t.mails[0].text).toContain('up to Force 4 from ENE');
      expect(t.mails[0].text).not.toContain('next days');
    });

    it('sends nothing when there is nothing to say, or the user turned it off', async () => {
      const a = await spot();
      const { agent } = await rider(mario, a.id, { device: false });
      stubSources({ forecast: 8, stationMs: 3 });
      expect(await t.notifications.sendEmails(evening)).toEqual({ sent: 0 });

      await agent.patch('/api/me/preferences').send({ email: false });
      stubSources({ forecast: 18, stationMs: 8 });
      expect(await t.notifications.sendEmails(evening)).toEqual({ sent: 0 });
    });
  });
});
