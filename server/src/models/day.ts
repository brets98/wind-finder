import { model, Schema, type Types } from 'mongoose';
import { createSchema } from '../db/schema.js';
import { DAY_REASONS, type DayReason } from '../domain/day.js';
import { STATION_SOURCES, type StationSource, type Value } from '../sources/types.js';

/** One model's hourly series for one run: `d1` = forecast of the day before, `d0` = latest. */
export interface DayForecast {
  model: string;
  run: 'd1' | 'd0';
  speed: Value[];
  gust: Value[];
  dir: Value[];
}

export type ObservedStatus = 'ok' | 'partial' | 'unavailable';
/** Why observations are missing: no station, a source without history, or too late to ask. */
export type ObservedReason = 'no_station' | 'no_history' | 'too_old' | 'no_data' | 'error';

export interface DayObserved {
  status: ObservedStatus;
  reason: ObservedReason | null;
  station: { source: StationSource; stationId: string; name: string; distanceKm: number } | null;
  usedBackup: boolean;
  /** Every reading of the day, in time order */
  times: Date[];
  wind: Value[];
  gust: Value[];
  dir: Value[];
  /** Fetched after the day was over: nothing more to ask */
  final: boolean;
}

/**
 * The whole day (Europe/Rome) at a spot: forecasts of every model for two runs, waves for sea
 * spots, the station's observations, and why it was saved. One per spot and date, shared by
 * every session there that day. Missing data is stored as null, never invented.
 */
export interface Day {
  spotId: Types.ObjectId;
  /** Local date, YYYY-MM-DD */
  date: string;
  reasons: DayReason[];
  /** Start of each hour of the day (UTC); 23 or 25 when the clocks change */
  hours: Date[];
  forecasts: DayForecast[];
  /** Forecasts fetched after the day was over (the D0 run is then complete) */
  forecastsFinal: boolean;
  marine: { waveHeight: Value[]; wavePeriod: Value[]; waveDir: Value[] } | null;
  observed: DayObserved;
  filledAt: Date | null;
}

const series = { type: [Number], default: [] };

const forecastSchema = new Schema<DayForecast>(
  {
    model: { type: String, required: true },
    run: { type: String, enum: ['d1', 'd0'], required: true },
    speed: series,
    gust: series,
    dir: series,
  },
  { _id: false },
);

const observedSchema = new Schema<DayObserved>(
  {
    status: { type: String, enum: ['ok', 'partial', 'unavailable'], default: 'unavailable' },
    reason: { type: String, default: null },
    station: {
      type: new Schema(
        {
          source: { type: String, enum: STATION_SOURCES },
          stationId: String,
          name: String,
          distanceKm: Number,
        },
        { _id: false },
      ),
      default: null,
    },
    usedBackup: { type: Boolean, default: false },
    times: { type: [Date], default: [] },
    wind: series,
    gust: series,
    dir: series,
    final: { type: Boolean, default: false },
  },
  { _id: false },
);

const daySchema = createSchema<Day>({
  spotId: { type: Schema.Types.ObjectId, ref: 'Spot', required: true },
  date: { type: String, required: true },
  reasons: { type: [String], enum: DAY_REASONS, default: [] },
  hours: { type: [Date], default: [] },
  forecasts: { type: [forecastSchema], default: [] },
  forecastsFinal: { type: Boolean, default: false },
  marine: {
    type: new Schema({ waveHeight: series, wavePeriod: series, waveDir: series }, { _id: false }),
    default: null,
  },
  observed: { type: observedSchema, default: () => ({}) },
  filledAt: { type: Date, default: null },
});

daySchema.index({ spotId: 1, date: -1 }, { unique: true });

export const DayModel = model<Day>('Day', daySchema);
