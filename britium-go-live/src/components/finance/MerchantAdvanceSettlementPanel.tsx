import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Entry = Record<string, any>;
const money = (v: unknown) => Number(v || 0).toLocaleString("en-US") + " MMK";
const input = "w-full rounded-lg border border-slate-600 bg-slate-950 p-2 text-white";
const btn = "rounded-lg border border-amber-600 px-3 py-2 text-sm font-bold disabled:opacity-40";
const financeCreators = ["FINANCE_CREATOR","FINANCE_ADMIN","FINANCE_MANAGER","ACCOUNTS","ADMIN","SUPERADMIN"];
const financeApprovers = ["FINANCE_APPROVER","FINANCE_ADMIN","FINANCE_MANAGER","ADMIN","SUPERADMIN"];
const financePayers = ["PAYMENT_OFFICER","FINANCE_ADMIN","FINANCE_MANAGER","ACCOUNTS","ADMIN","SUPERADMIN"];
const policyAdmins = ["FINANCE_ADMIN","ADMIN","SUPERADMIN"];
const providerOptions = ["BRITIUM","ROYAL EXPRESS","DK DELIVERY","MDY BRANCH","NPT BRANCH","H.TERMINAL DROP-OFF"];

export default function MerchantAdvanceSettlementPanel({role,merchantOptions}:{role:string;merchantOptions:string[]}){
 const [merchant,setMerchant] = useState("");
 const [data,setData] = useState<Entry>({rows:[],batches:[],recoveries:[],items:[],policies:[]});
 const [finalReconciliation,setFinalReconciliation]=useState<Entry>({rows:[],kpis:{}});
 const [finalUnavailable,setFinalUnavailable]=useState("");
 const [selected,setSelected] = useState<string[]>([]);
 const [draftNote,setDraftNote] = useState("");
 const [decisionNote,setDecisionNote] = useState("");
 const [payment,setPayment] = useState({method:"BANK_TRANSFER",ref:"",account:"",evidence:""});
 const [rto,setRto] = useState({itemId:"",amount:"",reason:""});
 const [refundReceipt,setRefundReceipt] = useState({method:"BANK_TRANSFER",reference:"",evidence:""});
 const [policy,setPolicy] = useState({rate:"",deduction:"0",contract:"",enabled:false,providers:providerOptions});
 const [message,setMessage] = useState("");
 const [error,setError] = useState("");
 const [loading,setLoading] = useState(false);
 const [busy,setBusy] = useState(false);
 const [available,setAvailable] = useState(false);
 const [display,setDisplay] = useState("ELIGIBLE");
 const roleKey=role.toUpperCase();
 async function call(name:string,args:Entry){
  const result=await (supabase as any).rpc(name,args);
  if(result.error||result.data?.ok===false)throw new Error(result.error?.message||result.data?.error||"Finance request failed");
  return result.data;
 }
 async function refresh(){
  setLoading(true);setError("");
  try{
   const response=await call("be_finance_advance_preview_v1",{p_merchant_id:merchant||null,p_limit:3000});
   setData(response||{});
   setAvailable(true);
   try{const final=await call("be_finance_advance_final_reconciliation_preview_v1",{p_merchant_id:merchant||null,p_limit:3000});setFinalReconciliation(final||{rows:[],kpis:{}});setFinalUnavailable("");}
   catch(e:any){setFinalReconciliation({rows:[],kpis:{}});setFinalUnavailable(e.message||"Final reconciliation preview not installed");}
   const existing=response.policies?.find((p:Entry)=>p.merchant_id===merchant);
   if(existing)setPolicy({
     rate:String(existing.rate_pct),deduction:String(existing.flat_deduction),
     contract:String(existing.approval_reference||""),enabled:Boolean(existing.enabled),
     providers:existing.allowed_providers||providerOptions
   });
  }catch(e:any){
   setAvailable(false);setError(e.message||"Advance preview is unavailable");
  }finally{setLoading(false)}
 }
 useEffect(()=>{void refresh();setSelected([])},[merchant]);
 const candidates:Entry[]=data.rows||[];
 const eligible=candidates.filter(r=>r.advance_gate==="ELIGIBLE_FOR_ADVANCE_REVIEW");
 const shown=display==="ALL"?candidates:display==="ELIGIBLE"?eligible:candidates.filter(r=>r.advance_gate!== "ELIGIBLE_FOR_ADVANCE_REVIEW");
 const chosen=eligible.filter(r=>selected.includes(r.parcel_id));
 const chosenTotal=chosen.reduce((n,r)=>n+Number(r.proposed_advance||0),0);
 const batches:Entry[]=data.batches||[];
 const advances:Entry[]=data.items||[];
 const recoveries:Entry[]=data.recoveries||[];
 const merchants=[...new Set([...merchantOptions,...candidates.map(r=>String(r.merchant_id||"")),...batches.map(r=>String(r.merchant_id||""))].filter(Boolean))].sort();
 const activePolicy=(data.policies||[]).filter((p:Entry)=>!merchant||p.merchant_id===merchant);
 async function action(callback:()=>Promise<any>,success:string){
  if(busy)return;setBusy(true);setError("");setMessage("");
  try{await callback();setMessage(success);setSelected([]);await refresh()}
  catch(e:any){setError(e.message||"Action rejected")}finally{setBusy(false)}
 }
 async function policySave(){
  if(!merchant||!policy.contract.trim()||policy.contract.trim().length<8||!policy.rate||Number(policy.rate)<=0)return;
  await action(()=>call("be_finance_advance_set_policy_v1",{
   p_merchant_id:merchant,p_enabled:policy.enabled,p_rate_pct:Number(policy.rate),
   p_flat_deduction:Number(policy.deduction||0),p_allowed_providers:policy.providers,p_contract_ref:policy.contract.trim()
  }),"Merchant advance policy updated; no payment created.");
 }
 async function createDraft(){
  if(chosen.length===0||draftNote.trim().length<8)return;
  await action(()=>call("be_finance_advance_create_draft_v1",{p_parcel_ids:chosen.map(r=>r.parcel_id),p_reason:draftNote.trim()}),
   "Draft advance batch created. Independent approval is required before any payment can be recorded.");
 }
 async function transition(b:Entry,act:"SUBMIT"|"APPROVE"|"REJECT"){
  if(decisionNote.trim().length<8)return;
  await action(()=>call("be_finance_advance_transition_v1",{p_batch_id:b.id,p_action:act,p_note:decisionNote.trim()}),
   "Advance batch review status updated; no bank transfer performed.");
 }
 async function confirm(b:Entry){
  if(payment.ref.trim().length<4||!/^https:\/\//.test(payment.evidence))return;
  if(!window.confirm("Have you independently verified that the bank or mobile-money transfer has already occurred? This records payment evidence; it does NOT transfer money."))return;
  await action(()=>call("be_finance_advance_confirm_payment_v1",{
   p_batch_id:b.id,p_method:payment.method,p_reference:payment.ref,p_account:payment.account,p_evidence_url:payment.evidence
  }),"Externally completed merchant advance payment recorded.");
 }
 async function flagRto(){
  if(!rto.itemId||Number(rto.amount)<=0||rto.reason.trim().length<8)return;
  await action(()=>call("be_finance_advance_flag_rto_v1",{
   p_advance_item_id:rto.itemId,p_amount:Number(rto.amount),p_reason:rto.reason
  }),"RTO recovery recorded as REFUND_DUE. No refund has yet been received.");
 }
 async function reviewRto(r:Entry,kind:"APPROVE"|"WAIVE"){
  if(decisionNote.trim().length<8)return;
  await action(()=>call("be_finance_advance_review_rto_v1",{p_recovery_id:r.id,p_action:kind,p_note:decisionNote.trim()}),
   "RTO refund review recorded. No refund receipt has been recorded.");
 }
 async function confirmRefund(r:Entry){
  if(refundReceipt.reference.trim().length<4||!/^https:\/\//.test(refundReceipt.evidence))return;
  if(!window.confirm("Confirm the merchant has actually returned these funds and the receipt has been verified. This does not move money."))return;
  await action(()=>call("be_finance_advance_confirm_refund_v1",{
   p_recovery_id:r.id,p_method:refundReceipt.method,p_reference:refundReceipt.reference,p_evidence_url:refundReceipt.evidence
  }),"Actual merchant refund receipt recorded.");
 }
 return <section className="rounded-2xl border border-amber-500/40 bg-slate-900 p-4 text-slate-100 md:p-5">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div><h2 className="text-xl font-black text-amber-300">Merchant Advance Settlement · ငွေကြိုရှင်း</h2>
    <p className="mt-1 text-sm text-slate-300">Merchant-approved next-day pickup advances, independent payment approval, and post-payment RTO recovery. Delivered status is not required for an eligible advance.</p>
   </div><button className={btn} disabled={loading||busy} onClick={()=>void refresh()}>{loading?"Loading…":"Refresh advance queue"}</button>
  </div>
  {!available&&<p role="status" className="mt-3 rounded-lg border border-amber-700 p-3 text-amber-200">Advance settlement backend is not installed or not accessible. Existing Delivered / Ready to Settle processing stays unchanged. No advance payments can be recorded until UAT and release approval.</p>}
  {error&&<p role="alert" className="mt-2 rounded-lg border border-red-700 p-3 text-red-200">{error}</p>}
  {message&&<p role="status" className="mt-2 rounded-lg border border-emerald-700 p-3 text-emerald-200">{message}</p>}
  <div className="mt-4 flex flex-wrap items-end gap-3">
   <label className="min-w-56 flex-1 text-xs text-slate-300">Merchant
    <select aria-label="Advance merchant" value={merchant} onChange={e=>{setMerchant(e.target.value);setSelected([])}} className={input+" mt-1"}>
     <option value="">All merchants</option>{merchants.map(m=><option value={m} key={m}>{m}</option>)}
    </select>
   </label>
   <label className="text-xs text-slate-300">Eligibility
    <select className={input+" mt-1"} aria-label="Advance eligibility filter" value={display} onChange={e=>setDisplay(e.target.value)}>
     <option value="ELIGIBLE">Eligible for review</option><option value="BLOCKED">Held / not eligible</option><option value="ALL">All</option>
    </select>
   </label>
   <span className="rounded-lg border border-slate-700 px-3 py-2 text-sm">Eligible: <b>{eligible.length}</b> · Selected: <b>{chosen.length}</b> · Proposed: <b>{money(chosenTotal)}</b></span>
  </div>
  <p className="mt-2 text-xs text-amber-200">Pickup receipt evidence and the next Myanmar-calendar day are mandatory. Only signed merchant-policy amounts are eligible; these are not equivalent to COD collected.</p>
  <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-slate-700">
   <table className="w-full min-w-[1200px] text-left text-xs"><thead className="sticky top-0 bg-amber-400 text-slate-950"><tr>
    {["Select","Delivery Way / merchant","Provider","Pickup receipt","Delivery status","Item price","Proposed advance","Advance gate"].map(h=><th className="p-2" key={h}>{h}</th>)}
   </tr></thead><tbody>{shown.map(r=><tr key={r.parcel_id} className="border-t border-slate-700">
    <td className="p-2"><input type="checkbox" aria-label={"Advance "+r.delivery_way_id} disabled={!available||busy||!financeCreators.includes(roleKey)||r.advance_gate!=="ELIGIBLE_FOR_ADVANCE_REVIEW"||Boolean(selected.length&&chosen[0]?.merchant_id!==r.merchant_id)} checked={selected.includes(r.parcel_id)}
     onChange={e=>setSelected(old=>e.target.checked?[...old,r.parcel_id]:old.filter(x=>x!==r.parcel_id))}/></td>
    <td className="p-2 font-semibold">{r.delivery_way_id}<div className="text-slate-400">{r.merchant_id}</div></td><td className="p-2">{r.provider_code}</td>
    <td className="p-2">{r.receipt_at?new Date(r.receipt_at).toLocaleString("en-GB",{timeZone:"Asia/Yangon"}):"Unverified"}<div className="text-slate-400">{r.pickup_proof_source||""}</div></td>
    <td className="p-2">{r.delivery_state}</td><td className="p-2">{money(r.item_price)}</td>
    <td className="p-2 text-emerald-300">{money(r.proposed_advance)}</td><td className="p-2">{r.advance_gate}</td>
   </tr>)}</tbody></table>
   {!shown.length&&<p className="p-4 text-sm text-slate-400">No advance candidates match this filter.</p>}
  </div>
  <div className="mt-3 grid gap-3 lg:grid-cols-2">
   <div className="rounded-lg border border-slate-700 p-3">
    <h3 className="font-bold">Step 1 · Create advance draft</h3>
    <textarea aria-label="Advance justification" placeholder="Signed merchant arrangement / payout reason (at least 8 characters)" value={draftNote} onChange={e=>setDraftNote(e.target.value)} rows={2} className={input+" mt-2"}/>
    <button className={btn+" mt-2"} disabled={!available||busy||!financeCreators.includes(roleKey)||!chosen.length||draftNote.trim().length<8} onClick={()=>void createDraft()}>Create advance draft · {chosen.length} · {money(chosenTotal)}</button>
   </div>
   <div className="rounded-lg border border-slate-700 p-3">
    <h3 className="font-bold">Merchant policy · signed approval only</h3>
    <p className="text-xs text-slate-400">Configured per merchant; unset policies block advances. Provider coverage includes Royal, MDY and NPT.</p>
    <p className="text-xs text-amber-200">Current policy: {activePolicy.map((p:Entry)=>p.merchant_id+" "+(p.enabled?"ENABLED":"OFF")+" "+p.rate_pct+"%").join(" · ")||"None"}</p>
    {policyAdmins.includes(roleKey)&&<div className="mt-2 grid gap-2 sm:grid-cols-2">
     <label className="text-xs">Rate %<input type="number" min="0.01" max="100" step="0.01" className={input} value={policy.rate} onChange={e=>setPolicy({...policy,rate:e.target.value})}/></label>
     <label className="text-xs">Deduction per way (MMK)<input type="number" min="0" step="1" className={input} value={policy.deduction} onChange={e=>setPolicy({...policy,deduction:e.target.value})}/></label>
     <label className="col-span-full text-xs">Signed agreement / approval reference<input className={input} value={policy.contract} onChange={e=>setPolicy({...policy,contract:e.target.value})}/></label>
     <label className="col-span-full text-xs"><input type="checkbox" checked={policy.enabled} onChange={e=>setPolicy({...policy,enabled:e.target.checked})}/> Enable approved advance merchant</label>
     <button className={btn} disabled={!available||busy||!merchant||!policy.rate||policy.contract.length<8} onClick={()=>void policySave()}>Save signed merchant policy</button>
    </div>}
   </div>
  </div>
  <div className="mt-4 rounded-lg border border-slate-700 p-3">
   <h3 className="font-bold">Step 2 · Independent approval / Step 3 · Record actual payment</h3>
   <textarea aria-label="Advance review note" placeholder="Independent review reason (8+ characters)" rows={2} value={decisionNote} onChange={e=>setDecisionNote(e.target.value)} className={input+" mt-2"}/>
   <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
    <select aria-label="Advance payment method" className={input} value={payment.method} onChange={e=>setPayment({...payment,method:e.target.value})}>{["BANK_TRANSFER","KBZ_PAY","AYA_PAY","WAVE_PAY","CASH","OTHER"].map(x=><option key={x}>{x}</option>)}</select>
    <input aria-label="Advance payment transaction reference" className={input} placeholder="Actual transfer reference" value={payment.ref} onChange={e=>setPayment({...payment,ref:e.target.value})}/>
    <input aria-label="Advance payment account" className={input} placeholder="Merchant account" value={payment.account} onChange={e=>setPayment({...payment,account:e.target.value})}/>
    <input aria-label="Advance payment evidence URL" className={input} placeholder="Secure HTTPS receipt evidence URL" value={payment.evidence} onChange={e=>setPayment({...payment,evidence:e.target.value})}/>
   </div>
   <div className="mt-3 max-h-52 space-y-2 overflow-auto">{batches.map(b=><div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700 p-2 text-sm">
    <div><strong>{b.batch_number}</strong> · {b.merchant_id} · {money(b.total_amount)} <span className="text-amber-300">{b.status}</span><div className="text-xs text-slate-400">{b.payment_reference||"No transfer recorded"}</div></div>
    <div className="flex flex-wrap gap-2">
     {b.status==="DRAFT"&&<button className={btn} disabled={busy||decisionNote.trim().length<8||!financeCreators.includes(roleKey)} onClick={()=>void transition(b,"SUBMIT")}>Submit</button>}
     {b.status==="PENDING_APPROVAL"&&financeApprovers.includes(roleKey)&&<><button className={btn} disabled={busy||decisionNote.trim().length<8} onClick={()=>void transition(b,"APPROVE")}>Approve</button><button className={btn} disabled={busy||decisionNote.trim().length<8} onClick={()=>void transition(b,"REJECT")}>Reject</button></>}
     {b.status==="APPROVED"&&<button className={btn} disabled={busy||!financePayers.includes(roleKey)||payment.ref.length<4||!/^https:\/\//.test(payment.evidence)} onClick={()=>void confirm(b)}>Record confirmed payout</button>}
    </div>
   </div>)}</div>
   {!batches.length&&<p className="mt-2 text-sm text-slate-400">No advance batches yet.</p>}
  </div>
  <div className="mt-4 rounded-lg border border-sky-700/60 p-3">
   <h3 className="font-bold text-sky-300">Final delivery/COD reconciliation · Advance offset (review only)</h3>
   <p className="mt-1 text-xs text-slate-400">Delivery outcome remains separate from advance payment. This preview subtracts the confirmed advance from the normal final merchant entitlement, or shows RTO refund risk. It does not post to COD, merchant wallet or bank.</p>
   {finalUnavailable&&<p role="status" className="mt-2 text-sm text-amber-300">Reconciliation preview not installed: {finalUnavailable}</p>}
   <div className="mt-2 grid gap-2 sm:grid-cols-3">
     <div className="rounded-lg bg-slate-950 p-3"><p className="text-xs text-slate-400">Advance already disbursed</p><b>{money(finalReconciliation.kpis?.total_advance_disbursed)}</b></div>
     <div className="rounded-lg bg-slate-950 p-3"><p className="text-xs text-slate-400">Remaining delivered payable (review)</p><b>{money(finalReconciliation.kpis?.delivered_net_due_to_merchant)}</b></div>
     <div className="rounded-lg bg-slate-950 p-3"><p className="text-xs text-slate-400">RTO advance at risk</p><b className="text-rose-300">{money(finalReconciliation.kpis?.rto_advance_at_risk)}</b></div>
   </div>
   <div className="mt-3 max-h-60 overflow-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-slate-800"><tr>{["Way ID","Merchant","Delivery state","Final merchant entitlement","Advance paid","Final +/-","Reconciliation status"].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
    {(finalReconciliation.rows||[]).map((r:Entry)=><tr key={r.advance_item_id} className="border-t border-slate-700">
     <td className="p-2">{r.delivery_way_id}</td><td className="p-2">{r.merchant_id}</td><td className="p-2">{r.delivery_status}</td>
     <td className="p-2">{r.normal_final_entitlement==null?"—":money(r.normal_final_entitlement)}</td>
     <td className="p-2">{money(r.advance_amount)}</td><td className="p-2">{r.net_final_delta==null?"Pending":money(r.net_final_delta)}</td><td className="p-2">{r.reconciliation_state}</td>
    </tr>)}
   </tbody></table></div>
   {!(finalReconciliation.rows||[]).length&&!finalUnavailable&&<p className="mt-2 text-sm text-slate-400">No advanced items with confirmed disbursements yet.</p>}
   <p className="mt-2 text-xs font-semibold text-amber-200">Posting is intentionally blocked until approved final ledger-offset and UAT accounting tests are completed.</p>
  </div>
  <div className="mt-4 rounded-lg border border-rose-700/50 p-3">
   <h3 className="font-bold text-rose-300">Post-payment RTO · Refund / Recovery</h3>
   <p className="text-xs text-slate-400">Original advance stays immutable. Only a truly disbursed parcel confirmed RTO may create a refund-due case. Refund must be independently verified, not assumed paid.</p>
   <div className="mt-2 grid gap-2 md:grid-cols-3">
    <select aria-label="Advanced parcel RTO selection" className={input} value={rto.itemId} onChange={e=>setRto({...rto,itemId:e.target.value})}>
     <option value="">Select already advanced way</option>{advances.filter(a=>a.batch_status==="DISBURSED").map(a=><option value={a.id} key={a.id}>{a.delivery_way_id} · {a.current_delivery_status} · {money(a.advance_amount)}</option>)}
    </select>
    <input aria-label="RTO refund amount" type="number" min="0" step="1" className={input} placeholder="Refund due MMK" value={rto.amount} onChange={e=>setRto({...rto,amount:e.target.value})}/>
    <input aria-label="RTO recovery reason" className={input} placeholder="RTO reason / reference" value={rto.reason} onChange={e=>setRto({...rto,reason:e.target.value})}/>
   </div>
   <button className={btn+" mt-2"} disabled={!available||busy||!financeCreators.includes(roleKey)||!rto.itemId||Number(rto.amount)<=0||rto.reason.trim().length<8} onClick={()=>void flagRto()}>Flag verified RTO refund due</button>
   <div className="mt-3 grid gap-2 md:grid-cols-3">
    <select aria-label="Refund receipt method" className={input} value={refundReceipt.method} onChange={e=>setRefundReceipt({...refundReceipt,method:e.target.value})}>
      {["BANK_TRANSFER","KBZ_PAY","AYA_PAY","WAVE_PAY","CASH","OTHER"].map(x=><option key={x}>{x}</option>)}
    </select>
    <input aria-label="Refund receipt transaction reference" className={input} placeholder="Actual merchant refund reference" value={refundReceipt.reference} onChange={e=>setRefundReceipt({...refundReceipt,reference:e.target.value})}/>
    <input aria-label="Refund receipt evidence URL" className={input} placeholder="Secure HTTPS refund receipt" value={refundReceipt.evidence} onChange={e=>setRefundReceipt({...refundReceipt,evidence:e.target.value})}/>
   </div>
   <div className="mt-3 space-y-2">{recoveries.map(r=><div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-900 p-2 text-sm">
    <div>{r.delivery_way_id} · {r.merchant_id} · {money(r.amount)} · <b>{r.status}</b> · {r.reason}</div>
    <div className="flex gap-2">
      {r.status==="REFUND_DUE"&&financeApprovers.includes(roleKey)&&<>
       <button className={btn} disabled={busy||decisionNote.trim().length<8} onClick={()=>void reviewRto(r,"APPROVE")}>Approve refund</button>
       <button className={btn} disabled={busy||decisionNote.trim().length<8} onClick={()=>void reviewRto(r,"WAIVE")}>Waive with reason</button>
      </>}
      {r.status==="APPROVED"&&<button className={btn} disabled={busy||!financePayers.includes(roleKey)||refundReceipt.reference.trim().length<4||!/^https:\/\//.test(refundReceipt.evidence)} onClick={()=>void confirmRefund(r)}>Record received refund</button>}
    </div>
   </div>)}</div>
  </div>
 </section>;
}
