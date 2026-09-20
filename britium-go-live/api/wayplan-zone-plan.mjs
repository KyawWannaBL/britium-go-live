const MAX_STOPS = 500;
const FLOOR = 50;
const ROUTE_CEILING = 75;

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
  { id: "Z1", name: "Downtown (CBD)", townships: ["Kyauktada","Pabedan","Lanmadaw","Latha","Botahtaung","Pazundaung"], vehicle: "Compact Van / Micro-Van", departure: "YCDC LEGAL ENTRY WINDOW" },
  { id: "Z2", name: "Inner City (West & Central)", townships: ["Dagon","Ahlone","Kyimyindaing","Sanchaung","Kamayut","Bahan"], vehicle: "Compact / 1-Ton Delivery Van", departure: "08:00" },
  { id: "Z3", name: "Inner East & South-East", townships: ["Mingala Taungnyunt","Tamwe","Dawbon","Thaketa","Thingangyun","Yankin","South Okkalapa"], vehicle: "1-Ton Delivery Van", departure: "08:30" },
  { id: "Z4", name: "The Dagons (East Suburbs)", townships: ["North Dagon","South Dagon","East Dagon","Dagon Seikkan"], vehicle: "1.5-Ton Box / Delivery Van", departure: "08:30" },
  { id: "Z5", name: "Northern Corridor", townships: ["Mayangone","Hlaing","Insein","Mingaladon","North Okkalapa"], vehicle: "1.5-Ton Delivery Van", departure: "08:30" },
  { id: "Z6", name: "Trans-River West (Industrial)", townships: ["Hlaingthaya","Shwepyitha"], vehicle: "High-Capacity Cargo Van", departure: "FULL-SHIFT BRIDGE CROSSING" },
];
const ZONE_BY_TOWNSHIP = new Map(ZONES.flatMap((zone) => zone.townships.map((township) => [township, zone])));
const ROYAL_OUTSOURCED = new Set(["Dala","Seikkyi Kanaungto"]);
const OTHER_OUT_OF_SCOPE = new Set(["Thanlyin"]);
const MAINLAND_ZONE_ORDER = ["Z1", "Z2", "Z5", "Z3", "Z4"];
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

function centroid(rows) {
  return {
    latitude: rows.reduce((sum, row) => sum + Number(row.latitude), 0) / rows.length,
    longitude: rows.reduce((sum, row) => sum + Number(row.longitude), 0) / rows.length,
  };
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
    const applicable = group.filter((township) => townMap.has(township));
    if (applicable.length < 2) continue;
    if (applicable.some((township) => used.has(township))) continue;
    const members = applicable.flatMap((township) => townMap.get(township) || []);
    const allLow = applicable.every((township) => (townMap.get(township) || []).length < FLOOR);
    if (allLow && members.length <= ROUTE_CEILING) {
      buckets.push({ rows: members, townships: applicable, strategy: "EXPAND", note: "Approved adjacent low-volume townships absorbed into one van." });
      applicable.forEach((township) => used.add(township));
    }
  }
  for (const [township, rows] of townMap.entries()) {
    if (used.has(township)) continue;
    buckets.push({ rows, townships: [township], strategy: rows.length < FLOOR ? "LOW_VOLUME_STANDALONE" : "BASELINE", note: rows.length < FLOOR ? "Legacy V37 standalone bucket retained for overlap regression; V44 rebalances before production routing." : "Fixed township baseline." });
  }
  return buckets;
}
function practicalRouteSizes(total) {
  if (total <= 0) return [];
  const routeCount = Math.ceil(total / ROUTE_CEILING);
  if (routeCount === 1) return [total];
  if (total >= routeCount * FLOOR) {
    const base = Math.floor(total / routeCount);
    const extra = total % routeCount;
    return Array.from({ length: routeCount }, (_, index) => base + (index < extra ? 1 : 0));
  }
  const sizes = Array.from({ length: routeCount - 1 }, () => FLOOR);
  sizes.push(total - FLOOR * (routeCount - 1));
  return sizes;
}
function routeSortKey(row) {
  const zone = ZONE_BY_TOWNSHIP.get(row.township);
  const zoneOrder = MAINLAND_ZONE_ORDER.indexOf(zone?.id || "");
  const townshipOrder = Math.max(0, zone?.townships.indexOf(row.township) ?? 0);
  return `${String(zoneOrder < 0 ? 99 : zoneOrder).padStart(2, "0")}:${String(townshipOrder).padStart(2, "0")}:${row.delivery_way_id}`;
}
function splitBalancedPool(rows, groupCode) {
  if (!rows.length) return [];
  const sorted = [...rows].sort((a, b) => routeSortKey(a).localeCompare(routeSortKey(b)));
  const sizes = practicalRouteSizes(sorted.length);
  let offset = 0;
  return sizes.map((size, index) => {
    const routeRows = sorted.slice(offset, offset += size);
    return { rows: routeRows, group_code: groupCode, group_trip: index + 1 };
  });
}
function violatesDowntownEastFence(rows) {
  const zoneIds = new Set(rows.map((row) => ZONE_BY_TOWNSHIP.get(row.township)?.id).filter(Boolean));
  return zoneIds.has("Z1") && zoneIds.has("Z4");
}
function rebalanceDowntownEastFence(routes) {
  const output = routes.map((route) => ({ ...route, rows: [...route.rows] }));
  for (let index = 0; index < output.length; index += 1) {
    const route = output[index];
    if (!violatesDowntownEastFence(route.rows)) continue;
    const z4 = route.rows.filter((row) => ZONE_BY_TOWNSHIP.get(row.township)?.id === "Z4");
    route.rows = route.rows.filter((row) => ZONE_BY_TOWNSHIP.get(row.township)?.id !== "Z4");
    let target = output.find((candidate, candidateIndex) => candidateIndex !== index && candidate.rows.length + z4.length <= ROUTE_CEILING && !candidate.rows.some((row) => ZONE_BY_TOWNSHIP.get(row.township)?.id === "Z1"));
    if (!target) {
      target = { rows: [], group_code: "MAINLAND", group_trip: output.length + 1 };
      output.push(target);
    }
    target.rows.push(...z4);
  }
  return output.filter((route) => route.rows.length);
}
export function balanceYangonRouteRows(rows) {
  const eligible = rows.filter((row) => ZONE_BY_TOWNSHIP.has(row.township));
  if (!eligible.length) return [];

  const west = eligible.filter((row) => ZONE_BY_TOWNSHIP.get(row.township)?.id === "Z6");
  const mainland = eligible.filter((row) => ZONE_BY_TOWNSHIP.get(row.township)?.id !== "Z6");

  // A low-volume van batch must never multiply into multiple under-loaded vans.
  // If fewer than 50 compatible ways are selected, keep them on one route.
  if (eligible.length < FLOOR) {
    const crossesRiverFence = west.length > 0 && mainland.length > 0;
    if (crossesRiverFence || violatesDowntownEastFence(eligible)) {
      throw new Error("Fewer than 50 van parcels cannot be split into multiple under-loaded vans. Select compatible townships for one van, wait for more volume, or assign a Rider (Rider routes have no minimum parcel count).");
    }
    return [{ rows: [...eligible].sort((a, b) => routeSortKey(a).localeCompare(routeSortKey(b))), group_code: west.length ? "TRANS_RIVER_WEST" : "MAINLAND", group_trip: 1 }];
  }

  const mainlandRoutes = rebalanceDowntownEastFence(splitBalancedPool(mainland, "MAINLAND"));
  const westRoutes = splitBalancedPool(west, "TRANS_RIVER_WEST");
  const routes = [...mainlandRoutes, ...westRoutes];
  if (routes.some((route) => route.rows.length > ROUTE_CEILING)) throw new Error("A balanced Yangon route exceeds 75 parcels.");
  if (routes.some((route) => violatesDowntownEastFence(route.rows))) throw new Error("Downtown and East Suburbs cannot share a Yangon route.");
  const shortRoutes = routes.filter((route) => route.rows.length < FLOOR);
  if (shortRoutes.length > 1) {
    throw new Error("Automatic van planning would create more than one route below 50 parcels. Rebalance the selection, wait for additional volume, or use Rider assignment for the low-volume route.");
  }
  return routes;
}
function recommendedVehicle(rows) {
  const zones = [...new Set(rows.map((row) => ZONE_BY_TOWNSHIP.get(row.township)).filter(Boolean))];
  if (zones.some((zone) => zone.id === "Z6")) return "High-Capacity Cargo Van";
  if (zones.some((zone) => ["Z4", "Z5"].includes(zone.id))) return "1.5-Ton Box / Delivery Van";
  if (zones.some((zone) => zone.id === "Z3")) return "1-Ton Delivery Van";
  return "Compact / 1-Ton Delivery Van";
}
function routeFromBalancedChunk(chunk, index) {
  const rows = chunk.rows;
  const zones = [...new Map(rows.map((row) => {
    const zone = ZONE_BY_TOWNSHIP.get(row.township);
    return [zone.id, zone];
  })).values()];
  const townships = [...new Set(rows.map((row) => row.township))];
  const counts = countByTownship(rows);
  const belowMinimum = rows.length < FLOOR;
  const name = chunk.group_code === "TRANS_RIVER_WEST"
    ? "Trans-River West (Industrial)"
    : zones.map((zone) => zone.name).join(" → ");
  return {
    route_code: `V44-${index + 1}`,
    zone_code: zones.map((zone) => zone.id).join("+"),
    zone_name: name,
    name,
    strategy: belowMinimum ? "HARD_FENCE_LOW_VOLUME_EXCEPTION" : "BALANCED_50_75",
    capacity_profile: "PRACTICAL_50_75",
    floor: FLOOR,
    ceiling: ROUTE_CEILING,
    parcel_count: rows.length,
    townships,
    configured_townships: townships,
    townships_map: counts,
    delivery_way_ids: rows.map((row) => row.delivery_way_id),
    recommended_vehicle: recommendedVehicle(rows),
    vehicle_type: recommendedVehicle(rows),
    recommended_departure: zones.map((zone) => zone.departure).filter(Boolean).join(" / "),
    dispatch_window: zones.map((zone) => zone.departure).filter(Boolean).join(" / "),
    routing_strategy: belowMinimum
      ? "One unavoidable below-50 hard-fence route; explicit operator approval is required before creation."
      : "Balanced to the 50-75 parcel operating band, then Google road-time optimized.",
    geographic_center: centroid(rows),
    divider: null,
    note: belowMinimum ? "Hard-fence residual retained as the single operator-approved low-volume exception." : "Compatible Yangon volumes consolidated before road optimization.",
  };
}
function assignPlan(stops) {
  const royal = stops.filter((s) => ROYAL_OUTSOURCED.has(s.township));
  const otherExcluded = stops.filter((s) => OTHER_OUT_OF_SCOPE.has(s.township));
  const unmapped = stops.filter((s) => !s.township);
  const unsupported = stops.filter((s) => s.township && !ROYAL_OUTSOURCED.has(s.township) && !OTHER_OUT_OF_SCOPE.has(s.township) && !ZONE_BY_TOWNSHIP.has(s.township));
  const eligible = stops.filter((s) => ZONE_BY_TOWNSHIP.has(s.township));
  const balanced = balanceYangonRouteRows(eligible);
  const routes = balanced.map(routeFromBalancedChunk);
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
        plan_code: "YANGON_BALANCED_MINIMUM_LOAD_V44",
        plan_name: "Yangon Balanced Minimum-Load Wayplan V44",
        hub: { name: "Yangon Head Office", ...origin },
        scope: "BRITIUM_YANGON_ZONES_1_TO_6",
        thresholds: { floor: FLOOR, ceiling: ROUTE_CEILING },
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
        sequencing_policy: "BALANCE_COMPATIBLE_YANGON_VOLUME_TO_50_75_PRESERVE_HARD_FENCES_THEN_ROAD_OPTIMIZE",
        road_geometry_policy: "DO_NOT_CROSS_HARD_FENCES_FOR_CAPACITY_BALANCING",
        motorcycle_policy: "PROHIBITED_FROM_AUTOMATIC_YANGON_FLEET_PLANNING",
        low_volume_policy: "AT_MOST_ONE_DRIVER_VAN_ROUTE_BELOW_50_WITH_EXPLICIT_APPROVAL; RIDER_ROUTES_EXEMPT",
        high_volume_policy: "BALANCE_COMPATIBLE_CORRIDORS_TO_50_75_AND_USE_SEQUENTIAL_FLEET_WAVES",
        manual_editable: true,
        generated_at: new Date().toISOString(),
      });
    } catch (error) {
      return json({ ok: false, error: String(error?.message || error) }, 400);
    }
  },
};