import React, { useEffect, useMemo, useState } from "react";
import { MapPin, Navigation, Phone, RefreshCw, SkipForward, Truck, UserRoundCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Job = Record<string, any>;
type Stop = Record<string, any>;

const terminal = new Set(["DELIVERED","FAILED_DELIVERY","RETURN_TO_WAREHOUSE","RTO","DELIVERY_RESCHEDULED","SKIPPED","CANCELLED"]);
const button: React.CSSProperties={border:0,borderRadius:12,padding:"10px 13px",fontWeight:800,cursor:"pointer",background:"#173b5c",color:"#eef8ff",display:"inline-flex",alignItems:"center",gap:7};
const danger: React.CSSProperties={...button,background:"#7f1d1d"};
const gold: React.CSSProperties={...button,background:"#f6b84b",color:"#061524"};
const panel: React.CSSProperties={border:"1px solid #1a3a5c",borderRadius:16,padding:15,background:"#0b2236"};

function txt(v:any,fallback="-"){const x=String(v??"").trim();return x||fallback;}
function status(v:any){return String(v||"").trim().toUpperCase();}
function mapsUrl(stop:Stop){
 const lat=Number(stop.latitude),lng=Number(stop.longitude);
 const destination=Number.isFinite(lat)&&Number.isFinite(lng)?`${lat},${lng}`:txt(stop.address,txt(stop.township,""));
 return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}
function telUrl(phone:any){return `tel:${String(phone||"").replace(/[^+0-9]/g,"")}`;}

export default function OperationalWayplanRoute({jobs=[],onOpenDelivery}:{jobs?:Job[];onOpenDelivery?:(job:Job)=>void}){
 const suppliedWayplans=useMemo(()=>Array.from(new Set(jobs.map(j=>String(j.wayplan_id||"").trim()).filter(Boolean))),[jobs]);
 const [assignedWayplans,setAssignedWayplans]=useState<string[]>([]);
 const wayplanIds=suppliedWayplans.length?suppliedWayplans:assignedWayplans;
 const [wayplanId,setWayplanId]=useState("");
 const [snapshot,setSnapshot]=useState<any>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [reason,setReason]=useState("");

 useEffect(()=>{if(!suppliedWayplans.length)void loadAssignedWayplans();},[suppliedWayplans.length]);
 useEffect(()=>{if(!wayplanId&&wayplanIds.length)setWayplanId(wayplanIds[0]);},[wayplanIds,wayplanId]);
 useEffect(()=>{if(wayplanId)void load();else setSnapshot(null);},[wayplanId]);

 async function loadAssignedWayplans(){
   try{
     const {data,error}=await supabase.rpc("be_my_operational_wayplans_v1");
     if(error)throw error;
     const ids=(Array.isArray(data?.wayplans)?data.wayplans:[]).map((x:any)=>String(x.wayplan_id||"")).filter(Boolean);
     setAssignedWayplans(ids);
   }catch(e:any){setMessage(e?.message||"Could not load assigned Wayplans.");}
 }

 async function load(){
   setBusy(true);setMessage("");
   try{
     const {data,error}=await supabase.rpc("be_operational_wayplan_snapshot_v1",{p_wayplan_id:wayplanId});
     if(error)throw error;if(!data?.ok)throw new Error(data?.error||"Operational route unavailable.");
     setSnapshot(data);
   }catch(e:any){setMessage(e?.message||"Could not load operational route.");}
   finally{setBusy(false);}
 }

 const stops:Stop[]=Array.isArray(snapshot?.stops)?snapshot.stops:[];
 const current=stops.find(s=>!terminal.has(status(s.stop_status||s.rider_status)));
 const currentIndex=current?stops.findIndex(s=>s.delivery_way_id===current.delivery_way_id):-1;
 const next=currentIndex>=0?stops.slice(currentIndex+1).find(s=>!terminal.has(status(s.stop_status||s.rider_status))):null;
 const currentJob=current?jobs.find(j=>String(j.delivery_way_id||j.tracking_no||"")===String(current.delivery_way_id)):undefined;
 const route=snapshot?.active_route||{};

 async function position(){
   return new Promise<{latitude:number;longitude:number}>((resolve,reject)=>{
     if(!navigator.geolocation)return reject(new Error("GPS is unavailable on this device."));
     navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude}),e=>reject(new Error(e.message||"Could not read Rider GPS.")),{enableHighAccuracy:true,timeout:12000,maximumAge:15000});
   });
 }

 async function rerouteRemaining(origin:{latitude:number;longitude:number},why:string){
   const {data:fresh,error:freshError}=await supabase.rpc("be_operational_wayplan_snapshot_v1",{p_wayplan_id:wayplanId});
   if(freshError)throw freshError;
   const remaining=(fresh?.stops||[]).filter((s:Stop)=>!terminal.has(status(s.stop_status||s.rider_status)));
   if(remaining.length<2){await load();return;}
   const {data:{session}}=await supabase.auth.getSession();
   if(!session?.access_token)throw new Error("Authenticated Rider session is required.");
   const response=await fetch("/api/wayplan-route",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({origin,stops:remaining})});
   const optimized=await response.json().catch(()=>({}));
   if(!response.ok||!optimized?.ok)throw new Error(optimized?.error||"Remaining-stop optimizer failed.");
   const {data,error}=await supabase.rpc("be_apply_rider_reroute_v1",{p_payload:{wayplan_id:wayplanId,reason:why,route:{...optimized,origin}}});
   if(error)throw error;if(!data?.ok)throw new Error(data?.error||"Could not save Rider reroute version.");
   setMessage(`Remaining stops rerouted as Route Version ${data.route_version}. Warehouse loading history remains unchanged.`);
   await load();
 }

 async function event(eventType:string){
   if(!current)return;
   const eventReason=reason.trim();
   if(["CUSTOMER_UNAVAILABLE","RESCHEDULE","RTO","SKIP"].includes(eventType)&&eventReason.length<3){setMessage("Enter a short reason before this exception action.");return;}
   setBusy(true);setMessage("");
   try{
     const gps=await position();
     const {data,error}=await supabase.rpc("be_record_operational_stop_event_v1",{p_payload:{wayplan_id:wayplanId,delivery_way_id:current.delivery_way_id,event_type:eventType,reason:eventReason||null,...gps}});
     if(error)throw error;if(!data?.ok)throw new Error(data?.error||"Could not record stop event.");
     setReason("");
     if(data.requires_reroute)await rerouteRemaining(gps,`${eventType}: ${eventReason||"Rider route exception"}`);
     else {setMessage(`${eventType} recorded for ${current.delivery_way_id}.`);await load();}
   }catch(e:any){setMessage(e?.message||"Could not update current stop.");}
   finally{setBusy(false);}
 }

 function openDelivery(){
   if(currentJob&&onOpenDelivery){onOpenDelivery(currentJob);return;}
   window.location.hash="#/delivery";
 }

 if(!wayplanIds.length)return <div style={panel}><strong>No operational Wayplan assigned.</strong><div style={{marginTop:7,color:"#9cc2d9"}}>Published delivery Wayplans will appear here with a current-stop workflow.</div></div>;

 return <div style={{display:"grid",gap:12,color:"#eef8ff"}}>
   <div style={{...panel,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
     <label style={{fontWeight:800}}>Wayplan <select value={wayplanId} disabled={busy} onChange={e=>setWayplanId(e.target.value)} style={{marginLeft:8,padding:9,borderRadius:9}}>{wayplanIds.map(id=><option key={id}>{id}</option>)}</select></label>
     <button style={button} disabled={busy} onClick={()=>void load()}><RefreshCw size={16}/>Refresh</button>
     <span style={{marginLeft:"auto",fontWeight:800}}>Route V{route.route_version||"-"} · {txt(route.route_source,"UNKNOWN")} · {txt(route.route_mode,"-")}</span>
   </div>
   {message&&<div style={{...panel,borderColor:"#f6b84b"}}>{message}</div>}
   {current?<div style={{...panel,display:"grid",gap:13}}>
     <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><div style={{color:"#f6b84b",fontWeight:900,letterSpacing:1}}>CURRENT STOP {current.stop_sequence}</div><h2 style={{margin:"5px 0"}}>{txt(current.waybill_no,current.delivery_way_id)}</h2></div><strong>{txt(current.stop_status||current.rider_status,"PENDING")}</strong></div>
     <div><strong>{txt(current.recipient_name,"Recipient")}</strong><div>{txt(current.address)}</div><div>{txt(current.township)}</div><div>Phone: {txt(current.recipient_phone)}</div>{current.notes&&<div>Notes: {txt(current.notes)}</div>}</div>
     <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
       <a href={mapsUrl(current)} target="_blank" rel="noreferrer" style={{...gold,textDecoration:"none"}}><Navigation size={16}/>Navigate</a>
       {current.recipient_phone&&<a href={telUrl(current.recipient_phone)} style={{...button,textDecoration:"none"}}><Phone size={16}/>Call Customer</a>}
       <button style={button} disabled={busy} onClick={()=>void event("ARRIVED")}><MapPin size={16}/>Arrived</button>
       <button style={gold} disabled={busy} onClick={openDelivery}><UserRoundCheck size={16}/>Delivery Proof / Delivered</button>
     </div>
     <div style={{display:"grid",gap:8}}><input value={reason} disabled={busy} onChange={e=>setReason(e.target.value)} placeholder="Reason for unavailable / reschedule / RTO / skip" style={{padding:10,borderRadius:10,border:"1px solid #38566b"}}/><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
       <button style={danger} disabled={busy} onClick={()=>void event("CUSTOMER_UNAVAILABLE")}>Customer Unavailable</button>
       <button style={button} disabled={busy} onClick={()=>void event("RESCHEDULE")}>Reschedule</button>
       <button style={danger} disabled={busy} onClick={()=>void event("RTO")}><Truck size={16}/>RTO</button>
       <button style={button} disabled={busy} onClick={()=>void event("SKIP")}><SkipForward size={16}/>Skip</button>
     </div></div>
     {next&&<div style={{borderTop:"1px solid #1a3a5c",paddingTop:11}}><strong>NEXT STOP {next.stop_sequence}</strong><div>{txt(next.waybill_no,next.delivery_way_id)} · {txt(next.township)}</div></div>}
   </div>:<div style={panel}><strong>Route complete.</strong><div style={{marginTop:7}}>No remaining eligible stops in the active route version.</div></div>}
   <details style={panel}><summary style={{cursor:"pointer",fontWeight:800}}>All active route stops</summary><div style={{marginTop:10,display:"grid",gap:7}}>{stops.map((s:Stop)=><div key={s.delivery_way_id}>{s.stop_sequence}. {txt(s.waybill_no,s.delivery_way_id)} · {txt(s.township)} · {txt(s.stop_status||s.rider_status,"PENDING")}</div>)}</div></details>
 </div>;
}
