export type RouteCoordinate = {
  longitude: number;
  latitude: number;
};

export type RouteOrigin = RouteCoordinate & {
  code: string;
  name: string;
  address?: string;
};

export type RouteProfile = "mapbox/driving" | "mapbox/driving-traffic" | "mapbox/cycling";

export type RouteStop = RouteCoordinate & {
  deliveryWayId: string;
  recipientName?: string;
  recipientPhone?: string;
  address?: string;
  township?: string;
  placeName?: string;
  source?: "BACKEND" | "MAPBOX_GEOCODE" | "MANUAL" | "TOWNSHIP_FALLBACK";
  legDistanceMeters?: number;
  legDurationSeconds?: number;
  cumulativeDistanceMeters?: number;
  cumulativeDurationSeconds?: number;
  etaIso?: string;
  fromLabel?: string;
};

export type RouteLeg = {
  sequence: number;
  fromLabel: string;
  fromDeliveryWayId: string | null;
  toDeliveryWayId: string;
  distanceMeters: number;
  durationSeconds: number;
  cumulativeDistanceMeters: number;
  cumulativeDurationSeconds: number;
  etaIso: string;
};

export type OptimizedRoute = {
  orderedStops: RouteStop[];
  legs: RouteLeg[];
  geometry: GeoJSON.LineString;
  distanceMeters: number;
  durationSeconds: number;
  scheduledDurationSeconds: number;
  departureTimeIso: string;
  arrivalAtLastStopIso: string;
  serviceSecondsPerStop: number;
  profile: RouteProfile;
  mode: "MAPBOX_OPTIMIZATION_V1" | "MAPBOX_CHUNKED_OPTIMIZATION_V1" | "MAPBOX_OPTIMIZATION_PLUS_DIRECTIONS_V1" | "MAPBOX_CHUNKED_OPTIMIZATION_PLUS_DIRECTIONS_V1" | "MAPBOX_FIXED_ORDER_DIRECTIONS_V1" | "MAPBOX_CHUNKED_FIXED_ORDER_DIRECTIONS_V1";
  requestCount: number;
};

export type LiveLegRoute = {
  geometry: GeoJSON.LineString;
  distanceMeters: number;
  durationSeconds: number;
  etaIso: string;
};

type RawLeg = {
  fromLabel: string;
  fromDeliveryWayId: string | null;
  toDeliveryWayId: string;
  distanceMeters: number;
  durationSeconds: number;
};

type RouteScheduleOptions = {
  departureTimeIso?: string;
  serviceSecondsPerStop?: number;
};

const DEFAULT_PROFILE: RouteProfile = "mapbox/driving-traffic";
const OPTIMIZATION_MAX_COORDINATES = 12;
const OPTIMIZATION_MAX_STOPS = OPTIMIZATION_MAX_COORDINATES - 1;
const DIRECTIONS_MAX_COORDINATES = 25;
const DIRECTIONS_MAX_STOPS = DIRECTIONS_MAX_COORDINATES - 1;
const DEFAULT_SERVICE_SECONDS = 300;

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegative(value: unknown, fallback = 0) {
  const number = finiteNumber(value);
  return number === null ? fallback : Math.max(0, number);
}

function validIso(value?: string) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function addSeconds(iso: string, seconds: number) {
  return new Date(Date.parse(iso) + Math.max(0, seconds) * 1000).toISOString();
}

export function coordinateFromRecord(row: Record<string, unknown>): RouteCoordinate | null {
  const metadata = (row.metadata || row.meta || row.payload || {}) as Record<string, any>;
  const routeMeta = metadata.mapbox_route_v45 || metadata.route_v45 || metadata.mapbox_route_v62 || {};
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
  const code = String(payload?.code || "");
  if (!response.ok || (code && code !== "Ok")) {
    throw new Error(payload.message || code || `Mapbox request failed with HTTP ${response.status}`);
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

function validateStops(stops: RouteStop[]) {
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
}

function selectOptimizationChunk(origin: RouteCoordinate, remaining: RouteStop[]) {
  if (remaining.length <= OPTIMIZATION_MAX_STOPS) return [...remaining];
  return [...remaining]
    .sort((a, b) => distanceMeters(origin, a) - distanceMeters(origin, b))
    .slice(0, OPTIMIZATION_MAX_STOPS);
}

function buildRawLegs(origin: RouteOrigin, orderedStops: RouteStop[], mapboxLegs: any[]): RawLeg[] {
  return orderedStops.map((stop, index) => {
    const source = index === 0 ? origin : orderedStops[index - 1];
    const leg = mapboxLegs?.[index] || {};
    return {
      fromLabel: index === 0 ? origin.name : source.deliveryWayId,
      fromDeliveryWayId: index === 0 ? null : source.deliveryWayId,
      toDeliveryWayId: stop.deliveryWayId,
      distanceMeters: nonNegative(leg.distance, distanceMeters(source, stop)),
      durationSeconds: nonNegative(leg.duration, 0),
    };
  });
}

function applySchedule(
  origin: RouteOrigin,
  orderedStops: RouteStop[],
  rawLegs: RawLeg[],
  geometry: GeoJSON.LineString,
  profile: RouteProfile,
  mode: OptimizedRoute["mode"],
  requestCount: number,
  options: RouteScheduleOptions = {},
): OptimizedRoute {
  const departureTimeIso = validIso(options.departureTimeIso);
  const serviceSecondsPerStop = Math.round(nonNegative(options.serviceSecondsPerStop, DEFAULT_SERVICE_SECONDS));
  let cumulativeDistance = 0;
  let cumulativeElapsed = 0;
  let travelDuration = 0;

  const legs: RouteLeg[] = rawLegs.map((leg, index) => {
    if (index > 0) cumulativeElapsed += serviceSecondsPerStop;
    cumulativeDistance += leg.distanceMeters;
    cumulativeElapsed += leg.durationSeconds;
    travelDuration += leg.durationSeconds;
    return {
      sequence: index + 1,
      fromLabel: leg.fromLabel,
      fromDeliveryWayId: leg.fromDeliveryWayId,
      toDeliveryWayId: leg.toDeliveryWayId,
      distanceMeters: Math.round(leg.distanceMeters),
      durationSeconds: Math.round(leg.durationSeconds),
      cumulativeDistanceMeters: Math.round(cumulativeDistance),
      cumulativeDurationSeconds: Math.round(cumulativeElapsed),
      etaIso: addSeconds(departureTimeIso, cumulativeElapsed),
    };
  });

  const legByStop = new Map(legs.map((leg) => [leg.toDeliveryWayId, leg]));
  const scheduledStops = orderedStops.map((stop) => {
    const leg = legByStop.get(stop.deliveryWayId);
    return {
      ...stop,
      legDistanceMeters: leg?.distanceMeters || 0,
      legDurationSeconds: leg?.durationSeconds || 0,
      cumulativeDistanceMeters: leg?.cumulativeDistanceMeters || 0,
      cumulativeDurationSeconds: leg?.cumulativeDurationSeconds || 0,
      etaIso: leg?.etaIso,
      fromLabel: leg?.fromLabel || origin.name,
    };
  });

  return {
    orderedStops: scheduledStops,
    legs,
    geometry,
    distanceMeters: Math.round(cumulativeDistance),
    durationSeconds: Math.round(travelDuration),
    scheduledDurationSeconds: Math.round(cumulativeElapsed),
    departureTimeIso,
    arrivalAtLastStopIso: addSeconds(departureTimeIso, cumulativeElapsed),
    serviceSecondsPerStop,
    profile,
    mode,
    requestCount,
  };
}

async function optimizeChunk(
  origin: RouteOrigin,
  stops: RouteStop[],
  token: string,
  profile: RouteProfile,
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
    annotations: "distance,duration",
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
  const cleanedStops = orderedStops.map(({ kind: _kind, ...stop }) => stop);
  return {
    orderedStops: cleanedStops,
    rawLegs: buildRawLegs(origin, cleanedStops, trip.legs || []),
    geometry: trip.geometry as GeoJSON.LineString,
    distanceMeters: Number(trip.distance || 0),
    durationSeconds: Number(trip.duration || 0),
  };
}

export async function optimizeRouteFromHeadOffice(
  origin: RouteOrigin,
  stops: RouteStop[],
  token: string,
  profile: RouteProfile = DEFAULT_PROFILE,
  onProgress?: (completedRequests: number, totalRequests: number) => void,
  options: RouteScheduleOptions = {},
): Promise<OptimizedRoute> {
  ensureToken(token);
  validateStops(stops);

  let current: RouteOrigin = origin;
  let remaining = [...stops];
  const orderedStops: RouteStop[] = [];
  const rawLegs: RawLeg[] = [];
  const geometryCoordinates: number[][] = [];
  let requestCount = 0;
  const totalRequests = Math.ceil(stops.length / OPTIMIZATION_MAX_STOPS);

  while (remaining.length) {
    const chunk = selectOptimizationChunk(current, remaining);
    const result = await optimizeChunk(current, chunk, token, profile);
    requestCount += 1;
    onProgress?.(requestCount, totalRequests);
    orderedStops.push(...result.orderedStops);
    rawLegs.push(...result.rawLegs);
    const line = result.geometry.coordinates as number[][];
    geometryCoordinates.push(...(geometryCoordinates.length ? line.slice(1) : line));
    const completed = new Set(result.orderedStops.map((stop) => stop.deliveryWayId));
    remaining = remaining.filter((stop) => !completed.has(stop.deliveryWayId));
    const last = result.orderedStops[result.orderedStops.length - 1];
    if (last) {
      current = {
        code: last.deliveryWayId,
        name: last.deliveryWayId,
        address: last.address,
        longitude: last.longitude,
        latitude: last.latitude,
      };
    }
  }

  // Optimization V1 decides stop order. Directions V5 then recalculates the saved
  // order so every leg, departure-time traffic duration, ETA and map geometry use
  // one consistent route contract. This also avoids displaying straight-line or
  // optimization-only timings after the dispatcher manually changes a stop.
  const fixedOrder = await calculateRouteInFixedOrder(
    origin,
    orderedStops,
    token,
    profile,
    undefined,
    options,
  );
  return {
    ...fixedOrder,
    mode: requestCount > 1
      ? "MAPBOX_CHUNKED_OPTIMIZATION_PLUS_DIRECTIONS_V1"
      : "MAPBOX_OPTIMIZATION_PLUS_DIRECTIONS_V1",
    requestCount: requestCount + fixedOrder.requestCount,
  };
}

async function directionsChunk(
  origin: RouteOrigin,
  stops: RouteStop[],
  token: string,
  profile: RouteProfile,
  departAtIso: string,
) {
  const input = [origin, ...stops];
  const coordinates = input.map(encodeCoordinate).join(";");
  const parameters = new URLSearchParams({
    geometries: "geojson",
    overview: "full",
    steps: "false",
    annotations: "distance,duration",
    language: "en",
    access_token: ensureToken(token),
  });
  if (profile === "mapbox/driving-traffic") parameters.set("depart_at", departAtIso);
  const payload = await fetchJson(`https://api.mapbox.com/directions/v5/${profile}/${coordinates}?${parameters.toString()}`);
  const route = payload.routes?.[0];
  if (!route?.geometry?.coordinates?.length) throw new Error("Mapbox returned no fixed-order route geometry.");
  return {
    geometry: route.geometry as GeoJSON.LineString,
    rawLegs: buildRawLegs(origin, stops, route.legs || []),
    distanceMeters: Number(route.distance || 0),
    durationSeconds: Number(route.duration || 0),
  };
}

export async function calculateRouteInFixedOrder(
  origin: RouteOrigin,
  stops: RouteStop[],
  token: string,
  profile: RouteProfile = DEFAULT_PROFILE,
  onProgress?: (completedRequests: number, totalRequests: number) => void,
  options: RouteScheduleOptions = {},
): Promise<OptimizedRoute> {
  ensureToken(token);
  validateStops(stops);

  const departureTimeIso = validIso(options.departureTimeIso);
  const serviceSeconds = Math.round(nonNegative(options.serviceSecondsPerStop, DEFAULT_SERVICE_SECONDS));
  const geometryCoordinates: number[][] = [];
  const rawLegs: RawLeg[] = [];
  let current = origin;
  let remaining = [...stops];
  let requestCount = 0;
  let elapsedBeforeChunk = 0;
  let processedStops = 0;
  const totalRequests = Math.ceil(stops.length / DIRECTIONS_MAX_STOPS);

  while (remaining.length) {
    const chunk = remaining.slice(0, DIRECTIONS_MAX_STOPS);
    const chunkDepartAt = addSeconds(departureTimeIso, elapsedBeforeChunk + Math.max(0, processedStops) * serviceSeconds);
    const result = await directionsChunk(current, chunk, token, profile, chunkDepartAt);
    requestCount += 1;
    onProgress?.(requestCount, totalRequests);
    rawLegs.push(...result.rawLegs);
    const line = result.geometry.coordinates as number[][];
    geometryCoordinates.push(...(geometryCoordinates.length ? line.slice(1) : line));
    elapsedBeforeChunk += result.durationSeconds;
    processedStops += chunk.length;
    const last = chunk[chunk.length - 1];
    current = {
      code: last.deliveryWayId,
      name: last.deliveryWayId,
      address: last.address,
      longitude: last.longitude,
      latitude: last.latitude,
    };
    remaining = remaining.slice(chunk.length);
  }

  return applySchedule(
    origin,
    stops,
    rawLegs,
    { type: "LineString", coordinates: geometryCoordinates },
    profile,
    requestCount > 1 ? "MAPBOX_CHUNKED_FIXED_ORDER_DIRECTIONS_V1" : "MAPBOX_FIXED_ORDER_DIRECTIONS_V1",
    requestCount,
    { departureTimeIso, serviceSecondsPerStop: serviceSeconds },
  );
}

export async function calculateLiveLeg(
  from: RouteCoordinate,
  to: RouteCoordinate,
  token: string,
  profile: RouteProfile = DEFAULT_PROFILE,
  departureTimeIso = new Date().toISOString(),
): Promise<LiveLegRoute> {
  const origin: RouteOrigin = { code: "LIVE_RIDER", name: "Live rider location", ...from };
  const stop: RouteStop = { deliveryWayId: "NEXT_STOP", ...to };
  const result = await directionsChunk(origin, [stop], token, profile, validIso(departureTimeIso));
  const leg = result.rawLegs[0];
  return {
    geometry: result.geometry,
    distanceMeters: Math.round(leg?.distanceMeters || result.distanceMeters || 0),
    durationSeconds: Math.round(leg?.durationSeconds || result.durationSeconds || 0),
    etaIso: addSeconds(validIso(departureTimeIso), leg?.durationSeconds || result.durationSeconds || 0),
  };
}

export function routeSavePayload(origin: RouteOrigin, route: OptimizedRoute) {
  return {
    version: 45,
    enhancement_version: 62,
    calculation_version: "WAYPLAN_ROUTE_OPTIMIZATION_AND_ETA_V62_2026_08_02",
    origin,
    profile: route.profile,
    route_mode: route.mode,
    geometry: route.geometry,
    distance_m: Math.round(route.distanceMeters),
    duration_s: Math.round(route.durationSeconds),
    scheduled_duration_s: Math.round(route.scheduledDurationSeconds),
    departure_time: route.departureTimeIso,
    arrival_at_last_stop: route.arrivalAtLastStopIso,
    service_seconds_per_stop: route.serviceSecondsPerStop,
    request_count: route.requestCount,
    legs: route.legs.map((leg) => ({
      sequence: leg.sequence,
      from_label: leg.fromLabel,
      from_delivery_way_id: leg.fromDeliveryWayId,
      to_delivery_way_id: leg.toDeliveryWayId,
      distance_m: leg.distanceMeters,
      duration_s: leg.durationSeconds,
      cumulative_distance_m: leg.cumulativeDistanceMeters,
      cumulative_duration_s: leg.cumulativeDurationSeconds,
      eta_at: leg.etaIso,
    })),
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
      from_label: stop.fromLabel || null,
      leg_distance_m: Math.round(stop.legDistanceMeters || 0),
      leg_duration_s: Math.round(stop.legDurationSeconds || 0),
      cumulative_distance_m: Math.round(stop.cumulativeDistanceMeters || 0),
      cumulative_duration_s: Math.round(stop.cumulativeDurationSeconds || 0),
      eta_at: stop.etaIso || null,
    })),
  };
}
