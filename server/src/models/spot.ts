import { model, Schema, type Types } from 'mongoose';
import { createSchema } from '../db/schema.js';
import type { Sector } from '../domain/directions.js';
import { LEVELS, SPOT_STATUSES, SPOT_TYPES, WATER_TYPES, type SpotFields } from '../domain/spot.js';
import { STATION_SOURCES, type StationSource } from '../sources/types.js';

/** A station associated with a spot: always `source` + `stationId`, never only an id. */
export interface StationRef {
  source: StationSource;
  stationId: string;
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  notes: string;
}

export interface Spot extends SpotFields {
  osmId?: string;
  station?: StationRef | null;
  backupStation?: StationRef | null;
  /**
   * Open-Meteo models that cover the spot, found by probing (`probeModels()`); empty until
   * the first forecast, and emptied when the spot moves.
   */
  forecastModels: string[];
}

export type SpotDocument = Spot & { _id: Types.ObjectId; id: string };

const sectorSchema = new Schema<Sector>(
  {
    from: { type: Number, required: true, min: 0, max: 359 },
    to: { type: Number, required: true, min: 0, max: 359 },
  },
  { _id: false },
);

const stationSchema = new Schema<StationRef>(
  {
    source: { type: String, enum: STATION_SOURCES, required: true },
    stationId: { type: String, required: true },
    name: { type: String, default: '' },
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
    distanceKm: { type: Number, required: true },
    notes: { type: String, default: '' },
  },
  { _id: false },
);

const spotSchema = createSchema<Spot>({
  name: { type: String, required: true, trim: true },
  lat: { type: Number, required: true },
  lon: { type: Number, required: true },
  region: { type: String, default: '' },
  type: { type: String, enum: SPOT_TYPES, required: true },
  status: { type: String, enum: SPOT_STATUSES, default: 'to_verify' },
  osmId: { type: String },
  goodDirections: { type: [sectorSchema], default: [] },
  avoidDirections: { type: [sectorSchema], default: [] },
  water: { type: String, enum: [...WATER_TYPES, null], default: null },
  level: { type: String, enum: [...LEVELS, null], default: null },
  season: { type: String, default: '' },
  notes: { type: String, default: '' },
  station: { type: stationSchema, default: null },
  backupStation: { type: stationSchema, default: null },
  isStudySpot: { type: Boolean, default: false },
  forecastModels: { type: [String], default: [] },
});

// An OSM import never creates the same spot twice
spotSchema.index(
  { osmId: 1 },
  { unique: true, partialFilterExpression: { osmId: { $type: 'string' } } },
);

export const SpotModel = model<Spot>('Spot', spotSchema);
