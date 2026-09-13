const GOOGLE_MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const MAPBOX_MATRIX_BASE = "https://api.mapbox.com/directions-matrix/v1/mapbox/driving";
const GOOGLE_BATCH = 10;
const MAPBOX_BATCH = 12;
const MAX_STOPS = 500;
const MIN_PER_VAN = 50;
const MAX_PER_VAN = 75;

function env(...names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}
function json(body, status = 200) { return Response.json(body, { status, headers: { "Cache-Control": "no-store" } }); }
function point(value) {
  const latitude = Number(value?.latitude), longitude = Number(value?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error("Every planning point requires valid latitude and longitude.");
  return { latitude, longitude };
}
function normalizeTownship(value) { return String(value || "").trim().replace(/\s+/g, " "); }
function normalizeStops(stops) {
  if (!Array.isArray(stops) || !stops.length) throw new Error("At least one delivery stop is required.");
  if (stops.length > MAX_STOPS) throw new Error(`Strategic planning is limited to ${MAX_STOPS} ready parcels per request.`);
  const seen = new Set();
  return stops.map((stop, index) => {
    const id = String(stop?.delivery_way_id || stop?.id || "").trim();
    const township = normalizeTownship(stop?.township || stop?.delivery_township);
    if (!id) throw new Error(`Stop ${index + 1} has no delivery_way_id.`);
    if (!township) throw new Error(`Stop ${id} has no township.`);
    if (seen.has(id)) throw new Error(`Duplicate delivery stop: ${id}`);
    seen.add(id);
    return { ...stop, delivery_way_id: id, township, ...point(stop) };
  });
}
function seconds(value) { const n = Number(String(value || "0s").replace(/s$/, "")); return Number.isFinite(n) ? n : 0; }
function parseGoogleMatrix(text) {
  try { const parsed = JSON.parse(text); return Array.isArray(parsed) ? parsed : [parsed]; }
  catch { return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line)); }
}
function googleWaypoint(p) { return { waypoint: { location: { latLng: { latitude: p.latitude, longitude: p.longitude } } } }; }
async function googleMatrix(points, apiKey) {
  const n = points.length;
  const durations = Array.from({ length: n }, () => Array(n).fill(Number.POSITIVE_INFINITY));
  const distances = Array.from({ length: n }, () => Array(n).fill(Number.POSITIVE_INFINITY));
  for (let i = 0; i < n; i += 1) { durations[i][i] = 0; distances[i][i] = 0; }
  let requestCount = 0;
  for (let oi = 0; oi < n; oi += GOOGLE_BATCH) {
    const origins = points.slice(oi, oi + GOOGLE_BATCH);
    for (let di = 0; di < n; di += GOOGLE_BATCH) {
      const destinations = points.slice(di, di + GOOGLE_BATCH);
      requestCount += 1;
      const response = await fetch(GOOGLE_MATRIX_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "originIndex,destinationIndex,status,condition,distanceMeters,duration" },
        body: JSON.stringify({ origins: origins.map(googleWaypoint), destinations: destinations.map(googleWaypoint), travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE", units: "METRIC" }),
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`Google Routes matrix failed (${response.status}): ${body.slice(0, 220)}`);
      for (const element of parseGoogleMatrix(body)) {
        const i = oi + Number(element.originIndex), j = di + Number(element.destinationIndex);
        if (!Number.isInteger(i) || !Number.isInteger(j)) continue;
        if (Number(element?.status?.code || 0) !== 0 || String(element?.condition || "ROUTE_EXISTS") === "ROUTE_NOT_FOUND") continue;
        const duration = seconds(element.duration), distance = Number(element.distanceMeters);
        if (Number.isFinite(duration) && Number.isFinite(distance)) { durations[i][j] = duration; distances[i][j] = distance; }
      }
    }
  }
  return { durations, distances, requestCount };
}
async function mapboxMatrix(points, token) {
  const n = points.length;
  const durations = Array.from({ length: n }, () => Array(n).fill(Number.POSITIVE_INFINITY));
  const distances = Array.from({ length: n }, () => Array(n).fill(Number.POSITIVE_INFINITY));
  for (let i = 0; i < n; i += 1) { durations[i][i] = 0; distances[i][i] = 0; }
  let requestCount = 0;
  for (let oi = 0; oi < n; oi += MAPBOX_BATCH) {
    const origins = points.slice(oi, oi + MAPBOX_BATCH);
    for (let di = 0; di < n; di += MAPBOX_BATCH) {
      const destinations = points.slice(di, di + MAPBOX_BATCH);
      const combined = [...origins, ...destinations];
      const sourceIndexes = origins.map((_, i) => i).join(";");
      const destinationIndexes = destinations.map((_, i) => origins.length + i).join(";");
      const coordinates = combined.map((p) => `${p.longitude},${p.latitude}`).join(";");
      requestCount += 1;
      const response = await fetch(`${MAPBOX_MATRIX_BASE}/${coordinates}?sources=${sourceIndexes}&destinations=${destinationIndexes}&annotations=duration,distance&access_token=${encodeURIComponent(token)}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.code !== "Ok") throw new Error(`Mapbox road matrix failed (${response.status}): ${String(body?.message || body?.code || "unknown error")}`);
      for (let i = 0; i < origins.length; i += 1) for (let j = 0; j < destinations.length; j += 1) {
        const duration = Number(body?.durations?.[i]?.[j]), distance = Number(body?.distances?.[i]?.[j]);
        if (Number.isFinite(duration) && Number.isFinite(distance)) { durations[oi + i][di + j] = duration; distances[oi + i][di + j] = distance; }
      }
    }
  }
  return { durations, distances, requestCount };
}
async function verifySupabaseUser(request) {
  const authorization = String(request.headers.get("authorization") || "");
  if (!/^Bearer\s+\S+/i.test(authorization)) return false;
  const url = env("SUPABASE_URL", "VITE_SUPABASE_URL").replace(/\/+$/, ""), key = env("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
  if (!url || !key) return false;
  try { const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: authorization } }); return response.ok; }
  catch { return false; }
}
function targetSizes(total, count) {
  if (!Number.isInteger(count) || count < 1 || count > 7) throw new Error("Choose one to seven delivery vans.");
  if (total > count * MAX_PER_VAN) throw new Error(`Use more vans: maximum is ${MAX_PER_VAN} parcels per delivery van.`);
  if (count > 1 && total < (count - 1) * MIN_PER_VAN + 1) throw new Error("This van count would create more than one van below 50 parcels.");
  const sizes = Array.from({ length: count }, () => Math.floor(total / count));
  for (let i = 0; i < total % count; i += 1) sizes[i] += 1;
  for (let i = 0; i < count - 1; i += 1) if (sizes[i] < MIN_PER_VAN) { const n = MIN_PER_VAN - sizes[i]; sizes[i] += n; sizes[count - 1] -= n; }
  if (sizes.some((size) => size > MAX_PER_VAN || size < 1)) throw new Error("Could not create a practical 50-75 parcel van allocation.");
  return sizes;
}
function centroid(rows) { return { latitude: rows.reduce((s, r) => s + Number(r.latitude), 0) / rows.length, longitude: rows.reduce((s, r) => s + Number(r.longitude), 0) / rows.length }; }
function symmetricRoadTime(matrix, a, b) {
  const ab = Number(matrix[a]?.[b]), ba = Number(matrix[b]?.[a]);
  if (Number.isFinite(ab) && Number.isFinite(ba)) return (ab + ba) / 2;
  if (Number.isFinite(ab)) return ab; if (Number.isFinite(ba)) return ba; return Number.POSITIVE_INFINITY;
}
function chooseSeeds(groupCount, count, durations) {
  const seeds = [];
  if (!groupCount) return seeds;
  let first = 1, farthest = -1;
  for (let i = 1; i <= groupCount; i += 1) { const value = Number(durations[0]?.[i]); if (Number.isFinite(value) && value > farthest) { farthest = value; first = i; } }
  seeds.push(first);
  while (seeds.length < Math.min(count, groupCount)) {
    let candidate = null, best = -1;
    for (let i = 1; i <= groupCount; i += 1) {
      if (seeds.includes(i)) continue;
      const nearest = Math.min(...seeds.map((seed) => symmetricRoadTime(durations, i, seed)));
      if (Number.isFinite(nearest) && nearest > best) { best = nearest; candidate = i; }
    }
    if (candidate == null) break;
    seeds.push(candidate);
  }
  while (seeds.length < count) seeds.push(seeds[seeds.length % Math.max(1, seeds.length)] || 1);
  return seeds;
}
function strategicAssign(groups, durations, vanCount, sizes) {
  const seeds = chooseSeeds(groups.length, vanCount, durations);
  const vans = sizes.map((target, index) => ({ target, remaining: target, seedNode: seeds[index], stops: [], townshipCounts: new Map() }));
  const rankedGroups = groups.map((group, groupIndex) => {
    const node = groupIndex + 1;
    const preferences = vans.map((van, vanIndex) => ({ vanIndex, time: symmetricRoadTime(durations, node, van.seedNode) })).sort((a, b) => a.time - b.time || a.vanIndex - b.vanIndex);
    const gap = preferences.length > 1 ? preferences[1].time - preferences[0].time : Number.POSITIVE_INFINITY;
    return { group, preferences, gap };
  }).sort((a, b) => b.gap - a.gap || b.group.rows.length - a.group.rows.length);
  for (const item of rankedGroups) {
    let cursor = 0; const rows = [...item.group.rows];
    while (cursor < rows.length) {
      const candidates = item.preferences.filter((choice) => vans[choice.vanIndex].remaining > 0);
      if (!candidates.length) throw new Error("Road cluster capacity exhausted before every parcel was assigned.");
      const van = vans[candidates[0].vanIndex], take = Math.min(van.remaining, rows.length - cursor), chunk = rows.slice(cursor, cursor + take);
      van.stops.push(...chunk); van.remaining -= take; van.townshipCounts.set(item.group.name, (van.townshipCounts.get(item.group.name) || 0) + take); cursor += take;
    }
  }
  if (vans.some((van) => van.remaining !== 0)) throw new Error("Road clustering did not fill the requested van capacities.");
  return vans.map((van, index) => ({ van_index: index + 1, target_parcels: van.target, delivery_way_ids: van.stops.map((stop) => stop.delivery_way_id), townships: [...van.townshipCounts.entries()].map(([township, parcel_count]) => ({ township, parcel_count })), seed_township: groups[Math.max(0, Number(van.seedNode) - 1)]?.name || null }));
}
export default {
  async fetch(request) {
    try {
      if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
      if (!(await verifySupabaseUser(request))) return json({ ok: false, error: "authenticated_wayplan_session_required" }, 401);
      const payload = await request.json().catch(() => ({})), origin = point(payload?.origin), stops = normalizeStops(payload?.stops);
      const vanCount = Number(payload?.van_count || Math.ceil(stops.length / MAX_PER_VAN)), sizes = targetSizes(stops.length, vanCount);
      const byTownship = new Map();
      for (const stop of stops) { const group = byTownship.get(stop.township) || []; group.push(stop); byTownship.set(stop.township, group); }
      const groups = [...byTownship.entries()].map(([name, rows]) => ({ name, rows, ...centroid(rows) }));
      const points = [origin, ...groups.map((group) => ({ latitude: group.latitude, longitude: group.longitude }))];
      const googleKey = env("GOOGLE_ROUTES_API_KEY", "GOOGLE_MAPS_API_KEY", "VITE_GOOGLE_MAPS_API_KEY"), mapboxToken = env("MAPBOX_ACCESS_TOKEN", "VITE_MAPBOX_ACCESS_TOKEN", "VITE_MAPBOX_TOKEN");
      const diagnostics = []; let matrix = null, source = "";
      if (googleKey) try { matrix = await googleMatrix(points, googleKey); source = "GOOGLE_ROUTES"; } catch (error) { diagnostics.push(`Google Routes: ${String(error?.message || error).slice(0, 300)}`); }
      if (!matrix && mapboxToken) try { matrix = await mapboxMatrix(points, mapboxToken); source = "MAPBOX_FALLBACK"; } catch (error) { diagnostics.push(`Mapbox: ${String(error?.message || error).slice(0, 300)}`); }
      if (!matrix) return json({ ok: false, error: "road_matrix_unavailable", diagnostics }, 503);
      const vans = strategicAssign(groups, matrix.durations, vanCount, sizes);
      return json({ ok: true, source, route_mode: `${source}_TOWNSHIP_ROAD_TIME_CLUSTERING`, parcel_count: stops.length, township_count: groups.length, van_count: vanCount, van_sizes: sizes, vans, request_count: matrix.requestCount, diagnostics, generated_at: new Date().toISOString() });
    } catch (error) { return json({ ok: false, error: String(error?.message || error) }, 400); }
  },
};
