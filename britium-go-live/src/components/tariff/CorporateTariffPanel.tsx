import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Contract = {
 id:string;company_name:string;merchant_code:string;project_name:string;contract_ref:string;
 service_type:string;area:"YANGON"|"OUTSIDE_YANGON";bill_to:"CORPORATE"|"RECIPIENT";
 fixed_rate_mmk:number;included_kg:number;extra_per_kg_mmk:number;
 valid_from:string;valid_until:string;approved_at:string|null;
};
type Draft = Omit<Contract,"id"|"approved_at"> & {id?:string};
const today = () => new Date().toISOString().slice(0,10);
const defaultDraft=():Draft=>({
 company_name:"",merchant_code:"",project_name:"",contract_ref:"",service_type:"SPECIAL_EVENT",
 area:"YANGON",bill_to:"CORPORATE",fixed_rate_mmk:0,included_kg:0,extra_per_kg_mmk:0,
 valid_from:today(),valid_until:today()
});
const control="rounded-lg border border-slate-500 bg-white px-3 py-2 text-slate-950";
const fmt=(x:unknown)=>Number(x||0).toLocaleString("en-US")+" MMK";
async function rpc(name:string,args?:object){
 const {data,error}=await (supabase as any).rpc(name,args||{});
 if(error)throw error;
 if(data?.ok!==true)throw new Error(data?.error||data?.message||name+" was rejected");
 return data;
}
export function CorporateTariffPanel({canEdit,isSuperadmin}:{canEdit:boolean;isSuperadmin:boolean}){
 const [contracts,setContracts]=useState<Contract[]>([]);
 const [draft,setDraft]=useState<Draft>(defaultDraft());
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [search,setSearch]=useState("");
 const refresh=async()=>{const result=await rpc("be_corporate_tariff_list_v1");setContracts(result.rows||[])};
 useEffect(()=>{void refresh().catch((e)=>setMessage(e.message))},[]);
 const set=(name:keyof Draft,value:unknown)=>setDraft(d=>({...d,[name]:value}));
 const save=async()=>{
  setBusy(true);setMessage("");
  try{
   if(!draft.company_name.trim()||!draft.contract_ref.trim()||!draft.project_name.trim()||!draft.merchant_code.trim())
    throw new Error("Complete company, merchant code, contract and project.");
   if(draft.valid_until<draft.valid_from)throw new Error("End date cannot precede start date.");
   if([draft.fixed_rate_mmk,draft.included_kg,draft.extra_per_kg_mmk].some(v=>!Number.isFinite(Number(v))||Number(v)<0))
    throw new Error("Rates and weights must be non-negative.");
   const v=await rpc("be_corporate_tariff_manage_v1",{p_action:"UPSERT",p_data:draft});
   setDraft(defaultDraft());await refresh();
   setMessage("Saved "+v.row.contract_ref+". Super Admin approval is required before the rate can be used.");
  }catch(e:any){setMessage(e.message)}finally{setBusy(false)}
 };
 const approve=async(row:Contract,action:"APPROVE"|"REVOKE")=>{
  if(!window.confirm(action+" "+row.contract_ref+" for "+row.area+"?"))return;
  setBusy(true);setMessage("");
  try{await rpc("be_corporate_tariff_manage_v1",{p_action:action,p_data:{id:row.id}});
   await refresh();setMessage("Approval status updated for "+row.contract_ref)}
  catch(e:any){setMessage(e.message)}finally{setBusy(false)}
 };
 const shown=contracts.filter(c=>(c.company_name+" "+c.project_name+" "+c.contract_ref+" "+c.merchant_code+" "+c.area).toLowerCase().includes(search.toLowerCase()));
 return <section className="rounded-2xl border border-[#31516a] bg-[#0b2236] p-5 text-[#d8efff]">
  <h2 className="text-xl font-black text-white">Corporate Services — Contract Tariff</h2>
  <p className="my-2 text-sm text-cyan-200">Special events, campaigns and marketing promotions. Yangon and outside-Yangon rates are defined separately per contract. No rate is active until Super Admin approves it.</p>
  {message&&<p role="status" className="my-3 rounded-lg border border-amber-400/30 p-3 text-amber-200">{message}</p>}
  {canEdit&&<div className="my-4 grid gap-3 rounded-xl border border-[#31516a] p-4 sm:grid-cols-2 lg:grid-cols-4">
   <label>Company<input aria-label="Corporate company" className={control+" w-full"} value={draft.company_name} onChange={e=>set("company_name",e.target.value)}/></label>
   <label>Merchant code<input aria-label="Contract merchant code" className={control+" w-full"} value={draft.merchant_code} onChange={e=>set("merchant_code",e.target.value.toUpperCase())}/></label>
   <label>Project / campaign<input aria-label="Project name" className={control+" w-full"} value={draft.project_name} onChange={e=>set("project_name",e.target.value)}/></label>
   <label>Contract reference<input aria-label="Contract reference" className={control+" w-full"} value={draft.contract_ref} onChange={e=>set("contract_ref",e.target.value)}/></label>
   <label>Service category<select className={control+" w-full"} value={draft.service_type} onChange={e=>set("service_type",e.target.value)}>
    <option value="SPECIAL_EVENT">Special Event</option><option value="MARKETING_PROMOTION">Marketing Promotion</option><option value="PROJECT_DELIVERY">Corporate Project</option><option value="OTHER">Other Contract Service</option>
   </select></label>
   <label>Service area<select className={control+" w-full"} value={draft.area} onChange={e=>set("area",e.target.value)}><option value="YANGON">Within Yangon</option><option value="OUTSIDE_YANGON">Outside Yangon</option></select></label>
   <label>Billing party<select className={control+" w-full"} value={draft.bill_to} onChange={e=>set("bill_to",e.target.value)}><option value="CORPORATE">Contracting Company</option><option value="RECIPIENT">Recipient</option></select></label>
   <label>Base rate (MMK)<input type="number" min="0" step="1" className={control+" w-full"} value={draft.fixed_rate_mmk} onChange={e=>set("fixed_rate_mmk",Number(e.target.value))}/></label>
   <label>Included weight (kg)<input type="number" min="0" step=".01" className={control+" w-full"} value={draft.included_kg} onChange={e=>set("included_kg",Number(e.target.value))}/></label>
   <label>Additional MMK per kg<input type="number" min="0" step="1" className={control+" w-full"} value={draft.extra_per_kg_mmk} onChange={e=>set("extra_per_kg_mmk",Number(e.target.value))}/></label>
   <label>Contract starts<input type="date" className={control+" w-full"} value={draft.valid_from} onChange={e=>set("valid_from",e.target.value)}/></label>
   <label>Contract ends<input type="date" className={control+" w-full"} value={draft.valid_until} onChange={e=>set("valid_until",e.target.value)}/></label>
   <div className="flex gap-2 lg:col-span-4">
    <button type="button" disabled={busy} onClick={()=>void save()} className="rounded-lg bg-[#f6b84b] px-5 py-2 font-bold text-slate-950 disabled:opacity-50">{draft.id?"Save changes":"Create contract rate"}</button>
    <button type="button" onClick={()=>setDraft(defaultDraft())} className="rounded-lg border px-4 py-2">Clear</button>
   </div>
  </div>}
  <div className="my-3 flex flex-wrap items-center justify-between gap-2"><strong>Corporate contract rates: {contracts.length}</strong>
   <input aria-label="Search corporate contracts" placeholder="Find company, project or contract" className={control} value={search} onChange={e=>setSearch(e.target.value)}/>
  </div>
  <div className="max-h-[640px] overflow-auto"><table className="min-w-[1000px] w-full text-sm"><thead><tr className="text-left text-amber-300">{["Company / Project","Merchant","Contract","Area","Rate","Extra / kg","Bill to","Dates","Approval","Action"].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead>
   <tbody>{shown.map(c=><tr key={c.id} className="border-t border-[#31516a]">
    <td className="p-2">{c.company_name}<div className="text-xs text-cyan-200">{c.project_name} · {c.service_type}</div></td><td>{c.merchant_code}</td><td>{c.contract_ref}</td><td>{c.area}</td><td>{fmt(c.fixed_rate_mmk)}</td><td>{fmt(c.extra_per_kg_mmk)}<div className="text-xs">Included {c.included_kg} kg</div></td><td>{c.bill_to}</td><td>{c.valid_from} → {c.valid_until}</td><td>{c.approved_at?"Approved":"Pending"}</td>
    <td className="p-2"><div className="flex gap-2">
     {canEdit&&<button disabled={busy} className="rounded border px-3 py-1" onClick={()=>setDraft({...c})}>Edit</button>}
     {isSuperadmin&&<button disabled={busy} className="rounded border border-amber-400 px-3 py-1 text-amber-300" onClick={()=>void approve(c,c.approved_at?"REVOKE":"APPROVE")}>{c.approved_at?"Revoke":"Approve"}</button>}
    </div></td>
   </tr>)}</tbody></table></div>
  <p className="mt-3 text-xs text-cyan-200">Changing an approved rate makes it pending approval again. Previously bound parcel rates are preserved as historical snapshots, with Finance review required.</p>
 </section>;
}

export function CorporateDataEntryBinding({merchantCode}:{merchantCode:string}){
 const [list,setList]=useState<Contract[]>([]);
 const [tariffId,setTariffId]=useState("");
 const [way,setWay]=useState("");
 const [weight,setWeight]=useState("0");
 const [quote,setQuote]=useState<any>(null);
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;setTariffId("");setQuote(null);void rpc("be_corporate_tariff_list_v1").then(d=>{
  if(live)setList((d.rows||[]).filter((x:Contract)=>x.approved_at && x.merchant_code===merchantCode.toUpperCase() && today()>=x.valid_from&&today()<=x.valid_until));
 }).catch(e=>{if(live)setMessage(e.message)});return()=>{live=false}},[merchantCode]);
 const selected=list.find(x=>x.id===tariffId);
 async function fetchQuote(){
  if(!selected)throw Error("Choose an approved contract tariff.");
  const result=await rpc("be_corporate_tariff_quote_v1",{p_tariff_id:selected.id,p_merchant_code:merchantCode,p_area:selected.area,p_weight_kg:Number(weight)});
  setQuote(result);setMessage("Quote computed by the backend. Verify parcel weight, area and recipient charge before binding.");
 }
 async function bind(){
  if(!selected||!way.trim()||!quote)throw Error("Provide saved Way ID and calculate an approved quote first.");
  const result=await rpc("be_corporate_tariff_bind_way_v1",{p_tariff_id:selected.id,p_delivery_way_id:way.trim()});
  setMessage("Corporate contract linked to "+way.trim()+". Finance review: "+result.finance_review_status+". No payment posted.");
 }
 async function run(operation:()=>Promise<void>){setBusy(true);setMessage("");try{await operation()}catch(e:any){setMessage(e.message)}finally{setBusy(false)}}
 return <section className="mt-3 rounded-xl border border-amber-400/30 bg-[#10283c] p-3 text-white">
  <strong className="text-amber-300">Corporate Contract Rate — Data Entry</strong>
  <p className="text-xs text-cyan-200">For special-event or marketing-project deliveries. Save the parcel first; then bind its Way ID to the approved contract. Contract receivables are tracked separately and require Finance review.</p>
  <div className="mt-2 flex flex-wrap items-end gap-2">
   <label className="text-xs">Approved contract<select aria-label="Approved corporate contract" value={tariffId} onChange={e=>{setTariffId(e.target.value);setQuote(null)}} className={control+" block max-w-[340px]"}>
    <option value="">Select approved contract</option>{list.map(c=><option key={c.id} value={c.id}>{c.contract_ref} · {c.project_name} · {c.area} · {c.bill_to}</option>)}
   </select></label>
   <label className="text-xs">Weight (kg)<input aria-label="Corporate delivery weight" type="number" min="0" step=".01" value={weight} onChange={e=>{setWeight(e.target.value);setQuote(null)}} className={control+" block w-28"}/></label>
   <label className="text-xs">Saved Way ID<input aria-label="Corporate Way ID" value={way} onChange={e=>{setWay(e.target.value);setQuote(null)}} placeholder="D1031-..." className={control+" block w-48"}/></label>
   <button type="button" disabled={busy||!selected} onClick={()=>void run(fetchQuote)} className="rounded-lg border border-amber-400 px-3 py-2 text-xs font-bold disabled:opacity-50">Calculate quote</button>
   <button type="button" disabled={busy||!quote||!way.trim()} onClick={()=>void run(bind)} className="rounded-lg bg-[#f6b84b] px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">Link saved Way to contract</button>
  </div>
  {quote&&<p className="mt-2 text-sm">Contract fee: <strong>{fmt(quote.service_fee_mmk)}</strong> · Corporate receivable: {fmt(quote.corporate_receivable_mmk)} · Recipient charge: {fmt(quote.recipient_fee_mmk)} · Finance review required</p>}
  {message&&<p role="status" className="mt-2 text-sm text-amber-200">{message}</p>}
 </section>;
}

export function CorporateFinanceReviewPanel(){
 const [rows,setRows]=useState<any[]>([]),[message,setMessage]=useState(""),[search,setSearch]=useState("");
 const refresh=async()=>{try{const d=await rpc("be_corporate_way_finance_v1",{p_search:search||null,p_limit:300});setRows(d.rows||[]);setMessage("")}catch(e:any){setMessage(e.message)}};
 const [reviewWay,setReviewWay]=useState("");
 const [reviewAction,setReviewAction]=useState("APPROVE_FOR_INVOICING");
 const [reviewNote,setReviewNote]=useState("");
 const [reviewBusy,setReviewBusy]=useState(false);
 const review=async()=>{setReviewBusy(true);setMessage("");
  try{const r=await rpc("be_corporate_finance_review_action_v1",{p_delivery_way_id:reviewWay,p_action:reviewAction,p_note:reviewNote});
   setMessage("Review saved for "+r.delivery_way_id+". "+r.finance_review_status+". No invoice or payment posted.");
   setReviewWay("");setReviewNote("");await refresh();
  }catch(e:any){setMessage(e.message)}finally{setReviewBusy(false)}
 };
 useEffect(()=>{void refresh()},[]);
 return <section className="my-5 rounded-xl border border-amber-400/30 bg-[#0b2236] p-4 text-white">
  <h2 className="text-lg font-black">Corporate Contracts — Finance Review</h2>
  <p className="mb-3 text-sm text-amber-200">These approved-rate snapshots are pending reconciliation. This screen does not post receipts, alter COD or settle invoices automatically.</p>
  <input aria-label="Corporate finance search" placeholder="Way ID or contracting company" className={control} value={search} onChange={e=>setSearch(e.target.value)}/>
  <button type="button" className="ml-2 rounded-lg bg-amber-400 px-3 py-2 text-slate-900" onClick={()=>void refresh()}>Refresh</button>
  {message&&<p role="status" className="my-2 text-amber-200">{message}</p>}
  <div className="my-3 flex flex-wrap items-end gap-2">
   <label className="text-xs">Corporate Way ID<select aria-label="Select corporate review Way ID" value={reviewWay} onChange={e=>setReviewWay(e.target.value)} className={control+" block"}>
    <option value="">Select saved contract Way</option>{rows.map(row=><option key={row.delivery_way_id} value={row.delivery_way_id}>{row.delivery_way_id} — {row.finance_review_status}</option>)}
   </select></label>
   <label className="text-xs">Review action<select className={control+" block"} value={reviewAction} onChange={e=>setReviewAction(e.target.value)}>
    <option value="APPROVE_FOR_INVOICING">Approve for invoicing (no posting)</option>
    <option value="REQUIRES_CORRECTION">Requires correction</option><option value="REOPEN">Reopen review</option>
   </select></label>
   <label className="text-xs">Finance review note<input aria-label="Finance review note" className={control+" block min-w-[260px]"} value={reviewNote} onChange={e=>setReviewNote(e.target.value)} placeholder="Explain review decision (12+ chars)"/></label>
   <button type="button" className="rounded-lg bg-amber-400 px-3 py-2 text-slate-950 disabled:opacity-50" disabled={!reviewWay||reviewBusy||reviewNote.trim().length<12} onClick={()=>void review()}>Save Finance review</button>
  </div>
  <div className="mt-3 max-h-[420px] overflow-auto"><table className="min-w-[900px] w-full text-sm"><thead><tr>{["Way ID","Company / Project","Area","Total contract fee","Corporate receivable","Recipient fee","Finance state"].map(x=><th className="p-2 text-left" key={x}>{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr className="border-t border-slate-500" key={r.delivery_way_id}><td className="p-2">{r.delivery_way_id}</td><td>{r.company_name}<div>{r.project_name}</div></td><td>{r.area}</td><td>{fmt(r.agreed_fee_mmk)}</td><td>{fmt(r.corporate_receivable_mmk)}</td><td>{fmt(r.recipient_fee_mmk)}</td><td>{r.finance_review_status}</td></tr>)}</tbody></table></div>
 </section>;
}

export function CorporateThirdPartyContext({wayId}:{wayId:string}){
 const [data,setData]=useState<any>(null),[error,setError]=useState("");
 useEffect(()=>{let active=true;setData(null);setError("");
  void rpc("be_corporate_way_lookup_v1",{p_delivery_way_id:wayId})
    .then(d=>{if(active)setData(d.assignment||null)}).catch(e=>{if(active)setError(e.message)});
  return()=>{active=false}
 },[wayId]);
 if(error)return <p className="text-xs text-amber-300">Corporate contract reference unavailable: {error}</p>;
 if(!data)return null;
 return <section className="my-3 rounded-lg border border-cyan-400/30 bg-[#15394d] p-3 text-white">
  <strong>Corporate Contract: {data.contract_ref}</strong> · {data.company_name} / {data.project_name}
  <p>Area: {data.area} · Contract fee: {fmt(data.agreed_fee_mmk)} · Company receivable: {fmt(data.corporate_receivable_mmk)} · Recipient fee: {fmt(data.recipient_fee_mmk)}</p>
  <p className="text-xs text-amber-200">Finance: {data.finance_review_status}. Delivery confirmation does not settle the corporate invoice or create COD receipt.</p>
 </section>;
}
