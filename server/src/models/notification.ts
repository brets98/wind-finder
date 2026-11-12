import { model } from 'mongoose';
import { createSchema } from '../db/schema.js';

export const CHANNELS = ['push', 'email'] as const;
export type Channel = (typeof CHANNELS)[number];

/**
 * What was sent to whom: at most one per user, channel and local date. Written before
 * sending, so that a second run the same day sends nothing. Kept for six months.
 */
export interface NotificationLog {
  userId: string;
  channel: Channel;
  /** Local date (Europe/Rome) it was sent */
  date: string;
  /** Names of the spots it was about */
  spots: string[];
}

const notificationSchema = createSchema<NotificationLog>({
  userId: { type: String, required: true },
  channel: { type: String, enum: CHANNELS, required: true },
  date: { type: String, required: true },
  spots: { type: [String], default: [] },
});

notificationSchema.index({ userId: 1, channel: 1, date: 1 }, { unique: true });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

export const NotificationLogModel = model<NotificationLog>(
  'NotificationLog',
  notificationSchema,
  'notifications',
);
