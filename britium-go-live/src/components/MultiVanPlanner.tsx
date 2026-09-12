import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { allocateVans, assignCrews, sortStopsNearestFirst, type Resource, type Stop, type VanPlan } from "@/lib/multiVanPlanner";
import { convertMyanmarTownshipToEnglish } from "@/lib/myanmarAddressConverter";

const field: React.CSSProperties={padding:10,borderRadius:8,color:"#102b45",background:"white",border:"1px solid #9cc2d9"};
const button: React.CSSProperties={...field,background:"#f6b84b",fontWeight:800,cursor:"pointer"};
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
 const available=(items:any[],key:string):Resource[]=>(items||[]).map(x=>({...x,available:!(context?.busy||[]).some((b:any)=>b[key]===x.id)}));
 const vehicles=available((context?.vehicles||[]).filter((v:any)=>v.operation_type==="DELIVERY"),"vehicle_code");
 const branch=region==="YANGON"?"YGN":region==="MANDALAY"?"MDY":"NPT";
 const drivers=available((context?.drivers||[]).filter((d:any)=>!d.branch_code||d.branch_code===branch),"driver_code");
 const helpers=available((context?.helpers||[]).filter((d:any)=>!d.branch_code||d.branch_code===branch),"helper_code");
 const origin=region==="YANGON"?context?.route_origins?.YANGON:undefined;
 const sequenceRows=(rs:Stop[])=>origin?sortStopsNearestFirst(rs,origin):rs;
 const changed=(next:VanPlan[])=>{setPlans(next.map(p=>({...p,rows:sequenceRows(p.rows)})));setApproved(false);setReason("");request.current=null;};
 function preview(){
   try {
     if(region==="YANGON"&&!origin) throw new Error("Yangon Head Office route origin is unavailable.");
     const raw=allocateVans(scopedRows,vehicles,count?Number(count):undefined,origin);
     changed(assignCrews(raw,drivers,helpers,convertMyanmarTownshipToEnglish));
     setMessage(region==="YANGON"?"Review nearest-first routes from Yangon Head Office and each van's reverse LIFO warehouse loading list.":"Review the suggested vans and crews. You may adjust assignments before creating.");
   } catch(e:any){setMessage(e.message);}
 }
 async function save(){
   setBusy(true);setMessage("");
   const payload={region_code:region,plans:plans.map(p=>({vehicle_code:p.vehicle_code,driver_code:p.driver_code,helper_code:p.helper_code,delivery_way_ids:sequenceRows(p.rows).map(r=>r.delivery_way_id)})),approve_below_minimum:approved,below_minimum_reason:reason};
   const body=JSON.stringify(payload);
   if(request.current?.body!==body) request.current={body,id:crypto.randomUUID()};
   try {
     const {data,error}=await supabase.rpc("be_generate_multi_van",{p_payload:{...payload,request_id:request.current!.id}});
     if(error)throw error;
     if(!data?.ok)throw new Error(data?.error||"Wayplan creation failed.");
     setMessage(data.wayplans.length+" Wayplans created for "+data.parcel_count+" parcels with warehouse LIFO loading lists.");
     setPlans([]);request.current=null;onSaved();
   }catch(e:any){setMessage(e.message+" Retry uses the same request to avoid duplicate Wayplans.");}
   finally{setBusy(false);}
 }
 const short=plans.filter(p=>p.rows.length<50);
 return <section style={{padding:16,border:"1px solid #1a3a5c",borderRadius:16,background:"#0b2236",display:"grid",gap:12}}>
   <h2 style={{margin:0}}>Automatic delivery van planning</h2>
   <p style={{margin:0}}>Plan {scopedRows.length} ready parcels by location. Normal minimum: 50 parcels per delivery van. Pickup/highway vehicles 7R-1473 and 1H-6033 remain reserved.</p>
   {region==="YANGON"&&<p style={{margin:0}}>Yangon delivery order starts with the validated stop closest to <strong>{origin?.label||"Yangon Head Office"}</strong> and progresses outward. Warehouse loading is generated in exact reverse order (LIFO).</p>}
   <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
     <label>Pickup batch <select style={field} value={currentPickup} disabled={busy} onChange={e=>{setPickup(e.target.value);changed([]);}}><option value="*">All ready pickups</option>{Array.from(new Set(rows.map(r=>String(r.pickup_id||"")))).map(id=><option key={id} value={id}>{id}</option>)}</select></label>
     <label>Vans to use <select style={field} value={count} onChange={e=>{setCount(e.target.value);changed([]);}}>
       <option value="">Automatic — only vans needed</option>{vehicles.filter(v=>v.available).map((_,i)=><option key={i} value={i+1}>{i+1}</option>)}
     </select></label>
     <button style={button} disabled={busy||!context||!scopedRows.length||(region==="YANGON"&&!origin)} onClick={preview}>Preview automatic Wayplans</button>
   </div>
   {message&&<p role="status" style={{margin:0}}>{message}</p>}
   {plans.map((plan,i)=>{
     const delivery=sequenceRows(plan.rows); const lifo=[...delivery].reverse();
     return <section key={i} style={{padding:12,border:"1px solid #38566b",borderRadius:10}}>
     <strong>Van {i+1}: {delivery.length} parcels · {Array.from(new Set(delivery.map(r=>r.township))).join(", ")}</strong>
     <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:10}}>
       {(["vehicle_code","driver_code","helper_code"] as const).map((key,k)=>{
         const list=[vehicles,drivers,helpers][k];
         return <label key={key}>{["Vehicle","Driver","Helper (optional)"][k]} <select style={field} disabled={busy} value={plan[key]} onChange={e=>changed(plans.map((p,j)=>j===i?{...p,[key]:e.target.value}:p))}>
           <option value="">{key==="helper_code"?"No helper":"Choose"}</option>
           {list.filter(x=>x.available).map(x=><option key={x.id} value={x.id}>{x.name} ({x.id}) {x.zone||""}</option>)}
         </select></label>;
       })}
     </div>
     <details style={{marginTop:10}}><summary>Delivery sequence — nearest first</summary>
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
             const to=Number(e.target.value);
             changed(plans.map((p,j)=>({...p,rows:j===i?p.rows.filter(r=>r.delivery_way_id!==row.delivery_way_id):j===to?[...p.rows,row]:p.rows})));
           }}>{plans.map((_,j)=><option value={j} key={j}>Van {j+1}</option>)}</select>
         </div>)}
       </div>
     </details>
   </section>})}
   {short.length>0&&<div style={{display:"grid",gap:8}}>
     <strong>{short.length} van(s) below 50 parcels. Only one exception is allowed in this reviewed planning batch.</strong>
     <input style={field} disabled={busy} placeholder="Reason for the below-minimum van" value={reason} onChange={e=>{setReason(e.target.value);setApproved(false);}}/>
     <label><input type="checkbox" disabled={busy||short.length!==1||reason.trim().length<5} checked={approved} onChange={e=>setApproved(e.target.checked)}/> I approve this one van below 50 parcels. Record my account, van, parcel count and reason.</label>
   </div>}
   {plans.length>0&&<button style={button} disabled={busy||plans.some(p=>!p.driver_code||!p.rows.length)||short.length>1||(short.length===1&&!approved)} onClick={save}>{busy?"Creating Wayplans…":"Create reviewed Wayplans + LIFO lists"}</button>}
 </section>;
}
