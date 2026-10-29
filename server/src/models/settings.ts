import { model, Schema } from 'mongoose';
import { createSchema } from '../db/schema.js';
import { DEFAULT_GOOD_WIND, type GoodWindSettings } from '../domain/good-wind.js';

/** Global settings, edited by the admin: a single document. */
export interface Settings {
  key: 'global';
  goodWind: GoodWindSettings;
  /** Last full download of Windy's open-data station catalogue */
  windyCatalogueSyncedAt: Date | null;
  /** OSM ids of imported spots the admin deleted, so that a new import skips them */
  ignoredOsmIds: string[];
}

const settingsSchema = createSchema<Settings>({
  key: { type: String, default: 'global', unique: true },
  goodWind: {
    type: new Schema<GoodWindSettings>(
      {
        minKnots: { type: Number, required: true, min: 1, max: 60 },
        minHours: { type: Number, required: true, min: 1, max: 24 },
      },
      { _id: false },
    ),
    default: () => ({ ...DEFAULT_GOOD_WIND }),
  },
  windyCatalogueSyncedAt: { type: Date, default: null },
  ignoredOsmIds: { type: [String], default: [] },
});

export const SettingsModel = model<Settings>('Settings', settingsSchema);

/** The settings document, created with the defaults the first time. */
export async function getSettings() {
  return SettingsModel.findOneAndUpdate(
    { key: 'global' },
    { $setOnInsert: { key: 'global' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).orFail();
}
