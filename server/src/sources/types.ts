/**
 * The internal, normalized formats every source adapter returns. Wind speeds in knots,
 * directions in degrees (where the wind comes from), times as ISO 8601 UTC strings.
 * Missing values are null, never invented.
 */

export type Value = number | null;

/** One weather model's hourly series, aligned with `Forecast.times`. */
export interface ModelSeries {
  model: string;
  speed: Value[];
  gust: Value[];
  dir: Value[];
}

export interface Forecast {
  /** Hourly, UTC */
  times: string[];
  models: ModelSeries[];
}

export interface MarineForecast {
  times: string[];
  /** Metres */
  waveHeight: Value[];
  /** Seconds */
  wavePeriod: Value[];
  /** Degrees, where the waves come from */
  waveDir: Value[];
}

export const STATION_SOURCES = ['meteonetwork', 'windy'] as const;
export type StationSource = (typeof STATION_SOURCES)[number];

export interface StationInfo {
  source: StationSource;
  stationId: string;
  name: string;
  lat: number;
  lon: number;
}

export interface StationReading {
  time: string;
  wind: Value;
  gust: Value;
  dir: Value;
}

/** Why a station can't feed a live panel. */
export type UnusableReason = 'not_available' | 'no_wind' | 'no_data' | 'stale' | 'error';

export type StationCheck =
  | { usable: true; station: StationInfo; latest: StationReading }
  | { usable: false; reason: UnusableReason; station?: StationInfo; latest?: StationReading };

export interface SpotCandidate {
  osmId: string;
  name: string;
  lat: number;
  lon: number;
}
