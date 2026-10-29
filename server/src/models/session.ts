import { model, Schema, type Types } from 'mongoose';
import { createSchema } from '../db/schema.js';
import {
  GUSTINESS,
  SEA_STATES,
  SPORTS,
  VISIBILITIES,
  type SessionFields,
} from '../domain/session.js';

/**
 * An outing ("session") logged by a rider, stored in `outings`, linked to the Day of its spot and date (created if needed).
 * `group` sessions are seen by everyone signed in, `private` ones only by their owner.
 */
export interface Session extends SessionFields {
  userId: string;
  spotId: Types.ObjectId;
  dayId: Types.ObjectId;
}

const sessionSchema = createSchema<Session>({
  userId: { type: String, required: true },
  spotId: { type: Schema.Types.ObjectId, ref: 'Spot', required: true },
  dayId: { type: Schema.Types.ObjectId, ref: 'Day', required: true },
  date: { type: String, required: true },
  start: { type: String, required: true },
  end: { type: String, required: true },
  sport: { type: String, enum: SPORTS, required: true },
  size: { type: Number, default: null },
  board: { type: String, default: '' },
  perceivedWind: { type: Number, default: null },
  gustiness: { type: String, enum: [...GUSTINESS, null], default: null },
  seaState: { type: String, enum: [...SEA_STATES, null], default: null },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '' },
  visibility: { type: String, enum: VISIBILITIES, default: 'group' },
});

// The board (newest first, by spot or by rider) and each Day's sessions
sessionSchema.index({ date: -1, start: -1 });
sessionSchema.index({ spotId: 1, date: -1 });
sessionSchema.index({ userId: 1, date: -1 });
sessionSchema.index({ dayId: 1 });

// Not "sessions": that collection belongs to Better Auth (sign-in sessions)
export const SessionModel = model<Session>('Session', sessionSchema, 'outings');

/** Sessions `userId` may see: the group's, plus their own private ones. */
export const visibleTo = (userId: string) => ({
  $or: [{ visibility: 'group' as const }, { userId }],
});
