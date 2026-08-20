export type RouteCoordinate = {
  longitude: number;
  latitude: number;
};

export type RouteOrigin = RouteCoordinate & {
  code: string;
  name: string;
  address?: string;
};

export type RouteStop = RouteCoordinate & {
  deliveryWayId: string;
  recipientName?: string;
  recipientPhone?: string;
  address?: string;
  township?: string;
  placeName?: string;
  source?: "BACKEND" | "MAPBOX_GEOCODE" | "MANUAL" | "TOWNSHIP_FALLBACK";
};

export type OptimizedRoute = {
  orderedStops: RouteStop[];
  geometry: GeoJSON.LineString;
  distanceMeters: number;
  durationSeconds: number;
  profile: "mapbox/driving" | "mapbox/driving-traffic" | "mapbox/cycling";
  mode: "MAPBOX_OPTIMIZATION_V1" | "MAPBOX_CHUNKED_OPTIMIZATION_V1";
  requestCount: number;
};

const DEFAULT_PROFILE: OptimizedRoute["profile"] = "mapbox/driving-traffic";
const MAX_COORDINATES = 12;
const MAX_STOPS_PER_REQUEST = MAX_COORDINATES - 1;

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function coordinateFromRecord(row: Record<string, unknown>): RouteCoordinate | null {
  const metadata = (row.metadata || row.meta || row.payload || {}) as Record<string, any>;
  const routeMeta = metadata.mapbox_route_v45 || metadata.route_v45 || {};
  const longitude = finiteNumber(
    row.longitude ?? row.lng ?? row.recipient_longitude ?? row.delivery_longitude ??
    row.recipient_lng ?? row.delivery_lng ?? routeMeta.longitude ?? routeMeta.lng,
  );
  const latitude = finiteNumber(
    row.latitude ?? row.lat ?? row.recipient_latitude ?? row.delivery_latitude ??
    row.recipient_lat ?? row.delivery_lat ?? routeMeta.latitude ?? routeMeta.lat,
  );
  if (longitude === null || latitude === null) return null;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
  return { longitude, latitude };
}

function radians(value: number) {
  return value * Math.PI / 180;
}

export function distanceMeters(a: RouteCoordinate, b: RouteCoordinate) {
  const earthRadius = 6_371_000;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

function ensureToken(token: string) {
  const value = token.trim();
  if (!value) throw new Error("Mapbox token is missing. Add VITE_MAPBOX_ACCESS_TOKEN in Vercel and local environment settings.");
  return value;
}

function encodeCoordinate(point: RouteCoordinate) {
  return `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`;
}

async function fetchJson(url: string) {
  const response = await fetch(url, { method: "GET" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || (payload.code && payload.code !== "Ok")) {
    throw new Error(payload.message || payload.code || `Mapbox request failed with HTTP ${response.status}`);
  }
  return payload;
}

export async function geocodeRouteStop(
  stop: Omit<RouteStop, keyof RouteCoordinate>,
  token: string,
  origin: RouteOrigin,
): Promise<RouteStop> {
  const query = [stop.address, stop.township, "Yangon", "Myanmar"].filter(Boolean).join(", ");
  if (!query.trim()) throw new Error(`${stop.deliveryWayId}: address and township are missing.`);
  const parameters = new URLSearchParams({
    q: query,
    access_token: ensureToken(token),
    limit: "1",
    autocomplete: "false",
    permanent: "true",
    country: "MM",
    proximity: `${origin.longitude},${origin.latitude}`,
  });
  const payload = await fetchJson(`https://api.mapbox.com/search/geocode/v6/forward?${parameters.toString()}`);
  const feature = payload.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error(`${stop.deliveryWayId}: Mapbox could not resolve the delivery address.`);
  }
  return {
    ...stop,
    longitude: Number(coordinates[0]),
    latitude: Number(coordinates[1]),
    placeName: feature.properties?.full_address || feature.properties?.name || query,
    source: "MAPBOX_GEOCODE",
  };
}

export async function geocodeMissingStops(
  stops: Array<Partial<RouteStop> & { deliveryWayId: string }>,
  token: string,
  origin: RouteOrigin,
  onProgress?: (done: number, total: number, current: string) => void,
): Promise<{ resolved: RouteStop[]; failed: Array<{ deliveryWayId: string; message: string }> }> {
  const resolved: RouteStop[] = [];
  const failed: Array<{ deliveryWayId: string; message: string }> = [];
  let done = 0;
  const queue = [...stops];
  const worker = async () => {
    while (queue.length) {
      const stop = queue.shift();
      if (!stop) return;
      try {
        const existing = coordinateFromRecord(stop as Record<string, unknown>);
        const output = existing
          ? { ...stop, ...existing, source: stop.source || "BACKEND" } as RouteStop
          : await geocodeRouteStop(stop as Omit<RouteStop, keyof RouteCoordinate>, token, origin);
        resolved.push(output);
      } catch (error: any) {
        failed.push({ deliveryWayId: stop.deliveryWayId, message: error?.message || "Geocoding failed" });
      } finally {
        done += 1;
        onProgress?.(done, stops.length, stop.deliveryWayId);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, Math.max(1, stops.length)) }, () => worker()));
  const order = new Map(stops.map((stop, index) => [stop.deliveryWayId, index]));
  resolved.sort((a, b) => (order.get(a.deliveryWayId) ?? 0) - (order.get(b.deliveryWayId) ?? 0));
  return { resolved, failed };
}

function selectChunk(origin: RouteCoordinate, remaining: RouteStop[]) {
  if (remaining.length <= MAX_STOPS_PER_REQUEST) return [...remaining];
  return [...remaining]
    .sort((a, b) => distanceMeters(origin, a) - distanceMeters(origin, b))
    .slice(0, MAX_STOPS_PER_REQUEST);
}

async function optimizeChunk(
  origin: RouteCoordinate,
  stops: RouteStop[],
  token: string,
  profile: OptimizedRoute["profile"],
) {
  if (!stops.length) throw new Error("No delivery stops were supplied to Mapbox.");
  const farthest = [...stops].sort((a, b) => distanceMeters(origin, b) - distanceMeters(origin, a))[0];
  const intermediate = stops.filter((stop) => stop.deliveryWayId !== farthest.deliveryWayId);
  const input = [
    { kind: "origin" as const, ...origin },
    ...intermediate.map((stop) => ({ kind: "stop" as const, ...stop })),
    { kind: "stop" as const, ...farthest },
  ];
  const coordinates = input.map(encodeCoordinate).join(";");
  const parameters = new URLSearchParams({
    source: "first",
    destination: "last",
    roundtrip: "false",
    geometries: "geojson",
    overview: "full",
    steps: "true",
    language: "en",
    access_token: ensureToken(token),
  });
  const payload = await fetchJson(`https://api.mapbox.com/optimized-trips/v1/${profile}/${coordinates}?${parameters.toString()}`);
  const trip = payload.trips?.[0];
  if (!trip?.geometry?.coordinates?.length) throw new Error("Mapbox returned no route geometry.");

  const orderedInput = input
    .map((point, inputIndex) => ({ point, order: Number(payload.waypoints?.[inputIndex]?.waypoint_index ?? inputIndex) }))
    .sort((a, b) => a.order - b.order)
    .map((item) => item.point);
  const orderedStops = orderedInput.filter((point): point is RouteStop & { kind: "stop" } => point.kind === "stop");
  return {
    orderedStops: orderedStops.map(({ kind: _kind, ...stop }) => stop),
    geometry: trip.geometry as GeoJSON.LineString,
    distanceMeters: Number(trip.distance || 0),
    durationSeconds: Number(trip.duration || 0),
  };
}

export async function optimizeRouteFromHeadOffice(
  origin: RouteOrigin,
  stops: RouteStop[],
  token: string,
  profile: OptimizedRoute["profile"] = DEFAULT_PROFILE,
  onProgress?: (completedRequests: number, totalRequests: number) => void,
): Promise<OptimizedRoute> {
  ensureToken(token);
  if (!stops.length) throw new Error("At least one delivery stop is required.");
  const seen = new Set<string>();
  for (const stop of stops) {
    if (!stop.deliveryWayId) throw new Error("Every route stop requires a Way ID.");
    if (seen.has(stop.deliveryWayId)) throw new Error(`Duplicate Way ID in route: ${stop.deliveryWayId}`);
    seen.add(stop.deliveryWayId);
    if (!Number.isFinite(stop.longitude) || !Number.isFinite(stop.latitude)) {
      throw new Error(`${stop.deliveryWayId}: valid coordinates are required before optimization.`);
    }
  }

  let current: RouteCoordinate = origin;
  let remaining = [...stops];
  const orderedStops: RouteStop[] = [];
  const geometryCoordinates: number[][] = [];
  let distance = 0;
  let duration = 0;
  let requestCount = 0;
  const totalRequests = Math.ceil(stops.length / MAX_STOPS_PER_REQUEST);

  while (remaining.length) {
    const chunk = selectChunk(current, remaining);
    const result = await optimizeChunk(current, chunk, token, profile);
    requestCount += 1;
    onProgress?.(requestCount, totalRequests);
    orderedStops.push(...result.orderedStops);
    distance += result.distanceMeters;
    duration += result.durationSeconds;
    const line = result.geometry.coordinates as number[][];
    geometryCoordinates.push(...(geometryCoordinates.length ? line.slice(1) : line));
    const completed = new Set(result.orderedStops.map((stop) => stop.deliveryWayId));
    remaining = remaining.filter((stop) => !completed.has(stop.deliveryWayId));
    const last = result.orderedStops[result.orderedStops.length - 1];
    current = last || current;
  }

  return {
    orderedStops,
    geometry: { type: "LineString", coordinates: geometryCoordinates },
    distanceMeters: distance,
    durationSeconds: duration,
    profile,
    mode: requestCount > 1 ? "MAPBOX_CHUNKED_OPTIMIZATION_V1" : "MAPBOX_OPTIMIZATION_V1",
    requestCount,
  };
}

export function routeSavePayload(origin: RouteOrigin, route: OptimizedRoute) {
  return {
    version: 45,
    origin,
    profile: route.profile,
    route_mode: route.mode,
    geometry: route.geometry,
    distance_m: Math.round(route.distanceMeters),
    duration_s: Math.round(route.durationSeconds),
    request_count: route.requestCount,
    ordered_stops: route.orderedStops.map((stop, index) => ({
      delivery_way_id: stop.deliveryWayId,
      sequence: index + 1,
      latitude: stop.latitude,
      longitude: stop.longitude,
      place_name: stop.placeName || null,
      coordinate_source: stop.source || "BACKEND",
      recipient_name: stop.recipientName || null,
      recipient_phone: stop.recipientPhone || null,
      address: stop.address || null,
      township: stop.township || null,
    })),
  };
}
