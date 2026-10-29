import { useEffect, useState } from 'react';
import type { LatLon } from './geo';

/** The user's position, asked once; null while unknown or when refused. */
export function useGeolocation(): LatLon | null {
  const [position, setPosition] = useState<LatLon | null>(null);
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setPosition({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => setPosition(null),
      { maximumAge: 10 * 60_000, timeout: 10_000 },
    );
  }, []);
  return position;
}

/** Whether a media query matches, following changes (e.g. rotating a tablet). */
export function useMediaQuery(query: string): boolean {
  const get = () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Desktop layout: full-screen map with a side list. */
export const DESKTOP_QUERY = '(min-width: 900px)';
