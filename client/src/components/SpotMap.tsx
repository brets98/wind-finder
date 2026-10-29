import 'leaflet/dist/leaflet.css';
import type { LatLngBounds } from 'leaflet';
import { useEffect, useRef } from 'react';
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { useNavigate } from 'react-router';
import type { Indicator, SpotSummary } from '../lib/spots';

/**
 * Leaflet with OpenStreetMap's standard tiles (no Google Maps). OSM's tile usage policy asks
 * for the attribution, which stays visible, and for light use: fine for a handful of users.
 */
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const ITALY_CENTER: [number, number] = [42.5, 12.5];

const COLORS: Record<Indicator | 'unknown', string> = {
  yes: '#16a34a',
  maybe: '#eab308',
  no: '#64748b',
  unknown: '#94a3b8',
};

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

interface Props {
  spots: SpotSummary[];
  /** Called with the visible area whenever the map moves */
  onBoundsChange?: (bounds: Bounds) => void;
  highlighted?: string | null;
  onHover?: (id: string | null) => void;
}

const toBounds = (b: LatLngBounds): Bounds => ({
  south: b.getSouth(),
  west: b.getWest(),
  north: b.getNorth(),
  east: b.getEast(),
});

function BoundsWatcher({ onChange }: { onChange?: (bounds: Bounds) => void }) {
  const map = useMapEvents({ moveend: () => onChange?.(toBounds(map.getBounds())) });
  useEffect(() => {
    onChange?.(toBounds(map.getBounds()));
  }, [map, onChange]);
  return null;
}

/** Frames all the spots the first time they arrive. */
function FitToSpots({ spots }: { spots: SpotSummary[] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || spots.length === 0) return;
    done.current = true;
    if (spots.length === 1) map.setView([spots[0].lat, spots[0].lon], 11);
    else
      map.fitBounds(
        spots.map((s) => [s.lat, s.lon] as [number, number]),
        { padding: [30, 30] },
      );
  }, [map, spots]);
  return null;
}

export function SpotMap({ spots, onBoundsChange, highlighted, onHover }: Props) {
  const navigate = useNavigate();
  return (
    <MapContainer center={ITALY_CENTER} zoom={6} className="spot-map" scrollWheelZoom>
      <TileLayer url={TILES} attribution={ATTRIBUTION} maxZoom={19} />
      <FitToSpots spots={spots} />
      <BoundsWatcher onChange={onBoundsChange} />
      {spots.map((spot) => {
        const color = COLORS[spot.today ?? 'unknown'];
        return (
          <CircleMarker
            key={spot.id}
            center={[spot.lat, spot.lon]}
            radius={highlighted === spot.id ? 11 : 8}
            pathOptions={{ color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.9 }}
            eventHandlers={{
              click: () => navigate(`/spots/${spot.id}`),
              mouseover: () => onHover?.(spot.id),
              mouseout: () => onHover?.(null),
            }}
          >
            <Tooltip>{spot.name}</Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
