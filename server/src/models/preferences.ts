import { model } from 'mongoose';
import { createSchema } from '../db/schema.js';

export const UNITS = ['knots', 'beaufort'] as const;
export type Unit = (typeof UNITS)[number];

/**
 * A user's own preferences, one document per user (created on first change). Push is on for
 * each device with a subscription (`pushsubscriptions`), so it has no flag here.
 */
export interface Preferences {
  userId: string;
  unit: Unit;
  /** The evening email about good wind at favorite spots */
  email: boolean;
}

export const DEFAULT_PREFERENCES = { unit: 'knots' as Unit, email: true };

const preferencesSchema = createSchema<Preferences>({
  userId: { type: String, required: true, unique: true },
  unit: { type: String, enum: UNITS, default: DEFAULT_PREFERENCES.unit },
  email: { type: Boolean, default: DEFAULT_PREFERENCES.email },
});

export const PreferencesModel = model<Preferences>('Preferences', preferencesSchema);
