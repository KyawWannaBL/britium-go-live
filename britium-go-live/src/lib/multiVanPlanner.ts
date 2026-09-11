export type Stop = { delivery_way_id: string; township: string; latitude?: number; longitude?: number; parcel_weight_kg?: number; [key: string]: unknown };
export type Resource = { id: string; name: string; zone?: string; capacity_kg?: number; available?: boolean; [key: string]: unknown };
export type VanPlan = { vehicle_code: string; driver_code: string; helper_code: string; rows: Stop[] };

/** Geographic sweep keeps township blocks together before balancing contiguous routes.
 * It uses accepted coordinates supplied by the server, never fabricated map pins.
 */
export function allocateVans(rows: Stop[], vehicles: Resource[], requested?: number): VanPlan[] {
  if (!rows.length) throw new Error("No ready parcels selected.");
  if (new Set(rows.map(r => r.delivery_way_id)).size !== rows.length) throw new Error("Duplicate parcel selection.");
  const available = vehicles.filter(v => v.available !== false);
  if (!available.length) throw new Error("No delivery van is available.");
  const count = requested ?? Math.min(available.length, Math.max(1, Math.floor(rows.length / 50)));
  if (!Number.isInteger(count) || count < 1 || count > Math.min(7, available.length, rows.length)) throw new Error("Choose an available van count.");
  if (rows.length < (count - 1) * 50 + 1) throw new Error("This would leave more than one van below 50 parcels.");
  const towns = new Map<string, Stop[]>();
  for (const row of rows) {
    if (!row.township) throw new Error("A selected parcel has no township.");
    if (!Number.isFinite(Number(row.latitude)) || !Number.isFinite(Number(row.longitude)) || row.latitude == null || row.longitude == null) throw new Error("A selected parcel needs a validated location.");
    const group = towns.get(row.township) ?? []; group.push(row); towns.set(row.township, group);
  }
  const centroid = (rs: Stop[]) => [rs.reduce((s,r)=>s+Number(r.latitude),0)/rs.length,rs.reduce((s,r)=>s+Number(r.longitude),0)/rs.length];
  const hub = centroid(rows);
  const blocks = [...towns.entries()].sort((a,b)=>{
    const x=centroid(a[1]), y=centroid(b[1]);
    return Math.atan2(x[0]-hub[0],x[1]-hub[1])-Math.atan2(y[0]-hub[0],y[1]-hub[1]) || a[0].localeCompare(b[0]);
  });
  const ordered = blocks.flatMap(([,rs]) => rs.sort((a,b)=>Number(a.latitude)-Number(b.latitude)||Number(a.longitude)-Number(b.longitude)||a.delivery_way_id.localeCompare(b.delivery_way_id)));
  const sizes = Array.from({length:count},()=>Math.floor(rows.length/count));
  for(let i=0;i<rows.length%count;i++) sizes[i]++;
  // Concentrate any unavoidable shortfall into exactly one van.
  for(let i=0;i<count-1;i++) if(sizes[i]<50) { const needed=50-sizes[i]; sizes[i]=50; sizes[count-1]-=needed; }
  const unused=[...available]; let offset=0;
  return sizes.map(size=>{
    const batch=ordered.slice(offset,offset+=size);
    const weight=batch.reduce((s,r)=>s+Number(r.parcel_weight_kg||0),0);
    const index=unused.findIndex(v=>!Number(v.capacity_kg)||Number(v.capacity_kg)>=weight);
    if(index<0) throw new Error("Known van weight capacities are insufficient. Adjust the selected parcels or van count.");
    const vehicle=unused.splice(index,1)[0];
    return {vehicle_code:vehicle.id,driver_code:"",helper_code:"",rows:batch};
  });
}

export function assignCrews(plans: VanPlan[], drivers: Resource[], helpers: Resource[], normalize: (town:string)=>string): VanPlan[] {
  const choose=(pool:Resource[],rows:Stop[])=>{
    const key=(s:string)=>normalize(s).toLowerCase().replace(/township|[^a-z0-9]/g,"");
    const score=(p:Resource)=>rows.reduce((n,r)=>{
      const town=key(r.township), zones=String(p.zone||"").split(",").map(key);
      return n+(zones.includes(town)?1:0);
    },0);
    pool.sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id));
    return pool.shift()?.id||"";
  };
  const ds=drivers.filter(d=>d.available!==false), hs=helpers.filter(h=>h.available!==false);
  return plans.map(p=>({...p,driver_code:choose(ds,p.rows),helper_code:choose(hs,p.rows)}));
}
