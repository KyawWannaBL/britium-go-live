import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Stop = { delivery_way_id:string; waybill_no?:string; latitude?:number; longitude?:number; address?:string; township?:string };

let loader:Promise<any>|null=null;
function loadMaps(){
 const w=window as any;
 if(w.google?.maps)return Promise.resolve(w.google.maps);
 if(loader)return loader;
 const key=String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY||"").trim();
 if(!key)return Promise.reject(new Error("Google Maps browser key is not configured."));
 loader=new Promise((resolve,reject)=>{
  const id="britium-google-maps-js";
  const existing=document.getElementById(id) as HTMLScriptElement|null;
  if(existing){const wait=()=>w.google?.maps?resolve(w.google.maps):window.setTimeout(wait,80);wait();return;}
  const script=document.createElement("script");script.id=id;script.async=true;script.defer=true;
  script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
  script.onload=()=>w.google?.maps?resolve(w.google.maps):reject(new Error("Google Maps failed to initialize."));
  script.onerror=()=>reject(new Error("Could not load Google Maps."));
  document.head.appendChild(script);
 });
 return loader;
}

export default function RiderStopPinEditor({stop,onUpdated}:{stop:Stop;onUpdated:(lat:number,lng:number)=>Promise<void>|void}){
 const [open,setOpen]=useState(false),[draft,setDraft]=useState<{lat:number;lng:number}|null>(null),[saving,setSaving]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 const mapRef=useRef<HTMLDivElement|null>(null);
 const markerRef=useRef<any>(null);
 const current={lat:Number(stop.latitude),lng:Number(stop.longitude)};
 const valid=Number.isFinite(current.lat)&&Number.isFinite(current.lng);

 useEffect(()=>{setDraft(null);setMessage("");setError("");},[stop.delivery_way_id]);
 useEffect(()=>{
  if(!open||!mapRef.current||!valid)return;
  let cancelled=false;let listener:any=null;
  void loadMaps().then((maps)=>{
   if(cancelled||!mapRef.current)return;
   const map=new maps.Map(mapRef.current,{center:current,zoom:16,fullscreenControl:true,streetViewControl:false,gestureHandling:"greedy"});
   const marker=new maps.Marker({map,position:draft||current,draggable:true,label:"●",title:"Delivery location"});markerRef.current=marker;
   marker.addListener("dragend",(e:any)=>{const lat=Number(e.latLng?.lat?.()),lng=Number(e.latLng?.lng?.());if(Number.isFinite(lat)&&Number.isFinite(lng)){setDraft({lat,lng});setMessage("New location selected. Press Update location.");}});
   listener=map.addListener("click",(e:any)=>{const lat=Number(e.latLng?.lat?.()),lng=Number(e.latLng?.lng?.());if(Number.isFinite(lat)&&Number.isFinite(lng)){marker.setPosition({lat,lng});setDraft({lat,lng});setMessage("New location selected. Press Update location.");}});
  }).catch((e:any)=>!cancelled&&setError(e?.message||"Could not open map."));
  return()=>{cancelled=true;listener?.remove?.();markerRef.current?.setMap?.(null);markerRef.current=null;};
 },[open,stop.delivery_way_id,valid]);

 async function save(){
  if(!draft)return;
  setSaving(true);setError("");setMessage("Updating location and recalculating remaining route…");
  try{
   const {data,error:rpcError}=await supabase.rpc("be_update_delivery_location_pin_v1",{p_delivery_way_id:stop.delivery_way_id,p_latitude:draft.lat,p_longitude:draft.lng,p_context:"RIDER_CURRENT_STOP_MAP"});
   if(rpcError)throw rpcError;if(!data?.ok)throw new Error(data?.error||"Location update failed.");
   await onUpdated(draft.lat,draft.lng);
   setMessage("Location updated. Remaining route recalculated from the corrected pin.");setDraft(null);
  }catch(e:any){setError(e?.message||"Could not update location.");}
  finally{setSaving(false);}
 }

 if(!valid)return null;
 return <div style={{border:"1px solid #1a3a5c",borderRadius:12,overflow:"hidden",background:"#081b2c"}}>
  <button type="button" onClick={()=>setOpen(v=>!v)} style={{width:"100%",border:0,padding:"10px 12px",background:"#173a55",color:"white",fontWeight:900,textAlign:"left",cursor:"pointer"}}>{open?"Hide":"Correct"} delivery pin on map</button>
  {open&&<div style={{padding:10,display:"grid",gap:8}}>
    <div style={{fontSize:12}}>Tap the exact drop-off point on the map or drag the pin, then press <strong>Update location</strong>. Only the active route is recalculated; warehouse loading history remains unchanged.</div>
    <div ref={mapRef} style={{height:330,borderRadius:10,background:"#102b45"}}/>
    {draft&&<div style={{fontSize:12}}>New pin: {draft.lat.toFixed(6)}, {draft.lng.toFixed(6)}</div>}
    {message&&<div style={{fontSize:12,color:"#9cc2d9"}}>{message}</div>}
    {error&&<div style={{fontSize:12,color:"#f87171"}}>{error}</div>}
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <button type="button" disabled={!draft||saving} onClick={()=>void save()} style={{border:0,borderRadius:10,padding:"10px 14px",background:"#f6b84b",color:"#061524",fontWeight:900,cursor:!draft||saving?"not-allowed":"pointer"}}>{saving?"Updating…":"Update location"}</button>
      <button type="button" disabled={!draft||saving} onClick={()=>{setDraft(null);markerRef.current?.setPosition?.(current);setMessage("Pin change cancelled.");}} style={{border:"1px solid #1a3a5c",borderRadius:10,padding:"10px 14px",background:"#102b45",color:"white",fontWeight:800}}>Cancel</button>
    </div>
  </div>}
 </div>;
}
