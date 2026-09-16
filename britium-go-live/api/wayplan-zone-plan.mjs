const MAX_STOPS = 500;
const FLOOR = 45;
const SPRAWL_CEILING = 70;
const COMPACT_CEILING = 95;

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
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error("Every planning point requires valid latitude and longitude.");
  }
  return { latitude, longitude };
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
  } catch { return false; }
}

const ALIASES = new Map(Object.entries({
  "eastdagon":"East Dagon","dagonmyothiteast":"East Dagon","အရှေ့ဒဂုံ":"East Dagon","ဒဂုံမြို့သစ်အရှေ့ပိုင်း":"East Dagon",
  "northdagon":"North Dagon","dagonmyothitnorth":"North Dagon","မြောက်ဒဂုံ":"North Dagon","ဒဂုံမြို့သစ်မြောက်ပိုင်း":"North Dagon",
  "southdagon":"South Dagon","dagonmyothitsouth":"South Dagon","တောင်ဒဂုံ":"South Dagon","ဒဂုံမြို့သစ်တောင်ပိုင်း":"South Dagon",
  "dagonseikkan":"Dagon Seikkan","dagonmyothitseikkan":"Dagon Seikkan","ဒဂုံဆိပ်ကမ်း":"Dagon Seikkan","ဒဂုံမြို့သစ်ဆိပ်ကမ်း":"Dagon Seikkan",
  "thingangyun":"Thingangyun","သင်္ဃန်းကျွန်း":"Thingangyun",
  "southokkalapa":"South Okkalapa","တောင်ဥက္ကလာပ":"South Okkalapa",
  "northokkalapa":"North Okkalapa","မြောက်ဥက္ကလာပ":"North Okkalapa",
  "yankin":"Yankin","ရန်ကင်း":"Yankin",
  "tamwe":"Tamwe","tarmwe":"Tamwe","တာမွေ":"Tamwe",
  "bahan":"Bahan","ဗဟန်း":"Bahan",
  "thaketa":"Thaketa","သာကေတ":"Thaketa",
  "dawbon":"Dawbon","ဒေါပုံ":"Dawbon",
  "kyauktada":"Kyauktada","ကျောက်တံတား":"Kyauktada",
  "pabedan":"Pabedan","ပန်းဘဲတန်း":"Pabedan",
  "latha":"Latha","လသာ":"Latha",
  "lanmadaw":"Lanmadaw","လမ်းမတော်":"Lanmadaw",
  "botahtaung":"Botahtaung","botataung":"Botahtaung","ဗိုလ်တထောင်":"Botahtaung",
  "pazundaung":"Pazundaung","ပုဇွန်တောင်":"Pazundaung",
  "dagon":"Dagon","ဒဂုံ":"Dagon",
  "sanchaung":"Sanchaung","စမ်းချောင်း":"Sanchaung",
  "ahlone":"Ahlone","alohn":"Ahlone","အလုံ":"Ahlone",
  "kyimyindaing":"Kyimyindaing","kyeemyindaing":"Kyimyindaing","kyimyindine":"Kyimyindaing","kyeemyindine":"Kyimyindaing","ကြည့်မြင်တိုင်":"Kyimyindaing",
  "hlaing":"Hlaing","လှိုင်":"Hlaing",
  "kamayut":"Kamayut","ကမာရွတ်":"Kamayut",
  "mayangone":"Mayangone","မရမ်းကုန်း":"Mayangone",
  "insein":"Insein","အင်းစိန်":"Insein",
  "mingaladon":"Mingaladon","မင်္ဂလာဒုံ":"Mingaladon",
  "shwepyitha":"Shwepyitha","ရွှေပြည်သာ":"Shwepyitha",
  "hlaingthaya":"Hlaingthaya","hlaingthayar":"Hlaingthaya","hlaingtharya":"Hlaingthaya","hlaingtharyar":"Hlaingthaya","hlaingtharyaeast":"Hlaingthaya","hlaingtharyawest":"Hlaingthaya","hlaingtharyareast":"Hlaingthaya","hlaingtharyarwest":"Hlaingthaya","လှိုင်သာယာ":"Hlaingthaya","လှိုင်သာယာအရှေ့":"Hlaingthaya","လှိုင်သာယာအနောက်":"Hlaingthaya",
  "mingalataungnyunt":"Mingala Taungnyunt","mingalartaungnyunt":"Mingala Taungnyunt","minglartaungnyunt":"Mingala Taungnyunt","မင်္ဂလာတောင်ညွန့်":"Mingala Taungnyunt",
  "dala":"Dala","ဒလ":"Dala",
  "seikkyikanaungto":"Seikkyi Kanaungto","seikgyikanaungto":"Seikkyi Kanaungto","ဆိပ်ကြီးခနောင်တို":"Seikkyi Kanaungto",
  "thanlyin":"Thanlyin","syriam":"Thanlyin","သန်လျင်":"Thanlyin"
}));

function compact(value) {
  return String(value || "").normalize("NFC").toLowerCase()
    .replace(/(?:township|မြို့နယ်|city|မြို့)/g, "")
    .replace(/[^a-z0-9\u1000-\u109f]+/g, "");
}
function canonicalTownship(value) { return ALIASES.get(compact(value)) || ""; }
function normalizeStops(stops) {
  if (!Array.isArray(stops) || !stops.length) throw new Error("At least one delivery stop is required.");
  if (stops.length > MAX_STOPS) throw new Error(`Yangon master planning is limited to ${MAX_STOPS} ready parcels per request.`);
  const seen = new Set();
  return stops.map((stop, index) => {
    const id = String(stop?.delivery_way_id || stop?.id || "").trim();
    if (!id) throw new Error(`Stop ${index + 1} has no delivery_way_id.`);
    if (seen.has(id)) throw new Error(`Duplicate delivery stop: ${id}`);
    seen.add(id);
    const rawTownship = String(stop?.township || stop?.delivery_township || "").trim();
    const township = canonicalTownship(rawTownship);
    return { ...stop, delivery_way_id: id, raw_township: rawTownship, township, ...point(stop) };
  });
}

const ZONES = [
  { id: "Z1", name: "Downtown (CBD)", townships: ["Kyauktada","Pabedan","Lanmadaw","Latha","Botahtaung","Pazundaung"], ceiling: COMPACT_CEILING, vehicle: "Compact Van / Micro-Van", departure: "YCDC LEGAL ENTRY WINDOW" },
  { id: "Z2", name: "Inner City (West & Central)", townships: ["Dagon","Ahlone","Kyimyindaing","Sanchaung","Kamayut","Bahan"], ceiling: SPRAWL_CEILING, vehicle: "Compact / 1-Ton Delivery Van", departure: "08:00" },
  { id: "Z3", name: "Inner East & South-East", townships: ["Mingala Taungnyunt","Tamwe","Dawbon","Thaketa","Thingangyun","Yankin","South Okkalapa"], ceiling: SPRAWL_CEILING, vehicle: "1-Ton Delivery Van", departure: "08:30" },
  { id: "Z4", name: "The Dagons (East Suburbs)", townships: ["North Dagon","South Dagon","East Dagon","Dagon Seikkan"], ceiling: SPRAWL_CEILING, vehicle: "1.5-Ton Box / Delivery Van", departure: "08:30" },
  { id: "Z5", name: "Northern Corridor", townships: ["Mayangone","Hlaing","Insein","Mingaladon","North Okkalapa"], ceiling: SPRAWL_CEILING, vehicle: "1.5-Ton Delivery Van", departure: "08:30" },
  { id: "Z6", name: "Trans-River West (Industrial)", townships: ["Hlaingthaya","Shwepyitha"], ceiling: SPRAWL_CEILING, vehicle: "High-Capacity Cargo Van", departure: "FULL-SHIFT BRIDGE CROSSING" },
];
const ZONE_BY_TOWNSHIP = new Map(ZONES.flatMap((zone) => zone.townships.map((township) => [township, zone])));
const COMPACT_TOWNSHIPS = new Set(["Kyauktada","Pabedan","Lanmadaw","Latha","Botahtaung","Pazundaung","Sanchaung","Bahan"]);
const ROYAL_OUTSOURCED = new Set(["Dala","Seikkyi Kanaungto"]);
const OTHER_OUT_OF_SCOPE = new Set(["Thanlyin"]);

const EXPANSION_GROUPS = [
  ["Lanmadaw","Latha","Pabedan"],
  ["Kyauktada","Botahtaung","Pazundaung"],
  ["Ahlone","Kyimyindaing"],
  ["Dawbon","Thaketa"],
  ["Mingala Taungnyunt","Tamwe"],
  ["East Dagon","North Dagon"],
  ["Dagon Seikkan","South Dagon"],
  ["Mayangone","Insein"],
  ["Mingaladon","Insein"],
];

const HARD_FENCES = [
  "NEVER_CROSS_HLAING_RIVER_FOR_CAPACITY_BALANCING",
  "NEVER_MERGE_DOWNTOWN_WITH_EAST_SUBURBS",
  "DALA_AND_SEIKGYI_KANAUNGTO_ALWAYS_OUTSOURCE_TO_ROYAL_EXPRESS",
];

function ceilingForTownships(townships) {
  return townships.every((t) => COMPACT_TOWNSHIPS.has(t)) ? COMPACT_CEILING : SPRAWL_CEILING;
}
function centroid(rows) {
  return {
    latitude: rows.reduce((sum, row) => sum + row.latitude, 0) / rows.length,
    longitude: rows.reduce((sum, row) => sum + row.longitude, 0) / rows.length,
  };
}
function axisFor(townships) {
  if (townships.includes("North Dagon")) return { axis: "longitude", divider: "Pinlon Road proxy: geographic east/west split" };
  if (townships.includes("Sanchaung")) return { axis: "longitude", divider: "Baho Road proxy: geographic east/west split" };
  if (townships.includes("Hlaing") || townships.includes("Kamayut")) return { axis: "longitude", divider: "Pyay Road proxy: geographic east/west split" };
  if (townships.includes("Thingangyun") || townships.includes("Tamwe")) return { axis: "latitude", divider: "Kyaik Ka San / Lay Daung Kan proxy: geographic north/south split" };
  return { axis: "longitude", divider: "Geographic median split inside approved township/cluster" };
}
function splitGeographically(rows, ceiling, townships) {
  const routeCount = Math.ceil(rows.length / ceiling);
  const { axis, divider } = axisFor(townships);
  const sorted = [...rows].sort((a, b) => Number(a[axis]) - Number(b[axis]) || a.delivery_way_id.localeCompare(b.delivery_way_id));
  const chunks = [];
  for (let i = 0; i < routeCount; i++) {
    const start = Math.floor(i * sorted.length / routeCount);
    const end = Math.floor((i + 1) * sorted.length / routeCount);
    chunks.push({ rows: sorted.slice(start, end), divider });
  }
  return chunks;
}
function countByTownship(rows) {
  const counts = {};
  for (const row of rows) counts[row.township] = (counts[row.township] || 0) + 1;
  return counts;
}
function groupRowsByTownship(rows) {
  const map = new Map();
  for (const row of rows) {
    const list = map.get(row.township) || [];
    list.push(row);
    map.set(row.township, list);
  }
  return map;
}
export function buildBaselineBuckets(zoneRows) {
  const townMap = groupRowsByTownship(zoneRows);
  const used = new Set();
  const buckets = [];
  for (const group of EXPANSION_GROUPS) {
    const applicable = group.filter((t) => townMap.has(t));
    if (applicable.length < 2) continue;
    if (applicable.some((t) => used.has(t))) continue;
    const members = applicable.flatMap((t) => townMap.get(t) || []);
    const allLow = applicable.every((t) => (townMap.get(t) || []).length < FLOOR);
    const ceiling = ceilingForTownships(applicable);
    if (allLow && members.length <= ceiling) {
      buckets.push({ rows: members, townships: applicable, strategy: "EXPAND", note: "Approved adjacent low-volume townships absorbed into one van." });
      applicable.forEach((t) => used.add(t));
    }
  }
  for (const [township, rows] of townMap.entries()) {
    if (used.has(township)) continue;
    buckets.push({ rows, townships: [township], strategy: rows.length < FLOOR ? "LOW_VOLUME_STANDALONE" : "BASELINE", note: rows.length < FLOOR ? "No safe approved adjacent absorption available; retain as low-volume route or operator reassignment." : "Fixed township baseline." });
  }
  return buckets;
}
function routeFromChunk(zone, bucket, rows, index, divider) {
  const townships = [...new Set(rows.map((r) => r.township))];
  const ceiling = ceilingForTownships(townships);
  const counts = countByTownship(rows);
  return {
    route_code: `${zone.id}-${index + 1}`,
    zone_code: zone.id,
    zone_name: zone.name,
    strategy: bucket.strategy,
    capacity_profile: ceiling === COMPACT_CEILING ? "HIGH_DENSITY_COMPACT" : "SPRAWL_TRAFFIC",
    floor: FLOOR,
    ceiling,
    parcel_count: rows.length,
    townships,
    townships_map: counts,
    delivery_way_ids: rows.map((r) => r.delivery_way_id),
    recommended_vehicle: zone.vehicle,
    recommended_departure: zone.departure,
    geographic_center: centroid(rows),
    divider: divider || null,
    note: bucket.note,
  };
}
function planZone(zone, zoneRows) {
  const routes = [];
  let seq = 0;
  for (const bucket of buildBaselineBuckets(zoneRows)) {
    const ceiling = ceilingForTownships(bucket.townships);
    if (bucket.rows.length > ceiling) {
      const chunks = splitGeographically(bucket.rows, ceiling, bucket.townships);
      for (const chunk of chunks) {
        const squeezed = { ...bucket, strategy: "SQUEEZE", note: "Ceiling breached: keep the core geography compact and assign peripheral overflow to a floater van. Decouple B2B/bulk stops first where identified." };
        routes.push(routeFromChunk(zone, squeezed, chunk.rows, seq++, chunk.divider));
      }
    } else {
      routes.push(routeFromChunk(zone, bucket, bucket.rows, seq++));
    }
  }
  return routes;
}
function assignPlan(stops) {
  const royal = stops.filter((s) => ROYAL_OUTSOURCED.has(s.township));
  const otherExcluded = stops.filter((s) => OTHER_OUT_OF_SCOPE.has(s.township));
  const unmapped = stops.filter((s) => !s.township);
  const unsupported = stops.filter((s) => s.township && !ROYAL_OUTSOURCED.has(s.township) && !OTHER_OUT_OF_SCOPE.has(s.township) && !ZONE_BY_TOWNSHIP.has(s.township));
  const eligible = stops.filter((s) => ZONE_BY_TOWNSHIP.has(s.township));
  const routes = [];
  for (const zone of ZONES) {
    const zoneRows = eligible.filter((s) => ZONE_BY_TOWNSHIP.get(s.township)?.id === zone.id);
    if (zoneRows.length) routes.push(...planZone(zone, zoneRows));
  }
  return { royal, otherExcluded, unmapped, unsupported, eligible, routes };
}

export default {
  async fetch(request) {
    try {
      if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
      if (!(await verifySupabaseUser(request))) return json({ ok: false, error: "authenticated_wayplan_session_required" }, 401);
      const payload = await request.json().catch(() => ({}));
      const origin = point(payload?.origin);
      const stops = normalizeStops(payload?.stops);
      const assigned = assignPlan(stops);
      if (assigned.unmapped.length || assigned.unsupported.length) {
        return json({
          ok: false,
          error: "yangon_master_township_mapping_required",
          message: "One or more parcels do not map to the approved Yangon van-assignment master. Correct the township before automatic Wayplan generation.",
          unmapped: assigned.unmapped.map((s) => ({ delivery_way_id: s.delivery_way_id, township: s.raw_township })),
          unsupported: assigned.unsupported.map((s) => ({ delivery_way_id: s.delivery_way_id, township: s.raw_township, canonical_township: s.township })),
        }, 422);
      }
      return json({
        ok: true,
        plan_code: "YANGON_DYNAMIC_ZONING_V37",
        plan_name: "Yangon Dynamic Van Zoning V37",
        hub: { name: "East Dagon Logistics Center", ...origin },
        scope: "BRITIUM_YANGON_ZONES_1_TO_6",
        thresholds: { floor: FLOOR, sprawl_ceiling: SPRAWL_CEILING, compact_ceiling: COMPACT_CEILING },
        eligible_parcel_count: assigned.eligible.length,
        recommended_unit_count: assigned.routes.length,
        active_route_count: assigned.routes.length,
        routes: assigned.routes.map((route) => ({ ...route, township_counts: Object.entries(route.townships_map).map(([township, parcel_count]) => ({ township, parcel_count })) })),
        outsourced_to_royal_express: assigned.royal.map((s) => ({ delivery_way_id: s.delivery_way_id, township: s.township, service_provider: "ROYAL", reason: "OUT_OF_SCOPE_FOR_BRITIUM_YANGON_DELIVERY" })),
        excluded_from_yangon_plan: [
          ...assigned.royal.map((s) => ({ delivery_way_id: s.delivery_way_id, township: s.township, reason: "OUTSOURCED_TO_ROYAL_EXPRESS" })),
          ...assigned.otherExcluded.map((s) => ({ delivery_way_id: s.delivery_way_id, township: s.township, reason: "OUTSIDE_YANGON_VAN_MASTER_SCOPE" })),
        ],
        hard_fences: HARD_FENCES,
        sequencing_policy: "APPROVED_LOGISTICS_ZONE_AND_TOWNSHIP_CLUSTER_FIRST_THEN_GOOGLE_ROAD_TIME_OPTIMIZATION",
        road_geometry_policy: "DO_NOT_CROSS_HARD_FENCES_FOR_CAPACITY_BALANCING",
        motorcycle_policy: "PROHIBITED_FROM_AUTOMATIC_YANGON_FLEET_PLANNING",
        low_volume_policy: "EXPAND_ONLY_WITHIN_PREAPPROVED_ADJACENCY; OTHERWISE_STAND_DOWN_OR_REASSIGN_EXCESS_VAN",
        high_volume_policy: "DECOUPLE_B2B_BULK_THEN_SQUEEZE_BY_ARTERIAL_OR_GEOGRAPHIC_MEDIAN_AND_USE_FLOATER",
        manual_editable: true,
        generated_at: new Date().toISOString(),
      });
    } catch (error) {
      return json({ ok: false, error: String(error?.message || error) }, 400);
    }
  },
};