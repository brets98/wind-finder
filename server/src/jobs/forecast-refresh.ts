import { FavoritesModel } from '../models/favorite.js';
import { SpotModel } from '../models/spot.js';
import { forecastsFor, marineFor } from '../services/forecasts.js';
import type { Job } from './scheduler.js';

/** Shorter than the forecast cache (an hour), so that it never runs cold. */
export const REFRESH_EVERY_MS = 30 * 60 * 1000;

/** Keeps the cached forecasts of favorite and study spots up to date with the latest runs. */
export function forecastRefreshJob(): Job {
  async function run(now: Date) {
    const favorites = await FavoritesModel.distinct('spotIds');
    const spots = await SpotModel.find({
      $or: [{ isStudySpot: true }, { _id: { $in: favorites } }],
    });
    await forecastsFor(spots, now);
    for (const spot of spots) await marineFor(spot, now);
  }

  return { name: 'forecast-refresh', schedule: () => ({ everyMs: REFRESH_EVERY_MS }), run };
}
