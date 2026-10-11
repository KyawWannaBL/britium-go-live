// Server-side only. Counters fail closed; neither caller-supplied usage nor
// a process-local counter can authorize a billable request.
export async function budgetRpc(name, payload) {
  const base=String(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'').replace(/\/+$/,'');
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;
  if(!base||!key) throw new Error('MAPBOX_BUDGET_STORE_UNAVAILABLE');
  const res=await fetch(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(5000)});
  if(!res.ok) throw new Error('MAPBOX_BUDGET_STORE_UNAVAILABLE');
  return res.json();
}

export async function reserveMapbox(service, units) {
  const result=await budgetRpc('be_mapbox_reserve_v1',{p_service:service,p_units:units});
  if(result?.allowed!==true) throw new Error(`MAPBOX_BUDGET_${result?.reason||'DENIED'}`);
  return result;
}

export function estimatedMatrix(points) {
  const radians=n=>n*Math.PI/180;
  const distances=points.map(a=>points.map(b=>{
    const dl=radians(b.latitude-a.latitude),dg=radians(b.longitude-a.longitude);
    const h=Math.min(1,Math.max(0,Math.sin(dl/2)**2+Math.cos(radians(a.latitude))*Math.cos(radians(b.latitude))*Math.sin(dg/2)**2));
    return Math.round(6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))*1.35);
  }));
  return {distances,durations:distances.map(row=>row.map(m=>Math.round(m/(25000/3600))))};
}
