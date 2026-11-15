import React, {useEffect,useMemo,useState} from 'react';
import * as XLSX from 'xlsx';
import {supabase} from '@/integrations/supabase/client';
import {CorporateThirdPartyContext} from '@/components/tariff/CorporateTariffPanel';

const OUTCOMES=['DELIVERED','RTO','FAILED','POSTPONED','NO_ATTEMPT','UNREACHABLE','REFUSED','ADDRESS_ISSUE','LOST','DAMAGED','HANDED_TO_PARTNER','OTHER'];
const REASONS=['','PHONE_OFF','NOT_ANSWERING','UNREACHABLE','OUT_OF_AREA','ADDRESS_INCORRECT','RECIPIENT_REFUSED','RECIPIENT_ABSENT','TIME_NOT_ENOUGH','CUSTOMER_REQUESTED_POSTPONEMENT','DAMAGED','LOST','RTO_REQUESTED','OTHER'];
type Row={delivery_way_id:string;last_schedule_date:string;schedule_occurrences:number;merchant_code:string|null;merchant_name:string|null;recipient_name:string|null;system_parcel_status:string|null;system_cod_amount:number|null;cs_outcome:string;revision:number;finance_review_status:string|null;merchant_prefix_conflict:boolean;provider_code:string|null;reason_code:string|null;notes:string|null;};
const money=(v:unknown)=>v==null?'Unknown':Number(v).toLocaleString('en-US')+' MMK';
type Reconcile={delivery_way_id:string;township:string|null;city:string|null;region_state:string|null;delivery_route_mode:string|null;handoff_station_name:string|null;system_cod_amount:number|null;inventory_row_count:number;inventory_cod_min:number|null;inventory_cod_max:number|null;inventory_township:string|null;inventory_amount_conflict:boolean;duplicate_inventory_way:boolean;route_review_required:boolean;parcel_master_row_count:number;};
type LocalInventory={amount:number|null;township:string|null;sheet:string;rows:number;amountConflict:boolean};
const input:React.CSSProperties={background:'#f8fafc',color:'#111827',padding:'9px',borderRadius:6,width:'100%',border:'1px solid #64748b'};
export default function ThirdPartyDeliveryConfirmationPage(){
 const [rows,setRows]=useState<Row[]>([]),[search,setSearch]=useState(''),[filter,setFilter]=useState('ALL'),[selected,setSelected]=useState<Row|null>(null);
 const [outcome,setOutcome]=useState('DELIVERED'),[provider,setProvider]=useState('Royal Express'),[reason,setReason]=useState(''),[note,setNote]=useState(''),[evidence,setEvidence]=useState('');
 const [uploadedInventory,setUploadedInventory]=useState<Record<string,LocalInventory>>({}),[uploadNotice,setUploadNotice]=useState('');
 const [reconciliation,setReconciliation]=useState<Record<string,Reconcile>>({}),[reconcileError,setReconcileError]=useState(''),[reviewOnly,setReviewOnly]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[modalError,setModalError]=useState(''),[total,setTotal]=useState(0),[unfilteredTotal,setUnfilteredTotal]=useState<number|null>(null);
 async function refresh(searchOverride?:string){setBusy(true);try{
  const {data,error}=await (supabase as any).rpc('be_cs_thirdparty_queue_v1',{p_search:(searchOverride??search)||null,p_outcome:searchOverride===''?'ALL':filter,p_limit:300});
  if(error||!data?.ok)throw new Error(error?.message||data?.error||'Queue unavailable');
  setRows(data.rows||[]);setTotal(data.total||0);
  if((searchOverride??search).trim()){const {data:all,error:allError}=await (supabase as any).rpc('be_cs_thirdparty_queue_v1',{p_search:null,p_outcome:'ALL',p_limit:1});setUnfilteredTotal(!allError&&all?.ok?Number(all.total):null);}else setUnfilteredTotal(null);
  const ids=(data.rows||[]).map((r:Row)=>r.delivery_way_id);
  setReconciliation({});setReconcileError('');
  if(ids.length){
   const {data:preview,error:previewError}=await (supabase as any).rpc('be_cs_thirdparty_reconcile_preview_v1',{p_way_ids:ids});
   if(previewError||!preview?.ok){setReconcileError('Reconciliation detail unavailable: '+(previewError?.message||preview?.error||'RPC unavailable'));}
   else setReconciliation(Object.fromEntries((preview.rows||[]).map((r:Reconcile)=>[r.delivery_way_id,r])));
  }
 }catch(e:any){setRows([]);setTotal(0);setMessage(e.message);}finally{setBusy(false);}}
 useEffect(()=>{void refresh();},[filter]);
 async function importInventory(file:File|undefined){if(!file)return;
  try{if(file.size>15_000_000)throw new Error('File exceeds 15 MB maximum');
   const book=XLSX.read(await file.arrayBuffer(),{type:'array'});const found=new Map<string,LocalInventory>();let parsed=0;
   for(const sheetName of book.SheetNames){const sheet=book.Sheets[sheetName];if(!sheet)continue;
    const table=XLSX.utils.sheet_to_json<(string|number|null)[]>(sheet,{header:1,defval:null,blankrows:false});
    const headerAt=table.findIndex(row=>Array.isArray(row)&&row.some(v=>/^(way\s*id|delivery\s*way\s*id)$/i.test(String(v||'').trim())));
    if(headerAt<0)continue;const headers=table[headerAt].map(v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]/g,''));
    const wayCol=headers.findIndex(v=>v==='wayid'||v==='deliverywayid');const amountCol=headers.findIndex(v=>['finalcod','codamount','cod','amount'].includes(v));const townCol=headers.findIndex(v=>['destination','recipienttown','township'].includes(v));
    if(wayCol<0)continue;
    for(const row of table.slice(headerAt+1)){const id=String(row[wayCol]||'').trim().toUpperCase();if(!/^D[0-9]{4}-[A-Z0-9]+-[0-9]+$/.test(id))continue;
     const raw=amountCol<0?'':String(row[amountCol]??'').replace(/,/g,'').trim();const amount=raw!==''&&Number.isFinite(Number(raw))?Number(raw):null;
     const old=found.get(id);found.set(id,{amount:old?.amount??amount,township:old?.township??(townCol>=0?String(row[townCol]||'').trim():null),sheet:old?.sheet||sheetName,rows:(old?.rows||0)+1,amountConflict:Boolean(old?.amountConflict||(old?.amount!=null&&amount!=null&&old.amount!==amount))});parsed++;
    }
   }
   if(!found.size)throw new Error('No recognized Way ID rows. Required: Way ID; optional: Final COD, Destination.');
   setUploadedInventory(Object.fromEntries(found));setUploadNotice('Local Excel comparison: '+found.size+' unique Way IDs, '+parsed+' rows. No data uploaded.');
  }catch(error:any){setUploadedInventory({});setUploadNotice('Inventory import failed: '+(error?.message||String(error)));}
 }
 const inventoryAmount=(id:string)=>uploadedInventory[id]?.amount??reconciliation[id]?.inventory_cod_min??null;
 const excelIds=Object.keys(uploadedInventory);
 const queueIds=new Set(rows.map(r=>r.delivery_way_id));
 const unmatchedExcelIds=excelIds.filter(id=>!queueIds.has(id));
 const hasLocalComparison=excelIds.length>0;
 const hasDuplicate=(id:string)=>Boolean(uploadedInventory[id]?.rows>1||reconciliation[id]?.duplicate_inventory_way);
 const hasConflict=(r:Row)=>Boolean(reconciliation[r.delivery_way_id]?.inventory_amount_conflict||uploadedInventory[r.delivery_way_id]?.amountConflict||(uploadedInventory[r.delivery_way_id]?.amount!=null&&r.system_cod_amount!=null&&uploadedInventory[r.delivery_way_id].amount!==Number(r.system_cod_amount)));
 const visibleRows=useMemo(()=>reviewOnly?rows.filter(r=>{const d=reconciliation[r.delivery_way_id];return !d||hasConflict(r)||hasDuplicate(r.delivery_way_id)||d.route_review_required||(Object.keys(uploadedInventory).length>0?!uploadedInventory[r.delivery_way_id]:d.inventory_row_count===0);}):rows,[rows,reconciliation,reviewOnly,uploadedInventory]);
 function downloadReview(){const header=['Way ID','Merchant','Recipient','Township','System COD MMK','Inventory COD min MMK','Inventory COD max MMK','Variance MMK','Inventory rows','Route mode','Gate','Review reasons'];
  const quote=(value:unknown)=>'"'+String(value??'').replace(/"/g,'""')+'"';
  const data=visibleRows.map(r=>{const d=reconciliation[r.delivery_way_id];const reasons=[hasConflict(r)?'COD_MISMATCH':'',hasDuplicate(r.delivery_way_id)?'DUPLICATE_INVENTORY':'',d?.route_review_required?'ROUTING_REVIEW':'',d&&d.inventory_row_count===0?'NO_REFERENCE_INVENTORY':''].filter(Boolean).join(';');return [r.delivery_way_id,r.merchant_name,r.recipient_name,d?.township,r.system_cod_amount,inventoryAmount(r.delivery_way_id),uploadedInventory[r.delivery_way_id]?.amount??d?.inventory_cod_max,inventoryAmount(r.delivery_way_id)==null?'':Number(r.system_cod_amount||0)-Number(inventoryAmount(r.delivery_way_id)),d?.inventory_row_count,d?.delivery_route_mode,d?.handoff_station_name,reasons].map(quote).join(',')});
  const csv='\uFEFF'+[header.map(quote).join(','),...data].join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='thirdparty-reconciliation-review.csv';a.click();URL.revokeObjectURL(url);
 }
 const chosen=useMemo(()=>rows.find(r=>r.delivery_way_id===selected?.delivery_way_id)||selected,[rows,selected]);
 function choose(r:Row){setSelected(r);setOutcome(r.cs_outcome==='UNCONFIRMED'?'DELIVERED':r.cs_outcome);setProvider(r.provider_code||'Royal Express');setReason(r.reason_code||'');setNote(r.notes||'');setEvidence('');setMessage('');setModalError('');}
 async function save(){if(!chosen)return;
  const detail=reconciliation[chosen.delivery_way_id];
  if(outcome==='DELIVERED'&&(reconcileError||!detail||hasConflict(chosen)||hasDuplicate(chosen.delivery_way_id)||detail.route_review_required)){setModalError('Reconciliation unresolved: review inventory COD, duplicates and branch before confirming DELIVERED.');return;} if(!note.trim()||note.trim().length<8){setModalError('Enter at least 8 characters describing how the delivery status was verified.');return;}
  if(outcome!=='DELIVERED'&&!reason){setModalError('Choose a reason for RTO, rejected, postponed or other non-delivered outcomes.');return;}
  setModalError('');setBusy(true);try{const {data,error}=await (supabase as any).rpc('be_cs_thirdparty_confirm_v1',{
   p_way_id:chosen.delivery_way_id,p_provider:provider,p_outcome:outcome,p_reason:reason,p_note:note,p_evidence:evidence||null,p_expected_revision:chosen.revision||0
  });if(error||!data?.ok)throw new Error(error?.message||data?.error||'Save failed');
  setMessage('Saved CS confirmation. Finance review: '+data.finance_review_status+'. No payment posted.');setSelected(null);await refresh();
 }catch(e:any){setModalError(e.message);}finally{setBusy(false);}}
 return <div style={{color:'#e2e8f0',padding:12,maxWidth:1500,margin:'auto'}}>
  <h1 style={{fontSize:23,fontWeight:700}}>Third-party Delivery Confirmation / ပြင်ပပို့ဆောင်မှု အတည်ပြုခြင်း</h1>
  <p style={{color:'#fbbf24'}}>The schedule is not proof of delivery. CS confirmations create dedicated merchant-account Finance reviews, never automatic cash receipts or settled payments.</p>
  <div style={{display:'flex',gap:9,flexWrap:'wrap',margin:'14px 0'}}>
   <input aria-label="Search Way ID or merchant" placeholder="Search Way ID or merchant" value={search} onChange={e=>setSearch(e.target.value)} style={{...input,maxWidth:310}}/>
   <select aria-label="Filter outcome" value={filter} onChange={e=>setFilter(e.target.value)} style={{...input,maxWidth:180}}>{['ALL','UNCONFIRMED',...OUTCOMES].map(x=><option key={x}>{x}</option>)}</select>
   <button type="button" disabled={busy} onClick={()=>void refresh()} style={{padding:'9px 16px',background:'#f5b942',color:'#111',borderRadius:6}}>Search / Refresh</button>
   <label style={{display:'flex',alignItems:'center',gap:6,fontSize:13}}>Compare Excel <input aria-label="Import inventory Excel" type="file" accept=".xlsx,.xls,.csv" onChange={e=>void importInventory(e.target.files?.[0])}/></label>
   <label style={{display:'flex',alignItems:'center',gap:6}}><input type="checkbox" checked={reviewOnly} onChange={e=>setReviewOnly(e.target.checked)}/> Needs review only</label>
   <button type="button" disabled={!rows.length} onClick={downloadReview} style={{padding:'9px 13px',background:'#1f4b67',color:'#fff',border:'1px solid #88a4b9',borderRadius:6}}>Export review CSV</button>
  </div>
  <p>{total} third-party Ways matching the current search and outcome filter. Royal Express parcels are included even without a partner schedule; registration does not prove dispatch, handover, or delivery.</p>
  {total===0&&search.trim()&&<p role="status" style={{padding:12,border:'1px solid #6388a5',borderRadius:7}}>No Ways match <strong>{search.trim()}</strong>. {unfilteredTotal!=null?`${unfilteredTotal} Ways exist in the unfiltered current queue. `:''}<button type="button" onClick={()=>{setSearch('');setFilter('ALL');void refresh('');}} style={{color:'#0e2438',background:'#f5b942',borderRadius:5,padding:'6px 10px'}}>Clear search</button> and click Search / Refresh.</p>
  {hasLocalComparison&&<p role="status" style={{color:'#fcd58c'}}>Excel reference: {excelIds.length} unique Way IDs. {excelIds.length-unmatchedExcelIds.length} are among the {rows.length} currently loaded queue rows; {unmatchedExcelIds.length} are not in this loaded result. This is not evidence they are missing from the parcel master; clear search and review all pages before escalation. Excel is not uploaded or imported into operational records.</p>
  {uploadNotice&&<p role="status" style={{color:'#fcd58c'}}>{uploadNotice}</p>}
  {reconcileError&&<p role="alert" style={{color:'#fbbf24'}}>{reconcileError}. COD and routing comparison is unavailable; do not finalize disputed Ways.</p>}
  <p style={{color:'#fcd58c'}}>Inventory comparison is read-only and uses existing warehouse reference rows. A blank inventory value is NOT proof that a package is missing; verify the dated Excel source. CS confirmation never posts settlement.</p>
  {message&&<p role="status" style={{padding:12,background:'#17324b',borderRadius:6}}>{message}</p>}
  {total===0&&!search.trim()&&filter==='ALL'&&<p role="status" style={{padding:12,border:'1px solid #486a88',borderRadius:7,margin:'8px 0',color:'#fbbf24'}}>No current third-party Ways qualify under the live go-live cutoff. Royal Express Ways should appear once registered in the current Data Entry parcel master, even without an old schedule. Historical schedules remain excluded.</p>}
  <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:940}}>
   <thead><tr>{['Way ID','Latest schedule','Township / branch review','Merchant account','Recipient','System status','CS status','System COD','Inventory COD (reference)','Variance / flags','Finance review','Action'].map(x=><th key={x} style={{textAlign:'left',padding:10,background:'#193a55'}}>{x}</th>)}</tr></thead>
   <tbody>{visibleRows.map(r=><tr key={r.delivery_way_id} style={{borderBottom:'1px solid #36506a'}}>
    <td style={{padding:9,minWidth:140}}>{r.delivery_way_id}</td><td>{r.last_schedule_date||'Not yet scheduled'}</td><td style={{minWidth:155}}>{reconciliation[r.delivery_way_id]?.township||'—'}<div style={{fontSize:12,color:'#fcd58c'}}>{reconciliation[r.delivery_way_id]?.delivery_route_mode||'Unverified routing'} {reconciliation[r.delivery_way_id]?.route_review_required?'⚠ Review branch':''}</div></td>
    <td style={{color:r.merchant_prefix_conflict?'#ffb36b':undefined}}>{r.merchant_name||'Unresolved'} ({r.merchant_code||'—'}){r.merchant_prefix_conflict?' ⚠':''}</td>
    <td>{r.recipient_name||'—'}</td><td>{r.system_parcel_status||'Not in Parcel Master'}</td><td>{r.cs_outcome}</td><td>{money(r.system_cod_amount)}</td><td>{inventoryAmount(r.delivery_way_id)==null?'Not matched':money(inventoryAmount(r.delivery_way_id))}{reconciliation[r.delivery_way_id]?.inventory_cod_min!==reconciliation[r.delivery_way_id]?.inventory_cod_max&&<span style={{color:'#fbbf24'}}> (varies)</span>}</td><td style={{minWidth:145}}>{inventoryAmount(r.delivery_way_id)==null?'Pending':money(Number(r.system_cod_amount||0)-Number(inventoryAmount(r.delivery_way_id)))}{hasConflict(r)&&<div style={{color:'#fda4af'}}>⚠ COD mismatch</div>}{hasDuplicate(r.delivery_way_id)&&<div style={{color:'#fbbf24'}}>⚠ Inventory duplicates</div>}{reconciliation[r.delivery_way_id]?.route_review_required&&<div style={{color:'#fbbf24'}}>⚠ Wrong branch/provider?</div>}</td><td>{r.finance_review_status||'Awaiting CS'}</td>
    <td><button type="button" onClick={()=>choose(r)} style={{padding:'7px 12px',background:'#f5b942',color:'#111',borderRadius:6}}>Confirm / RTO</button></td>
   </tr>)}</tbody>
  </table></div>
  {chosen&&<div style={{position:'fixed',inset:0,zIndex:1000,background:'rgba(0,10,20,0.85)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}><section role="dialog" aria-modal="true" aria-label={`Confirm third-party delivery for ${chosen.delivery_way_id}`} style={{width:'min(960px,100%)',maxHeight:'90vh',overflowY:'auto',padding:20,border:'1px solid #54718c',borderRadius:10,background:'#10283c',boxShadow:'0 20px 65px rgba(0,0,0,0.55)'}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'start'}}><h2 style={{fontSize:19,fontWeight:600}}>Confirm {chosen.delivery_way_id} · {chosen.merchant_name||'Merchant unresolved'}</h2><button type="button" aria-label="Close confirmation dialog" onClick={()=>setSelected(null)} style={{fontSize:22,color:'#fff',padding:'3px 10px',border:'1px solid #64748b',borderRadius:6}}>×</button></div>
   <p>Previous CS outcome: {chosen.cs_outcome} · Revision {chosen.revision||0}. Merchant account: {chosen.merchant_code||'not resolved'}.</p>
   {!chosen.last_schedule_date&&<p role="note" style={{padding:10,border:'1px solid #f5b942',borderRadius:8,color:'#fcd58c'}}>This Royal Express Way has no qualifying third-party schedule recorded. Confirm actual provider handover or delivery independently before recording a CS outcome. Registration does not prove a partner accepted the parcel.</p>}
   <p style={{color:'#e2e8f0'}}>Destination township: {reconciliation[chosen.delivery_way_id]?.township||'Not available'} · Inventory reference COD: {money(inventoryAmount(chosen.delivery_way_id))} · System COD: {money(chosen.system_cod_amount)}.</p>
   {(hasConflict(chosen)||reconciliation[chosen.delivery_way_id]?.route_review_required||hasDuplicate(chosen.delivery_way_id))&&<p role="alert" style={{color:'#fda4af'}}>⚠ Inventory or branch discrepancy: hold DELIVERED confirmation until reviewed with original Excel/partner proof.</p>}
   <CorporateThirdPartyContext wayId={chosen.delivery_way_id}/>
   <p style={{fontWeight:600,marginBottom:7}}>Choose a confirmation action:</p>
   <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>{[{code:'DELIVERED',title:'Delivered / ပို့ပြီး'},{code:'RTO',title:'RTO / ပြန်ပို့'},{code:'REFUSED',title:'Rejected / လက်မခံ'},{code:'FAILED',title:'Failed / မအောင်မြင်'},{code:'POSTPONED',title:'Postponed / ရွှေ့ဆိုင်း'}].map(a=><button type="button" key={a.code} onClick={()=>{setOutcome(a.code);setModalError('');setReason(a.code==='REFUSED'?'RECIPIENT_REFUSED':'');}} style={{padding:'10px 13px',borderRadius:7,border:outcome===a.code?'2px solid #f5b942':'1px solid #6988a0',background:outcome===a.code?'#f5b942':'#1c3c54',color:outcome===a.code?'#142334':'#f8fafc',fontWeight:600}}>{a.title}</button>)}</div>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>
    <label>Third-party provider<input style={input} value={provider} onChange={e=>setProvider(e.target.value)} required/></label>
    <label>Delivery outcome<select style={input} value={outcome} onChange={e=>{setOutcome(e.target.value);setReason('');setModalError('');}}>{OUTCOMES.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
    <label>Failure / RTO / postponement reason<select style={input} value={reason} onChange={e=>setReason(e.target.value)}><option value="">Select reason</option>{REASONS.filter(Boolean).map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Evidence reference (optional)<input style={input} value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="Provider POD, call log or case reference"/></label>
   </div>
   <label style={{display:'block',marginTop:12}}>Verification notes<textarea style={{...input,minHeight:85}} value={note} onChange={e=>setNote(e.target.value)} placeholder="Who confirmed, when, and what the provider reported?"/></label>
   {modalError&&<p role="alert" style={{padding:10,border:'1px solid #fb7185',background:'#4b1f32',borderRadius:6,color:'#fff'}}>{modalError}</p>}
   <p style={{color:'#ffca79'}}>This saves a CS history event and sends the outcome to a merchant-specific Finance review. It does NOT mark Parcel Master delivered, create a wayplan scan, collect COD or authorize settlement.</p>
   <div style={{display:'flex',gap:10}}><button disabled={busy} onClick={()=>void save()} style={{padding:'10px 18px',background:'#f5b942',color:'#111',borderRadius:6}}>Save confirmation &amp; send to Finance</button><button onClick={()=>setSelected(null)} style={{padding:'10px 18px',border:'1px solid #64748b',borderRadius:6}}>Cancel</button></div>
  </section></div>}
 </div>;
}
