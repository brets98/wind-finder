import type { HydratedDocument } from 'mongoose';
import { readCache, writeCache } from '../models/cache.js';
import { SpotModel, type Spot } from '../models/spot.js';
import { fetchForecasts, fetchMarine, probeModelsMany } from '../sources/open-meteo.js';
import type { Forecast, MarineForecast } from '../sources/types.js';

/**
 * Forecasts are cached in MongoDB. The high-resolution models update every 1–3 hours on
 * Open-Meteo (ECMWF every 6, ICON-2I every 12), so an hour keeps them close to the latest run;
 * waves change more slowly.
 */
export const FORECAST_TTL_MS = 60 * 60 * 1000;
export const MARINE_TTL_MS = 3 * 60 * 60 * 1000;

type SpotDoc = HydratedDocument<Spot>;

/** The cache key changes with the spot's position and models, so edits never show stale data. */
const forecastKey = (s: SpotDoc) =>
  `forecast:${s.id}:${s.lat},${s.lon}:${s.forecastModels.join(',')}`;
const marineKey = (s: SpotDoc) => `marine:${s.id}:${s.lat},${s.lon}`;

/** Finds (once per position) the models covering each spot, in as few calls as possible. */
async function ensureModels(spots: SpotDoc[]) {
  const missing = spots.filter((s) => s.forecastModels.length === 0);
  if (missing.length === 0) return;
  const models = await probeModelsMany(missing);
  await Promise.all(
    missing.map((spot, i) => {
      spot.forecastModels = models[i];
      // Not save(): an admin edit at the same time must not conflict with this
      return SpotModel.updateOne(
        { _id: spot._id, lat: spot.lat, lon: spot.lon },
        { forecastModels: models[i] },
      );
    }),
  );
}

/**
 * The forecast of each spot, from the cache or from Open-Meteo, grouping spots with the same
 * models into one call. A spot whose forecast can't be fetched gets null.
 */
export async function forecastsFor(
  spots: SpotDoc[],
  now = new Date(),
): Promise<Map<string, Forecast | null>> {
  const result = new Map<string, Forecast | null>();
  try {
    await ensureModels(spots);
  } catch (err) {
    console.error('Could not find the forecast models:', err);
  }

  const toFetch = new Map<string, SpotDoc[]>();
  for (const spot of spots) {
    if (spot.forecastModels.length === 0) {
      result.set(spot.id, null);
      continue;
    }
    const cached = await readCache<Forecast>(forecastKey(spot), now);
    if (cached) {
      result.set(spot.id, cached);
    } else {
      const group = spot.forecastModels.join(',');
      toFetch.set(group, [...(toFetch.get(group) ?? []), spot]);
    }
  }

  for (const [group, groupSpots] of toFetch) {
    try {
      const forecasts = await fetchForecasts(groupSpots, group.split(','));
      const expiresAt = new Date(now.getTime() + FORECAST_TTL_MS);
      await Promise.all(
        groupSpots.map((spot, i) => {
          result.set(spot.id, forecasts[i]);
          return writeCache(forecastKey(spot), forecasts[i], expiresAt);
        }),
      );
    } catch (err) {
      console.error('Could not fetch forecasts:', err);
      for (const spot of groupSpots) result.set(spot.id, null);
    }
  }
  return result;
}

/** Waves for a sea spot (null for lakes, or when they can't be fetched). */
export async function marineFor(spot: SpotDoc, now = new Date()): Promise<MarineForecast | null> {
  if (spot.type !== 'sea') return null;
  const cached = await readCache<MarineForecast>(marineKey(spot), now);
  if (cached) return cached;
  try {
    const marine = await fetchMarine(spot);
    await writeCache(marineKey(spot), marine, new Date(now.getTime() + MARINE_TTL_MS));
    return marine;
  } catch (err) {
    console.error('Could not fetch the marine forecast:', err);
    return null;
  }
}
