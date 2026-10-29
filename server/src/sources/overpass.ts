import { fetchJson, SourceError } from './http.js';
import type { SpotCandidate } from './types.js';

/**
 * OpenStreetMap (© OpenStreetMap contributors, ODbL) through the Overpass API: places in Italy
 * tagged sport=kitesurfing or sport=kiteboarding (also inside a list, e.g. "surfing;kitesurfing"),
 * nodes, ways and relations, each at its center point.
 */
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

export const KITE_SPOTS_QUERY = `[out:json][timeout:120];
area["ISO3166-1"="IT"][admin_level=2]->.it;
nwr["sport"~"(^|;)(kitesurfing|kiteboarding)(;|$)"](area.it);
out center tags;`;

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export async function fetchKiteSpots(): Promise<SpotCandidate[]> {
  const { status, body } = await fetchJson<{ elements?: OverpassElement[] }>(
    'overpass',
    OVERPASS_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: KITE_SPOTS_QUERY }).toString(),
      timeoutMs: 150_000,
    },
  );
  if (status !== 200 || !Array.isArray(body?.elements)) {
    throw new SourceError('overpass', status, `HTTP ${status}`);
  }

  return body.elements.flatMap((e) => {
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat === undefined || lon === undefined) return [];
    const osmId = `${e.type}/${e.id}`;
    return [{ osmId, name: e.tags?.name?.trim() || '', lat, lon }];
  });
}
