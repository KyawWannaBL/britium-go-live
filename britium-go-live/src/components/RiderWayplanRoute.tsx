import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, MapPin, Navigation, Phone, RefreshCw, Route, SkipForward, Undo2 } from "lucide-react";
import { supabase } from "../integrations/supabase/client";

type AnyRow = Record<string, any>;

const panel: React.CSSProperties={border:"1px solid rgba(130,170,205,.26)",background:"rgba(11,34,54,.86)",borderRadius:18,padding:16};
const button=(kind:"gold"|"blue"|"red"|"plain"="plain"):React.CSSProperties=>({border:"1px solid rgba(130,170,205,.34)",borderRadius:12,padding:"10px 13px",fontWeight:800,cursor:"pointer",display:"inline-flex",gap:7,alignItems:"center",textDecoration:"none",background:kind==="gold"?"#f6b84b":kind==="blue"?"#4ea8de":kind==="red"?"rgba(248,113,113,.18)":"rgba(255,255,255,.06)",color:kind==="gold"?"#061524":"#eef7ff"});
const FINAL=new Set(["DELIVERED","RTO","RETURN_TO_WAREHOUSE","FAILED_DELIVERY","CANCELLED","SKIPPED","RESCHEDULED","CUSTOMER_UNAVAILABLE"]);

function wayplanIds(jobs:AnyRow[]){return Array.from(new Set(jobs.map(j=>String(j.wayplan_id||"").trim()).filter(Boolean)));}
function matches(job:AnyRow,deliveryWayId:string){return [job.delivery_way_id,job.tracking_no,job.waybill_no].some(v=>String(v||"")===deliveryWayId);}
function navigationUrl(stop:AnyRow){
 const lat=Number(stop?.latitude),lng=Number(stop?.longitude);
 const destination=Number.isFinite(lat)&&Number.isFinite(lng)?`${lat},${lng}`:String(stop?.address||"");
 return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}
function routeSource(snapshot:AnyRow){
 if(snapshot?.optimizer_source==="GOOGLE_ROUTES")return "Google Routes road optimized";
 if(snapshot?.optimizer_source==="MAPBOX_FALLBACK")return "Mapbox road fallback";
 return "Emergency geographic fallback — NOT Google optimized";
}

export default function RiderWayplanRoute({jobs,onOpenDelivery}:{jobs:AnyRow[];onOpenDelivery?:(job:AnyRow)=>void}){
 const ids=useMemo(()=>wayplanIds(jobs),[jobs]);
 const [wayplanId,setWayplanId]=useState("");
 const [snapshot,setSnapshot]=useState<AnyRow|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");

 useEffect(()=>{if(!wayplanId&&ids.length)setWayplanId(ids[0]);if(wayplanId&&!ids.includes(wayplanId))setWayplanId(ids[0]||"");},[ids.join("|"),wayplanId]);
 useEffect(()=>{if(wayplanId)void load();else setSnapshot(null);},[wayplanId]);

 async function load(){
   if(!wayplanId)return;
   setBusy(true);setError("");
   try{
     const {data,error}=await supabase.rpc("be_rider_wayplan_snapshot_v1",{p_wayplan_id:wayplanId});
     if(error)throw error;if(!data?.ok)throw new Error(data?.error||"Wayplan route is not ready.");setSnapshot(data);
   }catch(e:any){setError(e?.message||"Could not load Wayplan route.");}
   finally{setBusy(false);}
 }

 async function currentOrigin(stop:AnyRow){
   if(typeof navigator!=="undefined"&&navigator.geolocation){
     try{return await new Promise<{latitude:number;longitude:number}>((resolve,reject)=>navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude}),reject,{enableHighAccuracy:true,timeout:6000,maximumAge:30000}));}catch{}
   }
   const latitude=Number(stop?.latitude),longitude=Number(stop?.longitude);
   if(Number.isFinite(latitude)&&Number.isFinite(longitude))return {latitude,longitude};
   throw new Error("Current GPS or a validated stop coordinate is required to reroute remaining stops.");
 }

 async function reroute(nextSnapshot:AnyRow,reason:string,originStop:AnyRow){
   const remaining=(nextSnapshot?.stops||[]).filter((s:AnyRow)=>!FINAL.has(String(s.status||"").toUpperCase()));
   if(remaining.length<2){setSnapshot(nextSnapshot);return;}
   const origin=await currentOrigin(originStop);
   const {data:{session}}=await supabase.auth.getSession();
   if(!session?.access_token)throw new Error("Authenticated Rider session is required for rerouting.");
   const response=await fetch("/api/wayplan-route",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({origin,stops:remaining})});
   const route=await response.json().catch(()=>({}));
   if(!response.ok||!route?.ok)throw new Error(route?.error||`Route service failed (${response.status}).`);
   const {data:saved,error}=await supabase.rpc("be_wayplan_save_rider_reroute_v1",{p_wayplan_id:wayplanId,p_route:{...route,origin},p_reason:reason});
   if(error)throw error;if(!saved?.ok)throw new Error(saved?.error||"Rider reroute could not be saved.");
   await load();
   setMessage(`Remaining route recalculated as version ${saved.active_route_version}. Warehouse loading remains locked to version ${saved.warehouse_route_version}.`);
 }

 async function event(eventType:string,reason?:string){
   const stop=snapshot?.current_stop;if(!stop)return;
   setBusy(true);setError("");setMessage("");
   try{
     const {data,error}=await supabase.rpc("be_rider_stop_event_v1",{p_payload:{wayplan_id:wayplanId,delivery_way_id:stop.delivery_way_id,event_type:eventType,reason:reason||null}});
     if(error)throw error;if(!data?.ok)throw new Error(data?.error||"Stop action failed.");
     if(["CUSTOMER_UNAVAILABLE","RESCHEDULE","RTO","SKIP"].includes(eventType))await reroute(data,eventType,stop);else{setSnapshot(data);setMessage(`${eventType} recorded. Next eligible stop is now current.`);}
   }catch(e:any){setError(e?.message||"Could not update route stop.");}
   finally{setBusy(false);}
 }

 const stop=snapshot?.current_stop;
 const stopJob=stop?jobs.find(j=>matches(j,String(stop.delivery_way_id))):null;
 return <div style={{display:"grid",gap:12}}>
   <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}>
     <div><h2 style={{margin:"0 0 4px"}}>Current Stop → action → Next Stop</h2><div style={{opacity:.72}}>The active road sequence may change on the road. Warehouse LIFO history never changes.</div></div>
     <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
       {ids.length>1&&<select value={wayplanId} disabled={busy} onChange={e=>setWayplanId(e.target.value)} style={{padding:10,borderRadius:10}}>{ids.map(id=><option key={id}>{id}</option>)}</select>}
       <button onClick={()=>void load()} disabled={busy||!wayplanId} style={button("plain")}><RefreshCw size={16}/> Sync route</button>
     </div>
   </div>
   {error&&<div style={{...panel,borderColor:"rgba(248,113,113,.6)",color:"#fca5a5"}}>{error}</div>}
   {message&&<div style={{...panel,borderColor:"rgba(52,211,153,.55)",color:"#6ee7b7"}}>{message}</div>}
   {!wayplanId&&<div style={panel}>No generated delivery Wayplan is assigned to this Rider account yet.</div>}
   {snapshot&&<>
     <div style={{...panel,display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
       <div><strong>{wayplanId}</strong><div style={{opacity:.7,marginTop:4}}>{routeSource(snapshot)} · Active route v{snapshot.active_route_version} · Generated v{snapshot.generated_route_version}</div></div>
       <div style={{fontWeight:800}}>Warehouse LIFO: immutable v{snapshot.warehouse_route_version}</div>
     </div>
     {stop?<div style={{...panel,display:"grid",gap:12}}>
       <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><div style={{fontSize:13,opacity:.7}}>CURRENT STOP {stop.sequence}</div><div style={{fontSize:21,fontWeight:900}}>{stop.waybill_no||stop.delivery_way_id}</div></div><div style={{fontWeight:800}}>{stop.status||"PENDING"}</div></div>
       <div><strong>{stop.recipient_name||"Recipient"}</strong>{stop.recipient_phone&&<span> · {stop.recipient_phone}</span>}</div>
       <div style={{display:"flex",gap:8,alignItems:"flex-start"}}><MapPin size={17}/><span>{stop.address||"No address"}{stop.township?` · ${stop.township}`:""}</span></div>
       {stop.notes&&<div style={{opacity:.78}}>Notes: {stop.notes}</div>}
       <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
         <a href={navigationUrl(stop)} target="_blank" rel="noreferrer" style={button("blue")}><Navigation size={16}/> Navigate</a>
         {stop.recipient_phone&&<a href={`tel:${String(stop.recipient_phone).replace(/[^+0-9]/g,"")}`} style={button("plain")}><Phone size={16}/> Call Customer</a>}
         <button disabled={busy} onClick={()=>void event("ARRIVED")} style={button("gold")}><MapPin size={16}/> Arrived</button>
         {stopJob&&onOpenDelivery&&<button disabled={busy} onClick={()=>onOpenDelivery(stopJob)} style={button("gold")}><Route size={16}/> Delivery proof & complete</button>}
         <button disabled={busy} onClick={()=>void event("CUSTOMER_UNAVAILABLE","Customer unavailable")} style={button("red")}><AlertTriangle size={16}/> Customer Unavailable</button>
         <button disabled={busy} onClick={()=>void event("RESCHEDULE","Rescheduled by Rider")} style={button("plain")}><RefreshCw size={16}/> Reschedule</button>
         <button disabled={busy} onClick={()=>void event("SKIP","Skipped by Rider")} style={button("plain")}><SkipForward size={16}/> Skip</button>
         <button disabled={busy} onClick={()=>void event("RTO","Return to origin / warehouse")} style={button("red")}><Undo2 size={16}/> RTO</button>
       </div>
     </div>:<div style={panel}>No remaining eligible stop. Route execution is complete or all remaining stops are in exception status.</div>}
     <div style={panel}><strong>Active sequence</strong><div style={{display:"grid",gap:6,marginTop:10}}>{(snapshot.stops||[]).map((s:AnyRow)=><div key={s.delivery_way_id} style={{display:"grid",gridTemplateColumns:"48px 1fr auto",gap:10,padding:"8px 0",borderTop:"1px solid rgba(130,170,205,.16)"}}><strong>{s.sequence}</strong><span>{s.waybill_no||s.delivery_way_id} · {s.township||""}</span><span>{s.status||"PENDING"}</span></div>)}</div></div>
   </>}
 </div>;
}
