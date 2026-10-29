import { distanceKm, isInItaly, type LatLon } from '../domain/geo.js';
import { getSettings } from '../models/settings.js';
import type { StationRef } from '../models/spot.js';
import { WindyStationModel } from '../models/windy-station.js';
import type { MeteoNetwork } from '../sources/meteonetwork.js';
import type {
  StationCheck,
  StationInfo,
  StationReading,
  StationSource,
  UnusableReason,
} from '../sources/types.js';
import type { Windy } from '../sources/windy.js';

export interface StationSources {
  meteonetwork: MeteoNetwork;
  windy: Windy;
}

/** A reading older than this is stale: flagged on the live panel, hidden from suggestions. */
export const STALE_MS = 3 * 60 * 60 * 1000;
/** Readings are reused for this long (MeteoNetwork allows 5 requests a minute). */
export const LIVE_CACHE_MS = 5 * 60 * 1000;
/** Suggested stations are within this distance of the spot. */
export const SUGGESTION_RADIUS_KM = 20;
/** At most this many Windy stations are checked per suggestion (nearest first). */
const MAX_CHECKED = 15;

export function isStale(reading: StationReading, now = new Date()) {
  return now.getTime() - new Date(reading.time).getTime() > STALE_MS;
}

export function createStationService(sources: StationSources) {
  // In-process, like the rest of the app's state: a single server instance
  const cache = new Map<string, { at: number; check: StationCheck }>();

  async function check(source: StationSource, stationId: string, now = new Date()) {
    const key = `${source}:${stationId}`;
    const hit = cache.get(key);
    if (hit && now.getTime() - hit.at < LIVE_CACHE_MS) return hit.check;
    const result = await sources[source].check(stationId);
    cache.set(key, { at: now.getTime(), check: result });
    return result;
  }

  /** The cached check of a station, without calling the source (for lists). */
  function cached(ref: StationRef, now = new Date()) {
    const hit = cache.get(`${ref.source}:${ref.stationId}`);
    return hit && now.getTime() - hit.at < LIVE_CACHE_MS ? hit.check : null;
  }

  /**
   * The live panel: the main station's latest reading; when it has none or it is stale, the
   * backup station's, saying so. `reading` is the best one available, stale or not.
   */
  async function live(
    spot: { station?: StationRef | null; backupStation?: StationRef | null },
    now = new Date(),
  ) {
    if (!spot.station) return null;
    const main = await check(spot.station.source, spot.station.stationId, now);
    const mainOk = main.usable && !isStale(main.latest, now);
    if (!mainOk && spot.backupStation) {
      const backup = await check(spot.backupStation.source, spot.backupStation.stationId, now);
      if (backup.usable && !isStale(backup.latest, now)) {
        return {
          station: spot.backupStation,
          reading: backup.latest,
          usingBackup: true,
          stale: false,
        };
      }
    }
    const reading = main.latest ?? null;
    return {
      station: spot.station,
      reading,
      usingBackup: false,
      stale: reading ? isStale(reading, now) : true,
    };
  }

  /** A check with the distance from the spot, and stale readings counted as not usable. */
  function describe(spot: LatLon, info: StationInfo, result: StationCheck, now: Date) {
    let usable = result.usable;
    let reason: UnusableReason | null = result.usable ? null : result.reason;
    if (result.usable && isStale(result.latest, now)) {
      usable = false;
      reason = 'stale';
    }
    const station = result.station ?? info;
    return {
      ...station,
      distanceKm: distanceKm(spot, station),
      usable,
      reason,
      latest: result.latest ?? null,
    };
  }

  /**
   * Stations the admin can choose for a spot: Windy open-data stations within 20 km, nearest
   * first, each checked for recent wind. MeteoNetwork can't be searched by position with a
   * STANDARD token: its stations are added by code (`checkStation()`).
   */
  async function suggestions(spot: LatLon, now = new Date()) {
    const nearby = (await WindyStationModel.find().lean())
      .map((s) => ({ ...s, distanceKm: distanceKm(spot, s) }))
      .filter((s) => s.distanceKm <= SUGGESTION_RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, MAX_CHECKED);

    const results = [];
    for (const s of nearby) {
      const info: StationInfo = {
        source: 'windy',
        stationId: s.stationId,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
      };
      results.push(describe(spot, info, await check('windy', s.stationId, now), now));
    }
    return results;
  }

  /** One station by source and id (e.g. a MeteoNetwork code typed by the admin). */
  async function checkStation(
    spot: LatLon,
    source: StationSource,
    stationId: string,
    now = new Date(),
  ) {
    const result = await check(source, stationId, now);
    if (!result.station)
      return { source, stationId, usable: false, reason: result.usable ? null : result.reason };
    return describe(spot, result.station, result, now);
  }

  /**
   * Downloads Windy's whole open-data catalogue, page by page, and keeps its Italian stations.
   * Stations no longer listed are removed.
   */
  async function syncWindyCatalogue(now = new Date()) {
    const italian = new Map<string, { name: string; lat: number; lon: number; online: boolean }>();
    let page = 0;
    let totalPages = 1;
    while (page < totalPages) {
      const result = await sources.windy.listPage(page);
      totalPages = result.totalPages;
      for (const s of result.stations) {
        if (isInItaly(s))
          italian.set(s.stationId, { name: s.name, lat: s.lat, lon: s.lon, online: s.online });
      }
      page++;
    }

    if (italian.size > 0) {
      await WindyStationModel.bulkWrite(
        [...italian].map(([stationId, s]) => ({
          updateOne: { filter: { stationId }, update: { $set: s }, upsert: true },
        })),
      );
    }
    await WindyStationModel.deleteMany({ stationId: { $nin: [...italian.keys()] } });
    const settings = await getSettings();
    settings.windyCatalogueSyncedAt = now;
    await settings.save();
    return { pages: page, stations: italian.size, syncedAt: now };
  }

  /**
   * A station's readings between two instants, oldest first. Only Windy keeps history (7 days);
   * MeteoNetwork's STANDARD token has none, until the app keeps its own readings (Phase 3).
   */
  async function history(
    ref: Pick<StationRef, 'source' | 'stationId'>,
    from: Date,
    to: Date,
  ): Promise<{ readings: StationReading[] } | { reason: 'no_history' | 'no_data' | 'error' }> {
    if (ref.source !== 'windy') return { reason: 'no_history' };
    try {
      const result = await sources.windy.observations(ref.stationId, from);
      if (!result) return { reason: 'no_data' };
      return {
        readings: result.readings.filter((r) => {
          const t = new Date(r.time).getTime();
          return t >= from.getTime() && t < to.getTime();
        }),
      };
    } catch {
      return { reason: 'error' };
    }
  }

  return { check, cached, live, suggestions, checkStation, syncWindyCatalogue, history };
}

export type StationService = ReturnType<typeof createStationService>;
