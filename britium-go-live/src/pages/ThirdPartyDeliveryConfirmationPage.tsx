import React, {useEffect,useMemo,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';

const OUTCOMES=['DELIVERED','RTO','FAILED','POSTPONED','NO_ATTEMPT','UNREACHABLE','REFUSED','ADDRESS_ISSUE','LOST','DAMAGED','HANDED_TO_PARTNER','OTHER'];
const REASONS=['','PHONE_OFF','NOT_ANSWERING','UNREACHABLE','OUT_OF_AREA','ADDRESS_INCORRECT','RECIPIENT_REFUSED','RECIPIENT_ABSENT','TIME_NOT_ENOUGH','CUSTOMER_REQUESTED_POSTPONEMENT','DAMAGED','LOST','RTO_REQUESTED','OTHER'];
type Row={delivery_way_id:string;last_schedule_date:string;schedule_occurrences:number;merchant_code:string|null;merchant_name:string|null;recipient_name:string|null;system_parcel_status:string|null;system_cod_amount:number|null;cs_outcome:string;revision:number;finance_review_status:string|null;merchant_prefix_conflict:boolean;provider_code:string|null;reason_code:string|null;notes:string|null;};
const money=(v:unknown)=>v==null?'Unknown':Number(v).toLocaleString('en-US')+' MMK';
const input:React.CSSProperties={background:'#f8fafc',color:'#111827',padding:'9px',borderRadius:6,width:'100%',border:'1px solid #64748b'};
export default function ThirdPartyDeliveryConfirmationPage(){
 const [rows,setRows]=useState<Row[]>([]),[search,setSearch]=useState(''),[filter,setFilter]=useState('ALL'),[selected,setSelected]=useState<Row|null>(null);
 const [outcome,setOutcome]=useState('DELIVERED'),[provider,setProvider]=useState('Royal Express'),[reason,setReason]=useState(''),[note,setNote]=useState(''),[evidence,setEvidence]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[total,setTotal]=useState(0);
 async function refresh(){setBusy(true);try{
  const {data,error}=await (supabase as any).rpc('be_cs_thirdparty_queue_v1',{p_search:search||null,p_outcome:filter,p_limit:300});
  if(error||!data?.ok)throw new Error(error?.message||data?.error||'Queue unavailable');
  setRows(data.rows||[]);setTotal(data.total||0);
 }catch(e:any){setMessage(e.message);}finally{setBusy(false);}}
 useEffect(()=>{void refresh();},[filter]);
 const chosen=useMemo(()=>rows.find(r=>r.delivery_way_id===selected?.delivery_way_id)||selected,[rows,selected]);
 function choose(r:Row){setSelected(r);setOutcome(r.cs_outcome==='UNCONFIRMED'?'DELIVERED':r.cs_outcome);setProvider(r.provider_code||'Royal Express');setReason(r.reason_code||'');setNote(r.notes||'');setEvidence('');setMessage('');}
 async function save(){if(!chosen)return; if(!note.trim()||note.trim().length<8){setMessage('Enter at least 8 characters describing how the delivery status was verified.');return;}
  if(outcome!=='DELIVERED'&&!reason){setMessage('A reason is required for non-delivered outcomes.');return;}
  setBusy(true);try{const {data,error}=await (supabase as any).rpc('be_cs_thirdparty_confirm_v1',{
   p_way_id:chosen.delivery_way_id,p_provider:provider,p_outcome:outcome,p_reason:reason,p_note:note,p_evidence:evidence||null,p_expected_revision:chosen.revision||0
  });if(error||!data?.ok)throw new Error(error?.message||data?.error||'Save failed');
  setMessage('Saved CS confirmation. Finance review: '+data.finance_review_status+'. No payment posted.');setSelected(null);await refresh();
 }catch(e:any){setMessage(e.message);}finally{setBusy(false);}}
 return <div style={{color:'#e2e8f0',padding:12,maxWidth:1500,margin:'auto'}}>
  <h1 style={{fontSize:23,fontWeight:700}}>Third-party Delivery Confirmation / ပြင်ပပို့ဆောင်မှု အတည်ပြုခြင်း</h1>
  <p style={{color:'#fbbf24'}}>The schedule is not proof of delivery. CS confirmations create dedicated merchant-account Finance reviews, never automatic cash receipts or settled payments.</p>
  <div style={{display:'flex',gap:9,flexWrap:'wrap',margin:'14px 0'}}>
   <input aria-label="Search Way ID or merchant" placeholder="Search Way ID or merchant" value={search} onChange={e=>setSearch(e.target.value)} style={{...input,maxWidth:310}}/>
   <select aria-label="Filter outcome" value={filter} onChange={e=>setFilter(e.target.value)} style={{...input,maxWidth:180}}>{['ALL','UNCONFIRMED',...OUTCOMES].map(x=><option key={x}>{x}</option>)}</select>
   <button type="button" disabled={busy} onClick={()=>void refresh()} style={{padding:'9px 16px',background:'#f5b942',color:'#111',borderRadius:6}}>Search / Refresh</button>
  </div>
  <p>{total} unique Ways matching this filter. Repeated scheduling dates are combined per Way ID.</p>
  {message&&<p role="status" style={{padding:12,background:'#17324b',borderRadius:6}}>{message}</p>}
  <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:940}}>
   <thead><tr>{['Way ID','Latest schedule','Attempts in schedule','Merchant account','Recipient','System status','CS status','Expected COD','Finance review','Action'].map(x=><th key={x} style={{textAlign:'left',padding:10,background:'#193a55'}}>{x}</th>)}</tr></thead>
   <tbody>{rows.map(r=><tr key={r.delivery_way_id} style={{borderBottom:'1px solid #36506a'}}>
    <td style={{padding:9}}>{r.delivery_way_id}</td><td>{r.last_schedule_date}</td><td>{r.schedule_occurrences}</td>
    <td style={{color:r.merchant_prefix_conflict?'#ffb36b':undefined}}>{r.merchant_name||'Unresolved'} ({r.merchant_code||'—'}){r.merchant_prefix_conflict?' ⚠':''}</td>
    <td>{r.recipient_name||'—'}</td><td>{r.system_parcel_status||'Not in Parcel Master'}</td><td>{r.cs_outcome}</td><td>{money(r.system_cod_amount)}</td><td>{r.finance_review_status||'Awaiting CS'}</td>
    <td><button type="button" onClick={()=>choose(r)} style={{padding:'7px 12px',background:'#f5b942',color:'#111',borderRadius:6}}>Review</button></td>
   </tr>)}</tbody>
  </table></div>
  {chosen&&<section style={{marginTop:20,padding:18,border:'1px solid #54718c',borderRadius:8,background:'#10283c'}}>
   <h2 style={{fontSize:19,fontWeight:600}}>Confirm {chosen.delivery_way_id} · {chosen.merchant_name||'Merchant unresolved'}</h2>
   <p>Previous CS outcome: {chosen.cs_outcome} · Revision {chosen.revision||0}. Merchant account: {chosen.merchant_code||'not resolved'}.</p>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>
    <label>Third-party provider<input style={input} value={provider} onChange={e=>setProvider(e.target.value)} required/></label>
    <label>Delivery outcome<select style={input} value={outcome} onChange={e=>setOutcome(e.target.value)}>{OUTCOMES.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
    <label>Failure / RTO / postponement reason<select style={input} value={reason} onChange={e=>setReason(e.target.value)}><option value="">Select reason</option>{REASONS.filter(Boolean).map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Evidence reference (optional)<input style={input} value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="Provider POD, call log or case reference"/></label>
   </div>
   <label style={{display:'block',marginTop:12}}>Verification notes<textarea style={{...input,minHeight:85}} value={note} onChange={e=>setNote(e.target.value)} placeholder="Who confirmed, when, and what the provider reported?"/></label>
   <p style={{color:'#ffca79'}}>This saves a CS history event and sends the outcome to a merchant-specific Finance review. It does NOT mark Parcel Master delivered, create a wayplan scan, collect COD or authorize settlement.</p>
   <div style={{display:'flex',gap:10}}><button disabled={busy} onClick={()=>void save()} style={{padding:'10px 18px',background:'#f5b942',color:'#111',borderRadius:6}}>Save confirmation &amp; send to Finance</button><button onClick={()=>setSelected(null)} style={{padding:'10px 18px',border:'1px solid #64748b',borderRadius:6}}>Cancel</button></div>
  </section>}
 </div>;
}
