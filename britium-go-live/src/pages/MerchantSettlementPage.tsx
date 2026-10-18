import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, RefreshCw, WalletCards } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { uploadSettlementReceipt } from "@/lib/merchantSettlementReceipt";
import SettlementReceiptLink from "@/components/SettlementReceiptLink";
type Row = Record<string, any>;
const money=(n:unknown)=>Number(n||0).toLocaleString("en-US")+" MMK";
const field="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white";
const button="rounded-xl border border-sky-700 px-4 py-2 font-bold disabled:opacity-40";
const methods=["CASH","BANK_TRANSFER","KBZ_PAY","WAVE_PAY","AYA_PAY","CB_PAY","CHEQUE","OTHER"];
export default function MerchantSettlementPage(){
 const [data,setData]=useState<Row>({rows:[],batches:[],payments:[],wallet:{}});
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [search,setSearch]=useState(""),[merchant,setMerchant]=useState(""),[from,setFrom]=useState(""),[to,setTo]=useState("");
 const [selected,setSelected]=useState<string[]>([]),[allocations,setAllocations]=useState<Record<string,string>>({});
 const [payment,setPayment]=useState({method:"BANK_TRANSFER",reference:"",account:"",evidence:""});
 const [adjustment,setAdjustment]=useState({type:"NONE",direction:"CREDIT",amount:"",reason:""});
 const [post,setPost]=useState({batch:"",type:"REFUND",direction:"CREDIT",amount:"",reason:""});
 const [review,setReview]=useState({id:"",action:"APPROVE",note:""});
 const [requests,setRequests]=useState<Row[]>([]);
 const mutation=useRef(false),uploadLock=useRef(false);
 const [uploading,setUploading]=useState(false),[receiptName,setReceiptName]=useState("");
 async function uploadReceipt(event:React.ChangeEvent<HTMLInputElement>){
   const file=event.target.files?.[0];event.target.value="";
   if(!file||uploadLock.current||mutation.current||!canUploadReceipt)return;
   uploadLock.current=true;setUploading(true);setError("");setMessage("");
   setPayment(p=>({...p,evidence:""}));setReceiptName("");
   try{const receipt=await uploadSettlementReceipt(file);setPayment(p=>({...p,evidence:receipt.url}));setReceiptName(receipt.filename);setMessage("Receipt uploaded. Review the payment details, then record the confirmed payment.");}
   catch(e:any){setError(e.message||"Receipt upload failed. Please try again.");}
   finally{uploadLock.current=false;setUploading(false);}
 }
 async function rpc(name:string,args:Row){ const r=await (supabase as any).rpc(name,args); if(r.error||r.data?.ok===false) throw new Error(r.error?.message||r.data?.error||r.data?.code||"Request failed"); return r.data; }
 async function load(){
   setLoading(true); setError("");
   try { const next=await rpc("be_finance_settlement_snapshot_v3",{p_merchant_id:null,p_search:null,p_limit:5000}); setData(next); }
   catch(e:any){setError(e.message);} finally{setLoading(false);}
 }
 async function loadRequests(){try{const x=await rpc("be_finance_post_payment_adjustments_list_v1",{});setRequests(Array.isArray(x)?x:[]);}catch(e:any){setError(e.message);}}
 async function requestPost(){await mutate(()=>rpc("be_finance_post_payment_adjustment_request_v1",{p_batch_id:post.batch,p_type:post.type,p_direction:post.direction,p_amount:Number(post.amount),p_reason:post.reason,p_evidence_url:null}),"Adjustment requested without transferring funds.");await loadRequests();}
 async function reviewPost(){await mutate(()=>rpc("be_finance_post_payment_adjustment_review_v1",{p_adjustment_id:review.id,p_action:review.action,p_note:review.note}),"Review recorded; funds have not been transferred.");await loadRequests();}
 useEffect(()=>{void load();},[]);
 const role=String(data.scope?.role||"");
 const canCreate=["FINANCE_CREATOR","FINANCE_ADMIN","FINANCE","FINANCE_MANAGER","ACCOUNTS","ADMIN","SUPERADMIN"].includes(role);
 const canUploadReceipt=["FINANCE","FINANCE_CREATOR","FINANCE_REVIEWER","FINANCE_APPROVER","PAYMENT_OFFICER","FINANCE_ADMIN","FINANCE_MANAGER","ACCOUNTS","ADMIN","SUPERADMIN"].includes(role);
 const canPay=["PAYMENT_OFFICER","FINANCE_ADMIN","FINANCE_MANAGER","ACCOUNTS","ADMIN","SUPERADMIN"].includes(role);
 const rows=useMemo(()=>(data.rows||[]).filter((r:Row)=>{
   const day=String(r.created_at||"").slice(0,10);
   return (!merchant||r.merchant_id===merchant)&&(!from||day>=from)&&(!to||day<=to)&&(!search||JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));
 }),[data.rows,search,merchant,from,to]);
 const merchants=useMemo(()=>Array.from(new Set<string>((data.rows||[]).map((r:Row)=>String(r.merchant_id)).filter(Boolean))).sort(),[data.rows]);
 const batches=(data.batches||[]).filter((r:Row)=>!merchant||r.merchant_id===merchant);
 const payments=(data.payments||[]).filter((r:Row)=>!merchant||r.merchant_id===merchant);
 const payableBatches=batches.filter((b:Row)=>["APPROVED","PARTIALLY_PAID"].includes(b.status)&&Number(b.outstanding_amount)>0);
 const chosen=rows.filter((r:Row)=>selected.includes(r.parcel_id));
 async function mutate(action:()=>Promise<any>,success:string){
   if(mutation.current||uploadLock.current)return; mutation.current=true;setBusy(true);setError("");setMessage("");
   try{await action();setSelected([]);setAllocations({});setMessage(success);await load();}
   catch(e:any){setError(e.message);}finally{mutation.current=false;setBusy(false);}
 }
 function toggle(r:Row){
   if(!r.settlement_eligible)return;
   if(!selected.includes(r.parcel_id)&&chosen.length&&chosen[0].merchant_id!==r.merchant_id){setError("Create each batch for one merchant. Bulk payments can cover multiple approved batches.");return;}
   setSelected(s=>s.includes(r.parcel_id)?s.filter(x=>x!==r.parcel_id):[...s,r.parcel_id]);
 }
 async function createBatch(){
   const amount=adjustment.type==="NONE"?0:Number(adjustment.amount);
   if(adjustment.type!=="NONE"&&(!Number.isFinite(amount)||amount<=0||Math.round(amount*100)/100!==amount||!adjustment.reason.trim())){setError("Provide a positive adjustment amount and manual reason.");return;}
   const basePayable=chosen.reduce((sum,row)=>sum+Number(row.merchant_final_settlement_amount||0),0);
   if(adjustment.type!=="NONE"&&adjustment.direction==="DEDUCTION"&&amount>basePayable){setError("Deduction exceeds this draft merchant payable. Use a separately approved recovery transaction rather than creating negative payout.");return;}
   const reason=adjustment.type==="NONE"?"No adjustment":adjustment.type+" / "+adjustment.direction+": "+adjustment.reason.trim();
   await mutate(()=>rpc("be_finance_create_settlement_batch_v3",{p_parcel_ids:selected,p_period_from:from||null,p_period_to:to||null,p_planned_payment_date:null,p_batch_credits:adjustment.type!=="NONE"&&adjustment.direction==="CREDIT"?amount:0,p_batch_deductions:adjustment.type!=="NONE"&&adjustment.direction==="DEDUCTION"?amount:0,p_advance_recovery:0,p_withholding_tax:0,p_payment_method:payment.method,p_merchant_bank_account:payment.account||null,p_finance_remarks:"Created from live merchant settlement. Manual adjustment: "+reason}),"Draft batch created. Submit for independent review and approval.");
 }
 const paymentRows=Object.entries(allocations).filter(([,amount])=>Number(amount)>0).map(([batch_id,amount])=>({batch_id,amount:Number(amount)}));
 const paymentTotal=paymentRows.reduce((s,r)=>s+r.amount,0);
 const paymentValid=paymentRows.length>0&&payment.reference.trim()&&/^https:\/\//.test(payment.evidence)&&(!["BANK_TRANSFER","CHEQUE"].includes(payment.method)||payment.account.trim())&&paymentRows.every(r=>{
   const b=payableBatches.find((x:Row)=>x.id===r.batch_id);return b&&Number.isFinite(r.amount)&&r.amount<=Number(b.outstanding_amount)&&Math.round(r.amount*100)/100===r.amount;
 });
 function exportRows(){
   const headers=["delivery_way_id","merchant_id","amount_entry_type","status","customer_total_collection","cod_reported","cod_received","net_system_delivery_charge","merchant_final_settlement_amount","settlement_state"];
   const cell=(v:any)=>'"'+String(v??"").replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
   const csv=[headers.map(cell).join(","),...rows.map((r:Row)=>headers.map(h=>cell(r[h])).join(","))].join("\r\n");
   const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="merchant-settlement.csv";a.click();URL.revokeObjectURL(url);
 }
 function actions(b:Row){
   const privileged=["FINANCE_ADMIN","FINANCE_MANAGER","ADMIN","SUPERADMIN"].includes(role);
   const map:Record<string,[string,string,boolean]>={
     DRAFT:["SUBMIT_REVIEW","Submit review",canCreate],
     UNDER_REVIEW:["SUBMIT_APPROVAL","Submit approval",privileged||role==="FINANCE_REVIEWER"],
     PENDING_APPROVAL:["APPROVE","Approve",privileged||role==="FINANCE_APPROVER"]
   };
   const action=map[b.status];if(!action)return null;
   return <button className={button} disabled={busy||!action[2]} onClick={()=>void mutate(()=>rpc("be_finance_transition_batch_v3",{p_batch_id:b.id,p_action:action[0],p_note:"Merchant settlement review"}),"Batch status updated.")}>{action[1]}</button>;
 }
 return <main className="space-y-6 p-4 text-slate-100 md:p-6">
  <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
   <div className="flex flex-wrap justify-between gap-4"><div><h1 className="flex items-center gap-3 text-2xl font-black"><WalletCards/>Merchant Settlement</h1><p className="mt-2 text-sm text-slate-300">Delivered parcels → reconciled COD → batch review → approval → confirmed merchant payments.</p></div><div className="flex gap-2"><button className={button} disabled={loading||busy} onClick={()=>void load()}><RefreshCw size={16} className="mr-2 inline"/>Refresh</button><button className={button} disabled={loading} onClick={exportRows}><Download size={16} className="mr-2 inline"/>Export</button></div></div>
   {error&&<p role="alert" className="mt-4 rounded-xl bg-red-950 p-3 text-red-200">{error}</p>}
   {message&&<p role="status" className="mt-4 rounded-xl bg-emerald-950 p-3 text-emerald-200">{message}</p>}
   {loading&&<p role="status" className="mt-3">Loading live settlement records…</p>}
  </section>
  <section className="grid gap-3 sm:grid-cols-3">{[["Britium owes merchants",data.wallet?.britium_owes],["Confirmed merchant payments",data.wallet?.paid_amount],["Merchants owe Britium",data.wallet?.owes_britium]].map(([title,value])=><div key={String(title)} className="rounded-2xl border border-slate-700 bg-slate-900 p-5"><p className="text-sm text-slate-300">{String(title)}</p><p className="mt-2 text-2xl font-black">{money(value)}</p></div>)}</section>
  <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
   <div className="flex flex-wrap gap-3"><input aria-label="Search settlements" className={field} placeholder="Way ID / merchant / collection type" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Merchant filter" className={field} value={merchant} onChange={e=>{setMerchant(e.target.value);setSelected([]);setAllocations({});}}><option value="">All merchants</option>{merchants.map(m=><option key={m}>{m}</option>)}</select><label>From<input type="date" className={field+" ml-2"} value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" className={field+" ml-2"} value={to} onChange={e=>setTo(e.target.value)}/></label></div>
   <div className="mt-4 overflow-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead><tr>{["Select","Way ID / merchant","Collection type","Delivery","Expected COD","Reported","Received by Finance","Britium entitlement","Merchant payable","State"].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{rows.map((r:Row)=><tr key={r.parcel_id} className="border-t border-slate-700"><td className="p-3"><input type="checkbox" aria-label={"Select "+r.delivery_way_id} checked={selected.includes(r.parcel_id)} disabled={!r.settlement_eligible||busy||!canCreate} onChange={()=>toggle(r)}/></td><td className="p-3">{r.delivery_way_id}<br/>{r.merchant_name||r.merchant_id}</td><td className="p-3">{r.amount_entry_type}</td><td className="p-3">{r.status}</td>{["customer_total_collection","cod_reported","cod_received","net_system_delivery_charge","merchant_final_settlement_amount"].map(k=><td key={k} className="p-3">{money(r[k])}</td>)}<td className="p-3">{r.settlement_state}{r.validation_status!=="OK"&&<p>{r.validation_message}</p>}</td></tr>)}</tbody></table>{!loading&&!rows.length&&<p className="p-5">No settlement parcels match these filters.</p>}</div>
   <div className="mt-4 rounded-xl border border-slate-700 p-4"><h3 className="font-bold">Refund / promotion / manual settlement adjustment</h3><p className="mt-1 text-sm text-slate-300">Draft only: credit increases merchant payable and deduction decreases it. Original COD stays unchanged; independent review and approval remain required.</p><div className="mt-3 grid gap-3 md:grid-cols-3"><label>Purpose<select aria-label="Adjustment purpose" className={field+" mt-1 w-full"} value={adjustment.type} onChange={e=>setAdjustment({...adjustment,type:e.target.value})}>{["NONE","REFUND","PROMOTION","GOODWILL","OTHER"].map(v=><option key={v} value={v}>{v==="NONE"?"No adjustment":v}</option>)}</select></label><label>Direction<select aria-label="Adjustment direction" className={field+" mt-1 w-full"} disabled={adjustment.type==="NONE"} value={adjustment.direction} onChange={e=>setAdjustment({...adjustment,direction:e.target.value})}><option value="CREDIT">Credit (+)</option><option value="DEDUCTION">Deduction (-)</option></select></label><label>Amount (MMK)<input aria-label="Adjustment amount" type="number" min="0" step="0.01" className={field+" mt-1 w-full"} disabled={adjustment.type==="NONE"} value={adjustment.amount} onChange={e=>setAdjustment({...adjustment,amount:e.target.value})}/></label></div><label className="mt-3 block">Manual reason / approval reference<textarea aria-label="Adjustment reason" maxLength={1000} rows={2} className={field+" mt-1 w-full"} disabled={adjustment.type==="NONE"} value={adjustment.reason} onChange={e=>setAdjustment({...adjustment,reason:e.target.value})}/></label><p className="mt-3 font-bold">Estimated draft payable: {money(chosen.reduce((a,r)=>a+Number(r.merchant_final_settlement_amount||0),0)+(adjustment.type==="NONE"?0:(adjustment.direction==="CREDIT"?1:-1)*Number(adjustment.amount||0)))}</p></div>
   <button className={button+" mt-4"} disabled={busy||loading||!canCreate||!selected.length} onClick={()=>void createBatch()}>Create draft batch · {selected.length} parcels · {money(chosen.reduce((s,r)=>s+Number(r.merchant_final_settlement_amount||0),0))}</button>
   <p className="mt-3 text-sm text-slate-400">COD must be received and reconciled before batching. The batch creator cannot approve their own batch. Zero/negative payable is not a merchant payout.</p>
  </section>
  <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5"><h2 className="text-xl font-bold">Batches and approval</h2><div className="mt-4 overflow-auto"><table className="w-full min-w-[750px] text-left text-sm"><thead><tr>{["Batch / merchant","Status","Payable","Paid","Outstanding","Action"].map(h=><th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{batches.map((b:Row)=><tr key={b.id} className="border-t border-slate-700"><td className="p-3">{b.batch_number}<br/>{b.merchant_name||b.merchant_id}</td><td className="p-3">{b.status}</td><td className="p-3">{money(b.batch_net_payable)}</td><td className="p-3">{money(b.paid_amount)}</td><td className="p-3">{money(b.outstanding_amount)}</td><td className="p-3">{actions(b)} <button className={button} onClick={()=>window.print()}><FileText size={14} className="mr-1 inline"/>Print</button></td></tr>)}</tbody></table></div></section>
  <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5"><h2 className="text-xl font-bold">Record confirmed payment</h2><p className="mt-2 text-sm text-slate-300">Record a payment already made. Enter each batch allocation for partial, split or bulk payments. Each transfer needs its own reference and receipt evidence.</p>
   <div className="mt-4 grid gap-3 sm:grid-cols-2">{payableBatches.map((b:Row)=><label key={b.id} className="rounded-xl border border-slate-700 p-3">{b.batch_number} · {b.merchant_id} · outstanding {money(b.outstanding_amount)}<input type="number" min="0" step="0.01" max={b.outstanding_amount} className={field+" mt-2 w-full"} aria-label={"Payment amount "+b.batch_number} value={allocations[b.id]||""} onChange={e=>setAllocations({...allocations,[b.id]:e.target.value})}/></label>)}</div>
   <div className="mt-4 grid gap-3 md:grid-cols-2"><label>Payment method<select className={field+" mt-1 w-full"} value={payment.method} onChange={e=>setPayment({...payment,method:e.target.value})}>{methods.map(m=><option key={m}>{m}</option>)}</select></label><label>Transfer / receipt reference<input className={field+" mt-1 w-full"} value={payment.reference} onChange={e=>setPayment({...payment,reference:e.target.value})}/></label><label>Beneficiary bank / wallet / cheque account<input className={field+" mt-1 w-full"} value={payment.account} onChange={e=>setPayment({...payment,account:e.target.value})}/></label><label>Receipt / evidence URL (HTTPS)<input disabled={busy||uploading} type="url" className={field+" mt-1 w-full"} value={payment.evidence} onChange={e=>{setPayment({...payment,evidence:e.target.value});setReceiptName("");}}/></label></div>
   <div className="mt-3 space-y-2"><label className={button+" inline-block cursor-pointer"}>Upload receipt<input aria-label="Upload receipt" type="file" accept="image/jpeg,image/png,application/pdf" className="mt-2 block max-w-full text-sm" disabled={busy||loading||uploading||!canUploadReceipt} onChange={uploadReceipt}/></label><p className="text-sm text-slate-300">JPG, PNG or PDF · up to 10 MB. Upload a file or paste an existing HTTPS evidence link.</p>{uploading&&<p role="status">Uploading receipt…</p>}{receiptName&&<p role="status">Attached: {receiptName} · <SettlementReceiptLink url={payment.evidence} label="Preview receipt"/></p>}</div>
   <button className={button+" mt-4"} disabled={busy||loading||uploading||!canPay||!paymentValid} onClick={()=>void mutate(async()=>{await rpc("be_finance_record_bulk_payment_v200",{p_payments:paymentRows,p_reference:payment.reference,p_method:payment.method,p_account:payment.account||null,p_evidence_url:payment.evidence});setPayment(p=>({...p,reference:"",evidence:""}));setReceiptName("");},"Confirmed payment recorded. Merchant wallet and transaction history updated.")}>Record {money(paymentTotal)} · {paymentRows.length} batches</button>
  </section>
  <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
    <h2 className="text-xl font-bold">After-payment refund and promotion requests</h2>
    <p className="mt-2 text-sm text-slate-300">Requests and independent approvals only. No automatic funds transfer or alteration to historical COD.</p>
    <div className="mt-3 grid gap-3 md:grid-cols-3">
      <label>Paid settlement<select className={field+" mt-1 w-full"} value={post.batch} onChange={e=>setPost({...post,batch:e.target.value})}><option value="">Choose paid batch</option>{batches.filter((b:Row)=>b.status==="PAID").map((b:Row)=><option key={b.id} value={b.id}>{b.batch_number} / {b.merchant_id}</option>)}</select></label>
      <label>Purpose<select className={field+" mt-1 w-full"} value={post.type} onChange={e=>setPost({...post,type:e.target.value})}>{["REFUND","PROMOTION","GOODWILL","OTHER"].map(t=><option key={t}>{t}</option>)}</select></label>
      <label>Direction<select className={field+" mt-1 w-full"} value={post.direction} onChange={e=>setPost({...post,direction:e.target.value})}><option value="CREDIT">Credit merchant</option><option value="DEDUCTION">Merchant deduction</option></select></label>
      <label>Amount (MMK)<input className={field+" mt-1 w-full"} type="number" min="0.01" step="0.01" value={post.amount} onChange={e=>setPost({...post,amount:e.target.value})}/></label>
      <label className="md:col-span-2">Manual reason<textarea className={field+" mt-1 w-full"} maxLength={1000} rows={2} value={post.reason} onChange={e=>setPost({...post,reason:e.target.value})}/></label>
    </div>
    <button className={button+" mt-3"} disabled={busy||!canCreate||!post.batch||!(Number(post.amount)>0)||post.reason.trim().length<8} onClick={()=>void requestPost()}>Submit adjustment request (no payment)</button>
    <div className="mt-5 flex items-center gap-3"><h3 className="font-bold">Review queue</h3><button className={button} onClick={()=>void loadRequests()}>Refresh requests</button></div>
    <div className="mt-3 space-y-2">{requests.map((a:Row)=><div className="rounded-xl border border-slate-700 p-3" key={a.id}><p>{a.batch_number} · {a.merchant_id} · {a.adjustment_type} · {money(Math.abs(Number(a.difference||0)))} · {a.status}</p><p className="text-sm text-slate-300">{a.reason}</p>{a.status==="PENDING_APPROVAL"&&<button className={button+" mt-2"} onClick={()=>setReview({...review,id:a.id})}>Review this request</button>}</div>)}</div>
    {review.id&&<div className="mt-3 flex flex-wrap gap-3"><select className={field} value={review.action} onChange={e=>setReview({...review,action:e.target.value})}><option value="APPROVE">Approve (unpaid)</option><option value="REJECT">Reject</option></select><input className={field} placeholder="Review note (required)" maxLength={1000} value={review.note} onChange={e=>setReview({...review,note:e.target.value})}/><button className={button} disabled={busy||review.note.trim().length<8} onClick={()=>void reviewPost()}>Record independent review</button></div>}
  </section>
  <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5"><h2 className="text-xl font-bold">Payment history</h2><div className="mt-4 overflow-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr>{["Date","Batch / merchant","Amount","Method","Reference","Account","Evidence","Entered / confirmed by","Status"].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{payments.map((p:Row)=><tr key={p.id} className="border-t border-slate-700"><td className="p-3">{new Date(p.confirmed_at||p.created_at).toLocaleString()}</td><td className="p-3">{p.batch_number}<br/>{p.merchant_id}</td><td className="p-3">{money(p.amount)}</td><td className="p-3">{p.payment_method}</td><td className="p-3">{p.payment_group_reference||p.payment_reference}</td><td className="p-3">{p.bank_account||"—"}</td><td className="p-3">{<SettlementReceiptLink url={p.evidence_url||""}/>}</td><td className="p-3">{p.entered_by}<br/>{p.confirmed_by}</td><td className="p-3">{p.status}</td></tr>)}</tbody></table>{!payments.length&&<p className="p-5">No recorded payments.</p>}</div></section>
 </main>;
}
