const GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

function env(...names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
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
  const parsed = Number(String(value || "0s").replace(/s$/, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function waypoint(p) {
  return { location: { latLng: { latitude: p.latitude, longitude: p.longitude } } };
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

async function routeLeg(origin, destination, apiKey) {
  const response = await fetch(GOOGLE_ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
    },
    body: JSON.stringify({
      origin: waypoint(origin),
      destination: waypoint(destination),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      polylineQuality: "HIGH_QUALITY",
      polylineEncoding: "ENCODED_POLYLINE",
      units: "METRIC",
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Google Routes leg failed (${response.status}): ${String(body?.error?.message || "unknown error").slice(0, 220)}`);
  const route = body?.routes?.[0];
  if (!route?.polyline?.encodedPolyline) throw new Error("Google Routes returned no road polyline for one route leg.");
  return {
    encoded_polyline: route.polyline.encodedPolyline,
    distance_m: Number(route.distanceMeters || 0),
    duration_s: seconds(route.duration),
  };
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export default {
  async fetch(request) {
    try {
      if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
      if (!(await verifySupabaseUser(request))) return json({ ok: false, error: "authenticated_wayplan_session_required" }, 401);

      const apiKey = env("GOOGLE_ROUTES_API_KEY", "GOOGLE_MAPS_API_KEY", "VITE_GOOGLE_MAPS_API_KEY");
      if (!apiKey) return json({ ok: false, error: "Google Routes API key is not configured in the Vercel runtime." }, 503);

      const payload = await request.json().catch(() => ({}));
      const origin = point(payload?.origin);
      const stops = normalizeStops(payload?.stops);
      const points = [origin, ...stops];
      const legs = points.slice(0, -1).map((from, index) => ({ from, to: points[index + 1], sequence: index + 1 }));

      const segments = await mapLimit(legs, 6, async (leg) => ({
        sequence: leg.sequence,
        ...(await routeLeg(leg.from, leg.to, apiKey)),
      }));

      return json({
        ok: true,
        source: "GOOGLE_ROUTES",
        route_mode: "GOOGLE_COMPLETE_PER_VAN_ROUTE_VIEW",
        stop_count: stops.length,
        distance_m: Math.round(segments.reduce((sum, item) => sum + Number(item.distance_m || 0), 0)),
        duration_s: Math.round(segments.reduce((sum, item) => sum + Number(item.duration_s || 0), 0)),
        segments,
        generated_at: new Date().toISOString(),
      });
    } catch (error) {
      return json({ ok: false, error: String(error?.message || error) }, 400);
    }
  },
};
