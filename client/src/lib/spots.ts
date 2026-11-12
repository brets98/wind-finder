/** Types of the spots API (see server/src/routes/spots.ts). */

export type SpotType = 'sea' | 'lake';
export type SpotStatus = 'to_verify' | 'verified';
export type Indicator = 'yes' | 'maybe' | 'no';
export type StationSource =
  'meteonetwork' | 'windy' | 'metar' | 'arpav' | 'meteotrentino' | 'lombardia';
export type Value = number | null;

export interface Sector {
  from: number;
  to: number;
}

export interface Reading {
  time: string;
  wind: Value;
  gust: Value;
  dir: Value;
}

export interface SpotSummary {
  id: string;
  name: string;
  lat: number;
  lon: number;
  type: SpotType;
  status: SpotStatus;
  region: string;
  isFavorite: boolean;
  today: Indicator | null;
  tomorrow: Indicator | null;
  live: (Reading & { source: StationSource }) | null;
}

export interface StationRef {
  source: StationSource;
  stationId: string;
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  notes: string;
}

export interface Spot {
  id: string;
  name: string;
  lat: number;
  lon: number;
  region: string;
  type: SpotType;
  status: SpotStatus;
  osmId?: string;
  goodDirections: Sector[];
  avoidDirections: Sector[];
  water: 'flat' | 'chop' | 'waves' | null;
  level: 'beginner' | 'intermediate' | 'advanced' | null;
  season: string;
  notes: string;
  station: StationRef | null;
  backupStation: StationRef | null;
  isStudySpot: boolean;
  isFavorite: boolean;
}

export interface ModelForecast {
  model: string;
  group: 'high_res' | 'global';
  speed: Value[];
  gust: Value[];
  dir: Value[];
  good: boolean[];
}

export interface SpotForecast {
  times: string[];
  models: ModelForecast[];
  marine: { times: string[]; waveHeight: Value[]; wavePeriod: Value[]; waveDir: Value[] } | null;
  goodWind: { minKnots: number; minHours: number };
  days: { date: string; indicator: Indicator | null }[];
}

export interface Live {
  station: StationRef;
  reading: Reading | null;
  usingBackup: boolean;
  stale: boolean;
}

export type UnusableReason = 'not_available' | 'no_wind' | 'no_data' | 'stale' | 'error';

export interface StationCandidate {
  source: StationSource;
  stationId: string;
  name?: string;
  lat?: number;
  lon?: number;
  distanceKm?: number;
  usable: boolean;
  reason: UnusableReason | null;
  latest?: Reading | null;
}
