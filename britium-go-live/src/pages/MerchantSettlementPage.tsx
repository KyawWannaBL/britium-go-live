import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, RefreshCw, WalletCards } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { uploadSettlementReceipt } from "@/lib/merchantSettlementReceipt";
import SettlementReceiptLink from "@/components/SettlementReceiptLink";
import MerchantAdvanceSettlementPanel from "@/components/finance/MerchantAdvanceSettlementPanel";
type Row = Record<string, any>;
const money=(n:unknown)=>Number(n||0).toLocaleString("en-US")+" MMK";
const field="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white";
// Match the Merchant Settlement screenshot: high-contrast white search/date controls.
const filterField="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-950 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-400";
const button="rounded-xl border border-sky-700 px-4 py-2 font-bold disabled:opacity-40";
const methods=["CASH","BANK_TRANSFER","KBZ_PAY","WAVE_PAY","AYA_PAY","CB_PAY","CHEQUE","OTHER"];
const RTO_EXPLANATIONS = {
 warehouse:"Returned to an authorized warehouse or hub; merchant/sender return is not yet confirmed.",
 return:"Return-to-origin completed and confirmed by the operational return workflow.",
 pending:"RTO initiated or pending; warehouse receipt or return completion is not yet verified."
} as const;
function rtoStage(row:Row):"warehouse"|"return"|"pending"|null {
 const status=String(row.status||"").trim().toUpperCase().replace(/[\\s-]+/g,"_");
 const returnStates=new Set(["RTO_RETURNED_TO_ORIGIN","RTO_RETURN_COMPLETED","RTO_RETURNED_TO_SENDER","RETURNED_TO_ORIGIN","RETURNED_TO_SENDER","RETURN_TO_ORIGIN_COMPLETED","RTO_DELIVERED_BACK"]);
 const warehouseStates=new Set(["RTO_RETURNED_TO_HUB","RTO_AT_WAREHOUSE","RTO_WAREHOUSE","RETURNED_TO_WAREHOUSE","RTO_WAREHOUSE_RECEIVED","RTO_RECEIVED_AT_HUB"]);
 if(returnStates.has(status))return "return";
 if(warehouseStates.has(status))return "warehouse";
 if(status.startsWith("RTO")||status.includes("RETURN_TO_ORIGIN")||status.includes("RETURN_PENDING")||status==="RETURN_SCANNED")return "pending";
 return null;
}
const rtoName=(stage:ReturnType<typeof rtoStage>)=>stage==="warehouse"?"RTO Warehouse":stage==="return"?"RTO Return":stage==="pending"?"RTO Pending":"—";
const uniqueOptions=(rows:Row[],field:string)=>Array.from(new Set(rows.map(r=>String(r[field]||"").trim()).filter(Boolean))).sort();

const settlementTabs = [
 {key:"overview",label:"Overview",description:"Merchant balances and workflow summary",step:"01"},
 {key:"queue",label:"Parcel Queue",description:"Review eligible delivered parcels and COD",step:"02"},
 {key:"draft",label:"Draft Settlement",description:"Prepare a merchant batch and adjustments",step:"03"},
 {key:"approvals",label:"Review & Approval",description:"Independent checks before a payout",step:"04"},
 {key:"payments",label:"Record Payment",description:"Record verified, already-completed transfers",step:"05"},
 {key:"adjustments",label:"Refunds & Adjustments",description:"Post-payment requests and approvals",step:"06"},
 {key:"history",label:"Payment History",description:"Payment evidence and audit trail",step:"07"},
 {key:"advance",label:"Advance Settlement",description:"Preview only — payout actions locked",step:"08"}
] as const;
type SettlementTab = typeof settlementTabs[number]["key"];

export default function MerchantSettlementPage(){
 const [data,setData]=useState<Row>({rows:[],batches:[],payments:[],wallet:{}});
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [search,setSearch]=useState(""),[merchant,setMerchant]=useState(""),[from,setFrom]=useState(""),[to,setTo]=useState("");
 const [queueStatus,setQueueStatus]=useState("ALL");
 const [collectionFilter,setCollectionFilter]=useState("");
 const [deliveryFilter,setDeliveryFilter]=useState("");
 const [paymentFilter,setPaymentFilter]=useState("");
 const [rtoSearch,setRtoSearch]=useState("");
 const [historySearch,setHistorySearch]=useState("");
 const [historyStatus,setHistoryStatus]=useState("");
 const [historyMethod,setHistoryMethod]=useState("");
 const [postSearch,setPostSearch]=useState("");
 const [postTypeFilter,setPostTypeFilter]=useState("");
 const [postStatusFilter,setPostStatusFilter]=useState("");
 const [activeTab,setActiveTab]=useState<SettlementTab>("overview");
 const tabRefs=useRef<Partial<Record<SettlementTab,HTMLButtonElement|null>>>({});
 const tabStripRef=useRef<HTMLElement|null>(null);
 const [tabScroll,setTabScroll]=useState({offset:0,max:0});
 const [scopedWallet,setScopedWallet]=useState<{merchant:string;wallet:Row|null;loading:boolean;error:string}>({merchant:"",wallet:null,loading:false,error:""});
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
   try { const next=await rpc("be_finance_settlement_snapshot_v3",{p_merchant_id:null,p_search:null,p_limit:5000}); setData(next); }
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
 // The main snapshot populates the full merchant selector. A second scoped snapshot
 // supplies ledger-derived wallet figures without truncating that selector.
 useEffect(()=>{
   if(!merchant){setScopedWallet({merchant:"",wallet:null,loading:false,error:""});return;}
   let cancelled=false;
   setScopedWallet({merchant,wallet:null,loading:true,error:""});
   void rpc("be_finance_settlement_snapshot_v3",{p_merchant_id:merchant,p_search:null,p_limit:1})
    .then(result=>{if(!cancelled)setScopedWallet({merchant,wallet:result.wallet||{},loading:false,error:""});})
    .catch((e:any)=>{if(!cancelled)setScopedWallet({merchant,wallet:null,loading:false,error:e.message||"Merchant wallet could not be loaded"});});
   return ()=>{cancelled=true;};
 },[merchant,data.wallet]);
 const role=String(data.scope?.role||"");
 const canCreate=["FINANCE_CREATOR","FINANCE_ADMIN","FINANCE","FINANCE_MANAGER","ACCOUNTS","ADMIN","SUPERADMIN"].includes(role);
 const canUploadReceipt=["FINANCE","FINANCE_CREATOR","FINANCE_REVIEWER","FINANCE_APPROVER","PAYMENT_OFFICER","FINANCE_ADMIN","FINANCE_MANAGER","ACCOUNTS","ADMIN","SUPERADMIN"].includes(role);
 const canPay=["PAYMENT_OFFICER","FINANCE_ADMIN","FINANCE_MANAGER","ACCOUNTS","ADMIN","SUPERADMIN"].includes(role);
 const canReviewPost=["FINANCE_APPROVER","FINANCE_ADMIN","FINANCE_MANAGER","ADMIN","SUPERADMIN"].includes(role);
 const postAmount=Number(post.amount);
 const postAmountValid=post.amount.trim()!==""&&Number.isFinite(postAmount)&&postAmount>0&&postAmount<=1000000000&&Math.round(postAmount*100)/100===postAmount;
 const postEvidenceValid=!post.evidence.trim()||(/^https:\/\/\S+$/i.test(post.evidence.trim())&&post.evidence.trim().length<=2000);
 const walletReady=!merchant ? !loading&&!error : scopedWallet.merchant===merchant&&!scopedWallet.loading&&!scopedWallet.error&&scopedWallet.wallet!==null;
 const walletValues=merchant?scopedWallet.wallet:data.wallet;
 const walletMoney=(v:unknown)=>walletReady?money(v):"—";
 const rows=useMemo(()=>(data.rows||[]).filter((r:Row)=>{
   const day=String(r.created_at||"").slice(0,10);
   return (!merchant||r.merchant_id===merchant)&&(!from||day>=from)&&(!to||day<=to)&&(!search||JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));
 }),[data.rows,search,merchant,from,to]);
 const merchants=useMemo(()=>Array.from(new Set<string>((data.rows||[]).map((r:Row)=>String(r.merchant_id)).filter(Boolean))).sort(),[data.rows]);
 const batches=(data.batches||[]).filter((r:Row)=>!merchant||r.merchant_id===merchant);
 const payments=(data.payments||[]).filter((r:Row)=>!merchant||r.merchant_id===merchant);
 const payableBatches=batches.filter((b:Row)=>["APPROVED","PARTIALLY_PAID"].includes(b.status)&&Number(b.outstanding_amount)>0);
 const chosen=rows.filter((r:Row)=>selected.includes(r.parcel_id));
 const queueRows=useMemo(()=>rows.filter((r:Row)=>{
  const stage=rtoStage(r);
  if(collectionFilter&&String(r.amount_entry_type||"")!==collectionFilter)return false;
  if(deliveryFilter&&String(r.status||"")!==deliveryFilter)return false;
  if(paymentFilter&&String(r.settlement_method||"")!==paymentFilter)return false;
  if(rtoSearch&&!JSON.stringify(r).toLowerCase().includes(rtoSearch.toLowerCase()))return false;
  if(queueStatus==="READY")return Boolean(r.settlement_eligible);
  if(queueStatus==="RTO_WAREHOUSE")return stage==="warehouse";
  if(queueStatus==="RTO_RETURN")return stage==="return";
  if(queueStatus==="RTO_PENDING")return stage==="pending";
  if(queueStatus==="IN_TRANSIT")return !r.settlement_eligible&&!stage&&!["DELIVERED","CANCELLED"].includes(String(r.status||"").toUpperCase());
  return true;
 }),[rows,collectionFilter,deliveryFilter,paymentFilter,rtoSearch,queueStatus]);
 const queueCounts={ALL:rows.length,READY:rows.filter(r=>r.settlement_eligible).length,
  RTO_WAREHOUSE:rows.filter(r=>rtoStage(r)==="warehouse").length,
  RTO_RETURN:rows.filter(r=>rtoStage(r)==="return").length,
  RTO_PENDING:rows.filter(r=>rtoStage(r)==="pending").length,
  IN_TRANSIT:rows.filter(r=>!r.settlement_eligible&&!rtoStage(r)&&!["DELIVERED","CANCELLED"].includes(String(r.status||"").toUpperCase())).length};
 const filteredHistory=payments.filter((p:Row)=>
  (!historyStatus||String(p.status||"")===historyStatus)&&
  (!historyMethod||String(p.payment_method||"")===historyMethod)&&
  (!historySearch||JSON.stringify(p).toLowerCase().includes(historySearch.toLowerCase())));
 const filteredRequests=requests.filter((r:Row)=>
  (!merchant||r.merchant_id===merchant)&&(!postTypeFilter||r.adjustment_type===postTypeFilter)&&
  (!postStatusFilter||r.status===postStatusFilter)&&
  (!postSearch||JSON.stringify(r).toLowerCase().includes(postSearch.toLowerCase())));
 function selectAllReady(){
  if(busy||!canCreate)return;
  const ready=queueRows.filter((r:Row)=>r.settlement_eligible);
  const scope=merchant||selected.length?rows.find((r:Row)=>selected.includes(r.parcel_id))?.merchant_id||merchant:ready[0]?.merchant_id;
  const eligible=ready.filter((r:Row)=>r.merchant_id===scope).map((r:Row)=>r.parcel_id);
  setSelected(eligible);
  if(ready.some((r:Row)=>r.merchant_id!==scope))setMessage("Selected eligible parcels for one merchant only. Switch merchant to select another merchant.");
 }

 async function mutate(action:()=>Promise<any>,success:string){
   if(mutation.current||uploadLock.current)return; mutation.current=true;setBusy(true);setError("");setMessage("");
   try{await action();setSelected([]);setAllocations({});setMessage(success);await load();return true;}
   catch(e:any){setError(e.message);return false;}finally{mutation.current=false;setBusy(false);}
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
   if(Number(b.batch_net_payable)<=0||Number(b.outstanding_amount)<0)return <span className="text-amber-300">Non-payout / merchant receivable — Finance review required</span>;
   return <button className={button} disabled={busy||!action[2]} onClick={()=>void mutate(()=>rpc("be_finance_transition_batch_v3",{p_batch_id:b.id,p_action:action[0],p_note:"Merchant settlement review"}),"Batch status updated.")}>{action[1]}</button>;
 }
  function onTabKeyDown(event:React.KeyboardEvent<HTMLButtonElement>,index:number){
    const key=event.key;
    let next=index;
    if(key==="ArrowRight")next=(index+1)%settlementTabs.length;
    else if(key==="ArrowLeft")next=(index+settlementTabs.length-1)%settlementTabs.length;
    else if(key==="Home")next=0;
    else if(key==="End")next=settlementTabs.length-1;
    else return;
    event.preventDefault();
    const nextTab=settlementTabs[next].key;
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  }
  function syncTabScrollbar(){
    const strip=tabStripRef.current;
    if(!strip)return;
    const max=Math.max(0,strip.scrollWidth-strip.clientWidth);
    const offset=Math.max(0,Math.min(max,strip.scrollLeft));
    setTabScroll(previous=>previous.max===max&&Math.abs(previous.offset-offset)<1?previous:{offset,max});
  }
  useEffect(()=>{
    const strip=tabStripRef.current;
    if(!strip)return;
    syncTabScrollbar();
    const resizeObserver=typeof ResizeObserver!=="undefined"?new ResizeObserver(syncTabScrollbar):null;
    resizeObserver?.observe(strip);
    if(typeof window!=="undefined")window.addEventListener("resize",syncTabScrollbar);
    return ()=>{resizeObserver?.disconnect();if(typeof window!=="undefined")window.removeEventListener("resize",syncTabScrollbar);};
  },[]);
  useEffect(()=>{
    tabRefs.current[activeTab]?.scrollIntoView?.({behavior:"smooth",block:"nearest",inline:"nearest"});
  },[activeTab]);
  function shiftTabScroll(direction:-1|1){
    const strip=tabStripRef.current;
    if(!strip)return;
    const delta=Math.max(180,Math.floor(strip.clientWidth*0.7))*direction;
    if(typeof strip.scrollBy==="function")strip.scrollBy({left:delta,behavior:"smooth"});
    else strip.scrollLeft+=delta;
    syncTabScrollbar();
  }
  function seekTabScroll(percent:number){
    const strip=tabStripRef.current;
    if(!strip)return;
    strip.scrollLeft=Math.max(0,strip.scrollWidth-strip.clientWidth)*percent/100;
    syncTabScrollbar();
  }
  const activeTabInfo=settlementTabs.find(t=>t.key===activeTab)!;
  const eligibleCount=rows.filter((r:Row)=>r.settlement_eligible).length;
  const approvalQueueCount=batches.filter((b:Row)=>["UNDER_REVIEW","PENDING_APPROVAL"].includes(String(b.status))).length;
  const adjustmentQueueCount=requests.filter((r:Row)=>r.status==="PENDING_APPROVAL").length;
  const tabCounts:Partial<Record<SettlementTab,number>>={
    queue:eligibleCount,draft:selected.length,approvals:approvalQueueCount,
    payments:payableBatches.length,adjustments:adjustmentQueueCount,history:payments.length
  };

 return <main className="min-h-screen space-y-6 bg-[#060913] p-4 text-slate-100 md:p-6">
   <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
   <div className="flex flex-wrap justify-between gap-4"><div><h1 className="flex items-center gap-3 text-2xl font-black"><WalletCards/>Merchant Settlement</h1><p className="mt-2 text-sm text-slate-300">Delivered parcels → reconciled COD → batch review → approval → confirmed merchant payments.</p></div><div className="flex gap-2"><button className={button} disabled={loading||busy} onClick={()=>void load()}><RefreshCw size={16} className="mr-2 inline"/>Refresh</button><button className={button} disabled={loading} onClick={exportRows}><Download size={16} className="mr-2 inline"/>Export</button></div></div>
   {error&&<p role="alert" className="mt-4 rounded-xl bg-red-950 p-3 text-red-200">{error}</p>}
   {message&&<p role="status" className="mt-4 rounded-xl bg-emerald-950 p-3 text-emerald-200">{message}</p>}
   {loading&&<p role="status" className="mt-3">Loading live settlement records…</p>}
  </section>
 <p role="status" className="rounded-xl border border-amber-800/70 bg-amber-950/20 px-4 py-3 text-sm font-semibold text-amber-200">Production safety gate: advance batch creation, approval, payment recording and refunds remain NOT ACTIVE until Finance UAT and final accounting reconciliation pass. Normal Merchant Settlement is unchanged.</p>
 
  <section className="rounded-3xl border border-sky-950 bg-[#090d1c] px-4 py-4 md:px-5" aria-label="Merchant selection">
   <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
    <label className="flex min-w-0 flex-col gap-2 text-sm font-bold text-slate-200 sm:flex-row sm:items-center">
      Merchant
      <select aria-label="Merchant filter" className={filterField+" w-full min-w-0 sm:ml-3 sm:w-64"} value={merchant} onChange={e=>{setMerchant(e.target.value);setSelected([]);setAllocations({});}}>
       <option value="">All merchants</option>{merchants.map(m=><option key={m}>{m}</option>)}
      </select>
    </label>
    <p className="max-w-2xl text-xs leading-relaxed text-slate-400">Merchant selection applies to normal settlement balances, batches, payments and parcel records. Date and search filters in Parcel Queue affect parcels only.</p>
   </div>
  </section>
  <nav ref={tabStripRef} onScroll={syncTabScrollbar} role="tablist" aria-label="Merchant Settlement process tabs" className="flex w-full gap-2 overflow-x-auto rounded-t-3xl border border-b-0 border-sky-950 bg-[#090d1c] p-2 shadow-lg shadow-slate-950/30" style={{scrollbarWidth:"auto",scrollbarColor:"#fbbf24 #111827"}}>
   {settlementTabs.map((tab,index)=><button
     key={tab.key} ref={node=>{tabRefs.current[tab.key]=node;}} type="button" role="tab"
     id={"settlement-tab-"+tab.key} aria-controls={"settlement-panel-"+tab.key}
     aria-selected={activeTab===tab.key} aria-label={"Open "+tab.label+" tab"}
     tabIndex={activeTab===tab.key?0:-1}
     onClick={()=>setActiveTab(tab.key)} onKeyDown={e=>onTabKeyDown(e,index)}
     className={"group flex min-w-max shrink-0 items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 "+(activeTab===tab.key?"border-amber-400 bg-amber-400 text-slate-950 shadow-lg shadow-amber-950/20":"border-slate-700 bg-slate-950 text-slate-200 hover:border-amber-500/60 hover:text-white")}>
     <span className={"text-xs font-black "+(activeTab===tab.key?"text-amber-950":"text-sky-400")}>{tab.step}</span>
     <span>{tab.label}</span>
     {tab.key==="advance"&&<span className={"rounded-md px-1.5 py-0.5 text-[10px] font-black "+(activeTab===tab.key?"bg-amber-100":"bg-amber-900/50 text-amber-200")}>LOCKED</span>}
     {tabCounts[tab.key]!==undefined&&<span className={"rounded-full px-2 py-0.5 text-xs "+(activeTab===tab.key?"bg-amber-100 text-slate-900":"bg-slate-800 text-slate-300")}>{tabCounts[tab.key]}</span>}
    </button>)}
  </nav>
  <div className="flex items-center gap-3 rounded-b-3xl border border-t-0 border-sky-950 bg-[#090d1c] px-3 pb-3 pt-2" aria-label="Workflow horizontal scrollbar controls">
    <button type="button" aria-label="Scroll workflows left" onClick={()=>shiftTabScroll(-1)} disabled={tabScroll.max<=0||tabScroll.offset<=1}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-600 bg-slate-950 text-amber-300 hover:border-amber-400 hover:text-white disabled:opacity-35" title="Scroll workflow tabs left">‹</button>
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
        <span>Scroll workflows horizontally</span>
        <span>{tabScroll.max>1?"Drag the bar to see all 8 tabs":"All workflows visible"}</span>
      </span>
      <input type="range" min={0} max={100} step={1} value={tabScroll.max>0?Math.round(tabScroll.offset/tabScroll.max*100):0}
        onChange={e=>seekTabScroll(Number(e.target.value))} disabled={tabScroll.max<=0}
        aria-label="Horizontal workflow scrollbar" aria-valuetext={tabScroll.max>0?Math.round(tabScroll.offset/tabScroll.max*100)+"% across workflow tabs":"All workflow tabs visible"}
        className="h-4 w-full cursor-ew-resize accent-amber-400 disabled:cursor-default disabled:opacity-40"/>
    </label>
    <button type="button" aria-label="Scroll workflows right" onClick={()=>shiftTabScroll(1)} disabled={tabScroll.max<=0||tabScroll.offset>=tabScroll.max-1}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-600 bg-slate-950 text-amber-300 hover:border-amber-400 hover:text-white disabled:opacity-35" title="Scroll workflow tabs right">›</button>
  </div>
  <section role="tabpanel" id={"settlement-panel-"+activeTab} aria-labelledby={"settlement-tab-"+activeTab} tabIndex={0} className="space-y-5 focus:outline-none">
    <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-sky-950/70 bg-[#0b1021] p-4 md:p-5">
      <div><p className="text-xs font-extrabold uppercase tracking-[0.15em] text-amber-400">Finance workspace · {activeTabInfo.step} / 08</p>
      <h2 className="mt-2 text-xl font-extrabold text-white md:text-2xl">{activeTabInfo.label}</h2>
      <p className="mt-1 text-sm text-slate-300">{activeTabInfo.description}</p></div>
      {activeTab==="queue"&&<span className="rounded-full border border-sky-800 bg-sky-950/50 px-3 py-1 text-sm font-bold text-sky-200">{eligibleCount} eligible</span>}
    </div>

 
  {activeTab==="overview"&&<>
     <section className="space-y-3" aria-label="Merchant settlement wallet summary">
   <p className="text-sm text-slate-300">Settlement wallet: <strong>{merchant||"All merchants"}</strong> · All dates. Parcel Queue date filters affect only the parcel list, not wallet balances or payment history.</p>
   {merchant&&scopedWallet.loading&&<p role="status" className="text-sm text-sky-300">Loading {merchant} wallet…</p>}
   {merchant&&scopedWallet.error&&<p role="alert" className="text-sm text-red-300">Merchant wallet unavailable: {scopedWallet.error}. Totals are hidden to avoid displaying another merchant's balances.</p>}
   <div className="grid gap-4 sm:grid-cols-3">{[["Britium owes merchants",walletValues?.britium_owes],["Confirmed merchant payments",walletValues?.paid_amount],["Merchants owe Britium",walletValues?.owes_britium]].map(([title,value])=><div key={String(title)} className="min-h-40 rounded-3xl border border-sky-900/70 bg-[#0b1021] p-5 shadow-lg shadow-slate-950/30"><p className="text-base font-semibold leading-snug text-slate-200">{String(title)}</p><p className="mt-4 break-words text-3xl font-black tracking-tight text-white">{walletReady?<>{walletMoney(value).replace(/ MMK$/, "")}<span className="mt-1 block text-2xl"> MMK</span></>:walletMoney(value)}</p></div>)}</div>
  </section>
   <section className="rounded-3xl border border-sky-950 bg-[#090d1c] p-5">
     <h3 className="text-lg font-extrabold">Settlement workflow</h3>
     <p className="mt-1 text-sm text-slate-400">Select the next step to continue. Your selected parcels and partially completed payment form stay in place when changing tabs.</p>
     <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
     {[
       {key:"queue" as const,title:"Prepare parcels",detail:eligibleCount+" eligible parcels ready for review"},
       {key:"draft" as const,title:"Draft settlement",detail:selected.length+" selected parcels"},
       {key:"approvals" as const,title:"Independent review",detail:approvalQueueCount+" batches awaiting review"},
       {key:"payments" as const,title:"Record verified payments",detail:payableBatches.length+" payable batches"},
       {key:"adjustments" as const,title:"Manage adjustments",detail:adjustmentQueueCount+" requests awaiting decision"},
       {key:"history" as const,title:"Review payment history",detail:payments.length+" payment records"}
     ].map(item=><button type="button" key={item.key} onClick={()=>setActiveTab(item.key)}
       className="flex items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-[#10182b] p-4 text-left transition-colors hover:border-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
       <span><span className="block font-bold text-white">{item.title}</span><span className="mt-1 block text-xs text-slate-300">{item.detail}</span></span>
       <span aria-hidden="true" className="font-black text-amber-400">›</span>
     </button>)}
     </div>
   </section>
   <p className="rounded-xl border border-amber-900/70 bg-amber-950/20 p-4 text-sm text-amber-200">Advance Settlement is a separate preview-only workflow. Advance batch creation, approval, payment recording and refund operations remain disabled until Finance UAT and reconciliation pass.</p>
  </>}

 
  {activeTab==="queue"&&<section className="rounded-3xl border border-sky-950 bg-[#090d1c] p-4 shadow-lg md:p-5">
 <div className="flex flex-wrap items-center justify-between gap-2">
  <div><h3 className="text-xl font-black">Merchant Parcel Settlement Queue</h3><p className="text-sm text-slate-300">Only server-verified eligible parcels can be settled. RTO stages are shown for operational review.</p></div>
  <div className="flex gap-2">
   <button className={button+" border-amber-500"} onClick={selectAllReady} disabled={!canCreate||busy||!queueRows.some((r:Row)=>r.settlement_eligible)}>Select All Delivered / Ready</button>
   <button className={button} onClick={()=>setSelected([])}>Clear selection</button>
  </div>
 </div>
 <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Settlement status and RTO filters">
  {([["ALL","All Unsettled"],["READY","Ready"],["RTO_WAREHOUSE","RTO Warehouse"],["RTO_RETURN","RTO Return"],["RTO_PENDING","RTO Pending"],["IN_TRANSIT","In Transit"]] as const).map(([key,label])=>
   <button key={key} aria-pressed={queueStatus===key} className={"rounded-lg border px-3 py-2 text-xs font-bold "+(queueStatus===key?"border-amber-400 bg-amber-400 text-slate-950":"border-slate-700 bg-[#121c30] text-slate-200")} onClick={()=>setQueueStatus(key)}>{label} ({queueCounts[key]})</button>)}
 </div>
 <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Settlement search and date filters">
  <label className="text-xs text-slate-300">Search Way ID / recipient<input aria-label="Search settlements" className={filterField+" mt-1 h-11 w-full text-sm"} placeholder="Way ID, merchant…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
  <label className="text-xs text-slate-300">Collection type<select aria-label="Collection type filter" className={field+" mt-1 w-full"} value={collectionFilter} onChange={e=>setCollectionFilter(e.target.value)}><option value="">All collection types</option>{uniqueOptions(rows,"amount_entry_type").map(x=><option key={x}>{x}</option>)}</select></label>
  <label className="text-xs text-slate-300">Delivery state<select aria-label="Delivery state filter" className={field+" mt-1 w-full"} value={deliveryFilter} onChange={e=>setDeliveryFilter(e.target.value)}><option value="">All delivery states</option>{uniqueOptions(rows,"status").map(x=><option key={x}>{x}</option>)}</select></label>
  <label className="text-xs text-slate-300">Settlement method<select aria-label="Settlement method filter" className={field+" mt-1 w-full"} value={paymentFilter} onChange={e=>setPaymentFilter(e.target.value)}><option value="">All settlement methods</option>{uniqueOptions(rows,"settlement_method").map(x=><option key={x}>{x}</option>)}</select></label>
  <label className="text-xs text-slate-300">From<input aria-label="From" type="date" className={filterField+" mt-1 h-11 w-full text-sm"} value={from} onChange={e=>setFrom(e.target.value)}/></label>
  <label className="text-xs text-slate-300">To<input aria-label="To" type="date" min={from||undefined} className={filterField+" mt-1 h-11 w-full text-sm"} value={to} onChange={e=>setTo(e.target.value)}/></label>
  <label className="text-xs text-slate-300">Additional details<input aria-label="Search RTO notes" className={filterField+" mt-1 h-11 w-full text-sm"} placeholder="Search any available data" value={rtoSearch} onChange={e=>setRtoSearch(e.target.value)}/></label>
  <div className="flex items-end"><button className={button+" h-11 w-full"} onClick={()=>{setSearch("");setFrom("");setTo("");setCollectionFilter("");setDeliveryFilter("");setPaymentFilter("");setRtoSearch("");setQueueStatus("ALL");}}>Clear filters</button></div>
 </div>
 <p className="mt-3 text-xs text-slate-400">Showing {queueRows.length} of {rows.length} parcels. Scroll horizontally or vertically inside the table; no rows are silently omitted by the display.</p>
 <div className="mt-3 max-h-[540px] overflow-auto rounded-xl border border-slate-700" aria-label="Scrollable merchant parcel settlement table" style={{scrollbarWidth:"auto",scrollbarColor:"#fbbf24 #111827"}}>
  <table className="w-full min-w-[1520px] text-left text-xs">
   <thead className="sticky top-0 z-10 bg-amber-400 text-slate-950"><tr>{["Select","Way ID / Date","Merchant","Collection type","Delivery state","Expected COD","COD received","Britium fee","Net merchant payable","RTO stage / reason","Settlement state"].map(h=><th key={h} scope="col" className="whitespace-nowrap px-3 py-4 font-extrabold">{h}</th>)}</tr></thead>
   <tbody>{queueRows.map((r:Row)=>{const stage=rtoStage(r);const eligible=Boolean(r.settlement_eligible);
    return <tr key={r.parcel_id} className={"border-t border-slate-800 "+(stage?"bg-rose-950/30":eligible?"bg-amber-950/10":"bg-[#0a1222]")+" hover:bg-slate-800/50"}>
     <td className="p-3"><input type="checkbox" aria-label={"Select "+r.delivery_way_id} checked={selected.includes(r.parcel_id)} disabled={!eligible||busy||!canCreate} onChange={()=>toggle(r)}/></td>
     <td className="whitespace-nowrap p-3 font-bold text-sky-300">{r.delivery_way_id}<div className="font-normal text-slate-400">{String(r.created_at||"").slice(0,10)}</div></td>
     <td className="p-3">{r.merchant_name||r.merchant_id}<div className="text-slate-400">{r.merchant_id}</div></td>
     <td className="p-3">{r.amount_entry_type||"—"}</td>
     <td className="p-3"><span className={"rounded-full px-2 py-1 font-bold "+(stage?"bg-rose-900/60 text-rose-200":eligible?"bg-emerald-900/60 text-emerald-200":"bg-slate-700 text-slate-100")}>{stage?rtoName(stage):r.status||"Unknown"}</span><div className="mt-1 text-slate-400">{stage?String(r.status||""):""}</div></td>
     <td className="whitespace-nowrap p-3 text-right">{money(r.customer_total_collection)}</td>
     <td className="whitespace-nowrap p-3 text-right">{money(r.cod_received)}</td>
     <td className="whitespace-nowrap p-3 text-right text-sky-300">{money(r.net_system_delivery_charge)}</td>
     <td className={"whitespace-nowrap p-3 text-right font-bold "+(Number(r.merchant_final_settlement_amount)<0?"text-rose-300":"text-emerald-300")}>{money(r.merchant_final_settlement_amount)}</td>
     <td className="min-w-64 p-3">{stage?<><strong className="text-rose-300">{rtoName(stage)}</strong><p className="mt-1 text-slate-300">{RTO_EXPLANATIONS[stage]}</p></>:<span className="text-slate-500">—</span>}</td>
     <td className="p-3">{r.settlement_state||"—"}{r.validation_status!=="OK"&&<p className="text-rose-300">{r.validation_message||"Validation required"}</p>}</td>
    </tr>;})}</tbody>
  </table>
  {!loading&&!queueRows.length&&<p className="p-5 text-sm text-slate-300">No parcels match these filters.</p>}
 </div>
 <div className="mt-3 grid gap-3 rounded-xl border border-slate-700 bg-[#0b1527] p-3 text-xs text-slate-300 md:grid-cols-3">
  <p><strong className="block text-amber-300">Settlement rule</strong>Only backend-verified eligible parcels can enter normal settlement; RTO records are not automatically payable.</p>
  <p><strong className="block text-rose-300">RTO Warehouse</strong>{RTO_EXPLANATIONS.warehouse}</p>
  <p><strong className="block text-rose-300">RTO Return</strong>{RTO_EXPLANATIONS.return} Generic RTO and RETURN_SCANNED remain pending until confirmed.</p>
 </div>
 <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-900 bg-slate-950/70 p-4">
  <p className="text-sm text-slate-200"><strong className="text-amber-300">{selected.length}</strong> parcels selected · <strong>{money(chosen.reduce((sum,r)=>sum+Number(r.merchant_final_settlement_amount||0),0))}</strong></p>
  <button type="button" className={button+" border-amber-500 bg-amber-400 text-slate-950"} disabled={!selected.length} onClick={()=>setActiveTab("draft")}>Continue to Draft Settlement</button>
 </div>
</section>}

 {activeTab==="draft"&&<section className="rounded-3xl border border-sky-950 bg-[#090d1c] p-4 md:p-5">
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-900 bg-slate-950/70 p-4">
   <div><p className="text-xs uppercase tracking-widest text-sky-300">Selected parcels</p><p className="mt-1 text-xl font-extrabold">{selected.length} · {money(chosen.reduce((sum,r)=>sum+Number(r.merchant_final_settlement_amount||0),0))}</p>{chosen.length>0&&<p className="mt-1 text-sm text-slate-300">Merchant: {chosen[0].merchant_id} · {chosen.slice(0,4).map((r:Row)=>r.delivery_way_id).join(", ")}{chosen.length>4?"…":""}</p>}</div>
   <button type="button" className={button} onClick={()=>setActiveTab("queue")}>{selected.length?"Change parcel selection":"Select parcels"}</button>
  </div>
  {!selected.length&&<p role="status" className="mt-3 rounded-lg border border-amber-800 bg-amber-950/20 p-3 text-sm text-amber-200">No parcels selected. Use Parcel Queue to select eligible, reconciled parcels before creating a batch.</p>}
     <div className="mt-4 rounded-xl border border-slate-700 p-4"><h3 className="font-bold">Refund / promotion / manual settlement adjustment</h3><p className="mt-1 text-sm text-slate-300">Draft only: credit increases merchant payable and deduction decreases it. Original COD stays unchanged; independent review and approval remain required.</p><div className="mt-3 grid gap-3 md:grid-cols-3"><label>Purpose<select aria-label="Adjustment purpose" className={field+" mt-1 w-full"} value={adjustment.type} onChange={e=>setAdjustment({...adjustment,type:e.target.value})}>{["NONE","REFUND","PROMOTION","GOODWILL","OTHER"].map(v=><option key={v} value={v}>{v==="NONE"?"No adjustment":v}</option>)}</select></label><label>Direction<select aria-label="Adjustment direction" className={field+" mt-1 w-full"} disabled={adjustment.type==="NONE"} value={adjustment.direction} onChange={e=>setAdjustment({...adjustment,direction:e.target.value})}><option value="CREDIT">Credit (+)</option><option value="DEDUCTION">Deduction (-)</option></select></label><label>Amount (MMK)<input aria-label="Adjustment amount" type="number" min="0" step="0.01" className={field+" mt-1 w-full"} disabled={adjustment.type==="NONE"} value={adjustment.amount} onChange={e=>setAdjustment({...adjustment,amount:e.target.value})}/></label></div><label className="mt-3 block">Manual reason / approval reference<textarea aria-label="Adjustment reason" maxLength={1000} rows={2} className={field+" mt-1 w-full"} disabled={adjustment.type==="NONE"} value={adjustment.reason} onChange={e=>setAdjustment({...adjustment,reason:e.target.value})}/></label><p className="mt-3 font-bold">Estimated draft payable: {money(chosen.reduce((a,r)=>a+Number(r.merchant_final_settlement_amount||0),0)+(adjustment.type==="NONE"?0:(adjustment.direction==="CREDIT"?1:-1)*Number(adjustment.amount||0)))}</p></div>
     <button className={button+" mt-4"} disabled={busy||loading||!canCreate||!selected.length} onClick={()=>void createBatch()}>Create draft batch · {selected.length} parcels · {money(chosen.reduce((s,r)=>s+Number(r.merchant_final_settlement_amount||0),0))}</button>
     <p className="mt-3 text-sm text-slate-400">COD must be received and reconciled before batching. The batch creator cannot approve their own batch. Zero/negative payable is not a merchant payout.</p>
 </section>}

 
 {activeTab==="approvals"&&<>
    <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5"><h2 className="text-xl font-bold">Batches and approval</h2><div className="mt-4 overflow-x-auto rounded-xl border border-slate-800"><table className="w-full min-w-[750px] text-left text-sm"><thead className="bg-amber-400 text-slate-950"><tr>{["Batch / merchant","Status","Payable","Paid","Outstanding","Action"].map(h=><th scope="col" className="px-3 py-4 font-extrabold" key={h}>{h}</th>)}</tr></thead><tbody>{batches.map((b:Row)=><tr key={b.id} className="border-t border-slate-700"><td className="p-3">{b.batch_number}<br/>{b.merchant_name||b.merchant_id}</td><td className="p-3">{b.status}</td><td className="p-3">{money(b.batch_net_payable)}</td><td className="p-3">{money(b.paid_amount)}</td><td className="p-3">{money(b.outstanding_amount)}</td><td className="p-3">{actions(b)} <button className={button} onClick={()=>window.print()}><FileText size={14} className="mr-1 inline"/>Print</button></td></tr>)}</tbody></table></div></section>
  {payableBatches.length>0&&<button type="button" className={button+" border-amber-500 bg-amber-400 text-slate-950"} onClick={()=>setActiveTab("payments")}>Continue to Record Payment · {payableBatches.length} payable</button>}
 </>}

 {activeTab==="payments"&&  <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5"><h2 className="text-xl font-bold">Record confirmed payment</h2><p className="mt-2 text-sm text-slate-300">Record a payment already made. Enter each batch allocation for partial, split or bulk payments. Each transfer needs its own reference and receipt evidence.</p>
   <div className="mt-4 grid gap-3 sm:grid-cols-2">{payableBatches.map((b:Row)=><label key={b.id} className="rounded-xl border border-slate-700 p-3">{b.batch_number} · {b.merchant_id} · outstanding {money(b.outstanding_amount)}<input type="number" min="0" step="0.01" max={b.outstanding_amount} className={field+" mt-2 w-full"} aria-label={"Payment amount "+b.batch_number} value={allocations[b.id]||""} onChange={e=>setAllocations({...allocations,[b.id]:e.target.value})}/></label>)}</div>
   <div className="mt-4 grid gap-3 md:grid-cols-2"><label>Payment method<select className={field+" mt-1 w-full"} value={payment.method} onChange={e=>setPayment({...payment,method:e.target.value})}>{methods.map(m=><option key={m}>{m}</option>)}</select></label><label>Transfer / receipt reference<input className={field+" mt-1 w-full"} value={payment.reference} onChange={e=>setPayment({...payment,reference:e.target.value})}/></label><label>Beneficiary bank / wallet / cheque account<input className={field+" mt-1 w-full"} value={payment.account} onChange={e=>setPayment({...payment,account:e.target.value})}/></label><label>Receipt / evidence URL (HTTPS)<input disabled={busy||uploading} type="url" className={field+" mt-1 w-full"} value={payment.evidence} onChange={e=>{setPayment({...payment,evidence:e.target.value});setReceiptName("");}}/></label></div>
   <div className="mt-3 space-y-2"><label className={button+" inline-block cursor-pointer"}>Upload receipt<input aria-label="Upload receipt" type="file" accept="image/jpeg,image/png,application/pdf" className="mt-2 block max-w-full text-sm" disabled={busy||loading||uploading||!canUploadReceipt} onChange={uploadReceipt}/></label><p className="text-sm text-slate-300">JPG, PNG or PDF · up to 10 MB. Upload a file or paste an existing HTTPS evidence link.</p>{uploading&&<p role="status">Uploading receipt…</p>}{receiptName&&<p role="status">Attached: {receiptName} · <SettlementReceiptLink url={payment.evidence} label="Preview receipt"/></p>}</div>
   <button className={button+" mt-4"} disabled={busy||loading||uploading||!canPay||!paymentValid} onClick={()=>void mutate(async()=>{await rpc("be_finance_record_bulk_payment_v200",{p_payments:paymentRows,p_reference:payment.reference,p_method:payment.method,p_account:payment.account||null,p_evidence_url:payment.evidence});setPayment(p=>({...p,reference:"",evidence:""}));setReceiptName("");},"Confirmed payment recorded. Merchant wallet and transaction history updated.")}>Record {money(paymentTotal)} · {paymentRows.length} batches</button>
  </section>}
 {activeTab==="adjustments"&&  <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
    <h2 className="text-xl font-bold">After-payment refund and promotion requests</h2>
    <p className="mt-2 text-sm text-slate-300">Requests and independent approvals only. No automatic funds transfer or alteration to historical COD.</p><p className="mt-2 text-sm text-amber-300">Approved requests remain unpaid until a separately verified external payment is confirmed. Do not treat approval as a disbursement.</p>
    <div className="mt-3 grid gap-3 md:grid-cols-3">
      <label>Paid settlement<select className={field+" mt-1 w-full"} value={post.batch} onChange={e=>setPost({...post,batch:e.target.value})}><option value="">Choose paid batch</option>{batches.filter((b:Row)=>b.status==="PAID").map((b:Row)=><option key={b.id} value={b.id}>{b.batch_number} / {b.merchant_id}</option>)}</select></label>
      <label>Purpose<select className={field+" mt-1 w-full"} value={post.type} onChange={e=>setPost({...post,type:e.target.value})}>{["REFUND","PROMOTION","GOODWILL","OTHER"].map(t=><option key={t}>{t}</option>)}</select></label>
      <label>Direction<select className={field+" mt-1 w-full"} value={post.direction} onChange={e=>setPost({...post,direction:e.target.value})}><option value="CREDIT">Credit merchant</option><option value="DEDUCTION">Merchant deduction</option></select></label>
      <label>Amount (MMK)<input className={field+" mt-1 w-full"} type="number" min="0.01" step="0.01" value={post.amount} onChange={e=>setPost({...post,amount:e.target.value})}/></label>
      <label>Evidence URL (HTTPS)<input className={field+" mt-1 w-full"} type="url" value={post.evidence} onChange={e=>setPost({...post,evidence:e.target.value})} placeholder="https://..."/></label><label className="md:col-span-2">Manual reason<textarea className={field+" mt-1 w-full"} maxLength={1000} rows={2} value={post.reason} onChange={e=>setPost({...post,reason:e.target.value})}/></label>
    </div>
    <button className={button+" mt-3"} disabled={busy||!canCreate||!post.batch||!postAmountValid||!postEvidenceValid||post.reason.trim().length<8} onClick={()=>void requestPost()}>Submit adjustment request (no payment)</button>
    <p className="mt-4 text-sm text-amber-300">This adjustment register is not a refund disbursement ledger. A PAID status alone does not verify the bank reference or receipt; reconcile against external payment records before closing the case.</p><div className="mt-5 flex items-center gap-3"><h3 className="font-bold">Review queue</h3><button className={button} onClick={()=>void loadRequests()}>Refresh requests</button><button className={button} disabled={!requests.length} onClick={exportAdjustments}>Export adjustment register CSV</button></div>
    <div className="mt-3 space-y-2">{requests.map((a:Row)=><div className="rounded-xl border border-slate-700 p-3" key={a.id}><p>{a.batch_number} · {a.merchant_id} · {a.adjustment_type} · {money(Math.abs(Number(a.difference||0)))} · {a.status}</p><p className="text-sm text-slate-300">Reason: {a.reason}</p>{a.supporting_document_url&&<p className="mt-1 text-sm"><SettlementReceiptLink url={a.supporting_document_url} label="View adjustment evidence"/></p>}<p className="text-xs text-slate-400">Requested: {a.requested_by||"Unknown"} · Reviewed: {a.approved_by||"Pending"} · {a.created_at?new Date(a.created_at).toLocaleString():""}</p>{a.status==="APPROVED_UNPAID"&&<p className="text-amber-300 text-sm">Approved; payment not yet confirmed.</p>}{a.status==="PAID"&&<p className="text-sky-300 text-sm">Marked paid in Finance. Payment reference and supporting receipt must be reconciled separately; they are not included in this adjustment register.</p>}{a.status==="REJECTED"&&<p className="text-slate-400 text-sm">Rejected; no payment is authorized.</p>}{a.status==="PENDING_APPROVAL"&&canReviewPost&&<button className={button+" mt-2"} onClick={()=>setReview({...review,id:a.id})}>Review this request</button>}</div>)}</div>
    {review.id&&<div className="mt-3 flex flex-wrap gap-3"><select className={field} value={review.action} onChange={e=>setReview({...review,action:e.target.value})}><option value="APPROVE">Approve (unpaid)</option><option value="REJECT">Reject</option></select><input className={field} placeholder="Review note (required)" maxLength={1000} value={review.note} onChange={e=>setReview({...review,note:e.target.value})}/><button className={button} disabled={busy||!canReviewPost||review.note.trim().length<8} onClick={()=>void reviewPost()}>Record independent review</button></div>}
  </section>}
 {activeTab==="history"&&  <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5"><h2 className="text-xl font-bold">Payment history</h2><div className="mt-4 overflow-x-auto rounded-xl border border-slate-800"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-amber-400 text-slate-950"><tr>{["Date","Batch / merchant","Amount","Method","Reference","Account","Evidence","Entered / confirmed by","Status"].map(h=><th scope="col" key={h} className="px-3 py-4 font-extrabold">{h}</th>)}</tr></thead><tbody>{payments.map((p:Row)=><tr key={p.id} className="border-t border-slate-700"><td className="p-3">{new Date(p.confirmed_at||p.created_at).toLocaleString()}</td><td className="p-3">{p.batch_number}<br/>{p.merchant_id}</td><td className="p-3">{money(p.amount)}</td><td className="p-3">{p.payment_method}</td><td className="p-3">{p.payment_group_reference||p.payment_reference}</td><td className="p-3">{p.bank_account||"—"}</td><td className="p-3">{<SettlementReceiptLink url={p.evidence_url||""}/>}</td><td className="p-3">{p.entered_by}<br/>{p.confirmed_by}</td><td className="p-3">{p.status}</td></tr>)}</tbody></table>{!payments.length&&<p className="p-5">No recorded payments.</p>}</div></section>}
 {activeTab==="advance"&&  <MerchantAdvanceSettlementPanel role={role} merchantOptions={merchants} previewOnly />}
 </section>
 </main>;
}
