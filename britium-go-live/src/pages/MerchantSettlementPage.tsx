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
 const [canonicalMerchantNames,setCanonicalMerchantNames]=useState<Record<string,string>>({});
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [activeTab,setActiveTab]=useState<"parcels"|"batches"|"payments"|"adjustments"|"history">("parcels");
 const [statusFilter,setStatusFilter]=useState<"ALL_UNSETTLED"|"READY"|"RTO"|"IN_TRANSIT">("ALL_UNSETTLED");
 const [drawer,setDrawer]=useState<"history"|"rto"|"adjustments"|null>(null);
 const [mobilePayout,setMobilePayout]=useState(false);
 const [search,setSearch]=useState(""),[merchant,setMerchant]=useState(""),[from,setFrom]=useState(""),[to,setTo]=useState("");
 const [selected,setSelected]=useState<string[]>([]),[allocations,setAllocations]=useState<Record<string,string>>({});
 const [payment,setPayment]=useState({method:"BANK_TRANSFER",reference:"",account:"",evidence:""});
 const [adjustment,setAdjustment]=useState({type:"NONE",direction:"CREDIT",amount:"",reason:""});
 const [post,setPost]=useState({batch:"",type:"REFUND",direction:"CREDIT",amount:"",reason:"",evidence:""});
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
   try {
     // Resolve the actual merchant display name from merchant masters, not from
     // the queue's sometimes code-only merchant_name field.
     const [master,profiles,next]=await Promise.all([
       (supabase as any).from("be_merchant_master").select("merchant_code,merchant_name").limit(2000),
       (supabase as any).from("be_merchant_financial_profiles_v2").select("merchant_id,merchant_name").limit(2000),
       rpc("be_finance_settlement_snapshot_v3",{p_merchant_id:null,p_search:null,p_limit:5000}),
     ]);
     const names:Record<string,string>={};
     for(const r of [...(profiles.data||[]),...(master.data||[])]){
       const code=String(r.merchant_code||r.merchant_id||"").trim().toUpperCase();
       const name=String(r.merchant_name||"").trim();
       if(code&&name&&name.toUpperCase()!==code)names[code]=name;
     }
     setCanonicalMerchantNames(names);
     setData(next);setMerchant((current:string)=>current||String(next.rows?.find((r:Row)=>r.merchant_id)?.merchant_id||""));
   }
   catch(e:any){setError(e.message);} finally{setLoading(false);}
 }
 async function loadRequests(){try{const x=await rpc("be_finance_post_payment_adjustments_list_v1",{});setRequests(Array.isArray(x)?x:[]);}catch(e:any){setError(e.message);}}
 function exportAdjustments(){
  const headers=["batch_number","merchant_id","adjustment_type","difference","status","reason","requested_by","approved_by","created_at","updated_at","supporting_document_url"];
   const clean=(v:unknown)=>'"'+String(v??"").replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
  const csv=[headers.map(clean).join(","),...requests.map((r:Row)=>headers.map(h=>clean(r[h])).join(","))].join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download="merchant-post-payment-adjustments.csv";a.click();URL.revokeObjectURL(url);
 }
 async function requestPost(){const ok=await mutate(()=>rpc("be_finance_post_payment_adjustment_request_v1",{p_batch_id:post.batch,p_type:post.type,p_direction:post.direction,p_amount:Number(post.amount),p_reason:post.reason,p_evidence_url:post.evidence.trim()||null}),"Adjustment requested without transferring funds.");if(ok)await loadRequests();}
 async function reviewPost(){const ok=await mutate(()=>rpc("be_finance_post_payment_adjustment_review_v1",{p_adjustment_id:review.id,p_action:review.action,p_note:review.note}),"Review recorded; funds have not been transferred.");if(ok){setReview({id:"",action:"APPROVE",note:""});await loadRequests();}}
 useEffect(()=>{void load();void loadRequests();},[]);
 const role=String(data.scope?.role||"");
 const canCreate=["FINANCE_CREATOR","FINANCE_ADMIN","FINANCE","FINANCE_MANAGER","ACCOUNTS","ADMIN","SUPERADMIN"].includes(role);
 const canUploadReceipt=["FINANCE","FINANCE_CREATOR","FINANCE_REVIEWER","FINANCE_APPROVER","PAYMENT_OFFICER","FINANCE_ADMIN","FINANCE_MANAGER","ACCOUNTS","ADMIN","SUPERADMIN"].includes(role);
 const canPay=["PAYMENT_OFFICER","FINANCE_ADMIN","FINANCE_MANAGER","ACCOUNTS","ADMIN","SUPERADMIN"].includes(role);
 const canReviewPost=["FINANCE_APPROVER","FINANCE_ADMIN","FINANCE_MANAGER","ADMIN","SUPERADMIN"].includes(role);
 const postAmount=Number(post.amount);
 const postAmountValid=post.amount.trim()!==""&&Number.isFinite(postAmount)&&postAmount>0&&postAmount<=1000000000&&Math.round(postAmount*100)/100===postAmount;
 const postEvidenceValid=!post.evidence.trim()||(/^https:\/\/\S+$/i.test(post.evidence.trim())&&post.evidence.trim().length<=2000);
 const rows=useMemo(()=>(data.rows||[]).filter((r:Row)=>{
   const day=String(r.created_at||"").slice(0,10);
   return (!merchant||r.merchant_id===merchant)&&(!from||day>=from)&&(!to||day<=to)&&(!search||JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));
 }),[data.rows,search,merchant,from,to]);
 const merchantNames=useMemo(()=>{
   const names:Record<string,string>={};
   for(const r of [...(data.rows||[]),...(data.batches||[]),...(data.payments||[])]){
     const id=String(r.merchant_id||"").trim();
     const name=String(r.merchant_name||"").trim();
     if(id&&name&&name.toLowerCase()!==id.toLowerCase()) names[id.toUpperCase()]=name;
   }
   // Canonical active merchant master wins over code-only / stale snapshot labels.
   return {...names,...canonicalMerchantNames};
 },[data.rows,data.batches,data.payments,canonicalMerchantNames]);
 const merchantName=(id:unknown)=>merchantNames[String(id||"").trim().toUpperCase()]||String(id||"Unknown merchant");
 const merchantLabel=(id:unknown)=>{const code=String(id||"");const name=merchantName(code);return name===code?code:`${name} (${code})`;};
 const merchants=useMemo(()=>Array.from(new Set<string>((data.rows||[]).map((r:Row)=>String(r.merchant_id)).filter(Boolean))).sort((a,b)=>(merchantNames[a]||a).localeCompare(merchantNames[b]||b)),[data.rows,merchantNames]);
 const batches=(data.batches||[]).filter((r:Row)=>!merchant||r.merchant_id===merchant);
 const payments=(data.payments||[]).filter((r:Row)=>!merchant||r.merchant_id===merchant);
 const payableBatches=batches.filter((b:Row)=>["APPROVED","PARTIALLY_PAID"].includes(b.status)&&Number(b.outstanding_amount)>0);
 const isRto=(r:Row)=>/RTO|RETURN/.test(String(r.status||"")+" "+String(r.settlement_state||""));
 const isSettled=(r:Row)=>["SETTLED","PAID","FULLY_PAID"].includes(String(r.settlement_state||"").toUpperCase());
 const merchantRows=rows.filter((r:Row)=>!isSettled(r));
 const visibleRows=merchantRows.filter((r:Row)=>statusFilter==="ALL_UNSETTLED"||(statusFilter==="READY"?Boolean(r.settlement_eligible):statusFilter==="RTO"?isRto(r):!r.settlement_eligible&&!isRto(r)));
 const merchantRtoRows=(data.rows||[]).filter((r:Row)=>(!merchant||r.merchant_id===merchant)&&!isSettled(r)&&isRto(r));
 const merchantSettledRows=(data.rows||[]).filter((r:Row)=>(!merchant||r.merchant_id===merchant)&&isSettled(r));
 const chosen=rows.filter((r:Row)=>selected.includes(r.parcel_id));
 const eligibleRows=visibleRows.filter((r:Row)=>r.settlement_eligible&&Number(r.merchant_final_settlement_amount)>0&&(!chosen.length||r.merchant_id===chosen[0].merchant_id));
 const selectableIds=eligibleRows.map((r:Row)=>String(r.parcel_id));
 const allVisibleSelected=selectableIds.length>0&&selectableIds.every(id=>selected.includes(id));
 function toggleVisible(){setError("");setSelected(current=>allVisibleSelected?current.filter(id=>!selectableIds.includes(id)):Array.from(new Set([...current,...selectableIds])));}
 const tabs=[{id:"parcels",label:"01 · Merchant settlement"},{id:"batches",label:"02 · Review & approval"},{id:"payments",label:"03 · Record payment"},{id:"adjustments",label:"04 · Adjustments"},{id:"history",label:"05 · Payment history"}] as const;
 async function mutate(action:()=>Promise<any>,success:string){
   if(mutation.current||uploadLock.current)return; mutation.current=true;setBusy(true);setError("");setMessage("");
   try{await action();setSelected([]);setAllocations({});setMessage(success);await load();return true;}
   catch(e:any){setError(e.message);return false;}finally{mutation.current=false;setBusy(false);}
 }
 function toggle(r:Row){
   if(!r.settlement_eligible||Number(r.merchant_final_settlement_amount)<=0)return;
   if(!selected.includes(r.parcel_id)&&chosen.length&&chosen[0].merchant_id!==r.merchant_id){setError("Create each batch for one merchant. Bulk payments can cover multiple approved batches.");return;}
   setSelected(s=>s.includes(r.parcel_id)?s.filter(x=>x!==r.parcel_id):[...s,r.parcel_id]);
 }
 async function createBatch(){
   const amount=adjustment.type==="NONE"?0:Number(adjustment.amount);
   if(adjustment.type!=="NONE"&&(!Number.isFinite(amount)||amount<=0||Math.round(amount*100)/100!==amount||!adjustment.reason.trim())){setError("Provide a positive adjustment amount and manual reason.");return;}
   if(!chosen.length||chosen.length!==selected.length||chosen.some(r=>!r.settlement_eligible||Number(r.merchant_final_settlement_amount)<=0)){setError("Recheck selected parcels against current filters before creating a batch.");return;}
   if(new Set(chosen.map(r=>r.merchant_id)).size!==1){setError("A settlement batch must contain only one merchant.");return;}
   const basePayable=chosen.reduce((sum,row)=>sum+Number(row.merchant_final_settlement_amount||0),0);
   if(basePayable<=0){setError("Merchant payout must be positive before creating a batch.");return;}
   if(adjustment.type!=="NONE"&&adjustment.direction==="DEDUCTION"&&amount>=basePayable){setError("Deduction exceeds this draft merchant payable. Use a separately approved recovery transaction rather than creating negative payout.");return;}
   const reason=adjustment.type==="NONE"?"No adjustment":adjustment.type+" / "+adjustment.direction+": "+adjustment.reason.trim();
   await mutate(()=>rpc("be_finance_create_settlement_batch_v3",{p_parcel_ids:selected,p_period_from:from||null,p_period_to:to||null,p_planned_payment_date:null,p_batch_credits:adjustment.type!=="NONE"&&adjustment.direction==="CREDIT"?amount:0,p_batch_deductions:adjustment.type!=="NONE"&&adjustment.direction==="DEDUCTION"?amount:0,p_advance_recovery:0,p_withholding_tax:0,p_payment_method:payment.method,p_merchant_bank_account:payment.account||null,p_finance_remarks:"Created from live merchant settlement. Manual adjustment: "+reason}),"Draft batch created. Submit for independent review and approval.");
 }
 const paymentRows=Object.entries(allocations).filter(([,amount])=>Number(amount)>0).map(([batch_id,amount])=>({batch_id,amount:Number(amount)}));
 const paymentTotal=paymentRows.reduce((s,r)=>s+r.amount,0);
 const selectedPayable=chosen.reduce((total,r)=>total+Number(r.merchant_final_settlement_amount||0),0);
 const canDraft=canCreate&&!loading&&!busy&&selected.length>0&&chosen.length===selected.length&&chosen.every(r=>r.settlement_eligible&&Number(r.merchant_final_settlement_amount)>0)&&selectedPayable>0;
 const canSubmitAdjustment=canCreate&&!busy&&Boolean(post.batch)&&postAmountValid&&postEvidenceValid&&post.reason.trim().length>=8;
 const stageButton="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg px-3 py-2 text-xs font-extrabold transition disabled:cursor-not-allowed disabled:opacity-50";
 const primaryStageButton=stageButton+" bg-amber-400 text-[#06101e] hover:bg-amber-300";
 const secondaryStageButton=stageButton+" border border-sky-700 bg-[#112240] text-sky-200 hover:bg-[#19385a]";
 const paymentValid=paymentRows.length>0&&paymentTotal>0&&payment.reference.trim()&&/^https:\/\//.test(payment.evidence)&&(!["BANK_TRANSFER","CHEQUE"].includes(payment.method)||payment.account.trim())&&paymentRows.every(r=>{
   const b=payableBatches.find((x:Row)=>x.id===r.batch_id);return b&&Number.isFinite(r.amount)&&r.amount<=Number(b.outstanding_amount)&&Math.round(r.amount*100)/100===r.amount;
 });
 async function recordPayment(){
   if(!canPay||!paymentValid||busy||loading||uploading)return;
   await mutate(async()=>{
     await rpc("be_finance_record_bulk_payment_v200",{p_payments:paymentRows,p_reference:payment.reference,p_method:payment.method,p_account:payment.account||null,p_evidence_url:payment.evidence});
     setPayment(p=>({...p,reference:"",evidence:""}));setReceiptName("");
   },"Confirmed payment recorded. Merchant wallet and transaction history updated.");
 }
 function exportPayments(){
   const headers=["confirmed_at","batch_number","merchant_id","merchant_name","amount","payment_method","payment_group_reference","payment_reference","bank_account","evidence_url","entered_by","confirmed_by","status"];
   const cell=(v:unknown)=>'"'+String(v??"").replace(/^[=+@-]/,"' function exportRows(){").replace(/"/g,'""')+'"';
   const lines=[headers.map(cell).join(","),...payments.map((r:Row)=>headers.map(k=>cell(k==="merchant_name"?merchantName(r.merchant_id):r[k])).join(","))].join("\r\n");
   const url=URL.createObjectURL(new Blob([lines],{type:"text/csv;charset=utf-8"}));
   const a=document.createElement("a");a.href=url;a.download="merchant-payment-history.csv";a.click();URL.revokeObjectURL(url);
 }
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
 return <main className="flex min-h-[650px] min-w-0 flex-col overflow-hidden bg-[#06101e] text-slate-100 lg:h-[calc(100vh-92px)]">
  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-[#0a192f] px-3 py-3 md:px-5">
   <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-400 text-sm font-black text-[#06101e]">BE</span><div><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-amber-400">Finance Operations</p><h1 className="text-base font-extrabold">Merchant Settlement</h1></div></div>
   <div className="flex flex-wrap items-center gap-2 text-xs">
    <span className="hidden rounded-lg border border-slate-700 bg-[#06101e] px-3 py-2 lg:block">Outstanding: <strong className="text-amber-400">{money(data.wallet?.britium_owes)}</strong></span>
    <button className={button} disabled={loading||busy} onClick={()=>{void load();void loadRequests();}}><RefreshCw size={14} className="mr-1 inline"/>Refresh</button>
    <button className={button} disabled={loading} onClick={exportRows}><Download size={14} className="mr-1 inline"/>Export</button>
    <button className={button} onClick={()=>setDrawer("history")}>Settled History</button>
   </div>
  </header>
  {error&&<p role="alert" className="mx-3 mt-2 rounded-lg border border-rose-700 bg-rose-950 px-3 py-2 text-sm text-rose-200">{error}</p>}
  {message&&<p role="status" className="mx-3 mt-2 rounded-lg border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm text-emerald-200">{message}</p>}
  {loading&&<p role="status" className="px-4 py-2 text-sm">Loading live settlement records…</p>}
  <nav aria-label="Merchant settlement workflow" className="shrink-0 border-b border-slate-800 bg-[#0a192f] px-3 py-2">
   <div role="tablist" aria-label="Settlement process tabs" className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1" style={{scrollbarWidth:"thin"}}>
    {tabs.map(tab=><button key={tab.id} type="button" role="tab" aria-selected={activeTab===tab.id} aria-controls={"settlement-"+tab.id} className={"shrink-0 rounded-lg px-3 py-2.5 text-xs font-extrabold transition "+(activeTab===tab.id?"bg-amber-400 text-[#06101e]":"bg-[#112240] text-slate-300 hover:bg-[#1d3557]")} onClick={()=>{setActiveTab(tab.id);setDrawer(null);setError("");setMobilePayout(false);}}>{tab.label}</button>)}
   </div>
  </nav>
  <div data-settlement-action-toolbar="true" className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-amber-400/20 bg-[#10213a] px-3 py-3">
    <div className="min-w-0 text-xs">
      <p className="font-extrabold text-amber-300">{activeTab==="parcels"?"01 · Prepare settlement draft":activeTab==="batches"?"02 · Review & approve settlement batches":activeTab==="payments"?"03 · Record verified merchant disbursement":activeTab==="adjustments"?"04 · Handle post-payment adjustments":"05 · Review & export payment history"}</p>
      <p className="mt-1 text-slate-300">{activeTab==="parcels"?(canCreate?(!selected.length?"Select delivered, COD-reconciled parcels to enable draft creation.":selected.length+" selected · "+money(selectedPayable)+" before adjustments"):"Your finance role cannot create settlement batches."):activeTab==="batches"?(!batches.length?"No batches for this merchant. Create a draft in the first tab.":batches.length+" batch(es) · only authorized stages can advance."):activeTab==="payments"?(payableBatches.length?payableBatches.length+" approved / partially paid batch(es) with an outstanding balance.":"No approved batches with a positive outstanding balance for this merchant."):activeTab==="adjustments"?"Requests and approvals never transfer money automatically.":"Confirmed transactions for the selected merchant."}</p>
    </div>
    <div className="flex max-w-full flex-wrap items-center gap-2" aria-label="Settlement workflow actions">
      {activeTab==="parcels"&&<>
        <button type="button" data-action="select-eligible" className={secondaryStageButton} disabled={!canCreate||busy||!selectableIds.length} onClick={toggleVisible}>{allVisibleSelected?"Deselect eligible":"Select eligible parcels"}</button>
        <button type="button" data-action="create-draft" className={primaryStageButton} disabled={!canDraft} onClick={()=>void createBatch()}>Create settlement draft ({selected.length})</button>
        <button type="button" className={secondaryStageButton} onClick={()=>setActiveTab("batches")}>Review batches</button>
      </>}
      {activeTab==="batches"&&<>
        <button type="button" className={secondaryStageButton} disabled={loading||busy} onClick={()=>void load()}>Refresh batches</button>
        <button type="button" className={secondaryStageButton} onClick={()=>setActiveTab("parcels")}>New settlement draft</button>
        <button type="button" className={primaryStageButton} onClick={()=>setActiveTab("payments")}>Open payment recorder</button>
      </>}
      {activeTab==="payments"&&<>
        <button type="button" data-action="record-payment" className={primaryStageButton} disabled={busy||loading||uploading||!canPay||!paymentValid} onClick={()=>void recordPayment()}>Record confirmed payment · {money(paymentTotal)}</button>
        <button type="button" className={secondaryStageButton} onClick={()=>setActiveTab("batches")}>Back to approvals</button>
        <button type="button" className={secondaryStageButton} onClick={()=>setActiveTab("history")}>Payment history</button>
      </>}
      {activeTab==="adjustments"&&<>
        <button type="button" data-action="request-adjustment" className={primaryStageButton} disabled={!canSubmitAdjustment} onClick={()=>void requestPost()}>Submit adjustment request</button>
        <button type="button" className={secondaryStageButton} disabled={busy} onClick={()=>void loadRequests()}>Refresh requests</button>
        <button type="button" className={secondaryStageButton} disabled={!requests.length} onClick={exportAdjustments}>Export adjustment CSV</button>
      </>}
      {activeTab==="history"&&<>
        <button type="button" data-action="export-payment-history" className={primaryStageButton} disabled={!payments.length} onClick={exportPayments}>Export payments CSV</button>
        <button type="button" className={secondaryStageButton} disabled={busy||loading} onClick={()=>void load()}>Refresh history</button>
        <button type="button" className={secondaryStageButton} onClick={()=>window.print()}>Print history</button>
      </>}
    </div>
  </div>
  {activeTab==="parcels"&&<section id="settlement-parcels" role="tabpanel" className="flex min-h-0 flex-1 flex-col overflow-hidden">
   <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-[#0a192f] px-3 py-3">
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
     <label className="flex min-w-[240px] items-center gap-2 rounded-xl border-2 border-amber-400/70 bg-[#06101e] px-3 py-2 text-xs">
      <span className="shrink-0 rounded bg-amber-400 px-1.5 py-1 font-black text-[#06101e]">STEP 1</span>
      <select aria-label="Merchant filter" className="min-w-0 flex-1 bg-transparent text-sm font-bold text-white" value={merchant} onChange={e=>{setMerchant(e.target.value);setSelected([]);setAllocations({});setStatusFilter("ALL_UNSETTLED");}}><option value="">Choose merchant</option>{merchants.map(m=><option key={m} value={m} className="bg-[#0a192f]">{merchantLabel(m)}</option>)}</select>
     </label>
     <div className="hidden max-w-[40vw] gap-1 overflow-x-auto xl:flex">{merchants.slice(0,12).map(m=><button key={m} className={"shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold "+(merchant===m?"bg-amber-400 text-[#06101e]":"bg-[#112240] text-slate-300")} onClick={()=>{setMerchant(m);setSelected([]);setStatusFilter("ALL_UNSETTLED");}} title={merchantLabel(m)}><span className="block max-w-44 truncate">{merchantName(m)}</span><span className="block text-[10px] font-medium opacity-75">{m}</span></button>)}</div>
    </div>
    <div className="flex items-center gap-2 text-xs"><span className="rounded-lg bg-[#06101e] px-3 py-2">Unsettled: <strong>{merchantRows.length}</strong></span><button className="rounded-lg border border-sky-600/50 bg-sky-950/40 px-3 py-2 font-bold text-sky-300" onClick={()=>setDrawer("history")}>Settled ({merchantSettledRows.length})</button><button className="rounded-lg bg-emerald-500 px-3 py-2 font-extrabold text-[#06101e] lg:hidden" onClick={()=>setMobilePayout(v=>!v)}>{mobilePayout?"Back to Parcels":"Payout ("+selected.length+")"}</button></div>
   </div>
   {merchantRtoRows.length>0&&<div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-rose-700/60 bg-rose-950/60 px-4 py-2 text-xs text-rose-200"><span className="font-bold">RTO Alert — {merchantRtoRows.length} return parcel(s) require separate review before any deduction.</span><button className="rounded-lg border border-rose-500 px-3 py-1.5 font-bold" onClick={()=>setDrawer("rto")}>Inspect RTO</button></div>}
   <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-12">
    <section className={(mobilePayout?"hidden ":"flex ")+"min-h-0 min-w-0 flex-col overflow-hidden border-r border-slate-800 bg-[#06101e] lg:col-span-7 lg:flex xl:col-span-8"}>
     <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-[#0a192f] px-3 py-2">
      <div className="flex gap-2"><button className="rounded-lg border border-amber-500/50 bg-amber-400/10 px-2.5 py-2 text-xs font-extrabold text-amber-300 disabled:opacity-40" disabled={!canCreate||busy||!selectableIds.length} onClick={toggleVisible}>{allVisibleSelected?"Deselect visible":"Select All Delivered"}</button><button className="rounded-lg border border-slate-700 px-2.5 py-2 text-xs" disabled={busy||!selected.length} onClick={()=>setSelected([])}>Clear</button></div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
       <div className="flex overflow-x-auto rounded-lg border border-slate-700 bg-[#112240] p-1">{([{id:"ALL_UNSETTLED",label:"All Unsettled"},{id:"READY",label:"Ready"},{id:"RTO",label:"RTO"},{id:"IN_TRANSIT",label:"Other"}] as const).map(t=><button key={t.id} onClick={()=>{setStatusFilter(t.id);setSelected([]);}} className={"shrink-0 rounded px-2 py-1 text-[11px] font-bold "+(statusFilter===t.id?"bg-amber-400 text-[#06101e]":"text-slate-300")}>{t.label}</button>)}</div>
       <input aria-label="Search settlements" className="w-36 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 sm:w-44" placeholder="Filter Way ID..." value={search} onChange={e=>{setSearch(e.target.value);setSelected([]);}}/>
       <label className="text-[10px] text-slate-400">From<input type="date" className="ml-1 rounded bg-white p-1.5 text-xs text-slate-900" value={from} onChange={e=>{setFrom(e.target.value);setSelected([]);}}/></label><label className="text-[10px] text-slate-400">To<input type="date" className="ml-1 rounded bg-white p-1.5 text-xs text-slate-900" value={to} onChange={e=>{setTo(e.target.value);setSelected([]);}}/></label>
      </div>
     </div>
     <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full min-w-[780px] border-collapse text-left text-xs">
       <thead className="sticky top-0 z-10 bg-amber-400 text-[10px] font-extrabold uppercase tracking-wide text-[#06101e]"><tr>{["Select","Way ID / date","Collection type","Delivery state","Expected COD","Britium Fee","Net Payable"].map(h=><th key={h} className="px-3 py-3">{h}</th>)}</tr></thead>
       <tbody className="divide-y divide-slate-200 bg-slate-50 text-slate-900">{visibleRows.slice(0,200).map((r:Row)=><tr key={r.parcel_id} className={selected.includes(r.parcel_id)?"bg-amber-100":"hover:bg-sky-50"}><td className="px-3 py-2"><input type="checkbox" aria-label={"Select "+r.delivery_way_id} checked={selected.includes(r.parcel_id)} disabled={!r.settlement_eligible||Number(r.merchant_final_settlement_amount)<=0||busy||!canCreate} onChange={()=>toggle(r)}/></td><td className="px-3 py-2 font-mono font-bold text-sky-950">{r.delivery_way_id}<div className="text-[10px] font-normal text-slate-500">{String(r.created_at||"").slice(0,10)}</div></td><td className="px-3 py-2 text-[10px]">{r.amount_entry_type}</td><td className="px-3 py-2"><span className={"rounded px-2 py-1 text-[10px] font-bold "+(r.settlement_eligible?"bg-emerald-100 text-emerald-800":isRto(r)?"bg-rose-100 text-rose-800":"bg-slate-200 text-slate-700")}>{r.status||r.settlement_state||"UNKNOWN"}</span>{r.validation_status!=="OK"&&<p className="mt-1 max-w-[160px] text-[10px] text-rose-700">{r.validation_message}</p>}</td><td className="px-3 py-2 text-right font-mono">{money(r.customer_total_collection)}</td><td className="px-3 py-2 text-right font-mono">{money(r.net_system_delivery_charge)}</td><td className={"px-3 py-2 text-right font-mono font-extrabold "+(Number(r.merchant_final_settlement_amount)<0?"text-rose-700":"text-emerald-800")}>{money(r.merchant_final_settlement_amount)}</td></tr>)}</tbody>
      </table>
      {!loading&&!visibleRows.length&&<p className="p-6 text-center text-sm text-slate-400">No unsettled parcels match this merchant and filter.</p>}
     </div>
     <div className="flex shrink-0 justify-between gap-2 border-t border-slate-800 bg-[#0a192f] px-4 py-2 text-[11px] text-slate-400"><span>Showing {Math.min(visibleRows.length,200)} of {visibleRows.length} unsettled · {selected.length} selected · Settled items hidden</span><button className="font-semibold text-sky-400" onClick={()=>setDrawer("history")}>View settled parcels</button></div>
    </section>
    <section className={(mobilePayout?"flex ":"hidden ")+"min-h-0 min-w-0 flex-col overflow-hidden bg-[#0b1628] lg:col-span-5 lg:flex xl:col-span-4"}>
     <div className="shrink-0 border-b border-slate-800 bg-[#0a192f] px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">STEP 2 · Cashier Payout Sheet</p><h2 className="mt-1 truncate text-sm font-extrabold">{merchant?merchantLabel(merchant):"Select a merchant"} — Settlement builder</h2></div>
     <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <div className="space-y-3 rounded-xl border border-slate-800 bg-[#06101e] p-3 text-xs">
       <div className="flex justify-between gap-2"><span className="text-slate-400">Selected parcels to settle</span><strong>{chosen.length} parcels</strong></div>
       <div className="flex justify-between gap-2"><span className="text-slate-400">Finance received COD</span><strong>{money(chosen.reduce((a,r)=>a+Number(r.cod_received||0),0))}</strong></div>
       <div className="flex justify-between gap-2"><span className="text-slate-400">Britium entitlement</span><strong className="text-sky-400">{money(chosen.reduce((a,r)=>a+Number(r.net_system_delivery_charge||0),0))}</strong></div>
       <div className="border-t border-slate-800 pt-2"><p className="text-xs font-semibold text-rose-300">Optional reviewed deduction or credit</p><div className="mt-2 grid grid-cols-2 gap-2"><select aria-label="Adjustment purpose" className={field+" col-span-2 w-full text-xs"} value={adjustment.type} onChange={e=>setAdjustment({...adjustment,type:e.target.value})}>{["NONE","REFUND","PROMOTION","GOODWILL","OTHER"].map(v=><option key={v} value={v}>{v==="NONE"?"No adjustment":v}</option>)}</select><select aria-label="Adjustment direction" className={field+" w-full text-xs"} disabled={adjustment.type==="NONE"} value={adjustment.direction} onChange={e=>setAdjustment({...adjustment,direction:e.target.value})}><option value="CREDIT">Credit (+)</option><option value="DEDUCTION">Deduction (-)</option></select><input aria-label="Adjustment amount" type="number" min="0" step=".01" className="w-full rounded-lg bg-white px-3 py-2 text-xs text-slate-900" disabled={adjustment.type==="NONE"} placeholder="Amount MMK" value={adjustment.amount} onChange={e=>setAdjustment({...adjustment,amount:e.target.value})}/></div><textarea aria-label="Adjustment reason" maxLength={1000} rows={2} className="mt-2 w-full rounded-lg bg-white px-3 py-2 text-xs text-slate-900" disabled={adjustment.type==="NONE"} placeholder="Document the reason and approval reference" value={adjustment.reason} onChange={e=>setAdjustment({...adjustment,reason:e.target.value})}/><button className="text-xs font-bold text-rose-300 underline" onClick={()=>setDrawer("rto")}>Inspect RTO / returns</button></div>
       <div className="flex items-center justify-between gap-2 border-t border-slate-700 pt-3"><span className="font-extrabold uppercase text-amber-400">Net Merchant Payout</span><strong className="text-lg text-emerald-400">{money(chosen.reduce((a,r)=>a+Number(r.merchant_final_settlement_amount||0),0)+(adjustment.type==="NONE"?0:(adjustment.direction==="CREDIT"?1:-1)*Number(adjustment.amount||0)))}</strong></div>
      </div>
      <div className="space-y-2 rounded-xl border border-slate-800 bg-[#0a192f] p-3 text-xs"><p className="font-extrabold uppercase text-sky-400">Disbursement details · after approval only</p><p className="text-slate-300">Create a draft now, then send it through independent review and approval. Record the bank or wallet transaction only after an actual transfer.</p><button className="font-semibold text-sky-400 underline" onClick={()=>setActiveTab("payments")}>Open confirmed payment recorder</button></div>
     </div>
     <div className="shrink-0 space-y-2 border-t border-slate-800 bg-[#0a192f] p-3"><button className="w-full rounded-xl bg-emerald-500 px-3 py-3 text-sm font-extrabold text-[#06101e] disabled:opacity-40" disabled={!canDraft} onClick={()=>void createBatch()}>Create draft batch · {selected.length} parcels</button><p className="text-[10px] text-slate-400">Approval and confirmed payment recording are separate actions. No automatic funds transfer.</p></div>
    </section>
   </div>
  </section>}
  <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-5">
  {activeTab==="batches"&&<section id="settlement-batches" role="tabpanel" className="rounded-2xl border border-slate-700 bg-[#0a192f] p-4 md:p-5"><h2 className="text-xl font-bold">Batches and approval</h2><p className="mt-2 text-xs text-slate-300">Use the Action column to submit, review or approve individual batches. Buttons are disabled when your role lacks permission.</p>{!batches.length&&<p className="mt-3 rounded-lg border border-slate-700 p-4 text-sm">No batches yet. Select eligible parcels in Merchant settlement and create a draft.</p>}<div className="mt-4 overflow-auto"><table className="w-full min-w-[750px] text-left text-sm"><thead><tr>{["Batch / merchant","Status","Payable","Paid","Outstanding","Action"].map(h=><th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{batches.map((b:Row)=><tr key={b.id} className="border-t border-slate-700"><td className="p-3">{b.batch_number}<br/>{merchantLabel(b.merchant_id)}</td><td className="p-3">{b.status}</td><td className="p-3">{money(b.batch_net_payable)}</td><td className="p-3">{money(b.paid_amount)}</td><td className="p-3">{money(b.outstanding_amount)}</td><td className="p-3">{actions(b)} <button type="button" className={button} onClick={()=>window.print()}><FileText size={14} className="mr-1 inline"/>Print</button>{!actions(b)&&<span className="ml-2 text-xs text-slate-400">{["APPROVED","PARTIALLY_PAID","PAID"].includes(b.status)?"Use Payment tab": "No permitted transition"}</span>}</td></tr>)}</tbody></table></div></section>}
  {activeTab==="payments"&&<section id="settlement-payments" role="tabpanel" className="rounded-2xl border border-slate-700 bg-[#0a192f] p-4 md:p-5"><h2 className="text-xl font-bold">Record confirmed payment</h2><p className="mt-2 text-sm text-slate-300">Record a payment already made. Enter each batch allocation for partial, split or bulk payments. Each transfer needs its own reference and receipt evidence.</p>
   <div className="mt-4 grid gap-3 sm:grid-cols-2">{payableBatches.map((b:Row)=><label key={b.id} className="rounded-xl border border-slate-700 p-3">{b.batch_number} · {merchantLabel(b.merchant_id)} · outstanding {money(b.outstanding_amount)}<input type="number" min="0" step="0.01" max={b.outstanding_amount} className={field+" mt-2 w-full"} aria-label={"Payment amount "+b.batch_number} value={allocations[b.id]||""} onChange={e=>setAllocations({...allocations,[b.id]:e.target.value})}/></label>)}</div>
   <div className="mt-4 grid gap-3 md:grid-cols-2"><label>Payment method<select className={field+" mt-1 w-full"} value={payment.method} onChange={e=>setPayment({...payment,method:e.target.value})}>{methods.map(m=><option key={m}>{m}</option>)}</select></label><label>Transfer / receipt reference<input className={field+" mt-1 w-full"} value={payment.reference} onChange={e=>setPayment({...payment,reference:e.target.value})}/></label><label>Beneficiary bank / wallet / cheque account<input className={field+" mt-1 w-full"} value={payment.account} onChange={e=>setPayment({...payment,account:e.target.value})}/></label><label>Receipt / evidence URL (HTTPS)<input disabled={busy||uploading} type="url" className={field+" mt-1 w-full"} value={payment.evidence} onChange={e=>{setPayment({...payment,evidence:e.target.value});setReceiptName("");}}/></label></div>
   <div className="mt-3 space-y-2"><label className={button+" inline-block cursor-pointer"}>Upload receipt<input aria-label="Upload receipt" type="file" accept="image/jpeg,image/png,application/pdf" className="mt-2 block max-w-full text-sm" disabled={busy||loading||uploading||!canUploadReceipt} onChange={uploadReceipt}/></label><p className="text-sm text-slate-300">JPG, PNG or PDF · up to 10 MB. Upload a file or paste an existing HTTPS evidence link.</p>{uploading&&<p role="status">Uploading receipt…</p>}{receiptName&&<p role="status">Attached: {receiptName} · <SettlementReceiptLink url={payment.evidence} label="Preview receipt"/></p>}</div>
   <button className={button+" mt-4"} disabled={busy||loading||uploading||!canPay||!paymentValid} onClick={()=>void recordPayment()}>Record {money(paymentTotal)} · {paymentRows.length} batches</button>
  </section>}
  {activeTab==="adjustments"&&<section id="settlement-adjustments" role="tabpanel" className="rounded-2xl border border-slate-700 bg-[#0a192f] p-4 md:p-5">
    <h2 className="text-xl font-bold">After-payment refund and promotion requests</h2>
    <p className="mt-2 text-sm text-slate-300">Requests and independent approvals only. No automatic funds transfer or alteration to historical COD.</p><p className="mt-2 text-sm text-amber-300">Approved requests remain unpaid until a separately verified external payment is confirmed. Do not treat approval as a disbursement.</p>
    <div className="mt-3 grid gap-3 md:grid-cols-3">
      <label>Paid settlement<select className={field+" mt-1 w-full"} value={post.batch} onChange={e=>setPost({...post,batch:e.target.value})}><option value="">Choose paid batch</option>{batches.filter((b:Row)=>b.status==="PAID").map((b:Row)=><option key={b.id} value={b.id}>{b.batch_number} / {merchantLabel(b.merchant_id)}</option>)}</select></label>
      <label>Purpose<select className={field+" mt-1 w-full"} value={post.type} onChange={e=>setPost({...post,type:e.target.value})}>{["REFUND","PROMOTION","GOODWILL","OTHER"].map(t=><option key={t}>{t}</option>)}</select></label>
      <label>Direction<select className={field+" mt-1 w-full"} value={post.direction} onChange={e=>setPost({...post,direction:e.target.value})}><option value="CREDIT">Credit merchant</option><option value="DEDUCTION">Merchant deduction</option></select></label>
      <label>Amount (MMK)<input className={field+" mt-1 w-full"} type="number" min="0.01" step="0.01" value={post.amount} onChange={e=>setPost({...post,amount:e.target.value})}/></label>
      <label>Evidence URL (HTTPS)<input className={field+" mt-1 w-full"} type="url" value={post.evidence} onChange={e=>setPost({...post,evidence:e.target.value})} placeholder="https://..."/></label><label className="md:col-span-2">Manual reason<textarea className={field+" mt-1 w-full"} maxLength={1000} rows={2} value={post.reason} onChange={e=>setPost({...post,reason:e.target.value})}/></label>
    </div>
    <button className={button+" mt-3"} disabled={!canSubmitAdjustment} onClick={()=>void requestPost()}>Submit adjustment request (no payment)</button>
    <p className="mt-4 text-sm text-amber-300">This adjustment register is not a refund disbursement ledger. A PAID status alone does not verify the bank reference or receipt; reconcile against external payment records before closing the case.</p><div className="mt-5 flex items-center gap-3"><h3 className="font-bold">Review queue</h3><button className={button} onClick={()=>void loadRequests()}>Refresh requests</button><button className={button} disabled={!requests.length} onClick={exportAdjustments}>Export adjustment register CSV</button></div>
    <div className="mt-3 space-y-2">{requests.map((a:Row)=><div className="rounded-xl border border-slate-700 p-3" key={a.id}><p>{a.batch_number} · {merchantLabel(a.merchant_id)} · {a.adjustment_type} · {money(Math.abs(Number(a.difference||0)))} · {a.status}</p><p className="text-sm text-slate-300">Reason: {a.reason}</p>{a.supporting_document_url&&<p className="mt-1 text-sm"><SettlementReceiptLink url={a.supporting_document_url} label="View adjustment evidence"/></p>}<p className="text-xs text-slate-400">Requested: {a.requested_by||"Unknown"} · Reviewed: {a.approved_by||"Pending"} · {a.created_at?new Date(a.created_at).toLocaleString():""}</p>{a.status==="APPROVED_UNPAID"&&<p className="text-amber-300 text-sm">Approved; payment not yet confirmed.</p>}{a.status==="PAID"&&<p className="text-sky-300 text-sm">Marked paid in Finance. Payment reference and supporting receipt must be reconciled separately; they are not included in this adjustment register.</p>}{a.status==="REJECTED"&&<p className="text-slate-400 text-sm">Rejected; no payment is authorized.</p>}{a.status==="PENDING_APPROVAL"&&canReviewPost&&<button className={button+" mt-2"} onClick={()=>setReview({...review,id:a.id})}>Review this request</button>}</div>)}</div>
    {review.id&&<div className="mt-3 flex flex-wrap gap-3"><select className={field} value={review.action} onChange={e=>setReview({...review,action:e.target.value})}><option value="APPROVE">Approve (unpaid)</option><option value="REJECT">Reject</option></select><input className={field} placeholder="Review note (required)" maxLength={1000} value={review.note} onChange={e=>setReview({...review,note:e.target.value})}/><button className={button} disabled={busy||!canReviewPost||review.note.trim().length<8} onClick={()=>void reviewPost()}>Record independent review</button></div>}
  </section>}
  {activeTab==="history"&&<section id="settlement-history" role="tabpanel" className="rounded-2xl border border-slate-700 bg-[#0a192f] p-4 md:p-5"><h2 className="text-xl font-bold">Payment history</h2><div className="mt-4 overflow-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr>{["Date","Batch / merchant","Amount","Method","Reference","Account","Evidence","Entered / confirmed by","Status"].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{payments.map((p:Row)=><tr key={p.id} className="border-t border-slate-700"><td className="p-3">{new Date(p.confirmed_at||p.created_at).toLocaleString()}</td><td className="p-3">{p.batch_number}<br/>{merchantLabel(p.merchant_id)}</td><td className="p-3">{money(p.amount)}</td><td className="p-3">{p.payment_method}</td><td className="p-3">{p.payment_group_reference||p.payment_reference}</td><td className="p-3">{p.bank_account||"—"}</td><td className="p-3">{<SettlementReceiptLink url={p.evidence_url||""}/>}</td><td className="p-3">{p.entered_by}<br/>{p.confirmed_by}</td><td className="p-3">{p.status}</td></tr>)}</tbody></table>{!payments.length&&<p className="p-5">No recorded payments.</p>}</div></section>}

  </div>
  {drawer&&<div className="fixed inset-0 z-50 flex justify-end bg-black/70" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setDrawer(null);}}><aside role="dialog" aria-modal="true" aria-label={drawer==="rto"?"Return parcel inspection":drawer==="history"?"Settled history":"Adjustment requests"} className="flex h-full w-full max-w-xl flex-col border-l border-slate-700 bg-[#0a192f] text-white shadow-2xl"><div className="flex shrink-0 items-center justify-between border-b border-slate-700 p-4"><h2 className="font-extrabold">{drawer==="rto"?"RTO Inspector & Fee Review":drawer==="history"?"Settled Parcels & Payment History":"Refund & Promotion Adjustments"}</h2><button aria-label="Close drawer" className={button} onClick={()=>setDrawer(null)}>Close</button></div><div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm">
   {drawer==="rto"&&<><p className="rounded-lg border border-rose-700 bg-rose-950/40 p-3 text-rose-200">RTO charges must be reviewed and documented before adding a deduction. No fee is assumed automatically.</p>{merchantRtoRows.map((r:Row)=><div key={r.parcel_id} className="rounded-xl border border-slate-700 p-3"><strong className="text-rose-300">{r.delivery_way_id}</strong><p className="mt-1 text-slate-300">{r.status} · {r.validation_message||r.settlement_state||"Return case"}</p><p className="mt-1">Original collection: {money(r.customer_total_collection)}</p></div>)}{!merchantRtoRows.length&&<p>No RTO items found for this merchant in the current snapshot.</p>}</>}
   {drawer==="history"&&<><h3 className="font-bold text-amber-400">Settled ways · {merchant?merchantLabel(merchant):"All merchants"}</h3>{merchantSettledRows.slice(0,100).map((r:Row)=><div key={r.parcel_id} className="flex justify-between gap-3 border-b border-slate-700 py-2"><span>{r.delivery_way_id}</span><strong>{money(r.merchant_final_settlement_amount)}</strong></div>)}{!merchantSettledRows.length&&<p>No settled parcel rows returned in this snapshot.</p>}<h3 className="pt-4 font-bold text-amber-400">Confirmed payment records</h3>{payments.slice(0,100).map((p:Row)=><div key={p.id} className="rounded-lg border border-slate-700 p-3"><p className="font-semibold">{p.batch_number} · {money(p.amount)}</p><p className="text-xs text-slate-400">{p.payment_method} · {p.payment_group_reference||p.payment_reference}</p><SettlementReceiptLink url={p.evidence_url||""}/></div>)}</>}
   {drawer==="adjustments"&&<><p>Use the Adjustments tab to submit and review requests with the existing approval functions.</p><button className={button} onClick={()=>{setDrawer(null);setActiveTab("adjustments");}}>Open adjustment workflow</button></>}
  </div></aside></div>}
 </main>;
}
