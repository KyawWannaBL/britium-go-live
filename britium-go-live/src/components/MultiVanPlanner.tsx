import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { assignCrews, PRACTICAL_MAX_PARCELS_PER_VAN, type Resource, type Stop, type VanPlan } from "@/lib/multiVanPlanner";
import { convertMyanmarTownshipToEnglish } from "@/lib/myanmarAddressConverter";
import FullVanRouteMap from "@/components/FullVanRouteMap";

const field: React.CSSProperties={padding:10,borderRadius:8,color:"#102b45",background:"white",border:"1px solid #9cc2d9"};
const button: React.CSSProperties={...field,background:"#f6b84b",fontWeight:800,cursor:"pointer"};
const secondary: React.CSSProperties={...field,background:"#173a55",color:"white",fontWeight:700,cursor:"pointer"};

function routeLabel(plan:VanPlan){
 const source=String(plan.route?.source||"");
 if(source==="OPERATOR_EDITED") return `Operator-edited route · based on ${String(plan.route?.base_source||"existing road plan").replaceAll("_"," ")}`;
 if(source==="GOOGLE_ROUTES") return "Google Routes road optimized";
 if(source==="MAPBOX_FALLBACK") return "Mapbox road optimized fallback";
 return "Road route unavailable";
}
function coord(row:any){const lat=Number(row?.latitude),lng=Number(row?.longitude);return Number.isFinite(lat)&&Number.isFinite(lng)?`${lat},${lng}`:"";}
function googleMapSegments(origin:any, rows:Stop[]){
 const output:{label:string;url:string}[]=[]; const valid=rows.filter(r=>coord(r)); if(!valid.length||!coord(origin))return output;
 let start=coord(origin); for(let i=0;i<valid.length;i+=8){const chunk=valid.slice(i,i+8);const destination=coord(chunk[chunk.length-1]);const waypoints=chunk.slice(0,-1).map(coord).filter(Boolean).join("|");const q=new URLSearchParams({api:"1",origin:start,destination,travelmode:"driving"});if(waypoints)q.set("waypoints",waypoints);output.push({label:`Open Google Maps ${Math.floor(i/8)+1}`,url:`https://www.google.com/maps/dir/?${q.toString()}`});start=destination;} return output;
}

export default function MultiVanPlanner({rows,region,onSaved}:{rows:Stop[];region:string;onSaved:()=>void}) {
 const [context,setContext]=useState<any>(null),[plans,setPlans]=useState<VanPlan[]>([]);
 const [pickup,setPickup]=useState(""); const currentPickup=pickup||String(rows[0]?.pickup_id||"");
 const scopedRows=currentPickup==="*"?rows:rows.filter(r=>String(r.pickup_id||"")===currentPickup);
 const [count,setCount]=useState(""),[reason,setReason]=useState(""),[approved,setApproved]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""); const request=useRef<{body:string;id:string}|null>(null);
 useEffect(()=>{setPlans([]);setApproved(false);setReason("");setContext(null);let alive=true;supabase.rpc("be_multi_van_context").then(({data,error})=>{if(alive){if(error)setMessage(error.message);else setContext(data);}});return()=>{alive=false};},[region,rows]);
 const available=(items:any[],key:string):Resource[]=>(items||[]).map(x=>({...x,available:!(context?.busy||[]).some((b:any)=>[b.driver_code,b.rider_code,b.helper_code,b[key]].filter(Boolean).includes(x.id))}));
 const vehicles=available((context?.vehicles||[]).filter((v:any)=>v.operation_type==="DELIVERY"),"vehicle_code");
 const branch=region==="YANGON"?"YGN":region==="MANDALAY"?"MDY":"NPT";
 const drivers=available((context?.drivers||[]).filter((d:any)=>!d.branch_code||d.branch_code===branch),"driver_code");
 const riders=available((context?.riders||[]).filter((d:any)=>!d.branch_code||d.branch_code===branch),"rider_code");
 const helpers=available((context?.helpers||[]).filter((d:any)=>!d.branch_code||d.branch_code===branch),"helper_code");
 const origin=context?.route_origins?.[region];

 function reset(next:VanPlan[]=[]){setPlans(next);setApproved(false);setReason("");request.current=null;}
 function patchPlan(index:number, patch:Partial<VanPlan>){reset(plans.map((p,j)=>j===index?{...p,...patch}:p));}

 async function roadSession(){const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw new Error("Authenticated Wayplan session is required for road planning.");return session.access_token;}

 async function optimizeOne(plan:VanPlan):Promise<VanPlan>{
   if(!origin) throw new Error(`${region} branch route origin is unavailable.`);
   const token=await roadSession();
   const response=await fetch("/api/wayplan-route",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({origin,stops:plan.rows})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result?.ok) throw new Error(result?.diagnostics?.join(" | ")||result?.error||`Road route service failed (${response.status}).`);
   if(!["GOOGLE_ROUTES","MAPBOX_FALLBACK"].includes(String(result.source||""))) throw new Error("Automatic Wayplan rejected: a real road-routing source was not available.");
   const byId=new Map(plan.rows.map(row=>[row.delivery_way_id,row]));
   const ordered=(result.ordered_stops||[]).map((row:any)=>byId.get(String(row.delivery_way_id))).filter(Boolean) as Stop[];
   if(ordered.length!==plan.rows.length) throw new Error("Road optimizer did not return every selected parcel exactly once.");
   return {...plan,rows:ordered,route:{...(plan.route||{}),source:result.source,route_mode:result.route_mode,distance_m:Number(result.distance_m||0),duration_s:Number(result.duration_s||0),request_count:Number(result.request_count||0),fallback:Boolean(result.fallback),warning:result.warning,optimized_at:result.optimized_at}};
 }

 async function optimizePlans(next:VanPlan[],note?:string){
   setBusy(true);setMessage(note||"Calculating actual road routes for the affected vans…");
   try{const optimized=await Promise.all(next.map(optimizeOne));reset(optimized);const sources=Array.from(new Set(optimized.map(p=>routeLabel(p))));setMessage(`Review ${optimized.length} strategic van plan(s). Road source: ${sources.join(" / ")}. Warehouse loading is the exact reverse of each reviewed road route.`);}
   catch(e:any){setPlans([]);setMessage(`No automatic Wayplan was generated. ${e?.message||"Road routing is unavailable."}`);}
   finally{setBusy(false);}
 }

 async function reoptimizeOne(index:number){setBusy(true);setMessage(`Re-optimizing Van ${index+1} on the road network…`);try{const optimized=await optimizeOne(plans[index]);reset(plans.map((p,j)=>j===index?optimized:p));setMessage(`Van ${index+1}: ${routeLabel(optimized)}. Review the whole route map before saving.`);}catch(e:any){setMessage(`Van ${index+1} was not replaced: ${e?.message||"road optimization unavailable"}`);}finally{setBusy(false);}}
 async function updateStopPin(index:number,deliveryWayId:string,latitude:number,longitude:number){setBusy(true);setMessage(`Location updated. Recalculating Van ${index+1} road route…`);try{const changed:VanPlan={...plans[index],rows:plans[index].rows.map(row=>row.delivery_way_id===deliveryWayId?{...row,latitude,longitude}:row)};const optimized=await optimizeOne(changed);reset(plans.map((p,j)=>j===index?optimized:p));setMessage(`Van ${index+1}: corrected pin saved and road route recalculated as ${routeLabel(optimized)}.`);}catch(e:any){setMessage(e?.message||"Location saved, but road route could not be recalculated. Do not create this Wayplan until re-optimization succeeds.");throw e;}finally{setBusy(false);}}
 function moveStop(index:number,from:number,to:number){if(to<0||to>=plans[index].rows.length||from===to)return;const rs=[...plans[index].rows];const[item]=rs.splice(from,1);rs.splice(to,0,item);const previous=plans[index].route?.source||"";patchPlan(index,{rows:rs,route:{...(plans[index].route||{}),source:"OPERATOR_EDITED",base_source:previous==="OPERATOR_EDITED"?plans[index].route?.base_source:previous,manual:true,fallback:plans[index].route?.fallback,route_mode:"OPERATOR_EDITED_SEQUENCE",warning:"Sequence manually edited by an authorized operator. Re-optimize to refresh road time/distance. Warehouse LIFO follows the reviewed sequence."}});}

 async function strategicAllocation():Promise<VanPlan[]>{
   if(!origin)throw new Error(`${region} branch route origin is unavailable.`);
   const usableVehicles=vehicles.filter(v=>v.available!==false); if(!usableVehicles.length)throw new Error("No delivery van is currently available.");
   const automatic=Math.min(usableVehicles.length,Math.max(1,Math.ceil(scopedRows.length/PRACTICAL_MAX_PARCELS_PER_VAN)));
   const vanCount=count?Number(count):automatic;
   const token=await roadSession();
   const response=await fetch("/api/wayplan-zone-plan",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({origin,stops:scopedRows,van_count:vanCount})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result?.ok)throw new Error(result?.diagnostics?.join(" | ")||result?.error||`Strategic road clustering failed (${response.status}).`);
   if(!["GOOGLE_ROUTES","MAPBOX_FALLBACK"].includes(String(result.source||"")))throw new Error("Township clustering was rejected because no road-time matrix was available.");
   const byId=new Map(scopedRows.map(row=>[row.delivery_way_id,row])); const unused=[...usableVehicles];
   return (result.vans||[]).map((cluster:any,index:number)=>{
     const clusterRows=(cluster.delivery_way_ids||[]).map((id:string)=>byId.get(String(id))).filter(Boolean) as Stop[];
     if(clusterRows.length!==Number(cluster.target_parcels||clusterRows.length))throw new Error(`Van ${index+1} road cluster is incomplete.`);
     const weight=clusterRows.reduce((sum,row)=>sum+Number(row.parcel_weight_kg||0),0);
     const vehicleIndex=unused.findIndex(v=>!Number(v.capacity_kg)||Number(v.capacity_kg)>=weight); if(vehicleIndex<0)throw new Error(`No remaining delivery van can safely carry strategic cluster ${index+1}.`);
     const vehicle=unused.splice(vehicleIndex,1)[0];
     const townships=(cluster.townships||[]).map((x:any)=>`${x.township} (${x.parcel_count})`).join(", ");
     return {vehicle_code:vehicle.id,driver_code:"",rider_code:"",helper_code:"",crew_mode:"ROSTER",rows:clusterRows,route:{source:result.source,route_mode:result.route_mode,fallback:result.source!=="GOOGLE_ROUTES",warning:`Strategic township allocation by road travel time: ${townships}. Per-stop road sequence will be optimized next.`,optimized_at:result.generated_at}} as VanPlan;
   });
 }

 async function preview(){
   setBusy(true);setMessage("Stage 1/2: grouping nearby townships into practical delivery zones using road travel time…");
   try{
     if(!origin)throw new Error(`${region} branch route origin is unavailable.`);if(!riders.length)throw new Error("No active authenticated Rider is available for this branch. Use Emergency substitution only when approved and unavoidable.");
     const strategic=await strategicAllocation();
     const crewed=assignCrews(strategic,drivers,riders,helpers,convertMyanmarTownshipToEnglish);if(crewed.some(p=>!p.driver_code||!p.rider_code))throw new Error("An active Driver and Rider are required for normal operation.");
     setBusy(false);await optimizePlans(crewed,"Stage 2/2: optimizing every delivery stop on the actual road network…");
   }catch(e:any){setPlans([]);setMessage(`No automatic Wayplan was generated. ${e?.message||"Strategic road planning failed."}`);setBusy(false);}
 }
 function crewName(list:Resource[],code:string){return list.find(x=>x.id===code)?.name||"";}

 async function save(){
   if(plans.some(p=>!["GOOGLE_ROUTES","MAPBOX_FALLBACK","OPERATOR_EDITED"].includes(String(p.route?.source||"")))){setMessage("Cannot create Wayplans: every van must have a reviewed road-based route.");return;}
   setBusy(true);setMessage("");
   const payload={region_code:region,plans:plans.map(p=>({vehicle_code:p.vehicle_code,crew_mode:p.crew_mode||"ROSTER",driver_code:p.crew_mode==="EMERGENCY_MANUAL"?null:p.driver_code,rider_code:p.crew_mode==="EMERGENCY_MANUAL"?null:p.rider_code,helper_code:p.crew_mode==="EMERGENCY_MANUAL"?null:p.helper_code,driver_name:p.crew_mode==="EMERGENCY_MANUAL"?p.manual_driver_name:crewName(drivers,p.driver_code),rider_name:p.crew_mode==="EMERGENCY_MANUAL"?p.manual_rider_name:crewName(riders,p.rider_code),helper_name:p.crew_mode==="EMERGENCY_MANUAL"?p.manual_helper_name:crewName(helpers,p.helper_code),emergency_substitution_reason:p.emergency_substitution_reason||null,delivery_way_ids:p.rows.map(r=>r.delivery_way_id),route:{source:p.route?.source||null,base_source:p.route?.base_source||null,route_mode:p.route?.route_mode||null,distance_m:p.route?.distance_m||0,duration_s:p.route?.duration_s||0,request_count:p.route?.request_count||0,fallback:Boolean(p.route?.fallback),manual:Boolean(p.route?.manual),warning:p.route?.warning||null,optimized_at:p.route?.optimized_at||new Date().toISOString()}})),approve_below_minimum:approved,below_minimum_reason:reason};
   const body=JSON.stringify(payload);if(request.current?.body!==body)request.current={body,id:crypto.randomUUID()};
   try{const{data,error}=await supabase.rpc("be_generate_multi_van_v2",{p_payload:{...payload,request_id:request.current!.id}});if(error)throw error;if(!data?.ok)throw new Error(data?.error||"Wayplan creation failed.");setMessage(`${data.wayplans.length} road-reviewed Wayplans created for ${data.parcel_count} parcels with immutable generated route versions and warehouse LIFO snapshots.`);setPlans([]);request.current=null;onSaved();}catch(e:any){setMessage(e.message+" Retry uses the same request to avoid duplicate Wayplans.");}finally{setBusy(false);}
 }
 const short=plans.filter(p=>p.rows.length<50),oversized=plans.filter(p=>p.rows.length>PRACTICAL_MAX_PARCELS_PER_VAN);
 const invalidCrew=plans.some(p=>p.crew_mode==="EMERGENCY_MANUAL"?!p.manual_driver_name?.trim()||!p.manual_rider_name?.trim()||String(p.emergency_substitution_reason||"").trim().length<5:!p.driver_code||!p.rider_code);
 return <section style={{padding:16,border:"1px solid #1a3a5c",borderRadius:16,background:"#0b2236",display:"grid",gap:12}}>
   <h2 style={{margin:0}}>Strategic road-based delivery van planning</h2>
   <p style={{margin:0}}>Plan {scopedRows.length} ready parcels in two stages: <strong>group nearby townships by real road travel time</strong>, then optimize every stop inside each van on the road network. Normal operating band: <strong>50–{PRACTICAL_MAX_PARCELS_PER_VAN} parcels per delivery van</strong>. Pickup/highway vehicles 7R-1473 and 1H-6033 remain reserved.</p>
   <p style={{margin:0}}>Straight-line/geographic fallback is no longer accepted for automatic Wayplan creation. Google Routes is primary; a road-matrix fallback may be used when Google is unavailable. Each van must be reviewed on the whole-route map before creation.</p>
   <div style={{display:"flex",gap:12,flexWrap:"wrap"}}><label>Pickup batch <select style={field} value={currentPickup} disabled={busy} onChange={e=>{setPickup(e.target.value);reset();}}><option value="*">All ready pickups</option>{Array.from(new Set(rows.map(r=>String(r.pickup_id||"")))).map(id=><option key={id} value={id}>{id}</option>)}</select></label><label>Vans to use <select style={field} value={count} disabled={busy} onChange={e=>{setCount(e.target.value);reset();}}><option value="">Automatic — practical van count</option>{vehicles.filter(v=>v.available).map((_,i)=><option key={i} value={i+1}>{i+1}</option>)}</select></label><button style={button} disabled={busy||!context||!scopedRows.length||!origin} onClick={preview}>{busy?"Planning road zones…":"Generate strategic road plan"}</button></div>
   {message&&<p role="status" style={{margin:0}}>{message}</p>}
   {plans.map((plan,i)=>{const delivery=plan.rows,lifo=[...delivery].reverse(),maps=googleMapSegments(origin,delivery),emergency=plan.crew_mode==="EMERGENCY_MANUAL",vehicleName=vehicles.find(v=>v.id===plan.vehicle_code)?.name||plan.vehicle_code||`Van ${i+1}`;return <section key={i} style={{padding:12,border:"1px solid #38566b",borderRadius:10}}>
       <strong>Van {i+1}: {delivery.length} parcels · {Array.from(new Set(delivery.map(r=>r.township))).join(", ")}</strong><div style={{marginTop:6,fontWeight:800}}>{routeLabel(plan)}{plan.route?.duration_s?` · ${Math.round(Number(plan.route.duration_s)/60)} min`:""}{plan.route?.distance_m?` · ${(Number(plan.route.distance_m)/1000).toFixed(1)} km`:""}</div>{plan.route?.warning&&<div style={{marginTop:5}}>{plan.route.warning}</div>}
       <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}><button style={secondary} disabled={busy} onClick={()=>void reoptimizeOne(i)}>Re-optimize road route</button>{maps.map(m=><a key={m.label} href={m.url} target="_blank" rel="noreferrer" style={{...secondary,textDecoration:"none"}}>{m.label}</a>)}</div>
       <FullVanRouteMap origin={origin} plan={plan} vanLabel={`Van ${i+1} · ${vehicleName}`} allowLocationEdit onStopPinUpdated={(deliveryWayId,latitude,longitude)=>updateStopPin(i,deliveryWayId,latitude,longitude)} />
       <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:10}}><label>Vehicle <select style={field} disabled={busy} value={plan.vehicle_code} onChange={e=>patchPlan(i,{vehicle_code:e.target.value})}><option value="">Choose</option>{vehicles.filter(x=>x.available||x.id===plan.vehicle_code).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Crew mode <select style={field} disabled={busy} value={plan.crew_mode||"ROSTER"} onChange={e=>patchPlan(i,{crew_mode:e.target.value as any})}><option value="ROSTER">Normal roster</option><option value="EMERGENCY_MANUAL">Emergency substitution</option></select></label>{!emergency&&<><label>Driver <select style={field} disabled={busy} value={plan.driver_code} onChange={e=>patchPlan(i,{driver_code:e.target.value})}><option value="">Choose name</option>{drivers.filter(x=>x.available||x.id===plan.driver_code).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Rider <select style={field} disabled={busy} value={plan.rider_code} onChange={e=>patchPlan(i,{rider_code:e.target.value})}><option value="">Choose name</option>{riders.filter(x=>x.available||x.id===plan.rider_code).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Helper (optional) <select style={field} disabled={busy} value={plan.helper_code} onChange={e=>patchPlan(i,{helper_code:e.target.value})}><option value="">No helper</option>{helpers.filter(x=>x.available||x.id===plan.helper_code).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label></>}</div>
       {emergency&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(180px,1fr))",gap:8,marginTop:10,padding:10,border:"1px solid #8f5a2a",borderRadius:8}}><input style={field} disabled={busy} placeholder="Emergency Driver name" value={plan.manual_driver_name||""} onChange={e=>patchPlan(i,{manual_driver_name:e.target.value})}/><input style={field} disabled={busy} placeholder="Emergency Rider name" value={plan.manual_rider_name||""} onChange={e=>patchPlan(i,{manual_rider_name:e.target.value})}/><input style={field} disabled={busy} placeholder="Emergency Helper name (optional)" value={plan.manual_helper_name||""} onChange={e=>patchPlan(i,{manual_helper_name:e.target.value})}/><input style={{...field,gridColumn:"1 / -1"}} disabled={busy} placeholder="Mandatory reason for emergency substitution" value={plan.emergency_substitution_reason||""} onChange={e=>patchPlan(i,{emergency_substitution_reason:e.target.value})}/><div style={{gridColumn:"1 / -1",fontSize:12}}>Emergency manual crew is audit-recorded. A manually substituted Rider has no Rider-App login mapping unless separately provisioned; use only as an approved operational exception.</div></div>}
       <details style={{marginTop:10}} open><summary>Editable delivery sequence</summary><div style={{maxHeight:320,overflow:"auto"}}>{delivery.map((row,n)=><div key={row.delivery_way_id} style={{padding:5,display:"grid",gridTemplateColumns:"44px 1fr auto",gap:8,alignItems:"center"}}><strong>{n+1}.</strong><span>{String((row as any).waybill_no||row.delivery_way_id)} · {row.township}</span><span style={{display:"flex",gap:4}}><button style={secondary} disabled={busy||n===0} onClick={()=>moveStop(i,n,n-1)}>↑</button><button style={secondary} disabled={busy||n===delivery.length-1} onClick={()=>moveStop(i,n,n+1)}>↓</button></span></div>)}</div></details>
       <details style={{marginTop:10}}><summary>Warehouse LIFO loading list — load in this order</summary><div style={{maxHeight:280,overflow:"auto"}}>{lifo.map((row,n)=><div key={row.delivery_way_id} style={{padding:5}}><strong>LOAD {n+1}</strong> · {String((row as any).waybill_no||row.delivery_way_id)} · {row.township} · Delivery stop {delivery.length-n}</div>)}</div></details>
       <details style={{marginTop:10}}><summary>Move parcel to another van</summary><div style={{maxHeight:280,overflow:"auto"}}>{delivery.map(row=><div key={row.delivery_way_id} style={{display:"flex",justifyContent:"space-between",gap:10,padding:5}}><span>{String((row as any).waybill_no||row.delivery_way_id)} · {row.township}</span><select style={field} disabled={busy} value={i} onChange={e=>{const to=Number(e.target.value);if(to===i)return;const next=plans.map((p,j)=>({...p,rows:j===i?p.rows.filter(r=>r.delivery_way_id!==row.delivery_way_id):j===to?[...p.rows,row]:p.rows}));void optimizePlans(next,"Parcel moved. Recalculating affected road routes and LIFO lists…");}}>{plans.map((_,j)=><option value={j} key={j}>Van {j+1}</option>)}</select></div>)}</div></details>
     </section>})}
   {oversized.length>0&&<strong>{oversized.length} van(s) exceed the practical {PRACTICAL_MAX_PARCELS_PER_VAN}-parcel maximum. Use more vans before creating Wayplans.</strong>}
   {short.length>0&&<div style={{display:"grid",gap:8}}><strong>{short.length} van(s) below 50 parcels. Only one exception is allowed in this reviewed planning batch.</strong><input style={field} disabled={busy} placeholder="Reason for the below-minimum van" value={reason} onChange={e=>{setReason(e.target.value);setApproved(false);}}/><label><input type="checkbox" disabled={busy||short.length!==1||reason.trim().length<5} checked={approved} onChange={e=>setApproved(e.target.checked)}/> I approve this one van below 50 parcels. Record my account, van, parcel count and reason.</label></div>}
   {plans.length>0&&<button style={button} disabled={busy||invalidCrew||plans.some(p=>!p.rows.length)||oversized.length>0||short.length>1||(short.length===1&&!approved)} onClick={save}>{busy?"Creating Wayplans…":"Create reviewed road Wayplans + immutable routes + LIFO"}</button>}
 </section>;
}
