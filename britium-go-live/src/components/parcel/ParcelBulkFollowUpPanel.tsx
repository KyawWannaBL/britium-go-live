import { useCallback,useEffect,useMemo,useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { departments,templates,type Person } from "@/components/parcel/ParcelActionComposer";
import { parcelNextAction,type OperationalParcel } from "@/lib/parcelOperationalSteps";

type Batch={request_id:string;created_by:string;created_at:string;wayplan_filter:string|null;
 department_key:string;recipient_scope:string;selected_way_count:number;notification_count:number};
type Decision={batch_id:string;decision:string;reason:string;decided_by:string};
type Override={message_en?:string;message_my?:string;task_type?:string};
const entryStyle="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const canManage=(role:string)=>["superadmin","super-admin","operation-manager","operation_manager","operations-manager","operations_manager"].includes(role.toLowerCase());
const tomorrow=()=>{const d=new Date(Date.now()+24*3600000);const t=new Date(d.getTime()-d.getTimezoneOffset()*60000);return t.toISOString().slice(0,16);};

export default function ParcelBulkFollowUpPanel({selected,onClear,onSent}:{
 selected:OperationalParcel[];onClear:()=>void;onSent?:()=>void
}){
 const {user,profile}=useAuth();
 const allowed=canManage(profile?.role||"");
 const [people,setPeople]=useState<Person[]>([]);
 const [directoryError,setDirectoryError]=useState("");
 const [department,setDepartment]=useState("OPERATIONS");
 const [scope,setScope]=useState<"PERSON"|"DEPARTMENT">("PERSON");
 const [recipient,setRecipient]=useState("");
 const [wayplan,setWayplan]=useState("");
 const [template,setTemplate]=useState("LOCATION_AND_CUSTODY");
 const [en,setEn]=useState<string>(templates[5][2]);
 const [my,setMy]=useState<string>(templates[5][3]);
 const [due,setDue]=useState(tomorrow);
 const [overrides,setOverrides]=useState<Record<string,Override>>({});
 const [expanded,setExpanded]=useState<string|null>(null);
 const [preview,setPreview]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const [batches,setBatches]=useState<Batch[]>([]);
 const [decisions,setDecisions]=useState<Decision[]>([]);
 const [reason,setReason]=useState("");
 const [reviewId,setReviewId]=useState("");
 const [sendResult,setSendResult]=useState<string|null>(null);
 const matching=useMemo(()=>selected.filter(p=>!wayplan||(p.wayplan_id||"")===wayplan),[selected,wayplan]);
 const byWayplan=useMemo(()=>Array.from(new Set(selected.map(p=>p.wayplan_id).filter((x):x is string=>!!x))),[selected]);
 const available=useMemo(()=>people.filter(p=>p.department_key===department&&p.active),[people,department]);
 const linked=useMemo(()=>available.filter(p=>p.account_linked&&!!p.auth_user_id),[available]);
 const total=matching.length*(scope==="PERSON"?1:linked.length);

 const reload=useCallback(async()=>{
  if(!allowed)return;
  const [d,b,rv]=await Promise.all([
   (supabase as any).rpc("be_parcel_hr_directory_v2"),
   (supabase as any).from("be_parcel_bulk_followup_batches_v1").select("*").order("created_at",{ascending:false}).limit(40),
   (supabase as any).from("be_parcel_bulk_followup_decisions_v1").select("batch_id,decision,reason,decided_by").limit(100)
  ]);
  if(d.error)setDirectoryError(d.error.message);
  else{setPeople((d.data||[]) as Person[]);setDirectoryError("");}
  if(!b.error)setBatches((b.data||[]) as Batch[]);
  if(!rv.error)setDecisions((rv.data||[]) as Decision[]);
 },[allowed]);
 useEffect(()=>{void reload();},[reload]);
 function setPreset(value:string){
  setTemplate(value);
  const t=templates.find(x=>x[0]===value);
  if(t){setEn(t[2]);setMy(t[3]);}
  setPreview(false);
 }
 function setOverride(id:string,key:keyof Override,value:string){
  setOverrides(old=>({...old,[id]:{...old[id],[key]:value}}));setPreview(false);
 }
 async function send(){
  setError("");setNotice("");
  if(!user||!allowed){setError("Only authorized managers can send.");return;}
  if(matching.length<1||matching.length>100){setError("Select 1 to 100 Way IDs.");return;}
  if(scope==="PERSON"&&!recipient){setError("Select an HR-linked employee.");return;}
  if(!due||!en.trim()||!my.trim()){setError("Deadline and English/Myanmar text required.");return;}
  if(!preview){setError("Review the selected Way IDs and recipients before sending.");return;}
  if(total>400||linked.length>30){setError("Batch exceeds safe size. Select fewer Ways or recipients.");return;}
  if(!window.confirm(`Confirm sending ${total} in-app notifications for ${matching.length} Way IDs? This will create accountable tasks. / Way ${matching.length} ခုအတွက် အသိပေးချက် ${total} စောင် ပို့ရန် အတည်ပြုပါ။`))return;
  setBusy(true);
  const items=matching.map(p=>({way_id:p.delivery_way_id,...overrides[p.delivery_way_id]}));
  const {data,error:e}=await (supabase as any).rpc("be_parcel_bulk_followup_send_v1",{
   p_items:items,p_department:department,p_scope:scope,p_recipient_id:scope==="PERSON"?recipient:null,
   p_default_type:template,p_message_en:en.trim(),p_message_my:my.trim(),
   p_due_at:new Date(due).toISOString(),p_wayplan:wayplan||null,p_request_id:requestId
  });
  setBusy(false);
  if(e){setError(e.message);return;}
  setNotice(data?.already_sent?"Batch already sent; no duplicate notifications.":"Submitted "+data.sent+" notifications to "+data.recipients+" linked HR employee(s).");
  setSendResult(requestId);setReviewId(requestId);setRequestId(crypto.randomUUID());setPreview(false);
  await reload();onSent?.();
 }
 async function decide(id:string,action:"APPROVED"|"REJECTED"|"CANCELLED"){
  if(reason.trim().length<8){setError("A review or cancellation reason of at least 8 characters is required.");return;}
  if(!window.confirm(`Record ${action} for follow-up task batch? This is NOT parcel delivery or COD settlement approval.`))return;
  setBusy(true);setError("");setNotice("");
  const {error:e}=await (supabase as any).rpc("be_parcel_bulk_followup_decide_v1",{
    p_batch_id:id,p_decision:action,p_reason:reason.trim()
  });
  setBusy(false);
  if(e)setError(e.message);
  else{setNotice(`${action} recorded as managerial follow-up review only.`);setReason("");await reload();}
 }
 if(!allowed)return null;
 return <section className="rounded-xl border border-slate-300 bg-white p-4 text-slate-900 space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <div><h2 className="text-lg font-bold">Bulk Wayplan & parcel actions / Ways အများအပြား တာဝန်ပေးပို့ခြင်း</h2>
    <p className="text-xs text-slate-600">Selected: {selected.length} original Way IDs • {matching.length} in chosen Wayplan group (maximum 100 per batch).</p></div>
   <button className="rounded-lg border px-3 py-2 text-sm" onClick={()=>{onClear();setPreview(false);}}>Clear selection / ရွေးချယ်မှုဖျက်ရန်</button>
  </div>
  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs">
   Directory is based on Admin/HR Employee Master. {people.length} registered staff; {people.filter(p=>p.active&&p.account_linked).length} linked active login accounts. Unlinked employees are visible but cannot receive notifications.
   <button className="ml-3 underline" onClick={()=>void reload()}>Refresh HR directory</button>
  </div>
  {directoryError&&<p className="text-sm text-red-700">{directoryError}</p>}
  <div className="grid gap-3 md:grid-cols-3">
   <label className="text-xs font-semibold">Wayplan / Wayplan အလိုက်
    <select className={entryStyle} value={wayplan} onChange={e=>{setWayplan(e.target.value);setPreview(false);}}>
      <option value="">All selected Ways / ရွေးထားသမျှ</option>
      {byWayplan.map(x=><option key={x} value={x}>{x}</option>)}
    </select></label>
   <label className="text-xs font-semibold">Department / ဌာန
    <select className={entryStyle} value={department} onChange={e=>{setDepartment(e.target.value);setRecipient("");setPreview(false);}}>
      {departments.map(([k,label])=><option value={k} key={k}>{label}</option>)}
    </select></label>
   <label className="text-xs font-semibold">Delivery scope / ပို့ရန်
    <select className={entryStyle} value={scope} onChange={e=>{setScope(e.target.value as "PERSON"|"DEPARTMENT");setPreview(false);}}>
     <option value="PERSON">One employee / လူတစ်ဦးချင်း</option>
     <option value="DEPARTMENT">Linked department staff / ဌာနဝန်ထမ်းများ</option>
    </select></label>
   {scope==="PERSON"?<label className="text-xs font-semibold">HR employee / ဝန်ထမ်း
    <select className={entryStyle} value={recipient} onChange={e=>{setRecipient(e.target.value);setPreview(false);}}>
      <option value="">Select HR employee / ရွေးပါ</option>
      {available.map(p=><option key={p.employee_code||p.employee_name} value={p.auth_user_id||""} disabled={!p.account_linked||!p.auth_user_id}>
       {p.employee_name} • {p.employee_code||"HR"} • {p.branch_code} • {p.account_linked?p.email:"Login account not linked"}
      </option>)}
    </select></label>:<p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{linked.length} linked employees in {department}. Department-wide task delivery is limited to 30 employees and 400 notifications per batch.</p>}
   <label className="text-xs font-semibold">Predefined message / စံသတ်မှတ်စာ
    <select className={entryStyle} value={template} onChange={e=>setPreset(e.target.value)}>
     {templates.map(t=><option value={t[0]} key={t[0]}>{t[1]}</option>)}
    </select></label>
   <label className="text-xs font-semibold">Deadline / ပြီးစီးရမည့်ရက်နှင့်အချိန်
    <input className={entryStyle} type="datetime-local" value={due} onChange={e=>{setDue(e.target.value);setPreview(false);}}/>
   </label>
   <label className="text-xs font-semibold md:col-span-3">Common English message / အင်္ဂလိပ်စာ
    <textarea className={entryStyle} rows={2} value={en} onChange={e=>{setEn(e.target.value);setPreview(false);}}/>
   </label>
   <label className="text-xs font-semibold md:col-span-3">Common Myanmar message / မြန်မာစာ
    <textarea className={entryStyle} rows={2} value={my} onChange={e=>{setMy(e.target.value);setPreview(false);}}/>
   </label>
  </div>
  <div className="max-h-72 overflow-auto rounded-lg border">
    <table className="w-full min-w-[750px] text-left text-xs">
     <thead className="sticky top-0 bg-slate-100"><tr>{["Way ID","Wayplan","Current app stage","Next action","Individual message"].map(x=><th key={x} className="p-2">{x}</th>)}</tr></thead>
     <tbody>{matching.map(p=>{const step=parcelNextAction(p);return <tr key={p.delivery_way_id} className="border-t align-top">
      <td className="p-2 font-semibold">{p.delivery_way_id}</td><td className="p-2">{p.wayplan_id||"Not recorded"}</td>
      <td className="p-2">{step.last}</td><td className="p-2">{step.next}</td>
      <td className="p-2"><button className="rounded border px-2 py-1" onClick={()=>setExpanded(expanded===p.delivery_way_id?null:p.delivery_way_id)}>Customize / သီးသန့်ပြင်ရန်</button>
      {expanded===p.delivery_way_id&&<div className="mt-2 space-y-2">
       <select className={entryStyle} value={overrides[p.delivery_way_id]?.task_type||template} onChange={e=>setOverride(p.delivery_way_id,"task_type",e.target.value)}>{templates.map(t=><option value={t[0]} key={t[0]}>{t[1]}</option>)}</select>
       <textarea rows={2} placeholder="Custom English (optional)" className={entryStyle} value={overrides[p.delivery_way_id]?.message_en||""} onChange={e=>setOverride(p.delivery_way_id,"message_en",e.target.value)}/>
       <textarea rows={2} placeholder="သီးသန့်မြန်မာစာ (လိုအပ်မှ)" className={entryStyle} value={overrides[p.delivery_way_id]?.message_my||""} onChange={e=>setOverride(p.delivery_way_id,"message_my",e.target.value)}/>
      </div>}</td>
     </tr>})}</tbody>
    </table>
  </div>
  <div className="flex flex-wrap gap-2">
   <button className="rounded-lg border border-blue-400 px-4 py-2 text-sm font-semibold" onClick={()=>{setPreview(true);setNotice("");setError("");}} disabled={!matching.length||matching.length>100||total>400||(scope==="PERSON"&&!recipient)||!due}>1. Review / စိစစ်ကြည့်ရှုရန်</button>
   <button className="rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" onClick={()=>void send()} disabled={busy||!preview}>2. Confirm & Send ({total}) / အတည်ပြုပေးပို့ရန်</button>
   <button className="rounded-lg border px-4 py-2 text-sm" onClick={()=>{setPreview(false);setOverrides({});}}>Reject draft / စာမူပယ်ဖျက်ရန်</button>
  </div>
  {preview&&<p className="rounded-lg bg-blue-50 p-3 text-sm">Review confirmed for {matching.length} Way IDs, {scope==="PERSON"?"one HR employee":linked.length+" linked HR employees"} ({total} separate notifications). Press Confirm & Send to create real in-app tasks. No physical parcel or COD status changes.</p>}
  {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  {notice&&<p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
  <div className="space-y-2 border-t pt-3">
   <div className="flex flex-wrap items-center justify-between"><h3 className="font-semibold">Sent batches & managerial review / ပို့ပြီးအစုလိုက်တာဝန်များ</h3><button className="text-xs underline" onClick={()=>void reload()}>Refresh</button></div>
   <p className="text-xs text-slate-600">Approve, reject and cancel refer ONLY to the operational follow-up batch. They do not approve delivery evidence or financial settlement. Approval requires a different manager.</p>
   <label className="block text-xs">Review reason / ဆုံးဖြတ်ချက်အကြောင်းပြချက်
    <input className={entryStyle} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Minimum 8 characters, evidence or reason"/></label>
   <div className="max-h-60 overflow-auto space-y-2">
    {batches.map(b=>{const reviewed=decisions.find(x=>x.batch_id===b.request_id);return <div key={b.request_id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-xs">
      <span className="font-semibold">{b.selected_way_count} Ways / {b.notification_count} messages · {b.department_key}</span>
      <span>{new Date(b.created_at).toLocaleString()}</span>
      <span>{reviewed?reviewed.decision:"Pending managerial review"}</span>
      {!reviewed&&<div className="flex flex-wrap gap-1">
       <button className="rounded border border-green-600 px-2 py-1" onClick={()=>void decide(b.request_id,"APPROVED")} disabled={busy||b.created_by===user?.id}>Approve task batch</button>
       <button className="rounded border border-red-600 px-2 py-1" onClick={()=>void decide(b.request_id,"REJECTED")} disabled={busy}>Reject</button>
       <button className="rounded border px-2 py-1" onClick={()=>void decide(b.request_id,"CANCELLED")} disabled={busy}>Cancel</button>
      </div>}
    </div>})}
    {!batches.length&&<p className="p-2 text-slate-500">No sent batch in permitted history.</p>}
   </div>
  </div>
 </section>;
}
