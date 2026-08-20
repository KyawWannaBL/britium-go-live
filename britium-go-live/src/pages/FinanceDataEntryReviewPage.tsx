import { useEffect, useMemo, useState } from "react";
import { Calculator, CheckCircle2, History, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const FINANCE_DATA_ENTRY_REVIEW_BUILD = "FINANCE_DATA_ENTRY_REVIEW_MY_V4_20260817";

const METHODS = [
  ["ITEM_PRICE_PLUS_DECLARED_DELIVERY", "ပစ္စည်းတန်ဖိုး + သတ်မှတ်ထားသော ပို့ဆောင်ခ"],
  ["DELIVERY_CHARGE_ONLY", "ပို့ဆောင်ခသာ"],
  ["EXACT_COLLECTION_AMOUNT", "အတိအကျ ကောက်ခံမည့်ငွေ"],
  ["OPAQUE_COD_COLLECTION", "ခွဲခြမ်းမထားသော COD ကောက်ခံငွေ (ယာယီ)"],
] as const;

type Row = Record<string, any>;
const inputClass="w-full rounded-lg border border-[#1a3a5c] bg-[#061524] px-3 py-2 text-sm text-[#eef8ff] outline-none focus:border-[#f6b84b]";
const box="rounded-xl border border-[#1a3a5c] bg-[#0b2236] p-4";
const money=(v:unknown)=>Number.isFinite(Number(v))?`${Number(v).toLocaleString("en-US")} MMK`:"—";

function deviceContext(){
  let id=localStorage.getItem("be_finance_device_id");
  if(!id){id=crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;localStorage.setItem("be_finance_device_id",id);}
  return {client_device_id:id,client_user_agent:navigator.userAgent,client_timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||""};
}

export default function FinanceDataEntryReviewPage(){
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [message,setMessage]=useState(""),[selectedWay,setSelectedWay]=useState("");
  const [rows,setRows]=useState<Row[]>([]),[audit,setAudit]=useState<Row[]>([]),[scope,setScope]=useState<any>({});
  const [preview,setPreview]=useState<any>(null);
  const [form,setForm]=useState<any>({amount_entry_type:"ITEM_PRICE_PLUS_DECLARED_DELIVERY",item_price:"",delivery_charges:"",merchant_stated_total_amount:"",weight_kg:"",reason:"Finance review and confirmation"});
  const selected=useMemo(()=>rows.find(r=>String(r.delivery_way_id||r.way_id)===selectedWay)||null,[rows,selectedWay]);

  async function load(){
    setLoading(true);setMessage("");
    try{
      const {data,error}=await (supabase as any).rpc("be_finance_settlement_snapshot_v3",{p_merchant_id:null,p_search:null,p_limit:1000});
      if(error)throw error;
      setRows(Array.isArray(data?.rows)?data.rows:[]);setAudit(Array.isArray(data?.audit)?data.audit:[]);setScope(data?.scope||{});
      const first=data?.rows?.[0];if(first&&!selectedWay)setSelectedWay(String(first.delivery_way_id||first.way_id||""));
    }catch(e:any){setMessage(e?.message||"Finance data မဖတ်နိုင်ပါ။");}finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);
  useEffect(()=>{
    if(!selected)return;
    const t=METHODS.some(([v])=>v===selected.amount_entry_type)?selected.amount_entry_type:"ITEM_PRICE_PLUS_DECLARED_DELIVERY";
    setForm({amount_entry_type:t,item_price:selected.item_price??"",delivery_charges:selected.merchant_declared_delivery??selected.delivery_charges??"",merchant_stated_total_amount:(t==="EXACT_COLLECTION_AMOUNT"||t==="OPAQUE_COD_COLLECTION")?(selected.customer_total_collection??selected.cod_amount??""):"",weight_kg:selected.weight_kg??selected.actual_weight_kg??"",reason:"Finance review and confirmation"});
    setPreview(null);
  },[selectedWay]);

  async function run(dry:boolean){
    if(!selectedWay)return;setBusy(true);setMessage("");
    try{
      const payload={...form,...deviceContext(),item_price:form.item_price===""?null:Number(form.item_price),delivery_charges:form.delivery_charges===""?null:Number(form.delivery_charges),merchant_stated_total_amount:form.merchant_stated_total_amount===""?null:Number(form.merchant_stated_total_amount),weight_kg:form.weight_kg===""?null:Number(form.weight_kg)};
      const {data,error}=await (supabase as any).rpc("be_finance_confirm_data_entry_financial_v4",{p_way_id:selectedWay,p_changes:payload,p_dry_run:dry});
      if(error)throw error;if(!data?.ok){setPreview(data?.preview||data?.data||null);throw new Error(data?.message||data?.code||"Finance confirmation မအောင်မြင်ပါ။");}
      setPreview(data?.data||null);setMessage(dry?"အကြိုတွက်ချက်မှု အောင်မြင်ပါသည်။":"Finance အတည်ပြုမှု အောင်မြင်ပါသည်။");if(!dry)await load();
    }catch(e:any){setMessage(e?.message||"လုပ်ဆောင်မှု မအောင်မြင်ပါ။");}finally{setBusy(false);}
  }

  if(loading)return <div className="min-h-screen bg-[#061524] p-8 text-white"><Loader2 className="mr-2 inline animate-spin"/>Finance စာရင်းဖတ်နေပါသည်…</div>;
  const exact=form.amount_entry_type==="EXACT_COLLECTION_AMOUNT"||form.amount_entry_type==="OPAQUE_COD_COLLECTION";
  return <div className="min-h-screen bg-[#061524] p-4 text-[#eef8ff]" style={{fontFamily:'"Myanmar Text","Noto Sans Myanmar",system-ui,sans-serif'}}><div className="mx-auto max-w-[1600px] space-y-4">
    <div className={box}><div className="flex flex-wrap justify-between gap-3"><div><div className="text-xs font-black text-[#f6b84b]">FINANCE DATA ENTRY REVIEW</div><h1 className="mt-2 text-2xl font-black">Data Entry ငွေကောက်ခံပုံနှင့် ငွေရှင်းတမ်း အတည်ပြုခြင်း</h1><p className="mt-2 text-sm text-[#9bbbd0]">Data Entry ရွေးချယ်မှုသည် အကြိုသတ်မှတ်ချက်ဖြစ်ပြီး Finance က ပြင်ဆင်/အတည်ပြုပြီးမှ နောက်ဆုံးငွေရှင်းတမ်းအတွက် အသုံးပြုမည်။</p></div><div><span className="mr-2 rounded-lg bg-[#12314a] px-3 py-2 text-xs">Role: {scope?.role||"—"}</span><button onClick={()=>void load()} className="rounded-lg border border-[#3aa7de]/40 bg-[#12314a] px-3 py-2 text-xs"><RefreshCw size={14} className="mr-2 inline"/>ပြန်ဖတ်ရန်</button></div></div></div>
    {message?<div className="rounded-xl border border-[#f6b84b]/30 bg-[#f6b84b]/10 p-3 text-sm text-[#ffd98a]">{message}</div>:null}
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]"><div className={box}><label className="text-xs font-black text-[#8fd3ff]">Delivery Way ID</label><select value={selectedWay} onChange={e=>setSelectedWay(e.target.value)} className={`${inputClass} mt-2`}>{rows.map(r=>{const w=String(r.delivery_way_id||r.way_id||"");return <option key={w} value={w}>{w} · {r.merchant_id||""}</option>})}</select>{selected?<div className="mt-4 space-y-2 text-sm"><div>ကုန်သည်: <b>{selected.merchant_name||selected.merchant_id||"—"}</b></div><div>လက်ရှိကောက်ခံငွေ: <b>{money(selected.customer_total_collection||selected.cod_amount)}</b></div><div>Britium ပို့ဆောင်ခ: <b>{money(selected.net_system_delivery_charge)}</b></div><div>ကုန်သည်ရှင်းတမ်း: <b>{money(selected.merchant_final_settlement_amount)}</b></div></div>:null}</div>
    <div className={box}><div className="mb-4 flex items-center gap-2 font-black text-[#68e8bd]"><ShieldCheck size={18}/>Finance ပြင်ဆင်/အတည်ပြုရန်</div><div className="grid gap-3 md:grid-cols-2"><label>ငွေကောက်ခံပုံ<select className={inputClass} value={form.amount_entry_type} onChange={e=>setForm({...form,amount_entry_type:e.target.value})}>{METHODS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>{!exact&&form.amount_entry_type!=="DELIVERY_CHARGE_ONLY"?<label>ပစ္စည်းတန်ဖိုး<input type="number" className={inputClass} value={form.item_price} onChange={e=>setForm({...form,item_price:e.target.value})}/></label>:null}{!exact?<label>ကုန်သည်သတ်မှတ် ပို့ဆောင်ခ<input type="number" className={inputClass} value={form.delivery_charges} onChange={e=>setForm({...form,delivery_charges:e.target.value})}/></label>:null}{exact?<label>အတိအကျ / COD စုစုပေါင်းကောက်ခံငွေ<input type="number" className={inputClass} value={form.merchant_stated_total_amount} onChange={e=>setForm({...form,merchant_stated_total_amount:e.target.value})}/></label>:null}<label>အလေးချိန် (kg)<input type="number" className={inputClass} value={form.weight_kg} onChange={e=>setForm({...form,weight_kg:e.target.value})}/></label></div><label className="mt-3 block">ပြင်ဆင်ရသည့်အကြောင်းရင်း<input className={inputClass} value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/></label><div className="mt-4 flex gap-2"><button disabled={busy} onClick={()=>void run(true)} className="rounded-lg border border-[#3aa7de]/40 bg-[#12314a] px-4 py-2 text-sm font-black"><Calculator size={15} className="mr-2 inline"/>အကြိုတွက်ချက်ရန်</button><button disabled={busy} onClick={()=>void run(false)} className="rounded-lg border border-[#34d399]/40 bg-[#0d3b32] px-4 py-2 text-sm font-black text-[#68e8bd]"><CheckCircle2 size={15} className="mr-2 inline"/>Finance အတည်ပြုရန်</button></div>{preview?<div className="mt-4 grid gap-3 md:grid-cols-3"><div className={box}>ကောက်ခံငွေ<br/><b>{money(preview.cod_amount)}</b></div><div className={box}>Britium ရပိုင်ခွင့်<br/><b>{money(preview.net_system_delivery_charge)}</b></div><div className={box}>ကုန်သည်ရှင်းတမ်း<br/><b>{money(preview.merchant_final_settlement_amount)}</b></div></div>:null}</div></div>
    <div className={box}><div className="mb-3 flex items-center gap-2 font-black"><History size={18}/>Finance ပြောင်းလဲမှုမှတ်တမ်း</div><div className="overflow-auto"><table className="w-full min-w-[800px] text-left text-xs"><thead><tr><th className="p-2">အချိန်</th><th>Action</th><th>Way</th><th>Account</th><th>Role</th><th>Device</th></tr></thead><tbody>{audit.filter(a=>String(a.action||"").includes("DATA_ENTRY")).slice(0,100).map((a,i)=><tr key={a.id||i} className="border-t border-[#1a3a5c]"><td className="p-2">{String(a.created_at||"")}</td><td>{a.action}</td><td>{a.entity_id}</td><td>{a.actor_email||a.actor_uid}</td><td>{a.actor_role}</td><td>{a.new_value?.finance_review?.device_id||"—"}</td></tr>)}</tbody></table></div></div>
  </div></div>;
}
