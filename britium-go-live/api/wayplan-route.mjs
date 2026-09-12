const GOOGLE_MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const MAPBOX_MATRIX_BASE = "https://api.mapbox.com/directions-matrix/v1/mapbox/driving";
const MATRIX_BATCH = 25;

function env(...names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function point(value) {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error("Every route point requires valid latitude and longitude.");
  }
  return { latitude, longitude };
}

function normalizeStops(stops) {
  if (!Array.isArray(stops) || !stops.length) throw new Error("At least one delivery stop is required.");
  if (stops.length > 75) throw new Error("A delivery van is limited to 75 route stops.");
  const seen = new Set();
  return stops.map((stop, index) => {
    const id = String(stop?.delivery_way_id || stop?.id || "").trim();
    if (!id) throw new Error(`Stop ${index + 1} has no delivery_way_id.`);
    if (seen.has(id)) throw new Error(`Duplicate delivery stop: ${id}`);
    seen.add(id);
    return { ...stop, delivery_way_id: id, ...point(stop) };
  });
}

function seconds(value) {
  const text = String(value || "0s").replace(/s$/, "");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function haversineMeters(a, b) {
  const rad = (n) => (n * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const lat1 = rad(a.latitude);
  const lat2 = rad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function pathCost(order, durations, distances) {
  let duration = 0;
  let distance = 0;
  for (let i = 1; i < order.length; i += 1) {
    const from = order[i - 1];
    const to = order[i];
    const d = Number(durations[from]?.[to]);
    const m = Number(distances[from]?.[to]);
    if (!Number.isFinite(d) || !Number.isFinite(m)) return { duration: Number.POSITIVE_INFINITY, distance: Number.POSITIVE_INFINITY };
    duration += d;
    distance += m;
  }
  return { duration, distance };
}

function optimizeMatrix(durations, distances) {
  const count = durations.length;
  const remaining = new Set(Array.from({ length: count - 1 }, (_, i) => i + 1));
  const order = [0];
  while (remaining.size) {
    const current = order[order.length - 1];
    let best = null;
    for (const candidate of remaining) {
      const duration = Number(durations[current]?.[candidate]);
      const distance = Number(distances[current]?.[candidate]);
      if (!Number.isFinite(duration) || !Number.isFinite(distance)) continue;
      if (!best || duration < best.duration || (duration === best.duration && distance < best.distance) || (duration === best.duration && distance === best.distance && candidate < best.index)) {
        best = { index: candidate, duration, distance };
      }
    }
    if (!best) throw new Error("Road matrix contains an unreachable remaining stop.");
    order.push(best.index);
    remaining.delete(best.index);
  }

  let bestOrder = order;
  let bestCost = pathCost(bestOrder, durations, distances);
  // Local 2-opt pass. The route is open-ended, so Head Office stays fixed and the final stop may move.
  for (let pass = 0; pass < 3; pass += 1) {
    let improved = false;
    for (let i = 1; i < bestOrder.length - 1; i += 1) {
      for (let k = i + 1; k < bestOrder.length; k += 1) {
        const candidate = bestOrder.slice(0, i).concat(bestOrder.slice(i, k + 1).reverse(), bestOrder.slice(k + 1));
        const cost = pathCost(candidate, durations, distances);
        if (cost.duration + 0.001 < bestCost.duration || (Math.abs(cost.duration - bestCost.duration) < 0.001 && cost.distance < bestCost.distance)) {
          bestOrder = candidate;
          bestCost = cost;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return { order: bestOrder, ...bestCost };
}

function parseGoogleMatrix(text) {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line));
  }
}

function googleWaypoint(p) {
  return { waypoint: { location: { latLng: { latitude: p.latitude, longitude: p.longitude } } } };
}

async function googleMatrix(points, apiKey) {
  const n = points.length;
  const durations = Array.from({ length: n }, () => Array(n).fill(Number.POSITIVE_INFINITY));
  const distances = Array.from({ length: n }, () => Array(n).fill(Number.POSITIVE_INFINITY));
  for (let i = 0; i < n; i += 1) {
    durations[i][i] = 0;
    distances[i][i] = 0;
  }
  let requestCount = 0;

  for (let oi = 0; oi < n; oi += MATRIX_BATCH) {
    const origins = points.slice(oi, oi + MATRIX_BATCH);
    for (let di = 0; di < n; di += MATRIX_BATCH) {
      const destinations = points.slice(di, di + MATRIX_BATCH);
      requestCount += 1;
      const response = await fetch(GOOGLE_MATRIX_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "originIndex,destinationIndex,status,condition,distanceMeters,duration",
        },
        body: JSON.stringify({
          origins: origins.map(googleWaypoint),
          destinations: destinations.map(googleWaypoint),
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
          units: "METRIC",
        }),
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`Google Routes matrix failed (${response.status}): ${body.slice(0, 220)}`);
      for (const element of parseGoogleMatrix(body)) {
        const originIndex = oi + Number(element.originIndex);
        const destinationIndex = di + Number(element.destinationIndex);
        if (!Number.isInteger(originIndex) || !Number.isInteger(destinationIndex)) continue;
        const statusCode = Number(element?.status?.code || 0);
        if (statusCode !== 0 || String(element?.condition || "ROUTE_EXISTS") === "ROUTE_NOT_FOUND") continue;
        const duration = seconds(element.duration);
        const distance = Number(element.distanceMeters);
        if (Number.isFinite(duration) && Number.isFinite(distance)) {
          durations[originIndex][destinationIndex] = duration;
          distances[originIndex][destinationIndex] = distance;
        }
      }
    }
  }
  return { durations, distances, requestCount };
}

async function mapboxMatrix(points, token) {
  if (points.length > 25) throw new Error("Mapbox fallback is limited to 24 delivery stops plus origin.");
  const coordinates = points.map((p) => `${p.longitude},${p.latitude}`).join(";");
  const response = await fetch(`${MAPBOX_MATRIX_BASE}/${coordinates}?annotations=duration,distance&access_token=${encodeURIComponent(token)}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.code !== "Ok") throw new Error(`Mapbox matrix failed (${response.status}): ${String(body?.message || body?.code || "unknown error")}`);
  return { durations: body.durations, distances: body.distances, requestCount: 1 };
}

function geographicFallback(origin, stops) {
  const remaining = [...stops];
  const ordered = [];
  let cursor = origin;
  let distance = 0;
  while (remaining.length) {
    remaining.sort((a, b) => haversineMeters(cursor, a) - haversineMeters(cursor, b) || a.delivery_way_id.localeCompare(b.delivery_way_id));
    const next = remaining.shift();
    distance += haversineMeters(cursor, next);
    ordered.push(next);
    cursor = next;
  }
  return {
    ok: true,
    source: "GEOGRAPHIC_FALLBACK",
    route_mode: "GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY",
    ordered_stops: ordered,
    distance_m: Math.round(distance),
    duration_s: 0,
    request_count: 0,
    fallback: true,
    warning: "Emergency geographic nearest-neighbour fallback; this is not Google road optimization.",
  };
}

async function verifySupabaseUser(request) {
  const authorization = String(request.headers.get("authorization") || "");
  if (!/^Bearer\s+\S+/i.test(authorization)) return false;
  const url = env("SUPABASE_URL", "VITE_SUPABASE_URL").replace(/\/+$/, "");
  const key = env("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
  if (!url || !key) return false;
  try {
    const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: authorization } });
    return response.ok;
  } catch {
    return false;
  }
}

async function googleHealthProbe(apiKey) {
  const points = [
    { latitude: 16.8409, longitude: 96.1735 },
    { latitude: 16.8512, longitude: 96.1811 },
  ];
  const matrix = await googleMatrix(points, apiKey);
  const result = optimizeMatrix(matrix.durations, matrix.distances);
  return Number.isFinite(result.distance) && result.distance > 0;
}

export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const googleKey = env("GOOGLE_ROUTES_API_KEY", "GOOGLE_MAPS_API_KEY", "VITE_GOOGLE_MAPS_API_KEY");
      const mapboxToken = env("MAPBOX_ACCESS_TOKEN", "VITE_MAPBOX_ACCESS_TOKEN", "VITE_MAPBOX_TOKEN");

      if (request.method === "GET" && url.searchParams.get("health") === "1") {
        const probe = url.searchParams.get("probe") === "1";
        let googleRoutesVerified = false;
        let probeError = "";
        if (probe && googleKey) {
          try { googleRoutesVerified = await googleHealthProbe(googleKey); }
          catch (error) { probeError = String(error?.message || error).slice(0, 240); }
        }
        return json({
          ok: Boolean(googleKey),
          google_routes_configured: Boolean(googleKey),
          google_routes_verified: probe ? googleRoutesVerified : null,
          mapbox_fallback_configured: Boolean(mapboxToken),
          probe_error: probeError || null,
        }, googleKey && (!probe || googleRoutesVerified) ? 200 : 503, { "Cache-Control": probe ? "public, s-maxage=3600, stale-while-revalidate=300" : "no-store" });
      }

      if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, { Allow: "POST, GET" });
      if (!(await verifySupabaseUser(request))) return json({ ok: false, error: "authenticated_wayplan_session_required" }, 401);

      const payload = await request.json().catch(() => ({}));
      const origin = point(payload?.origin);
      const stops = normalizeStops(payload?.stops);
      const points = [origin, ...stops];
      const diagnostics = [];

      if (googleKey) {
        try {
          const matrix = await googleMatrix(points, googleKey);
          const optimized = optimizeMatrix(matrix.durations, matrix.distances);
          return json({
            ok: true,
            source: "GOOGLE_ROUTES",
            route_mode: points.length > MATRIX_BATCH ? "GOOGLE_ROUTE_MATRIX_BATCHED_LOCAL_2OPT" : "GOOGLE_ROUTE_MATRIX_LOCAL_2OPT",
            ordered_stops: optimized.order.slice(1).map((index, sequence) => ({ ...stops[index - 1], sequence: sequence + 1 })),
            distance_m: Math.round(optimized.distance),
            duration_s: Math.round(optimized.duration),
            request_count: matrix.requestCount,
            fallback: false,
            optimized_at: new Date().toISOString(),
          });
        } catch (error) {
          diagnostics.push(`Google Routes: ${String(error?.message || error).slice(0, 260)}`);
        }
      } else {
        diagnostics.push("Google Routes: API key is not configured in the Vercel runtime.");
      }

      if (mapboxToken && points.length <= 25) {
        try {
          const matrix = await mapboxMatrix(points, mapboxToken);
          const optimized = optimizeMatrix(matrix.durations, matrix.distances);
          return json({
            ok: true,
            source: "MAPBOX_FALLBACK",
            route_mode: "MAPBOX_MATRIX_LOCAL_2OPT",
            ordered_stops: optimized.order.slice(1).map((index, sequence) => ({ ...stops[index - 1], sequence: sequence + 1 })),
            distance_m: Math.round(optimized.distance),
            duration_s: Math.round(optimized.duration),
            request_count: matrix.requestCount,
            fallback: true,
            warning: "Google Routes was unavailable; Mapbox fallback was used and is explicitly labelled.",
            diagnostics,
            optimized_at: new Date().toISOString(),
          });
        } catch (error) {
          diagnostics.push(`Mapbox: ${String(error?.message || error).slice(0, 260)}`);
        }
      }

      return json({ ...geographicFallback(origin, stops), diagnostics, optimized_at: new Date().toISOString() });
    } catch (error) {
      return json({ ok: false, error: String(error?.message || error) }, 400);
    }
  },
};
