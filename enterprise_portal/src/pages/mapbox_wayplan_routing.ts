export type Coordinate = [number, number];

export type WayplanStopInput = {
  id?: string;
  stop_id?: string;
  stop_sequence?: number | null;
  stop_seq?: number | null;
  sequence?: number | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  address?: string | null;
  township?: string | null;
  customer_name?: string | null;
};

export type RouteSummary = {
  distance_km: number;
  duration_min: number;
  geometry?: unknown;
  waypoints: Coordinate[];
  google_maps_url?: string;
  mapbox_url?: string;
};

export const mapboxRoutingEnabled = Boolean(import.meta.env.VITE_MAPBOX_TOKEN);

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function normalizeCoordinate(stop: WayplanStopInput): Coordinate | null {
  const lat = toNumber(stop.latitude ?? stop.lat);
  const lng = toNumber(stop.longitude ?? stop.lng);
  if (lat === null || lng === null) return null;
  return [lng, lat];
}

export function normalizeStopCoordinates(stops: WayplanStopInput[]): Coordinate[] {
  return stops.map(normalizeCoordinate).filter((v): v is Coordinate => Boolean(v));
}

export function buildMapboxWaypoints(stops: WayplanStopInput[]): Coordinate[] {
  return normalizeStopCoordinates(stops);
}

export function sortStopsBySequence<T extends WayplanStopInput>(stops: T[]): T[] {
  return [...stops].sort((a, b) => {
    const av = Number(a.stop_sequence ?? a.stop_seq ?? a.sequence ?? 0);
    const bv = Number(b.stop_sequence ?? b.stop_seq ?? b.sequence ?? 0);
    return av - bv;
  });
}

export function optimizeWayplanStops<T extends WayplanStopInput>(stops: T[]): T[] {
  // Safe deterministic fallback for testing: preserve planned sequence.
  return sortStopsBySequence(stops);
}

export function calculateRouteDistanceKm(stopsOrCoordinates: WayplanStopInput[] | Coordinate[]): number {
  if (!stopsOrCoordinates || stopsOrCoordinates.length < 2) return 0;

  const coords: Coordinate[] = Array.isArray(stopsOrCoordinates[0])
    ? (stopsOrCoordinates as Coordinate[])
    : normalizeStopCoordinates(stopsOrCoordinates as WayplanStopInput[]);

  if (coords.length < 2) return 0;

  const rad = (v: number) => (v * Math.PI) / 180;
  let total = 0;

  for (let i = 1; i < coords.length; i += 1) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const dLat = rad(lat2 - lat1);
    const dLng = rad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
    total += 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  return Math.round(total * 100) / 100;
}

export function estimateRouteDurationMin(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  return Math.max(10, Math.round((distanceKm / 22) * 60));
}

export function formatDistance(km: number): string {
  return Number.isFinite(km) ? km.toFixed(1) + " km" : "—";
}

export function buildGoogleMapsUrl(stops: WayplanStopInput[]): string {
  const coords = normalizeStopCoordinates(stops);
  if (!coords.length) return "";
  const parts = coords.map(([lng, lat]) => `${lat},${lng}`);
  return `https://www.google.com/maps/dir/${parts.join("/")}`;
}

export function buildMapboxDirectionsUrl(stops: WayplanStopInput[]): string {
  const coords = normalizeStopCoordinates(stops);
  if (!coords.length) return "";
  const joined = coords.map(([lng, lat]) => `${lng},${lat}`).join(";");
  return `https://api.mapbox.com/directions/v5/mapbox/driving/${joined}`;
}

export async function fetchMapboxRoute(stops: WayplanStopInput[]): Promise<RouteSummary> {
  const waypoints = normalizeStopCoordinates(stops);
  const distance_km = calculateRouteDistanceKm(waypoints);
  return {
    distance_km,
    duration_min: estimateRouteDurationMin(distance_km),
    waypoints,
    google_maps_url: buildGoogleMapsUrl(stops),
    mapbox_url: buildMapboxDirectionsUrl(stops),
  };
}

export async function getRouteSummary(stops: WayplanStopInput[]): Promise<RouteSummary> {
  return fetchMapboxRoute(stops);
}

export default {
  mapboxRoutingEnabled,
  normalizeCoordinate,
  normalizeStopCoordinates,
  buildMapboxWaypoints,
  sortStopsBySequence,
  optimizeWayplanStops,
  calculateRouteDistanceKm,
  estimateRouteDurationMin,
  formatDistance,
  buildGoogleMapsUrl,
  buildMapboxDirectionsUrl,
  fetchMapboxRoute,
  getRouteSummary,
};