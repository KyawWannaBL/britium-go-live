import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { allocateVans, assignCrews, PRACTICAL_MAX_PARCELS_PER_VAN, type Resource, type Stop, type VanPlan } from "@/lib/multiVanPlanner";
import { convertMyanmarTownshipToEnglish } from "@/lib/myanmarAddressConverter";

const field: React.CSSProperties={padding:10,borderRadius:8,color:"#102b45",background:"white",border:"1px solid #9cc2d9"};
const button: React.CSSProperties={...field,background:"#f6b84b",fontWeight:800,cursor:"pointer"};

function routeLabel(plan:VanPlan){
 const source=String(plan.route?.source||"GEOGRAPHIC_FALLBACK");
 if(source==="GOOGLE_ROUTES") return "Google Routes road optimized";
 if(source==="MAPBOX_FALLBACK") return "Mapbox road fallback";
 return "Emergency geographic fallback — NOT Google optimized";
}

export default function MultiVanPlanner({rows,region,onSaved}:{rows:Stop[];region:string;onSaved:()=>void}) {
 const [context,setContext]=useState<any>(null),[plans,setPlans]=useState<VanPlan[]>([]);
 const [pickup,setPickup]=useState("");
 const currentPickup=pickup||String(rows[0]?.pickup_id||"");
 const scopedRows=currentPickup==="*"?rows:rows.filter(r=>String(r.pickup_id||"")===currentPickup);
 const [count,setCount]=useState(""),[reason,setReason]=useState(""),[approved,setApproved]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const request=useRef<{body:string;id:string}|null>(null);
 useEffect(()=>{setPlans([]);setApproved(false);setReason("");setContext(null);
   let alive=true;
   supabase.rpc("be_multi_van_context").then(({data,error})=>{if(alive){if(error)setMessage(error.message);else setContext(data);}});
   return()=>{alive=false};
 },[region,rows]);
 const available=(items:any[],key:string):Resource[]=>(items||[]).map(x=>({...x,available:!(context?.busy||[]).some((b:any)=>[b.driver_code,b.rider_code,b.helper_code,b[key]].filter(Boolean).includes(x.id))}));
 const vehicles=available((context?.vehicles||[]).filter((v:any)=>v.operation_type==="DELIVERY"),"vehicle_code");
 const branch=region==="YANGON"?"YGN":region==="MANDALAY"?"MDY":"NPT";
 const drivers=available((context?.drivers||[]).filter((d:any)=>!d.branch_code||d.branch_code===branch),"driver_code");
 const riders=available((context?.riders||[]).filter((d:any)=>!d.branch_code||d.branch_code===branch),"rider_code");
 const helpers=available((context?.helpers||[]).filter((d:any)=>!d.branch_code||d.branch_code===branch),"helper_code");
 const origin=context?.route_origins?.[region];

 function reset(next:VanPlan[]=[]){setPlans(next);setApproved(false);setReason("");request.current=null;}

 async function optimizeOne(plan:VanPlan):Promise<VanPlan>{
   if(!origin) throw new Error(`${region} branch route origin is unavailable.`);
   const {data:{session}}=await supabase.auth.getSession();
   if(!session?.access_token) throw new Error("Authenticated Wayplan session is required for road optimization.");
   try{
     const response=await fetch("/api/wayplan-route",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({origin,stops:plan.rows})});
     const result=await response.json().catch(()=>({}));
     if(!response.ok||!result?.ok) throw new Error(result?.error||`Route service failed (${response.status}).`);
     const byId=new Map(plan.rows.map(row=>[row.delivery_way_id,row]));
     const ordered=(result.ordered_stops||[]).map((row:any)=>byId.get(String(row.delivery_way_id))).filter(Boolean) as Stop[];
     if(ordered.length!==plan.rows.length) throw new Error("Optimizer did not return every selected parcel exactly once.");
     return {...plan,rows:ordered,route:{source:result.source,route_mode:result.route_mode,distance_m:Number(result.distance_m||0),duration_s:Number(result.duration_s||0),request_count:Number(result.request_count||0),fallback:Boolean(result.fallback),warning:result.warning,optimized_at:result.optimized_at}};
   }catch(error:any){
     // allocateVans already carries the explicitly-labelled geographic emergency sequence.
     return {...plan,route:{...(plan.route||{}),source:"GEOGRAPHIC_FALLBACK",route_mode:"GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY",fallback:true,warning:`Road optimizer unavailable: ${error?.message||error}`}};
   }
 }

 async function optimizePlans(next:VanPlan[],note?:string){
   setBusy(true);setMessage(note||"Calculating road routes for the affected vans…");
   try{
     const optimized=await Promise.all(next.map(optimizeOne));
     reset(optimized);
     const sources=Array.from(new Set(optimized.map(p=>routeLabel(p))));
     setMessage(`Review ${optimized.length} van plan(s). Route source: ${sources.join(" / ")}. Warehouse loading is the exact reverse of each generated route.`);
   }catch(e:any){setMessage(e?.message||"Could not optimize Wayplans.");}
   finally{setBusy(false);}
 }

 async function preview(){
   try {
     if(!origin) throw new Error(`${region} branch route origin is unavailable.`);
     if(!riders.length) throw new Error("No active authenticated Rider is available for this branch.");
     const raw=allocateVans(scopedRows,vehicles,count?Number(count):undefined,origin);
     const crewed=assignCrews(raw,drivers,riders,helpers,convertMyanmarTownshipToEnglish);
     if(crewed.some(p=>!p.driver_code||!p.rider_code)) throw new Error("An active Driver and Rider are required for every delivery van.");
     await optimizePlans(crewed,"Calculating Google road-time/distance routes…");
   } catch(e:any){setMessage(e.message);}
 }

 async function save(){
   setBusy(true);setMessage("");
   const payload={region_code:region,plans:plans.map(p=>({vehicle_code:p.vehicle_code,driver_code:p.driver_code,rider_code:p.rider_code,helper_code:p.helper_code,delivery_way_ids:p.rows.map(r=>r.delivery_way_id),route:{source:p.route?.source||"GEOGRAPHIC_FALLBACK",route_mode:p.route?.route_mode||"GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY",distance_m:p.route?.distance_m||0,duration_s:p.route?.duration_s||0,request_count:p.route?.request_count||0,fallback:Boolean(p.route?.fallback),warning:p.route?.warning||null,optimized_at:p.route?.optimized_at||new Date().toISOString()}})),approve_below_minimum:approved,below_minimum_reason:reason};
   const body=JSON.stringify(payload);
   if(request.current?.body!==body) request.current={body,id:crypto.randomUUID()};
   try {
     const {data,error}=await supabase.rpc("be_generate_multi_van",{p_payload:{...payload,request_id:request.current!.id}});
     if(error)throw error;
     if(!data?.ok)throw new Error(data?.error||"Wayplan creation failed.");
     setMessage(`${data.wayplans.length} Wayplans created for ${data.parcel_count} parcels with immutable generated route versions and warehouse LIFO snapshots.`);
     setPlans([]);request.current=null;onSaved();
   }catch(e:any){setMessage(e.message+" Retry uses the same request to avoid duplicate Wayplans.");}
   finally{setBusy(false);}
 }
 const short=plans.filter(p=>p.rows.length<50);
 const oversized=plans.filter(p=>p.rows.length>PRACTICAL_MAX_PARCELS_PER_VAN);
 return <section style={{padding:16,border:"1px solid #1a3a5c",borderRadius:16,background:"#0b2236",display:"grid",gap:12}}>
   <h2 style={{margin:0}}>Automatic delivery van planning</h2>
   <p style={{margin:0}}>Plan {scopedRows.length} ready parcels by location. Normal operating band: <strong>50–{PRACTICAL_MAX_PARCELS_PER_VAN} parcels per delivery van</strong>. Pickup/highway vehicles 7R-1473 and 1H-6033 remain reserved.</p>
   <p style={{margin:0}}>Google Routes road distance/time is primary. Mapbox is a labelled fallback. Geographic nearest-neighbour is emergency fallback only and is never shown as Google optimized. Warehouse loading is always generated as the exact reverse (LIFO) of the pre-dispatch route.</p>
   <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
     <label>Pickup batch <select style={field} value={currentPickup} disabled={busy} onChange={e=>{setPickup(e.target.value);reset();}}><option value="*">All ready pickups</option>{Array.from(new Set(rows.map(r=>String(r.pickup_id||"")))).map(id=><option key={id} value={id}>{id}</option>)}</select></label>
     <label>Vans to use <select style={field} value={count} disabled={busy} onChange={e=>{setCount(e.target.value);reset();}}>
       <option value="">Automatic — practical van count</option>{vehicles.filter(v=>v.available).map((_,i)=><option key={i} value={i+1}>{i+1}</option>)}
     </select></label>
     <button style={button} disabled={busy||!context||!scopedRows.length||!origin} onClick={preview}>Preview road-optimized Wayplans</button>
   </div>
   {message&&<p role="status" style={{margin:0}}>{message}</p>}
   {plans.map((plan,i)=>{
     const delivery=plan.rows; const lifo=[...delivery].reverse();
     return <section key={i} style={{padding:12,border:"1px solid #38566b",borderRadius:10}}>
     <strong>Van {i+1}: {delivery.length} parcels · {Array.from(new Set(delivery.map(r=>r.township))).join(", ")}</strong>
     <div style={{marginTop:6,fontWeight:800}}>{routeLabel(plan)}{plan.route?.duration_s?` · ${Math.round(Number(plan.route.duration_s)/60)} min`:""}{plan.route?.distance_m?` · ${(Number(plan.route.distance_m)/1000).toFixed(1)} km`:""}</div>
     {plan.route?.warning&&<div style={{marginTop:5}}>{plan.route.warning}</div>}
     <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:10}}>
       {(["vehicle_code","driver_code","rider_code","helper_code"] as const).map((key,k)=>{
         const list=[vehicles,drivers,riders,helpers][k];
         return <label key={key}>{["Vehicle","Driver","Rider","Helper (optional)"][k]} <select style={field} disabled={busy} value={plan[key]} onChange={e=>{
           const next=plans.map((p,j)=>j===i?{...p,[key]:e.target.value}:p);
           reset(next);
         }}>
           <option value="">{key==="helper_code"?"No helper":"Choose"}</option>
           {list.filter(x=>x.available).map(x=><option key={x.id} value={x.id}>{x.name} ({x.id}) {x.zone||""}</option>)}
         </select></label>;
       })}
     </div>
     <details style={{marginTop:10}}><summary>Generated delivery sequence</summary>
       <div style={{maxHeight:280,overflow:"auto"}}>{delivery.map((row,n)=><div key={row.delivery_way_id} style={{padding:5}}><strong>{n+1}.</strong> {String(row.waybill_no||row.delivery_way_id)} · {row.township}</div>)}</div>
     </details>
     <details style={{marginTop:10}}><summary>Warehouse LIFO loading list — load in this order</summary>
       <div style={{maxHeight:280,overflow:"auto"}}>{lifo.map((row,n)=><div key={row.delivery_way_id} style={{padding:5}}><strong>LOAD {n+1}</strong> · {String(row.waybill_no||row.delivery_way_id)} · {row.township} · Delivery stop {delivery.length-n}</div>)}</div>
     </details>
     <details style={{marginTop:10}}><summary>Move parcel to another van</summary>
       <div style={{maxHeight:280,overflow:"auto"}}>
         {delivery.map(row=><div key={row.delivery_way_id} style={{display:"flex",justifyContent:"space-between",gap:10,padding:5}}>
           <span>{String(row.waybill_no||row.delivery_way_id)} · {row.township}</span>
           <select style={field} disabled={busy} value={i} onChange={e=>{
             const to=Number(e.target.value); if(to===i)return;
             const next=plans.map((p,j)=>({...p,rows:j===i?p.rows.filter(r=>r.delivery_way_id!==row.delivery_way_id):j===to?[...p.rows,row]:p.rows}));
             void optimizePlans(next,"Parcel moved. Recalculating both affected road routes and LIFO lists…");
           }}>{plans.map((_,j)=><option value={j} key={j}>Van {j+1}</option>)}</select>
         </div>)}
       </div>
     </details>
   </section>})}
   {oversized.length>0&&<strong>{oversized.length} van(s) exceed the practical {PRACTICAL_MAX_PARCELS_PER_VAN}-parcel maximum. Use more vans before creating Wayplans.</strong>}
   {short.length>0&&<div style={{display:"grid",gap:8}}>
     <strong>{short.length} van(s) below 50 parcels. Only one exception is allowed in this reviewed planning batch.</strong>
     <input style={field} disabled={busy} placeholder="Reason for the below-minimum van" value={reason} onChange={e=>{setReason(e.target.value);setApproved(false);}}/>
     <label><input type="checkbox" disabled={busy||short.length!==1||reason.trim().length<5} checked={approved} onChange={e=>setApproved(e.target.checked)}/> I approve this one van below 50 parcels. Record my account, van, parcel count and reason.</label>
   </div>}
   {plans.length>0&&<button style={button} disabled={busy||plans.some(p=>!p.driver_code||!p.rider_code||!p.rows.length)||oversized.length>0||short.length>1||(short.length===1&&!approved)} onClick={save}>{busy?"Creating Wayplans…":"Create reviewed Wayplans + immutable routes + LIFO"}</button>}
 </section>;
}
