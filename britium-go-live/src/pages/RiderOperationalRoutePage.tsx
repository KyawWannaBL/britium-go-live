import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, MapPin, Phone, RefreshCw, Route, SkipForward, UserX, CalendarClock, RotateCcw, Navigation } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import RiderStopPinEditor from "@/components/RiderStopPinEditor";

type StopRow={sequence:number;delivery_way_id:string;waybill_no?:string;recipient_name?:string;recipient_phone?:string;address?:string;township?:string;notes?:string;status?:string;latitude?:number;longitude?:number};
type Snapshot={ok:boolean;wayplan_id?:string|null;route_version?:number;route_kind?:string;optimizer_source?:string;route_mode?:string;distance_m?:number;duration_s?:number;current_stop?:StopRow|null;stops?:StopRow[];warehouse_snapshot?:any;warehouse_route_immutable?:boolean;message?:string};

const C={bg:"#061524",panel:"#0b2236",panel2:"#102b45",border:"#1a3a5c",text:"#eef8ff",sub:"#9cc2d9",gold:"#f6b84b",blue:"#4ea8de",green:"#34d399",red:"#f87171",purple:"#c084fc"};
const btn=(tone="plain"):React.CSSProperties=>({border:`1px solid ${tone==="red"?C.red:tone==="green"?C.green:tone==="gold"?C.gold:C.border}`,background:tone==="red"?"rgba(248,113,113,.12)":tone==="green"?"rgba(52,211,153,.12)":tone==="gold"?C.gold:C.panel2,color:tone==="gold"?C.bg:C.text,borderRadius:12,padding:"10px 13px",fontWeight:800,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:7,textDecoration:"none"});
const terminal=new Set(["DELIVERED","RTO","SKIP","SKIPPED","RESCHEDULE","DELIVERY_RESCHEDULED","CUSTOMER_UNAVAILABLE","RETURN_TO_WAREHOUSE","FAILED_DELIVERY","CANCELLED"]);

function sourceLabel(value?:string){
 if(value==="GOOGLE_ROUTES")return "Google Routes road optimized";
 if(value==="MAPBOX_FALLBACK")return "Mapbox fallback";
 if(value==="GEOGRAPHIC_FALLBACK")return "Emergency geographic fallback — NOT Google optimized";
 return value||"Route source unavailable";
}
function navigateUrl(stop:StopRow){
 const destination=Number.isFinite(Number(stop.latitude))&&Number.isFinite(Number(stop.longitude))?`${Number(stop.latitude)},${Number(stop.longitude)}`:[stop.address,stop.township].filter(Boolean).join(", ");
 return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

export default function RiderOperationalRoutePage(){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const stops=snapshot?.stops||[];
 const current=snapshot?.current_stop||null;
 const completed=useMemo(()=>stops.filter(s=>terminal.has(String(s.status||"").toUpperCase())).length,[stops]);

 async function load(silent=false){
  if(!silent)setLoading(true); setError("");
  try{
   const {data,error:rpcError}=await supabase.rpc("be_rider_operational_route_snapshot",{p_wayplan_id:null});
   if(rpcError)throw rpcError; if(data?.ok===false)throw new Error(data?.error||"Route snapshot failed.");
   setSnapshot(data as Snapshot);
  }catch(e:any){setError(e?.message||"Could not load operational route.");}
  finally{if(!silent)setLoading(false);}
 }
 useEffect(()=>{void load();},[]);

 async function roadOptimize(wayplanId:string,rows:StopRow[]){
  if(!rows.length)return;
  const usable=rows.filter(row=>Number.isFinite(Number(row.latitude))&&Number.isFinite(Number(row.longitude)));
  if(usable.length!==rows.length)throw new Error("One or more remaining stops have no validated coordinates. Reroute was not applied; the current route version remains active.");
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.access_token)throw new Error("Authenticated Rider session is required.");
  const branchOrigin=snapshot?.warehouse_snapshot?.metadata?.origin||null;
  let origin=branchOrigin;
  if(!origin?.latitude||!origin?.longitude){
   const currentPosition=await new Promise<GeolocationPosition|null>((resolve)=>{
    if(!navigator.geolocation)return resolve(null);
    navigator.geolocation.getCurrentPosition(resolve,()=>resolve(null),{enableHighAccuracy:true,timeout:6000,maximumAge:30000});
   });
   if(currentPosition)origin={latitude:currentPosition.coords.latitude,longitude:currentPosition.coords.longitude,label:"Rider current position"};
  }
  if(!origin?.latitude||!origin?.longitude){
   origin={latitude:Number(usable[0].latitude),longitude:Number(usable[0].longitude),label:"Current remaining stop"};
  }
  const response=await fetch("/api/wayplan-route",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({origin,stops:usable})});
  const route=await response.json().catch(()=>({}));
  if(!response.ok||!route?.ok)throw new Error(route?.error||`Road optimizer failed (${response.status}).`);
  const {data,error:applyError}=await supabase.rpc("be_rider_apply_operational_reroute",{p_wayplan_id:wayplanId,p_route:route});
  if(applyError)throw applyError; if(data?.ok===false)throw new Error(data?.error||"Could not save reroute version.");
  setSnapshot(data as Snapshot);
  setMessage(`New active route version ${data.route_version}. Warehouse loading route remains version ${data.warehouse_snapshot?.generated_route_version||"locked"} and was not regenerated.`);
 }

 async function action(actionName:string){
  if(!snapshot?.wayplan_id||!current)return;
  setBusy(true);setError("");setMessage("");
  try{
   const remark=actionName==="CUSTOMER_UNAVAILABLE"?"Customer unavailable at current stop":actionName==="RESCHEDULE"?"Customer requested reschedule":actionName==="SKIP"?"Stop skipped for current route":actionName==="RTO"?"Marked return to origin":"Arrived at customer";
   const {data,error:rpcError}=await supabase.rpc("be_rider_operational_route_action",{p_payload:{wayplan_id:snapshot.wayplan_id,delivery_way_id:current.delivery_way_id,action:actionName,remark}});
   if(rpcError)throw rpcError; if(data?.ok===false)throw new Error(data?.message||data?.error||"Route action failed.");
   setSnapshot(data as Snapshot);
   if(data?.reroute_required){
    const remaining=(data.stops||[]).filter((s:StopRow)=>!terminal.has(String(s.status||"").toUpperCase()));
    if(remaining.length>0)await roadOptimize(snapshot.wayplan_id,remaining);
    else setMessage(`${actionName} recorded. No eligible stops remain to reroute.`);
   }else setMessage(`${actionName} recorded for ${current.waybill_no||current.delivery_way_id}.`);
  }catch(e:any){setError(e?.message||"Could not update route.");}
  finally{setBusy(false);}
 }

 async function pinUpdated(latitude:number,longitude:number){
  if(!snapshot?.wayplan_id||!current)return;
  const corrected=(snapshot.stops||[]).map(stop=>stop.delivery_way_id===current.delivery_way_id?{...stop,latitude,longitude}:stop);
  const remaining=corrected.filter(stop=>!terminal.has(String(stop.status||"").toUpperCase()));
  if(remaining.length>1)await roadOptimize(snapshot.wayplan_id,remaining);
  else{
   setSnapshot({...snapshot,stops:corrected,current_stop:{...current,latitude,longitude}});
   setMessage("Corrected location saved. This is the final remaining stop, so no additional route optimization is required.");
  }
 }

 async function finishAndGuideNext(){
  if(!snapshot?.wayplan_id||!current)return;
  // Open synchronously so mobile browsers allow us to hand off navigation after the server confirms Finish.
  const navigationWindow=window.open("about:blank","_blank");
  setBusy(true);setError("");setMessage("Finishing this drop and preparing the next stop…");
  try{
   const {data,error:rpcError}=await supabase.rpc("be_rider_operational_route_action",{p_payload:{wayplan_id:snapshot.wayplan_id,delivery_way_id:current.delivery_way_id,action:"FINISH_STOP"}});
   if(rpcError)throw rpcError;
   if(data?.ok===false)throw new Error(data?.message||data?.error||"Could not finish this stop.");
   setSnapshot(data as Snapshot);
   const next=data?.current_stop as StopRow|null;
   if(next){
    const url=navigateUrl(next);
    if(navigationWindow) navigationWindow.location.replace(url);
    setMessage(`Finished ${current.waybill_no||current.delivery_way_id}. Next: Stop ${next.sequence} · ${next.waybill_no||next.delivery_way_id}. Navigation is ready.`);
   }else{
    navigationWindow?.close();
    setMessage("Final drop finished. No delivery stops remain in this Wayplan.");
   }
  }catch(e:any){
   navigationWindow?.close();
   setError(e?.message||"Could not finish this stop. Complete delivery proof/signature/COD confirmation first, then press Finish.");
  }finally{setBusy(false);}
 }

 if(loading)return <main style={{minHeight:"100vh",background:C.bg,color:C.text,display:"grid",placeItems:"center",fontFamily:"Poppins,Inter,system-ui,sans-serif"}}><div><RefreshCw className="be-spin"/> Loading operational route…</div></main>;
 return <main style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"Poppins,Inter,system-ui,sans-serif",padding:16}}>
  <div style={{maxWidth:1080,margin:"0 auto",display:"grid",gap:14}}>
   <header style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
    <div><div style={{color:C.gold,fontWeight:900,letterSpacing:2}}>BRITIUM RIDER · ACTIVE WAYPLAN</div><h1 style={{margin:"6px 0"}}>Current Stop → Finish → Guided Next Stop</h1><div style={{color:C.sub}}>Complete each drop, press Finish, and the system advances to the next planned location automatically.</div></div>
    <div style={{display:"flex",gap:8}}><button style={btn()} onClick={()=>{window.location.hash="#/wall"}}><ArrowLeft size={16}/> Wall</button><button style={btn()} disabled={busy} onClick={()=>void load()}><RefreshCw size={16}/> Sync</button></div>
   </header>
   {error&&<div style={{border:`1px solid ${C.red}`,background:"rgba(248,113,113,.12)",borderRadius:12,padding:12,color:C.red}}>{error}</div>}
   {message&&<div style={{border:`1px solid ${C.green}`,background:"rgba(52,211,153,.12)",borderRadius:12,padding:12,color:C.green}}>{message}</div>}
   {!snapshot?.wayplan_id?<section style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:16,padding:22}}>{snapshot?.message||"No active Wayplan assigned."}</section>:<>
    <section style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:16,padding:16,display:"grid",gap:8}}>
     <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}><strong>{snapshot.wayplan_id}</strong><strong>Active Route v{snapshot.route_version}</strong></div>
     <div>{sourceLabel(snapshot.optimizer_source)} · {snapshot.route_mode}</div>
     <div style={{color:C.sub}}>{completed}/{stops.length} closed stops · {snapshot.distance_m?`${(Number(snapshot.distance_m)/1000).toFixed(1)} km`:"distance unavailable"} · {snapshot.duration_s?`${Math.round(Number(snapshot.duration_s)/60)} min`:"ETA unavailable"}</div>
     <div style={{color:snapshot.warehouse_route_immutable?C.green:C.red,fontWeight:800}}>Warehouse loading history: {snapshot.warehouse_route_immutable?`LOCKED to Generated Route v${snapshot.warehouse_snapshot?.generated_route_version}`:"snapshot missing"}. Rider rerouting never rewrites it.</div>
    </section>
    {current?<section style={{background:C.panel,border:`2px solid ${C.gold}`,borderRadius:18,padding:18,display:"grid",gap:12}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}><div><div style={{color:C.gold,fontWeight:900}}>CURRENT STOP {current.sequence}</div><h2 style={{margin:"5px 0"}}>{current.waybill_no||current.delivery_way_id}</h2></div><div style={{fontWeight:800}}>{current.status||"PENDING"}</div></div>
      <div><strong>{current.recipient_name||"Recipient"}</strong>{current.recipient_phone?` · ${current.recipient_phone}`:""}</div>
      <div>{current.address||"No address"}{current.township?` · ${current.township}`:""}</div>
      {current.notes&&<div style={{color:C.sub}}>Notes: {current.notes}</div>}
      <RiderStopPinEditor stop={current} onUpdated={pinUpdated}/>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
       <a style={btn()} href={navigateUrl(current)} target="_blank" rel="noreferrer"><Navigation size={16}/> Navigate current stop</a>
       {current.recipient_phone&&<a style={btn()} href={`tel:${current.recipient_phone}`}><Phone size={16}/> Call Customer</a>}
       <button style={btn("gold")} disabled={busy} onClick={()=>void action("ARRIVED")}><CheckCircle2 size={16}/> Arrived</button>
       <button style={btn("red")} disabled={busy} onClick={()=>void action("CUSTOMER_UNAVAILABLE")}><UserX size={16}/> Customer Unavailable</button>
       <button style={btn()} disabled={busy} onClick={()=>void action("RESCHEDULE")}><CalendarClock size={16}/> Reschedule</button>
       <button style={btn()} disabled={busy} onClick={()=>void action("SKIP")}><SkipForward size={16}/> Skip</button>
       <button style={btn("red")} disabled={busy} onClick={()=>void action("RTO")}><RotateCcw size={16}/> RTO</button>
       <button style={btn("gold")} disabled={busy} onClick={()=>{window.location.hash="#/delivery"}}><CheckCircle2 size={16}/> Complete Delivery Proof</button>
       <button style={btn("green")} disabled={busy} onClick={()=>void finishAndGuideNext()}><Navigation size={16}/> Finish & guide next stop</button>
      </div>
      <div style={{fontSize:12,color:C.sub}}>Finish is proof-safe: receiver proof/signature and COD/payment confirmation must already be completed. After Finish, the next eligible stop becomes current and Google navigation opens automatically.</div>
    </section>:<section style={{background:C.panel,border:`1px solid ${C.green}`,borderRadius:16,padding:18,color:C.green,fontWeight:800}}>No eligible stop remains in this active route.</section>}
    <section style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:16,padding:16}}>
     <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><Route size={18}/><strong>Active road sequence</strong></div>
     <div style={{display:"grid",gap:8}}>{stops.map(stop=><div key={stop.delivery_way_id} style={{border:`1px solid ${stop.delivery_way_id===current?.delivery_way_id?C.gold:C.border}`,background:stop.delivery_way_id===current?.delivery_way_id?"rgba(246,184,75,.08)":C.panel2,borderRadius:12,padding:11,display:"grid",gridTemplateColumns:"50px 1fr auto",gap:10,alignItems:"center"}}><strong>{stop.sequence}</strong><div><strong>{stop.waybill_no||stop.delivery_way_id}</strong><div style={{color:C.sub,fontSize:13}}>{stop.recipient_name||"Recipient"} · {stop.township||""}</div></div><span>{stop.status||"PENDING"}</span></div>)}</div>
    </section>
   </>}
  </div>
 </main>;
}