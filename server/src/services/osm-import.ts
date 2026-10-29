import { getSettings } from '../models/settings.js';
import { SpotModel } from '../models/spot.js';
import { hasMarineData } from '../sources/open-meteo.js';
import { fetchKiteSpots } from '../sources/overpass.js';

/**
 * Imports candidate spots from OpenStreetMap as `to_verify`. Can be re-run: a spot already
 * imported (same OSM id) is neither duplicated nor overwritten, and one the admin deleted
 * (`settings.ignoredOsmIds`) doesn't come back. The type is a guess (sea if the Marine API
 * has waves there, otherwise lake), checked by the admin.
 */
export async function importOsmSpots() {
  const candidates = await fetchKiteSpots();
  const existing = new Set(
    (await SpotModel.find({ osmId: { $in: candidates.map((c) => c.osmId) } }, { osmId: 1 })).map(
      (s) => s.osmId,
    ),
  );
  const ignored = new Set((await getSettings()).ignoredOsmIds);
  const fresh = candidates.filter((c) => !existing.has(c.osmId) && !ignored.has(c.osmId));

  let sea: boolean[] = fresh.map(() => true);
  try {
    sea = await hasMarineData(fresh);
  } catch (err) {
    console.error('Could not guess sea or lake for the imported spots:', err);
  }

  if (fresh.length > 0) {
    await SpotModel.insertMany(
      fresh.map((c, i) => ({
        name: c.name || `OSM ${c.osmId}`,
        lat: c.lat,
        lon: c.lon,
        type: sea[i] ? 'sea' : 'lake',
        status: 'to_verify',
        osmId: c.osmId,
      })),
    );
  }
  return { found: candidates.length, created: fresh.length };
}
