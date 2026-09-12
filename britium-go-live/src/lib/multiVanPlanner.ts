export type Stop = { delivery_way_id: string; township: string; latitude?: number; longitude?: number; parcel_weight_kg?: number; [key: string]: unknown };
export type Resource = { id: string; name: string; zone?: string; capacity_kg?: number; available?: boolean; [key: string]: unknown };
export type RouteProvenance = { source?: string; route_mode?: string; distance_m?: number; duration_s?: number; request_count?: number; fallback?: boolean; warning?: string; optimized_at?: string; base_source?: string; manual?: boolean };
export type VanPlan = { vehicle_code: string; driver_code: string; rider_code: string; helper_code: string; rows: Stop[]; route?: RouteProvenance };
export type RouteOrigin = { latitude: number; longitude: number; label?: string; branch_code?: string };

export const NORMAL_MIN_PARCELS_PER_VAN = 50;
export const PRACTICAL_MAX_PARCELS_PER_VAN = 75;

function validPoint(latitude: unknown, longitude: unknown) {
  return latitude != null && longitude != null && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
}

export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad=(n:number)=>n*Math.PI/180;
  const dLat=rad(Number(b.latitude)-Number(a.latitude));
  const dLon=rad(Number(b.longitude)-Number(a.longitude));
  const lat1=rad(Number(a.latitude)), lat2=rad(Number(b.latitude));
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}

/** Emergency geographic fallback only. Never label this as Google road optimization. */
export function sortStopsNearestFirst(rows: Stop[], origin: RouteOrigin): Stop[] {
  if (!validPoint(origin?.latitude,origin?.longitude)) throw new Error("Route origin is unavailable.");
  for(const row of rows) if(!validPoint(row.latitude,row.longitude)) throw new Error("A selected parcel needs a validated location.");
  return [...rows].sort((a,b)=>
    distanceKm(origin,{latitude:Number(a.latitude),longitude:Number(a.longitude)})-
    distanceKm(origin,{latitude:Number(b.latitude),longitude:Number(b.longitude)}) ||
    a.delivery_way_id.localeCompare(b.delivery_way_id)
  );
}

/** Geographic allocation keeps township blocks contiguous before road optimization.
 * Automatic van count uses a practical 50-75 parcel operating band. One below-50 van can still
 * be explicitly approved when unavoidable. The initial sequence is only an emergency geographic
 * fallback; production road order is replaced by the authenticated route service before save.
 * IMPORTANT: once township blocks are assembled we DO NOT globally re-sort each van by hub distance;
 * doing that would interleave places such as South Okkalapa between East Dagon stops.
 */
export function allocateVans(rows: Stop[], vehicles: Resource[], requested?: number, origin?: RouteOrigin): VanPlan[] {
  if (!rows.length) throw new Error("No ready parcels selected.");
  if (new Set(rows.map(r => r.delivery_way_id)).size !== rows.length) throw new Error("Duplicate parcel selection.");
  const available = vehicles.filter(v => v.available !== false);
  if (!available.length) throw new Error("No delivery van is available.");
  const count = requested ?? Math.min(available.length, Math.max(1, Math.ceil(rows.length / PRACTICAL_MAX_PARCELS_PER_VAN)));
  if (!Number.isInteger(count) || count < 1 || count > Math.min(7, available.length, rows.length)) throw new Error("Choose an available van count.");
  if (rows.length > count * PRACTICAL_MAX_PARCELS_PER_VAN) throw new Error(`Use more delivery vans: practical maximum is ${PRACTICAL_MAX_PARCELS_PER_VAN} parcels per van.`);
  if (rows.length < (count - 1) * NORMAL_MIN_PARCELS_PER_VAN + 1) throw new Error("This would leave more than one van below 50 parcels.");
  const towns = new Map<string, Stop[]>();
  for (const row of rows) {
    if (!row.township) throw new Error("A selected parcel has no township.");
    if (!validPoint(row.latitude,row.longitude)) throw new Error("A selected parcel needs a validated location.");
    const group = towns.get(row.township) ?? []; group.push(row); towns.set(row.township, group);
  }
  const centroid = (rs: Stop[]) => ({
    latitude:rs.reduce((s,r)=>s+Number(r.latitude),0)/rs.length,
    longitude:rs.reduce((s,r)=>s+Number(r.longitude),0)/rs.length,
  });
  let ordered:Stop[];
  if(origin){
    if(!validPoint(origin.latitude,origin.longitude)) throw new Error("Route origin is unavailable.");
    const blocks=[...towns.entries()].sort((a,b)=>distanceKm(origin,centroid(a[1]))-distanceKm(origin,centroid(b[1]))||a[0].localeCompare(b[0]));
    ordered=blocks.flatMap(([,rs])=>sortStopsNearestFirst(rs,origin));
  }else{
    const hub=centroid(rows);
    const blocks=[...towns.entries()].sort((a,b)=>{
      const x=centroid(a[1]),y=centroid(b[1]);
      return Math.atan2(x.latitude-hub.latitude,x.longitude-hub.longitude)-Math.atan2(y.latitude-hub.latitude,y.longitude-hub.longitude)||a[0].localeCompare(b[0]);
    });
    ordered=blocks.flatMap(([,rs])=>[...rs].sort((a,b)=>Number(a.latitude)-Number(b.latitude)||Number(a.longitude)-Number(b.longitude)||a.delivery_way_id.localeCompare(b.delivery_way_id)));
  }
  const sizes = Array.from({length:count},()=>Math.floor(rows.length/count));
  for(let i=0;i<rows.length%count;i++) sizes[i]++;
  for(let i=0;i<count-1;i++) if(sizes[i]<NORMAL_MIN_PARCELS_PER_VAN) { const needed=NORMAL_MIN_PARCELS_PER_VAN-sizes[i]; sizes[i]=NORMAL_MIN_PARCELS_PER_VAN; sizes[count-1]-=needed; }
  if (sizes.some(size=>size>PRACTICAL_MAX_PARCELS_PER_VAN)) throw new Error(`Use more delivery vans: practical maximum is ${PRACTICAL_MAX_PARCELS_PER_VAN} parcels per van.`);
  const unused=[...available]; let offset=0;
  return sizes.map(size=>{
    // Preserve contiguous township blocks in emergency fallback order.
    const batch=ordered.slice(offset,offset+=size);
    const weight=batch.reduce((s,r)=>s+Number(r.parcel_weight_kg||0),0);
    const index=unused.findIndex(v=>!Number(v.capacity_kg)||Number(v.capacity_kg)>=weight);
    if(index<0) throw new Error("Known van weight capacities are insufficient. Adjust the selected parcels or van count.");
    const vehicle=unused.splice(index,1)[0];
    return {vehicle_code:vehicle.id,driver_code:"",rider_code:"",helper_code:"",rows:batch,route:{source:"GEOGRAPHIC_FALLBACK",route_mode:"GEOGRAPHIC_TOWNSHIP_BLOCK_EMERGENCY",fallback:true}};
  });
}

export function assignCrews(plans: VanPlan[], drivers: Resource[], riders: Resource[], helpers: Resource[], normalize: (town:string)=>string): VanPlan[] {
  const choose=(pool:Resource[],rows:Stop[],blocked:Set<string>)=>{
    const key=(s:string)=>normalize(s).toLowerCase().replace(/township|[^a-z0-9]/g,"");
    const score=(p:Resource)=>rows.reduce((n,r)=>{
      const town=key(r.township), zones=String(p.zone||"").split(",").map(key);
      return n+(zones.includes(town)?1:0);
    },0);
    pool.sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id));
    const index=pool.findIndex(x=>!blocked.has(x.id));
    return index>=0?pool.splice(index,1)[0]?.id||"":"";
  };
  const ds=drivers.filter(d=>d.available!==false), rs=riders.filter(r=>r.available!==false), hs=helpers.filter(h=>h.available!==false);
  const used=new Set<string>();
  return plans.map(p=>{
    const driver_code=choose(ds,p.rows,used); if(driver_code) used.add(driver_code);
    const rider_code=choose(rs,p.rows,used); if(rider_code) used.add(rider_code);
    const helper_code=choose(hs,p.rows,used); if(helper_code) used.add(helper_code);
    return {...p,driver_code,rider_code,helper_code};
  });
}
