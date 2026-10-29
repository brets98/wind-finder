import { model } from 'mongoose';
import { createSchema } from '../db/schema.js';

export const UNITS = ['knots', 'beaufort'] as const;
export type Unit = (typeof UNITS)[number];

/** A user's own preferences, one document per user (created on first change). */
export interface Preferences {
  userId: string;
  unit: Unit;
}

const preferencesSchema = createSchema<Preferences>({
  userId: { type: String, required: true, unique: true },
  unit: { type: String, enum: UNITS, default: 'knots' },
});

export const PreferencesModel = model<Preferences>('Preferences', preferencesSchema);
