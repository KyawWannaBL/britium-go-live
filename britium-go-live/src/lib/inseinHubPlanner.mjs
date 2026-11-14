// Insein township hub planning V1. Pure planning only: no database mutations.
// Shuttle manifests are not last-mile Wayplans. Actual transfers require custody scans.
export const INSEIN_HUB = Object.freeze({
  branchCode: "YGN-INS",
  hubCode: "INSEIN_HUB",
  latitude: 16.8914722,
  longitude: 96.1114444,
  address: "No. 285, Damayone Street, Lan Thit Road, Taung Thu Kone Quarter, Insein Township, Yangon, Myanmar",
  windows: ["MORNING", "EVENING"],
});
const aliases = new Map([
  ["insein","Insein"],["အင်းစိန်","Insein"],
  ["mayangone","Mayangone"],["mayangon","Mayangone"],["မရမ်းကုန်း","Mayangone"],
  ["shwepyitha","Shwepyitha"],["shwepyithar","Shwepyitha"],["ရွှေပြည်သာ","Shwepyitha"],
  ["hlaingthaya","Hlaingthaya"],["hlaingthayar","Hlaingthaya"],["hlaingtharya","Hlaingthaya"],
  ["hlaingtharyar","Hlaingthaya"],["hlaingthayareast","Hlaingthaya"],["hlaingthayarwest","Hlaingthaya"],
  ["hlaingtharyaeast","Hlaingthaya"],["hlaingtharyawest","Hlaingthaya"],
  ["hlaingtharyareast","Hlaingthaya"],["hlaingtharyarwest","Hlaingthaya"],
  ["လှိုင်သာယာ","Hlaingthaya"],["လှိုင်သာယာအရှေ့ပိုင်း","Hlaingthaya"],["လှိုင်သာယာအနောက်ပိုင်း","Hlaingthaya"],
  ["လှိုင်သာယာအရှေ့","Hlaingthaya"],["လှိုင်သာယာအနောက်","Hlaingthaya"],
]);
function key(input) {
  return String(input ?? "").normalize("NFC").toLowerCase()
    .replace(/(?:township|မြို့နယ်)\s*$/g,"").replace(/[^a-z0-9\u1000-\u109f]/g,"");
}
export function inseinTownship(input) { return aliases.get(key(input)) || null; }
function validateRows(rows) {
  if (!Array.isArray(rows)) throw new Error("Stops must be an array.");
  if (rows.length > 5000) throw new Error("Split the request into batches of at most 5000.");
  const seen = new Set();
  return rows.map((raw,i) => {
    const id = String(raw?.delivery_way_id || "").trim();
    if (!id || seen.has(id)) throw new Error("Missing or duplicate Way ID at position "+(i+1));
    seen.add(id);
    const township = inseinTownship(raw?.township || raw?.delivery_township);
    if (!township) throw new Error("Parcel "+id+" does not belong to the Insein hub.");
    return {...raw, delivery_way_id:id, canonical_township:township};
  });
}
function byWayId(a,b) { return a.delivery_way_id.localeCompare(b.delivery_way_id); }
function windows(value) {
  const s = String(value||"").toUpperCase();
  if (!INSEIN_HUB.windows.includes(s)) throw new Error("Shuttle window must be MORNING or EVENING.");
  return s;
}
function manifest(rows,direction,window) {
  return {hub_code:INSEIN_HUB.hubCode, branch_code:INSEIN_HUB.branchCode,
    direction, window, parcel_count:rows.length, delivery_way_ids:rows.map(r=>r.delivery_way_id),
    status:"DRAFT_UNSCANNED", requires_load_scan:true, requires_receipt_scan:true};
}
/** Separate local rider tasks from trunk-shuttle custody; no 50-way minimum applies.
 * Input queues must be pre-filtered for correct delivery/pickup state by the calling service.
 */
export function planInseinHub({deliveries=[],pickups=[],returns=[],shuttleWindow="MORNING",riderCount=0,originBranch="YGN"}={}) {
  const window = windows(shuttleWindow);
  if (!Number.isInteger(riderCount) || riderCount<0 || riderCount>200) throw new Error("Invalid rider count.");
  const d=validateRows(deliveries), p=validateRows(pickups), r=validateRows(returns);
  const all=[...d,...p,...r];
  if (new Set(all.map(x=>x.delivery_way_id)).size!==all.length) throw new Error("A Way ID cannot appear in two active queues.");
  const sorted=[...d].sort((a,b)=>a.canonical_township.localeCompare(b.canonical_township)||byWayId(a,b));
  // Rider route count is driven by staff availability, not van parcel thresholds.
  const count=Math.min(riderCount,sorted.length);
  const riderRoutes=Array.from({length:count},(_,i)=>({route_code:"INS-RIDER-"+String(i+1).padStart(2,"0"),
    origin:INSEIN_HUB.hubCode, mode:"RIDER", parcels:[], parcel_count:0,
    return_to_hub:true, requires_rider_assignment:true}));
  sorted.forEach((item,i)=>{if(count) riderRoutes[i%count].parcels.push(item.delivery_way_id);});
  riderRoutes.forEach(route=>{route.parcel_count=route.parcels.length;});
  return {
    plan_code:"INSEIN_SHUTTLE_RIDER_V1",hub:INSEIN_HUB, origin_branch:originBranch,
    shuttle_window:window,
    inbound_shuttle:manifest(d,"HQ_TO_INSEIN",window),
    outbound_shuttle:manifest([...p,...r].sort(byWayId),"INSEIN_TO_HQ",window),
    rider_routes:riderRoutes,
    local_pickup_queue:p.map(x=>({delivery_way_id:x.delivery_way_id,township:x.canonical_township,assignment_required:true})),
    unassigned_delivery_count:count===0?d.length:0,
    warnings:["Preview only: shuttle custody scans, rider assignments and dispatch must be committed through their authoritative workflows.",
      "Each shuttle travels in its scheduled direction; never mark a parcel transferred until load and receipt scans reconcile."],
  };
}
