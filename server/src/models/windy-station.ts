import { model } from 'mongoose';
import { createSchema } from '../db/schema.js';

/**
 * The Italian part of Windy's open-data station catalogue, which the API can't search by
 * position. Refreshed by the admin (`syncWindyCatalogue()`).
 */
export interface WindyStation {
  stationId: string;
  name: string;
  lat: number;
  lon: number;
  online: boolean;
}

const windyStationSchema = createSchema<WindyStation>({
  stationId: { type: String, required: true, unique: true },
  name: { type: String, default: '' },
  lat: { type: Number, required: true },
  lon: { type: Number, required: true },
  online: { type: Boolean, default: false },
});

export const WindyStationModel = model<WindyStation>(
  'WindyStation',
  windyStationSchema,
  'windyStations',
);
