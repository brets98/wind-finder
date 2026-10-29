export interface LatLon {
  lat: number;
  lon: number;
}

/** Great-circle distance in km (same formula as the server's `distanceKm()`). */
export function distanceKm(a: LatLon, b: LatLon): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * The home list order: favorites first, then the others by distance from the user (or by
 * name when the position is unknown). Favorites are sorted the same way among themselves.
 */
export function sortSpots<T extends LatLon & { name: string; isFavorite: boolean }>(
  spots: T[],
  position: LatLon | null,
): T[] {
  const byPlace = (a: T, b: T) =>
    position ? distanceKm(position, a) - distanceKm(position, b) : a.name.localeCompare(b.name);
  return [...spots].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || byPlace(a, b));
}
