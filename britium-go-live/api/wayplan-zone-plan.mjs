const MAX_STOPS = 500;

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

const PLANS = {
  LOW_3: [
    ["A","East & North-East",["East Dagon","North Dagon","South Dagon","Dagon Seikkan","Thingangyun","South Okkalapa","North Okkalapa","Yankin"],"1.5-Ton Box Van","08:30","Clear the Dagon home zone first, then continue into the Okkalapa / Thingangyun residential arc. Optimize the actual stop order by road travel time."],
    ["B","Urban Core & Inner West",["Thaketa","Dawbon","Tamwe","Bahan","Mingala Taungnyunt","Kyauktada","Pabedan","Latha","Lanmadaw","Botahtaung","Pazundaung","Dagon","Sanchaung","Ahlone","Kyimyindaing"],"1-Ton High-Roof Van","08:00","Transit to Thaketa / Dawbon, cross the central-east corridor into Downtown, then finish through Ahlone and Kyimyindaing."],
    ["C","Outer West & North",["Hlaing","Kamayut","Mayangone","Insein","Mingaladon","Shwepyitha","Hlaingthaya"],"1.5-Ton Cargo Van","08:30","Keep the long outer arc isolated. Use the live road matrix to choose northern-first or bridge-first order."],
  ],
  STANDARD_5: [
    ["1","East Core",["East Dagon","North Dagon","South Dagon","Dagon Seikkan"],"1.5-Ton Box Van","08:30","Micro-route around the East Dagon hub; prioritize dense and bulky B2B/residential drops and preserve reload capability."],
    ["2","North-East Corridor",["Thingangyun","South Okkalapa","North Okkalapa","Yankin"],"1-Ton Delivery Van","09:00","Use No. 2 Highway / Thanthumar / Waizayantar corridor logic; optimize actual stop order by live road time."],
    ["3","Central-East Corridor",["Tamwe","Bahan","Mingala Taungnyunt","Thaketa","Dawbon"],"1-Ton Light Van","09:00","Prefer Thaketa / Dawbon before inner-city congestion where road-time evidence supports it, then sweep Tamwe, Mingala Taungnyunt and Bahan."],
    ["4","Downtown, CBD & Inner West",["Kyauktada","Pabedan","Latha","Lanmadaw","Botahtaung","Pazundaung","Dagon","Sanchaung","Ahlone","Kyimyindaing"],"High-Roof Compact Van / LWB Walk-In","08:00","Use Lower Pazundaung / Strand Road as the principal spine where practical, then continue into Ahlone and Kyimyindaing."],
    ["5","West & North Gateway",["Hlaing","Kamayut","Mayangone","Insein","Mingaladon","Shwepyitha","Hlaingthaya"],"1.5-Ton High-Capacity Cargo Van","08:30","Use No. 3 Highway / Khayay Pin / Bayintnaung access according to road time; keep western and northern drops continuous."],
  ],
  HIGH_9: [
    ["1","East Dagon & Dagon Seikkan",["East Dagon","Dagon Seikkan"],"Van","08:30","Industrial and hub-adjacent micro-route; prioritize large cargo and dense local drops."],
    ["2","North Dagon & South Dagon",["North Dagon","South Dagon"],"Van","08:30","Residential Dagon micro-route optimized by ward and road time."],
    ["3","South Okkalapa & Thingangyun",["South Okkalapa","Thingangyun"],"Delivery Van","09:00","Mid-city residential route around Thanthumar / Waizayantar access."],
    ["4","North Okkalapa & Yankin",["North Okkalapa","Yankin"],"Delivery Van","09:00","North-east residential route; live road optimizer determines practical direction from the hub."],
    ["5","Central-East Peninsula",["Thaketa","Dawbon","Tamwe","Bahan","Mingala Taungnyunt"],"Light Van","09:00","Dedicated central-east loop using actual bridge and junction road-time costs."],
    ["6","Downtown Core",["Kyauktada","Pabedan","Latha","Lanmadaw","Botahtaung","Pazundaung","Dagon"],"Bulk Cargo / Mobile Hub Van","08:00","Downtown via Strand Road spine; mobile-hub handoff may be enabled by operations."],
    ["7","Inner West",["Sanchaung","Ahlone","Kyimyindaing"],"Compact Van / Motorcycle / Three-Wheeler","08:00","Gridlock-resistant inner-west route; operations may substitute smaller units for narrow streets."],
    ["8","Outer Residential & North-West",["Hlaing","Kamayut","Mayangone","Insein","Mingaladon"],"Delivery Van","08:30","Dedicated outer residential and north-west route; keeps these townships from being mixed arbitrarily into central routes."],
    ["9","Industrial Gateway",["Hlaingthaya","Shwepyitha"],"Heavy Cargo Van","08:30","Dedicated industrial/western route using Aung Zeya / Bayintnaung bridge access according to road conditions."],
  ],
};
const EXCLUDED = new Set(["Dala","Seikkyi Kanaungto","Thanlyin"]);
function planCode(count) { return count < 45 ? "LOW_3" : count <= 95 ? "STANDARD_5" : "HIGH_9"; }
function planName(code) { return code === "LOW_3" ? "Option 2 · Low-Volume Consolidation" : code === "STANDARD_5" ? "Option 1 · Standard 5-Zone Baseline" : "Option 3 · High-Volume 9-Route Expansion"; }

function assignPlan(stops) {
  const excluded = stops.filter((s) => EXCLUDED.has(s.township));
  const unmapped = stops.filter((s) => !s.township);
  const eligible = stops.filter((s) => s.township && !EXCLUDED.has(s.township));
  const code = planCode(eligible.length);
  const definitions = PLANS[code];
  const routeByTownship = new Map();
  definitions.forEach((def, index) => def[2].forEach((township) => routeByTownship.set(township, index)));
  const routes = definitions.map((def) => ({
    route_code: def[0], name: def[1], configured_townships: def[2], vehicle_type: def[3], dispatch_window: def[4], routing_strategy: def[5],
    parcel_count: 0, delivery_way_ids: [], townships: {}, road_optimization_required: true,
  }));
  const unsupported = [];
  for (const stop of eligible) {
    const index = routeByTownship.get(stop.township);
    if (index === undefined) { unsupported.push(stop); continue; }
    const route = routes[index];
    route.parcel_count += 1;
    route.delivery_way_ids.push(stop.delivery_way_id);
    route.townships[stop.township] = (route.townships[stop.township] || 0) + 1;
  }
  return { code, eligible, excluded, unmapped, unsupported, routes };
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
      const activeRoutes = assigned.routes.filter((route) => route.parcel_count > 0);
      return json({
        ok: true,
        plan_code: assigned.code,
        plan_name: planName(assigned.code),
        hub: { name: "East Dagon Logistics Center", ...origin },
        scope: "YANGON_URBAN_MASTER",
        thresholds: { low_volume: "<45", standard_volume: "45-95", high_volume: ">95" },
        eligible_parcel_count: assigned.eligible.length,
        recommended_unit_count: PLANS[assigned.code].length,
        active_route_count: activeRoutes.length,
        routes: assigned.routes.map((route) => ({ ...route, township_counts: Object.entries(route.townships).map(([township, parcel_count]) => ({ township, parcel_count })) })),
        excluded_from_yangon_plan: assigned.excluded.map((s) => ({ delivery_way_id: s.delivery_way_id, township: s.township, reason: "OUTSIDE_YANGON_VAN_MASTER_SCOPE" })),
        sequencing_policy: "FIXED_OPERATIONAL_ZONE_FIRST_THEN_ACTUAL_ROAD_TIME_OPTIMIZATION",
        road_geometry_policy: "DO_NOT_DRAW_OR_ACCEPT_STRAIGHT_LINE_AS_DELIVERY_ROUTE",
        manual_editable: true,
        generated_at: new Date().toISOString(),
      });
    } catch (error) {
      return json({ ok: false, error: String(error?.message || error) }, 400);
    }
  },
};
