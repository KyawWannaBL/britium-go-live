import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type Parcel = {
  delivery_way_id: string; warehouse_record_created_at: string | null; destination_township: string|null;
  merchant_name:string|null; recorded_provider_code:string|null;
  warehouse_status:string|null; dispatch_scanned:boolean|null;
  verified_dispatch_scanned_at:string|null; physically_handed_over_at:string|null;
  finance_settlement_status:string|null; attention_category:string|null;
  exception_flags:string[]|null; last_evidence_at:string|null;
  expected_cod_mmk:number|null; settled_cod_mmk:number|null;
  return_scan_count:number|null;
};
type Task = {
  id:string; original_delivery_way_id:string; assigned_user_id:string; assigned_department:string;
  task_type:string; task_note:string; created_at:string; due_at:string; status:string;
  acknowledged_at:string|null; resolved_at:string|null; resolution_note:string|null;
};
type Staff={auth_user_id:string;full_name:string|null;email:string|null;department:string|null};
const columns = [
 "delivery_way_id","warehouse_record_created_at","destination_township","merchant_name",
 "recorded_provider_code","warehouse_status","dispatch_scanned","verified_dispatch_scanned_at",
 "physically_handed_over_at","finance_settlement_status","attention_category","exception_flags",
 "last_evidence_at","expected_cod_mmk","settled_cod_mmk","return_scan_count"
].join(",");
const tabs = ["All parcels","Idle / exceptions","Gate finance queue","My alerts"] as const;
const taskTypes=["POD_VERIFICATION","PROVIDER_HANDOVER","RTO_CONFIRMATION","COD_RECONCILIATION","GATE_SETTLEMENT","LOCATION_AND_CUSTODY","OTHER_REVIEW"];
// Date filters follow Myanmar operational calendar days (UTC+06:30), not UTC midnight.
const isoDate = (v:string) => v ? new Date(v+"T00:00:00+06:30").toISOString() : null;
const isoToExclusive = (v:string) => {if(!v)return null;const d=new Date(v+"T00:00:00+06:30");d.setUTCDate(d.getUTCDate()+1);return d.toISOString();};
const esc = (v:unknown) => String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]||ch));
const money = (v:number|null|undefined) => v == null ? "Not recorded" : Number(v).toLocaleString("en-US");
const stamp = (v:string|null|undefined) => v ? new Date(v).toLocaleString() : "Not evidenced";
const safeCell = (v:unknown) => {const s=String(v??"");return /^[\s]*[=+@-]/.test(s)?"'"+s:s;};

export default function ParcelFollowUpPage(){
 const {user,profile}=useAuth();
 const [tab,setTab]=useState<typeof tabs[number]>("All parcels");
 const [from,setFrom]=useState("2026-11-01");
 const [to,setTo]=useState(new Date().toISOString().slice(0,10));
 const [way,setWay]=useState("");
 const [provider,setProvider]=useState("");
 const [rows,setRows]=useState<Parcel[]>([]);
 const [tasks,setTasks]=useState<Task[]>([]);
 const [staff,setStaff]=useState<Staff[]>([]);
 const [selected,setSelected]=useState<Parcel|null>(null);
 const [assignee,setAssignee]=useState("");
 const [department,setDepartment]=useState("Operations");
 const [type,setType]=useState("POD_VERIFICATION");
 const [due,setDue]=useState("");
 const [note,setNote]=useState("");
 const [loading,setLoading]=useState(false);
 const [count,setCount]=useState<number|null>(null);
 const [page,setPage]=useState(0);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [printBusy,setPrintBusy]=useState(false);
 const allowed = ["superadmin","super-admin"].includes((profile?.role||"").toLowerCase());
 const pageSize=75;

 const makeQuery=useCallback(()=>{
  let q=(supabase.from("be_v_harmonized_parcel_monitor_v1" as never) as any).select(columns,{count:"exact"});
  if(from)q=q.gte("warehouse_record_created_at",isoDate(from));
  if(to)q=q.lt("warehouse_record_created_at",isoToExclusive(to));
  if(way.trim())q=q.ilike("delivery_way_id","%"+way.trim().replace(/[%_,]/g,"")+"%");
  if(provider.trim())q=q.eq("recorded_provider_code",provider);
  if(tab==="Idle / exceptions")q=q.neq("attention_category","MONITOR");
  if(tab==="Gate finance queue")q=q.eq("recorded_provider_code","H.TERMINAL DROP-OFF");
  return q;
 },[from,to,way,provider,tab]);

 const load=useCallback(async()=>{
  if(tab==="My alerts"){setRows([]);setCount(null);return;}
  if(from&&to&&from>to){setError("Start date must be on or before end date.");return;}
  setLoading(true);setError("");
  const {data,count:total,error:e}=await makeQuery().order("warehouse_record_created_at",{ascending:false})
   .range(page*pageSize,(page+1)*pageSize-1);
  if(e){setRows([]);setCount(null);setError("Parcel monitor not activated or access restricted: "+e.message);}
  else {const selectedRows=(data||[]) as Parcel[];
   setRows(selectedRows);
   setCount(total);}
  setLoading(false);
 },[makeQuery,page,tab]);
 const loadTasks=useCallback(async()=>{
   const q=(supabase.from("be_parcel_followup_tasks_v1" as never) as any).select("id,original_delivery_way_id,assigned_user_id,assigned_department,task_type,task_note,created_at,due_at,status,acknowledged_at,resolved_at,resolution_note")
     .order("due_at",{ascending:true}).limit(250);
   const {data,error:e}=await q;
   if(e){if(tab==="My alerts")setError("Alert inbox unavailable until UAT task schema is activated: "+e.message);setTasks([]);}
   else setTasks((data||[]) as Task[]);
 },[tab]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{void loadTasks();const timer=window.setInterval(()=>void loadTasks(),60_000);return ()=>window.clearInterval(timer);},[loadTasks]);
 useEffect(()=>{setPage(0);setSelected(null);},[tab,from,to,way,provider]);
 useEffect(()=>{
  if(!allowed)return;
  void (supabase.from("be_user_account_registry") as any)
   .select("auth_user_id,full_name,email,department").eq("is_active",true).not("auth_user_id","is",null).limit(300)
   .then(({data}:{data:Staff[]|null})=>setStaff(data||[]));
 },[allowed]);
 const age=(v:string|null) => v ? Math.max(0,Math.floor((Date.now()-new Date(v).getTime())/86400000)) : null;
 const queue = rows.filter(r=>r.attention_category!=="MONITOR").length;
 const overdue=tasks.filter(t=>t.status!=="RESOLVED" && new Date(t.due_at).getTime()<Date.now()).length;
 const gateRows=rows.filter(r=>r.recorded_provider_code==="H.TERMINAL DROP-OFF").length;

 async function allFiltered(){
  const list:Parcel[]=[];let offset=0;
  // Fail closed if a large report cannot be exported completely.
  while(offset<10000){
   const {data,error:e}=await makeQuery().order("warehouse_record_created_at",{ascending:false})
     .range(offset,offset+499);
   if(e)throw new Error(e.message);
   const batch=(data||[]) as Parcel[];
   list.push(...batch);offset+=batch.length;
   if(batch.length<500)break;
  }
  if(offset>=10000)throw new Error("Export exceeds 10,000 rows. Narrow the timeline to avoid a partial report.");
  return list;
 }
 const reportColumns: {key:keyof Parcel;heading:string}[]=[
  {key:"delivery_way_id",heading:"Original Way ID"}, {key:"warehouse_record_created_at",heading:"Registered"},
  {key:"merchant_name",heading:"Merchant"}, {key:"destination_township",heading:"Destination"},
  {key:"recorded_provider_code",heading:"Provider (recorded)"}, {key:"warehouse_status",heading:"Application status"},
  {key:"dispatch_scanned",heading:"Actual dispatch scan evidenced"}, {key:"verified_dispatch_scanned_at",heading:"Actual scan timestamp"},
  {key:"physically_handed_over_at",heading:"Physical handover"}, {key:"attention_category",heading:"Priority review"},
  {key:"exception_flags",heading:"Exception flags"}, {key:"finance_settlement_status",heading:"Finance status"},
  {key:"expected_cod_mmk",heading:"Expected COD MMK"}, {key:"settled_cod_mmk",heading:"Settled MMK"},
  {key:"last_evidence_at",heading:"Last recorded evidence"}
 ];
 const flat=(p:Parcel,k:keyof Parcel):string|number=>{
   const v=p[k];
   return Array.isArray(v)?v.join("; "):v==null?"Not recorded":typeof v==="boolean"?(v?"Yes":"No"):v as string|number;
 };
 async function excel(){
  setPrintBusy(true);setError("");try{
   const data=await allFiltered();if(!data.length)throw new Error("No rows match the selected filters.");
   const XLSX=await import("xlsx");
   const sheet=XLSX.utils.aoa_to_sheet([reportColumns.map(c=>c.heading),...data.map(r=>reportColumns.map(c=>safeCell(flat(r,c.key))))]);
   sheet["!cols"]=reportColumns.map(c=>({wch:Math.min(43,Math.max(17,c.heading.length+7))}));
   const notes=XLSX.utils.aoa_to_sheet([
    ["Britium Express","Parcel follow-up evidence report"],["Period from (Myanmar time)",from],["Period through (Myanmar time)",to],
    ["Filter provider",provider||"All"],["Workstream",tab],["Rows",data.length],
    ["Dispatch scenario","Owner assumes dispatch complete for planning, not verified scan data."],
    ["Evidence control","Source app status and recorded finance fields are not proof of physical outcome."],
    ["Gate settlement","ဂိတ်ချ is a financial queue only when classified by verified destination routing; recorded provider may still be unverified."],
    ["Exported at",new Date().toISOString()]
   ]);
   const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,sheet,"Parcels");XLSX.utils.book_append_sheet(wb,notes,"Scope and controls");
   XLSX.writeFile(wb,"Britium_Parcel_FollowUp_"+from+"_to_"+to+".xlsx");
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setPrintBusy(false);}
 }
 async function pdf(){
  // Open the print tab synchronously with the click to avoid popup-blocker failures.
  const pop=window.open("","_blank");
  setPrintBusy(true);setError("");try{
   if(!pop)throw new Error("Browser blocked PDF preview. Allow popups and retry.");
   const data=await allFiltered();if(!data.length)throw new Error("No rows match the selected filters.");
   if(data.length>2000)throw new Error("PDF print is limited to 2,000 rows for readability; narrow the date range.");
   const headings=["Way ID","Merchant","Destination","Provider","App Status","Finance","Last evidence","Exceptions"];
   const body=data.map(p=>[p.delivery_way_id,p.merchant_name,p.destination_township,p.recorded_provider_code,p.warehouse_status,p.finance_settlement_status,p.last_evidence_at,(p.exception_flags||[]).join("; ")].map(v=>"<td>"+esc(v??"Not recorded")+"</td>").join(""));
   pop.document.open();
   pop.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Britium Parcel Follow-Up</title><style>@page{size:A3 landscape;margin:12mm}body{font:11px Arial,"Noto Sans Myanmar",sans-serif;color:#16293c}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:5px;overflow-wrap:anywhere}th{background:#0e2942;color:white}thead{display:table-header-group}tr{break-inside:avoid}button{padding:10px;background:#0e2942;color:white;border:0}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print / Save as PDF</button><h2>BRITIUM EXPRESS — Parcel Follow-Up</h2><p>Registration timeline (Myanmar Time): '+esc(from)+' to '+esc(to)+' | '+data.length+' rows | '+esc(tab)+'</p><p><b>Notice:</b> Dispatch assumed complete for planning only. App records and COD flags do not independently verify physical handover, delivery or payment.</p><table><thead><tr>'+headings.map(h=>"<th>"+esc(h)+"</th>").join("")+'</tr></thead><tbody>'+body.map(x=>"<tr>"+x+"</tr>").join("")+'</tbody></table></body></html>');
   pop.document.close();pop.focus();
  }catch(e){pop?.close();setError(e instanceof Error?e.message:String(e));}finally{setPrintBusy(false);}
 }
 async function createTask(){
  if(!selected||!user||!allowed||!assignee||!due||note.trim().length<8){setError("Select an authorized staff member, due date and task instructions.");return;}
  setError("");setMessage("");
  const {error:e}=await (supabase.from("be_parcel_followup_tasks_v1" as never) as any).insert({
    original_delivery_way_id:selected.delivery_way_id,assigned_user_id:assignee,
    assigned_department:department,task_type:type,task_note:note.trim(),
    created_by:user.id,due_at:new Date(due).toISOString()
  });
  if(e)setError(e.message);
  else{setMessage("Assigned to the selected staff in-app alert queue. Not an email or external push notification.");setNote("");void loadTasks();}
 }
 async function markTask(t:Task,mode:"ACKNOWLEDGED"|"RESOLVED"){
  if(!user||t.assigned_user_id!==user.id){setError("Only the assigned employee may acknowledge or resolve this task.");return;}
  const resolution=mode==="RESOLVED"?window.prompt("Enter a resolution reference and evidence summary (minimum 8 characters):",""):"";
  if(mode==="RESOLVED"&&(!resolution||resolution.trim().length<8))return;
  const patch=mode==="ACKNOWLEDGED"?{status:mode,acknowledged_at:new Date().toISOString(),acknowledged_by:user.id}:
   {status:mode,resolved_at:new Date().toISOString(),resolved_by:user.id,resolution_note:resolution!.trim()};
  const {error:e}=await (supabase.from("be_parcel_followup_tasks_v1" as never) as any)
    .update(patch).eq("id",t.id).eq("status",t.status);
  if(e)setError(e.message);else{setMessage("Task updated. This does not change parcel outcome or settlement.");void loadTasks();}
 }
 return <main className="space-y-5 p-4 text-slate-800 md:p-6">
  <div><h1 className="text-2xl font-bold">Parcel Status & Follow-Up Center</h1>
   <p className="text-sm text-slate-600">Track original Way IDs, review idle work, target accountable staff, and export evidence for an exact registration timeline.</p>
   <p className="mt-1 text-xs text-amber-800">Owner planning scenario: all dispatches assumed completed. Actual scans, provider custody and COD payments require separate verified evidence. The gate tab displays registered provider codes only, not the 21 destination-proposed gates in the Excel scenario. Screens and task inbox activate only after UAT/RLS approval.</p>
  </div>
  <nav className="flex gap-2 overflow-x-auto pb-2" aria-label="Parcel follow-up workflows">
   {tabs.map(t=><button key={t} onClick={()=>setTab(t)} className={`shrink-0 rounded-lg px-4 py-2 text-sm ${tab===t?"bg-slate-900 text-white":"border bg-white"}`}>{t}</button>)}
  </nav>
  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
   {([["Loaded parcels",rows.length],["Review flagged (loaded page)",queue],["Known gate assignments (page)",gateRows],["Overdue in-app alerts",overdue]] as const).map(([label,value])=><div key={label} className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-bold">{value}</p></div>)}
  </div>
  {tab!=="My alerts"&&<div className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-4">
    <label className="text-xs">From registered date<input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="block rounded border p-2"/></label>
    <label className="text-xs">Through registered date<input type="date" value={to} onChange={e=>setTo(e.target.value)} className="block rounded border p-2"/></label>
    <label className="text-xs">Original Way ID<input value={way} onChange={e=>setWay(e.target.value)} placeholder="Search Way ID" className="block rounded border p-2"/></label>
    <label className="text-xs">Recorded provider<input value={provider} onChange={e=>setProvider(e.target.value)} placeholder="e.g. ROYAL EXPRESS" className="block rounded border p-2"/></label>
    <button onClick={()=>void load()} className="rounded bg-slate-900 px-4 py-2 text-sm text-white">Refresh</button>
    <button disabled={printBusy} onClick={()=>void excel()} className="rounded border px-4 py-2 text-sm disabled:opacity-50">Export Excel</button>
    <button disabled={printBusy} onClick={()=>void pdf()} className="rounded border px-4 py-2 text-sm disabled:opacity-50">Print / Save as PDF</button>
   </div>}
  {error&&<p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
  {message&&<p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
  {tab==="My alerts"?<div className="overflow-x-auto rounded-xl border bg-white">
    <h2 className="p-4 font-semibold">My assigned follow-up tasks</h2>
    <table className="min-w-[900px] w-full text-left text-sm"><thead className="bg-slate-100"><tr>{["Way ID","Department","Task","Due","Status","Action"].map(x=><th key={x} className="p-3">{x}</th>)}</tr></thead><tbody>{tasks.map(t=><tr key={t.id} className="border-t">
     <td className="p-3 font-semibold">{t.original_delivery_way_id}</td><td className="p-3">{t.assigned_department}</td><td className="p-3">{t.task_type}: {t.task_note}</td>
     <td className="p-3">{stamp(t.due_at)}</td><td className="p-3">{t.status}{t.status!=="RESOLVED"&&new Date(t.due_at).getTime()<Date.now()?" · OVERDUE":""}</td>
     <td className="p-3">{user?.id===t.assigned_user_id&&t.status!=="RESOLVED"&&<div className="flex gap-1">
       {t.status==="OPEN"&&<button className="rounded border px-2 py-1" onClick={()=>void markTask(t,"ACKNOWLEDGED")}>Acknowledge</button>}
       <button className="rounded border px-2 py-1" onClick={()=>void markTask(t,"RESOLVED")}>Resolve with evidence</button>
     </div>}</td></tr>)}</tbody></table></div>:
   <>
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="min-w-[1240px] w-full text-left text-sm">
     <thead className="bg-slate-100"><tr>{["Original Way ID","Merchant / Township","Provider (recorded)","App warehouse","Actual dispatch scan","Finance","Last evidence / idle","Exception / action"].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead>
     <tbody>{rows.map(p=><tr key={p.delivery_way_id} className="border-t hover:bg-slate-50">
      <td className="p-3"><button className="font-semibold text-blue-700 underline" onClick={()=>setSelected(p)}>{p.delivery_way_id}</button></td>
      <td className="p-3">{p.merchant_name||"—"}<div className="text-xs text-slate-500">{p.destination_township||"—"}</div></td>
      <td className="p-3">{p.recorded_provider_code||"Unverified"}</td><td className="p-3">{p.warehouse_status||"Unknown"}</td>
      <td className="p-3">{p.verified_dispatch_scanned_at?stamp(p.verified_dispatch_scanned_at):"Not evidenced (assumed complete only)"}</td>
      <td className="p-3">{p.finance_settlement_status||"Not recorded"}</td>
      <td className="p-3">{stamp(p.last_evidence_at)}<div className="text-xs text-slate-500">{age(p.last_evidence_at)==null?"Aging unknown":age(p.last_evidence_at)+" days since latest recorded source"}</div></td>
      <td className="p-3 text-xs">{(p.exception_flags||[]).join("; ")||p.attention_category||"Review"}</td>
     </tr>)}</tbody></table>
     {!rows.length&&!loading&&<p className="p-5 text-sm text-slate-500">No visible parcel records in this filter; check UAT access or dates.</p>}
    </div>
    <div className="flex items-center justify-between text-sm"><span>Page {page+1} · {count??"Unknown"} total matching before optional local gate grouping</span>
      <div className="flex gap-2"><button disabled={page===0||loading} onClick={()=>setPage(p=>Math.max(p-1,0))} className="rounded border px-3 py-2 disabled:opacity-40">Previous</button>
      <button disabled={loading||count==null||(page+1)*pageSize>=count} onClick={()=>setPage(p=>p+1)} className="rounded border px-3 py-2 disabled:opacity-40">Next</button></div>
    </div>
    {selected&&<section className="space-y-3 rounded-xl border bg-white p-4">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Follow up: {selected.delivery_way_id}</h2><button className="rounded border px-3 py-1" onClick={()=>setSelected(null)}>Close</button></div>
      <p className="text-sm">Destination: {selected.destination_township||"Unverified"} · Last evidence: {stamp(selected.last_evidence_at)} · Recorded provider: {selected.recorded_provider_code||"Unverified"}</p>
      {allowed?<div className="grid gap-3 md:grid-cols-2">
       <label className="text-xs">Responsible employee (existing active account)<select value={assignee} onChange={e=>{setAssignee(e.target.value);const a=staff.find(s=>s.auth_user_id===e.target.value);if(a?.department)setDepartment(a.department);}} className="block w-full rounded border p-2"><option value="">Select employee</option>{staff.map(a=><option key={a.auth_user_id} value={a.auth_user_id}>{a.full_name||a.email||a.auth_user_id} · {a.department||"Unassigned department"}</option>)}</select></label>
       <label className="text-xs">Responsible department<input value={department} onChange={e=>setDepartment(e.target.value)} className="block w-full rounded border p-2"/></label>
       <label className="text-xs">Action type<select className="block w-full rounded border p-2" value={type} onChange={e=>setType(e.target.value)}>{taskTypes.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
       <label className="text-xs">Due by<input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)} className="block w-full rounded border p-2"/></label>
       <label className="text-xs md:col-span-2">Instructions (min 8 characters)<textarea value={note} onChange={e=>setNote(e.target.value)} className="block w-full rounded border p-2" rows={2} placeholder="Specify required proof and what must be completed" /></label>
       <button disabled={!assignee||!due||note.trim().length<8} className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" onClick={()=>void createTask()}>Assign targeted in-app alert</button>
      </div>:<p className="text-sm text-amber-800">Superadmin-level assignment required. Assigned staff may acknowledge tasks in My alerts.</p>}
     </section>}
   </>}
 </main>;
}
