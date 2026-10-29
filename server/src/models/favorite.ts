import { model, Schema, type Types } from 'mongoose';
import { createSchema } from '../db/schema.js';

/** A user's favorite spots, one document per user. */
export interface Favorites {
  userId: string;
  spotIds: Types.ObjectId[];
}

const favoritesSchema = createSchema<Favorites>({
  userId: { type: String, required: true, unique: true },
  spotIds: { type: [Schema.Types.ObjectId], default: [] },
});

export const FavoritesModel = model<Favorites>('Favorites', favoritesSchema);

export async function favoriteIds(userId: string): Promise<Set<string>> {
  const doc = await FavoritesModel.findOne({ userId });
  return new Set((doc?.spotIds ?? []).map(String));
}
