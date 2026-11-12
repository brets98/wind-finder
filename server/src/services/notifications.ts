import type { HydratedDocument } from 'mongoose';
import webpush from 'web-push';
import { forecastOutlook, measuredGoodWind, outlookDates } from '../domain/notifications.js';
import { localDate, localHours } from '../domain/time.js';
import type { Mailer } from '../mail/mailer.js';
import { emailMessage, pushMessage, type SpotNews } from '../mail/notifications.js';
import { FavoritesModel } from '../models/favorite.js';
import { NotificationLogModel, type Channel } from '../models/notification.js';
import { DEFAULT_PREFERENCES, PreferencesModel } from '../models/preferences.js';
import { PushSubscriptionModel, type PushSubscription } from '../models/push-subscription.js';
import { ROLES } from '../models/role.js';
import { getSettings } from '../models/settings.js';
import { SpotModel, type Spot } from '../models/spot.js';
import { UserModel } from '../models/user.js';
import type { GoodWindSettings } from '../domain/good-wind.js';
import { forecastsFor } from './forecasts.js';
import type { StationService } from './stations.js';

type SpotDoc = HydratedDocument<Spot>;

/** Sends one push message to one device; fails with `statusCode` 404/410 when it is gone. */
export type PushSender = (
  subscription: Pick<PushSubscription, 'endpoint' | 'keys'>,
  payload: string,
) => Promise<void>;

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  /** mailto: or https: contact for the push services */
  subject: string;
}

/** A push not delivered within 12 hours is about a past evening: drop it. */
const PUSH_TTL_SECONDS = 12 * 3600;

export function createWebPushSender(vapid: VapidKeys): PushSender {
  return async (subscription, payload) => {
    await webpush.sendNotification(subscription, payload, {
      vapidDetails: vapid,
      TTL: PUSH_TTL_SECONDS,
    });
  };
}

const DUPLICATE_KEY = 11000;

/**
 * The daily push and the evening email about each user's favorite spots. Each is sent at
 * most once per user and day: the log entry is written first, and removed if nothing could
 * be delivered.
 */
export function createNotificationService({
  stations,
  mailer,
  push,
  appUrl,
}: {
  stations: StationService;
  mailer: Mailer;
  /** Null without VAPID keys: push is off */
  push: PushSender | null;
  appUrl: string;
}) {
  /** Verified users with favorites (among `userIds` when given), with the spots they may see. */
  async function recipients(userIds?: string[]) {
    const favorites = await FavoritesModel.find({
      'spotIds.0': { $exists: true },
      ...(userIds ? { userId: { $in: userIds } } : {}),
    });
    const users = await UserModel.find({
      _id: { $in: favorites.map((f) => f.userId) },
      emailVerified: true,
    });
    const spots = await SpotModel.find({ _id: { $in: favorites.flatMap((f) => f.spotIds) } });
    return users.map((user) => {
      const ids = new Set(favorites.find((f) => f.userId === user.id)!.spotIds.map(String));
      return {
        user,
        spots: spots.filter(
          (s) => ids.has(s.id) && (s.status === 'verified' || user.role === ROLES.admin),
        ),
      };
    });
  }

  /** Good wind measured today by the spot's station (the backup when the main has nothing). */
  async function measuredToday(spot: SpotDoc, settings: GoodWindSettings, now: Date) {
    const hours = localHours(localDate(now)).filter((h) => new Date(h) < now);
    if (hours.length === 0) return null;
    for (const ref of [spot.station, spot.backupStation]) {
      if (!ref) continue;
      const result = await stations.history(ref, new Date(hours[0]), now);
      if (!('readings' in result) || result.readings.length === 0) continue;
      const measured = measuredGoodWind(hours, result.readings, spot, settings);
      return measured ? { ...measured, station: ref.name } : null;
    }
    return null;
  }

  /** Measured wind today (when asked) and forecast outlook of every spot, by id. */
  async function news(spots: SpotDoc[], now: Date, { measured }: { measured: boolean }) {
    const { goodWind } = await getSettings();
    const forecasts = await forecastsFor(spots, now);
    const dates = outlookDates(localDate(now));
    const result = new Map<string, SpotNews>();
    for (const spot of spots) {
      const forecast = forecasts.get(spot.id);
      result.set(spot.id, {
        id: spot.id,
        name: spot.name,
        measured: measured ? await measuredToday(spot, goodWind, now) : null,
        outlook: forecast ? forecastOutlook(forecast, dates, spot, goodWind) : [],
      });
    }
    return result;
  }

  const unique = (spots: SpotDoc[]) => [...new Map(spots.map((s) => [s.id, s])).values()];

  /** Writes the log entry; false when this user already got this channel today. */
  async function claim(userId: string, channel: Channel, date: string, spots: string[]) {
    try {
      await NotificationLogModel.create({ userId, channel, date, spots });
      return true;
    } catch (err) {
      if ((err as { code?: number }).code === DUPLICATE_KEY) return false;
      throw err;
    }
  }

  const release = (userId: string, channel: Channel, date: string) =>
    NotificationLogModel.deleteOne({ userId, channel, date });

  /** One push per user with a subscribed device, grouping every favorite spot. */
  async function sendPush(now = new Date()) {
    if (!push) return { sent: 0 };
    const date = localDate(now);
    const subscriptions = await PushSubscriptionModel.find();
    const list = await recipients([...new Set(subscriptions.map((s) => s.userId))]);
    const byId = await news(unique(list.flatMap((r) => r.spots)), now, { measured: false });

    let sent = 0;
    for (const { user, spots } of list) {
      const message = pushMessage(
        spots.map((s) => byId.get(s.id)!),
        appUrl,
      );
      if (!message || !(await claim(user.id, 'push', date, message.spots))) continue;
      const payload = JSON.stringify({
        title: message.title,
        body: message.body,
        url: message.url,
      });
      let delivered = 0;
      for (const sub of subscriptions.filter((s) => s.userId === user.id)) {
        try {
          await push(sub, payload);
          delivered++;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // The device unsubscribed or the browser was reset: forget it
          if (status === 404 || status === 410) await sub.deleteOne();
          else console.error(`Push to ${user.email} failed:`, err);
        }
      }
      if (delivered > 0) sent++;
      else await release(user.id, 'push', date);
    }
    return { sent };
  }

  /** The evening email to every user who keeps it on, when there is something to say. */
  async function sendEmails(now = new Date()) {
    const date = localDate(now);
    const list = await recipients();
    const prefs = await PreferencesModel.find({ userId: { $in: list.map((r) => r.user.id) } });
    const prefsOf = (userId: string) =>
      prefs.find((p) => p.userId === userId) ?? DEFAULT_PREFERENCES;
    const wanted = list.filter((r) => prefsOf(r.user.id).email);
    const byId = await news(unique(wanted.flatMap((r) => r.spots)), now, { measured: true });

    let sent = 0;
    for (const { user, spots } of wanted) {
      const message = emailMessage(
        user,
        spots.map((s) => byId.get(s.id)!),
        prefsOf(user.id).unit,
        appUrl,
      );
      if (!message || !(await claim(user.id, 'email', date, message.spots))) continue;
      try {
        await mailer({ to: user.email, subject: message.subject, text: message.text });
        sent++;
      } catch (err) {
        console.error(`Email to ${user.email} failed:`, err);
        await release(user.id, 'email', date);
      }
    }
    return { sent };
  }

  return { sendPush, sendEmails };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
