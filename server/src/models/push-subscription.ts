import { model, Schema } from 'mongoose';
import { createSchema } from '../db/schema.js';

/** A device (browser) that accepted push notifications for a user. */
export interface PushSubscription {
  userId: string;
  /** The push service's URL for this device: unique, it identifies the subscription */
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const pushSubscriptionSchema = createSchema<PushSubscription>({
  userId: { type: String, required: true, index: true },
  endpoint: { type: String, required: true, unique: true },
  keys: {
    type: new Schema(
      { p256dh: { type: String, required: true }, auth: { type: String, required: true } },
      { _id: false },
    ),
    required: true,
  },
});

export const PushSubscriptionModel = model<PushSubscription>(
  'PushSubscription',
  pushSubscriptionSchema,
  'pushsubscriptions',
);
