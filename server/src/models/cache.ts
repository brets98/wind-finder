import { model, Schema } from 'mongoose';
import { createSchema } from '../db/schema.js';

/**
 * Responses of external sources kept for a while (forecasts), so that opening the app doesn't
 * call them every time. A TTL index deletes each entry once it expires.
 */
export interface CacheEntry {
  key: string;
  data: unknown;
  expiresAt: Date;
}

const cacheSchema = createSchema<CacheEntry>({
  key: { type: String, required: true, unique: true },
  data: { type: Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true },
});

cacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const CacheModel = model<CacheEntry>('Cache', cacheSchema, 'cache');

/** The cached value, unless missing or expired (the TTL index runs only once a minute). */
export async function readCache<T>(key: string, now = new Date()): Promise<T | null> {
  const entry = await CacheModel.findOne({ key, expiresAt: { $gt: now } }).lean();
  return entry ? (entry.data as T) : null;
}

export async function writeCache(key: string, data: unknown, expiresAt: Date) {
  await CacheModel.updateOne({ key }, { data, expiresAt }, { upsert: true });
}
