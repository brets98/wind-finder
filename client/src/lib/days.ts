/** Types of the Days and Sessions API (see server/src/routes/days.ts and sessions.ts). */
import type { StationSource, Value } from './spots';

export type DayReason = 'auto_forecast' | 'auto_observed' | 'manual' | 'session';
export type ObservedStatus = 'ok' | 'partial' | 'unavailable';
export type ObservedReason = 'no_station' | 'no_history' | 'too_old' | 'no_data' | 'error';

export const SPORTS = ['kite', 'foil', 'wing', 'windsurf', 'other'] as const;
export const GUSTINESS = ['steady', 'gusty', 'very_gusty'] as const;
export const SEA_STATES = ['flat', 'chop', 'waves'] as const;

export interface Session {
  id: string;
  spotId: string;
  dayId: string;
  rider: { id: string; name: string };
  isOwn: boolean;
  date: string;
  start: string;
  end: string;
  sport: (typeof SPORTS)[number];
  size: number | null;
  board: string;
  perceivedWind: number | null;
  gustiness: (typeof GUSTINESS)[number] | null;
  seaState: (typeof SEA_STATES)[number] | null;
  rating: number;
  comment: string;
  visibility: 'group' | 'private';
}

export interface DayDetail {
  id: string;
  spotId: string;
  date: string;
  reasons: DayReason[];
  hours: string[];
  forecasts: { model: string; run: 'd1' | 'd0'; speed: Value[]; gust: Value[]; dir: Value[] }[];
  forecastsFinal: boolean;
  marine: { waveHeight: Value[]; wavePeriod: Value[]; waveDir: Value[] } | null;
  observed: {
    status: ObservedStatus;
    reason: ObservedReason | null;
    station: { source: StationSource; stationId: string; name: string; distanceKm: number } | null;
    usedBackup: boolean;
    final: boolean;
    hourly: { wind: Value[]; gust: Value[]; dir: Value[] };
  };
  spot?: { id: string; name: string; type: 'sea' | 'lake' };
  sessions?: Session[];
}

export interface DaySummary {
  id: string;
  date: string;
  reasons: DayReason[];
  observedStatus: ObservedStatus;
  maxObserved: number | null;
  sessions: Session[];
}

export interface BoardSession extends Session {
  spot: { id: string; name: string; type: 'sea' | 'lake' } | null;
  chart: {
    hours: string[];
    model: string | null;
    forecastD1: Value[];
    forecastD0: Value[];
    observed: Value[];
  } | null;
}

/** "HH:mm" to minutes after midnight. */
export const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
