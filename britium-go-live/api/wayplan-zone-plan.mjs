const MAX_STOPS = 500;
const FLOOR = 50;
const SPRAWL_CEILING = 70;
const COMPACT_CEILING = 75;

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
  "thingangyun":"Thingangyun","သင်္ဃန်းကျွန်း":"Thingangyun","southokkalapa":"South Okkalapa","တောင်ဥက္ကလာပ":"South Okkalapa",
  "northokkalapa":"North Okkalapa","မြောက်ဥက္ကလာပ":"North Okkalapa","yankin":"Yankin","ရန်ကင်း":"Yankin",
  "tamwe":"Tamwe","tarmwe":"Tamwe","တာမွေ":"Tamwe","bahan":"Bahan","ဗဟန်း":"Bahan","thaketa":"Thaketa","သာကေတ":"Thaketa",
  "dawbon":"Dawbon","ဒေါပုံ":"Dawbon","kyauktada":"Kyauktada","ကျောက်တံတား":"Kyauktada","pabedan":"Pabedan","ပန်းဘဲတန်း":"Pabedan",
  "latha":"Latha","လသာ":"Latha","lanmadaw":"Lanmadaw","လမ်းမတော်":"Lanmadaw","botahtaung":"Botahtaung","botataung":"Botahtaung","ဗိုလ်တထောင်":"Botahtaung",
  "pazundaung":"Pazundaung","ပုဇွန်တောင်":"Pazundaung","dagon":"Dagon","ဒဂုံ":"Dagon","sanchaung":"Sanchaung","စမ်းချောင်း":"Sanchaung",
  "ahlone":"Ahlone","alohn":"Ahlone","အလုံ":"Ahlone","kyimyindaing":"Kyimyindaing","kyeemyindaing":"Kyimyindaing","kyimyindine":"Kyimyindaing","kyeemyindine":"Kyimyindaing","ကြည့်မြင်တိုင်":"Kyimyindaing",
  "hlaing":"Hlaing","လှိုင်":"Hlaing","kamayut":"Kamayut","ကမာရွတ်":"Kamayut","mayangone":"Mayangone","မရမ်းကုန်း":"Mayangone",
  "insein":"Insein","အင်းစိန်":"Insein","mingaladon":"Mingaladon","မင်္ဂလာဒုံ":"Mingaladon","shwepyitha":"Shwepyitha","ရွှေပြည်သာ":"Shwepyitha",
  "hlaingthaya":"Hlaingthaya","hlaingthayar":"Hlaingthaya","hlaingtharya":"Hlaingthaya","hlaingtharyar":"Hlaingthaya","hlaingtharyaeast":"Hlaingthaya","hlaingtharyawest":"Hlaingthaya","လှိုင်သာယာ":"Hlaingthaya","လှိုင်သာယာအရှေ့":"Hlaingthaya","လှိုင်သာယာအနောက်":"Hlaingthaya",
  "mingalataungnyunt":"Mingala Taungnyunt","mingalartaungnyunt":"Mingala Taungnyunt","minglartaungnyunt":"Mingala Taungnyunt","မင်္ဂလာတောင်ညွန့်":"Mingala Taungnyunt",
  "dala":"Dala","ဒလ":"Dala","seikkyikanaungto":"Seikkyi Kanaungto","seikgyikanaungto":"Seikkyi Kanaungto","ဆိပ်ကြီးခနောင်တို":"Seikkyi Kanaungto",
  "thanlyin":"Thanlyin","syriam":"Thanlyin","သန်လျင်":"Thanlyin"
}));
function compact(value) {
  return String(value || "").normalize("NFC").toLowerCase().replace(/(?:township|မြို့နယ်|city|မြို့)/g, "").replace(/[^a-z0-9\u1000-\u109f]+/g, "");
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
    if (!township) throw new Error(`Unrecognized Yangon township: ${rawTownship || `(stop ${index + 1})`}`);
    return { ...stop, delivery_way_id: id, raw_township: rawTownship, township, ...point(stop) };
  });
}

const ZONES = [
  { id:"Z1", name:"Downtown (CBD)", townships:["Kyauktada","Pabedan","Lanmadaw","Latha","Botahtaung","Pazundaung"], ceiling:COMPACT_CEILING, vehicle:"Compact Van / Micro-Van", departure:"YCDC LEGAL ENTRY WINDOW" },
  { id:"Z2", name:"Inner City (West & Central)", townships:["Dagon","Ahlone","Kyimyindaing","Sanchaung","Kamayut","Bahan"], ceiling:SPRAWL_CEILING, vehicle:"Compact / 1-Ton Delivery Van", departure:"08:00" },
  { id:"Z3", name:"Inner East & South-East", townships:["Mingala Taungnyunt","Tamwe","Dawbon","Thaketa","Thingangyun","Yankin","South Okkalapa"], ceiling:SPRAWL_CEILING, vehicle:"1-Ton Delivery Van", departure:"08:30" },
  { id:"Z4", name:"The Dagons (East Suburbs)", townships:["North Dagon","South Dagon","East Dagon","Dagon Seikkan"], ceiling:SPRAWL_CEILING, vehicle:"1.5-Ton Box / Delivery Van", departure:"08:30" },
  { id:"Z5", name:"Northern Corridor", townships:["Mayangone","Hlaing","Insein","Mingaladon","North Okkalapa"], ceiling:SPRAWL_CEILING, vehicle:"1.5-Ton Delivery Van", departure:"08:30" },
  { id:"Z6", name:"Trans-River West (Industrial)", townships:["Hlaingthaya","Shwepyitha"], ceiling:SPRAWL_CEILING, vehicle:"High-Capacity Cargo Van", departure:"FULL-SHIFT BRIDGE CROSSING" },
  { id:"Z7", name:"Thanlyin South-East Corridor", townships:["Thanlyin"], ceiling:SPRAWL_CEILING, vehicle:"1.5-Ton Delivery Van", departure:"FULL-SHIFT BRIDGE CROSSING" },
];
const ZONE_BY_TOWNSHIP = new Map(ZONES.flatMap((zone) => zone.townships.map((township) => [township, zone])));
const ROYAL_OUTSOURCED = new Set(["Dala","Seikkyi Kanaungto"]);

function countByTownship(rows) {
  const counts = new Map();
  for (const row of rows) counts.set(row.township, (counts.get(row.township) || 0) + 1);
  return [...counts.entries()].map(([township, parcel_count]) => ({ township, parcel_count }));
}
function splitBalanced(rows, ceiling) {
  if (!rows.length) return [];
  const routeCount = Math.ceil(rows.length / ceiling);
  if (rows.length < (routeCount - 1) * FLOOR + 1) {
    throw new Error(`Capacity contract cannot be satisfied: ${rows.length} parcels would create more than one van below 50 parcels.`);
  }
  const ordered = [...rows].sort((a,b) => a.township.localeCompare(b.township) || Number(a.latitude)-Number(b.latitude) || Number(a.longitude)-Number(b.longitude) || a.delivery_way_id.localeCompare(b.delivery_way_id));
  const sizes = Array.from({ length: routeCount }, () => Math.floor(rows.length / routeCount));
  for (let i=0;i<rows.length%routeCount;i++) sizes[i]++;
  for (let i=0;i<routeCount-1;i++) {
    if (sizes[i] < FLOOR) {
      const needed = FLOOR - sizes[i];
      sizes[i] += needed;
      sizes[routeCount-1] -= needed;
    }
  }
  if (sizes.some((size) => size > ceiling)) throw new Error(`Capacity contract exceeded: one route would contain more than ${ceiling} parcels.`);
  let offset = 0;
  return sizes.map((size) => ordered.slice(offset, offset += size));
}
function buildRoutes(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const zone = ZONE_BY_TOWNSHIP.get(row.township);
    if (!zone) throw new Error(`No Britium Yangon planning zone is configured for ${row.township}.`);
    const list = grouped.get(zone.id) || [];
    list.push(row); grouped.set(zone.id, list);
  }
  const routes = [];
  for (const zone of ZONES) {
    const zoneRows = grouped.get(zone.id) || [];
    const chunks = splitBalanced(zoneRows, zone.ceiling);
    chunks.forEach((chunk, index) => routes.push({
      route_code: `${zone.id}-${String(index + 1).padStart(2,"0")}`,
      zone_id: zone.id,
      name: chunks.length > 1 ? `${zone.name} ${index + 1}` : zone.name,
      configured_townships: zone.townships,
      township_counts: countByTownship(chunk),
      parcel_count: chunk.length,
      delivery_way_ids: chunk.map((row) => row.delivery_way_id),
      vehicle_type: zone.vehicle,
      dispatch_window: zone.departure,
      routing_strategy: `V38 hard capacity contract: normal minimum ${FLOOR}, maximum ${zone.ceiling}; road sequence is optimized after vehicle assignment.`,
    }));
  }
  const below = routes.filter((route) => route.parcel_count < FLOOR);
  if (below.length > 1) throw new Error("Capacity contract rejected: more than one route below 50 parcels. Adjust the selected parcel set or combine operationally compatible volume before creating Wayplans.");
  if (routes.some((route) => route.parcel_count > COMPACT_CEILING)) throw new Error("Capacity contract rejected: a route exceeds 75 parcels.");
  return routes;
}

export default async function handler(request) {
  if (request.method !== "POST") return json({ ok:false, error:"METHOD_NOT_ALLOWED" }, 405);
  if (!(await verifySupabaseUser(request))) return json({ ok:false, error:"UNAUTHORIZED", message:"Authenticated Wayplan session is required." }, 401);
  try {
    const body = await request.json();
    point(body?.origin);
    const stops = normalizeStops(body?.stops);
    const outsourced = stops.filter((row) => ROYAL_OUTSOURCED.has(row.township));
    const inScope = stops.filter((row) => !ROYAL_OUTSOURCED.has(row.township));
    const routes = buildRoutes(inScope);
    return json({
      ok:true,
      plan_code:"YGN-V38",
      plan_name:"Yangon V38 50-75 Capacity Master Plan",
      sequencing_policy:"ZONE_THEN_ROAD_OPTIMIZED",
      floor:FLOOR,
      max_ceiling:COMPACT_CEILING,
      routes,
      outsourced: outsourced.map((row) => ({ delivery_way_id:row.delivery_way_id, township:row.township, provider:"ROYAL" })),
      hard_fences:["DALA_AND_SEIKGYI_KANAUNGTO_ALWAYS_OUTSOURCE_TO_ROYAL_EXPRESS","THANLYIN_REMAINS_BRITIUM_EXPRESS","MAX_75_STOPS_PER_VAN"],
      generated_at:new Date().toISOString(),
    });
  } catch (error) {
    return json({ ok:false, error:"WAYPLAN_ZONE_PLAN_REJECTED", message:error?.message || String(error) }, 400);
  }
}
