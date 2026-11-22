import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type Person = {auth_user_id:string;full_name:string;email:string;department:string;role_code:string};
const departments=[
 ["OPERATIONS","Operations / လုပ်ငန်းလည်ပတ်ရေး"],
 ["FIELD_TEAM","Rider / Driver / Helper — ပို့ဆောင်ရေးအဖွဲ့"],
 ["WAREHOUSE","Warehouse / ဂိုဒေါင်"],
 ["CUSTOMER_SERVICE","Customer Service / ဖောက်သည်ဝန်ဆောင်မှု"],
 ["FINANCE","Finance / ဘဏ္ဍာရေး"],
 ["BRANCH","Branch Offices / ရုံးခွဲများ"],
 ["THIRD_PARTY","Third-Party Providers / ပြင်ပဝန်ဆောင်မှု"],
 ["MERCHANT_RELATIONS","Merchant Relations / ဆိုင်များဆက်သွယ်ရေး"],
 ["ADMIN_HR","Administration & HR / စီမံခန့်ခွဲရေး"],
 ["MARKETING","Marketing / ဈေးကွက်ရှာဖွေရေး"]
] as const;
const templates=[
 ["POD_VERIFICATION","Request delivery proof / ပို့ဆောင်မှုအထောက်အထား",
 "Please verify actual delivery and attach signed proof, date and collection evidence as soon as possible.",
 "အမှန်တကယ်ပို့ဆောင်ပြီးစီးမှုကို စစ်ဆေးပြီး လက်မှတ်ပါအထောက်အထား၊ နေ့စွဲနှင့် ငွေကောက်ခံမှုအထောက်အထားတို့ကို အမြန်ဆုံးတင်ပြပါ။"],
 ["PROVIDER_HANDOVER","Confirm provider handover / လွှဲပြောင်းလက်ခံမှု",
 "Please confirm the current parcel custodian and attach signed provider handover and manifest references urgently.",
 "လက်ရှိပါဆယ်ကို တာဝန်ယူထားသူအား အတည်ပြုပြီး ဝန်ဆောင်မှုပေးသူ လွှဲပြောင်းလက်ခံလက်မှတ်နှင့် စာရင်းအထောက်အထားကို အမြန်ဆုံးတင်ပြပါ။"],
 ["RTO_CONFIRMATION","Confirm return to merchant / ပြန်အပ်မှု",
 "Please verify the RTO receipt by the merchant and provide signed return evidence and applicable charges.",
 "ကုန်သည်ထံ ပြန်လည်အပ်နှံလက်ခံပြီးစီးမှုကို စစ်ဆေးပြီး လက်မှတ်ပါပြန်အပ်အထောက်အထားနှင့် ကျသင့်ငွေများကို တင်ပြပါ။"],
 ["COD_RECONCILIATION","Reconcile COD / ငွေရှင်းတမ်း",
 "Please reconcile collected COD, bank/cash receipt, prior settlement and remaining balance without duplicate posting.",
 "ကောက်ခံ COD၊ ဘဏ်/ငွေသားလက်ခံဖြတ်ပိုင်း၊ ယခင်ရှင်းလင်းငွေနှင့် ကျန်ရှိငွေတို့ကို ထပ်မံစာရင်းသွင်းခြင်းမရှိစေဘဲ စစ်ဆေးညှိနှိုင်းပါ။"],
 ["GATE_SETTLEMENT","Complete gate settlement / ဂိတ်ချ ငွေရှင်း",
 "Please confirm gate delivery receipt, approved gate charges and supporting payment evidence for settlement review.",
 "ဂိတ်ချ လက်ခံအထောက်အထား၊ အတည်ပြုဂိတ်ခနှင့် ငွေပေးချေမှုအထောက်အထားများကို စစ်ဆေး၍ ငွေရှင်းစိစစ်ရန် တင်ပြပါ။"],
 ["LOCATION_AND_CUSTODY","Locate idle parcel / ပါဆယ်တည်နေရာ",
 "Please locate the parcel, identify the last confirmed custodian, and record the next action and completion deadline.",
 "ပါဆယ်တည်နေရာနှင့် နောက်ဆုံးအတည်ပြုတာဝန်ခံကို ရှာဖွေပြီး နောက်လုပ်ဆောင်ချက်နှင့် ပြီးစီးရမည့်အချိန်ကို မှတ်တမ်းတင်ပါ။"],
 ["OTHER_REVIEW","Urgent task follow-up / အရေးပေါ်လိုက်လံဆောင်ရွက်ရန်",
 "Please investigate the outstanding parcel task, provide supporting evidence and update the responsible manager promptly.",
 "ကျန်ရှိနေသော ပါဆယ်လုပ်ငန်းတာဝန်ကို အမြန်စစ်ဆေးပြီး အထောက်အထားနှင့်တကွ တာဝန်ရှိမန်နေဂျာထံ ချက်ချင်းအကြောင်းပြန်ပါ။"]
] as const;
const input="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm";
const isAllowed=(role:string)=>["superadmin","super-admin","operation-manager","operation_manager","operations-manager","operations_manager"].includes(role.toLowerCase());
export default function ParcelActionComposer({wayId}:{wayId:string}){
 const {profile,user}=useAuth();
 const [department,setDepartment]=useState<string>("OPERATIONS");
 const [scope,setScope]=useState<"PERSON"|"DEPARTMENT">("PERSON");
 const [recipient,setRecipient]=useState("");
 const [template,setTemplate]=useState<string>("LOCATION_AND_CUSTODY");
 const [en,setEn]=useState(templates[5][2] as string);
 const [my,setMy]=useState(templates[5][3] as string);
 const [due,setDue]=useState("");
 const [people,setPeople]=useState<Person[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [result,setResult]=useState("");
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const [loaded,setLoaded]=useState(false);
 const [lang,setLang]=useState<"both"|"en"|"my">("both");
 const allowed=isAllowed(profile?.role||"");
 const load=useCallback(async()=>{
  if(!allowed)return;
  const {data,error:e}=await (supabase as any).rpc("be_parcel_alert_directory_v1");
  if(e){setError("Staff directory unavailable: "+e.message);setPeople([]);}
  else{setPeople((data||[]) as Person[]);setLoaded(true);}
 },[allowed]);
 useEffect(()=>{void load();},[load]);
 const available=useMemo(()=>people.filter(p=>p.department===department),[people,department]);
 const choice=(key:string)=>{
  setTemplate(key);
  const t=templates.find(x=>x[0]===key);
  if(t){setEn(t[2]);setMy(t[3]);}
 };
 async function send(){
  setResult("");setError("");
  if(scope==="DEPARTMENT"&&available.length>20 && !window.confirm(`Send the task notification to ${available.length} members of ${department}? / ဌာနရှိဝန်ထမ်း ${available.length} ဦးထံ ပို့ရန်အတည်ပြုပါ။`))return;
  if(!allowed||!user){setError("An authorized Superadmin or Operation Manager session is required.");return;}
  if(scope==="PERSON"&&!recipient){setError("Select an individual recipient.");return;}
  if(!due||!en.trim()||!my.trim()){setError("Choose a deadline and complete both English/Myanmar messages.");return;}
  setBusy(true);
  const {data,error:e}=await (supabase as any).rpc("be_parcel_send_targeted_alert_v1",{
   p_way_id:wayId,p_department:department,p_recipient_scope:scope,
   p_recipient_user_id:scope==="PERSON"?recipient:null,p_task_type:template,
   p_message_en:en.trim(),p_message_my:my.trim(),
   p_due_at:new Date(due).toISOString(),p_request_id:requestId
  });
  setBusy(false);
  if(e){setError(e.message);return;}
  const sent=Number(data?.sent||0);
  setResult(data?.already_sent? "Already sent / ပို့ပြီးသားဖြစ်ပါသည်" :
   "Notification delivered to "+sent+" selected account(s). / သတ်မှတ်ထားသော အကောင့် "+sent+" ခုသို့ အသိပေးချက်ပို့ပြီးပါပြီ။");
  if(!data?.already_sent){setRequestId(crypto.randomUUID());}
 }
 if(!allowed)return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Only Superadmin / Operation Manager can send new follow-up notifications. / Superadmin နှင့် Operation Manager များသာ အသိပေးချက်အသစ် ပို့နိုင်သည်။</p>;
 return <section className="space-y-3 rounded-xl border bg-white p-4" aria-label="Bilingual parcel action notifications">
  <div><h3 className="font-semibold">Send action notification / လုပ်ငန်းတာဝန် အသိပေးချက်ပို့ရန်</h3>
   <p className="text-xs text-slate-500">Way ID: <strong>{wayId}</strong> · One person or selected department only; no broadcast to all staff.</p></div>
  <div className="grid gap-3 md:grid-cols-2">
   <label className="text-xs font-medium">Department / ဌာန
    <select className={input} value={department} onChange={e=>{setDepartment(e.target.value);setRecipient("");}}>
     {departments.map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></label>
   <label className="text-xs font-medium">Destination / ပို့ရန်
    <select className={input} value={scope} onChange={e=>setScope(e.target.value as "PERSON"|"DEPARTMENT")}>
     <option value="PERSON">Selected individual / သတ်မှတ်ဝန်ထမ်း</option>
     <option value="DEPARTMENT">Entire selected department / သတ်မှတ်ဌာနရှိဝန်ထမ်းများ</option>
    </select></label>
   {scope==="PERSON"?<label className="text-xs font-medium">Employee / ဝန်ထမ်း
     <select className={input} value={recipient} onChange={e=>setRecipient(e.target.value)}>
      <option value="">Choose employee / ဝန်ထမ်းရွေးပါ</option>
      {available.map(p=><option value={p.auth_user_id} key={p.auth_user_id}>{p.full_name} — {p.email}</option>)}
     </select>
    </label>:<p className="rounded bg-amber-50 p-2 text-xs text-amber-800">Recipients: {available.length} active users in {department}; maximum 80. This is sent only after confirmation. No other departments are notified.</p>}
   <label className="text-xs font-medium">Predefined message / ကြိုတင်သတ်မှတ်စာ
    <select className={input} value={template} onChange={e=>choice(e.target.value)}>
     {templates.map(t=><option value={t[0]} key={t[0]}>{t[1]}</option>)}
    </select></label>
   <label className="text-xs font-medium">Due date and time / နောက်ဆုံးလုပ်ဆောင်ရမည့်အချိန်
    <input type="datetime-local" className={input} value={due} onChange={e=>setDue(e.target.value)}/></label>
   <label className="text-xs font-medium">Message language / စာဘာသာ
    <select className={input} value={lang} onChange={e=>setLang(e.target.value as "both"|"en"|"my")}>
     <option value="both">English + မြန်မာ</option><option value="en">English editor</option><option value="my">မြန်မာစာ editor</option>
    </select></label>
   {(lang==="both"||lang==="en")&&<label className="text-xs font-medium md:col-span-2">English message — editable
    <textarea rows={3} className={input} value={en} maxLength={1500} onChange={e=>setEn(e.target.value)}/></label>}
   {(lang==="both"||lang==="my")&&<label className="text-xs font-medium md:col-span-2">မြန်မာစာ အသိပေးချက် — ပြင်ဆင်ရေးသားနိုင်သည်
    <textarea rows={3} className={input} value={my} maxLength={1500} onChange={e=>setMy(e.target.value)}/></label>}
  </div>
  {!loaded&&<p className="text-xs text-amber-700">Staff directory not loaded. Check account permissions.</p>}
  {error&&<p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
  {result&&<p role="status" className="rounded bg-emerald-50 p-2 text-sm text-emerald-800">{result}</p>}
  <button onClick={()=>void send()} type="button" disabled={busy||!loaded||(scope==="PERSON"&&!recipient)||!due||!en.trim()||!my.trim()}
   className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">
   {busy?"Sending…":"Send notification & assign task / အသိပေးချက်နှင့် တာဝန်ပို့ရန်"}
  </button>
  <p className="text-xs text-slate-500">Notifications are in-app and create follow-up tasks. They do not change custody, parcel outcome, or finance settlement.</p>
 </section>;
}
