import React,{useEffect,useState} from 'react';
import {codPaymentTypeLabel} from '@/lib/paymentAllocations';
import {supabase} from '@/integrations/supabase/client';
const money=(value:unknown)=>Number(value||0).toLocaleString('en-US',{maximumFractionDigits:2});
const collectionDisplay=(row:any,key:string)=>{const monetary=['total_collected','cash_collected','digital_collected','unclassified_collected','confirmed_total','pending_total'].includes(key);if(monetary&&Number(row?.unknown_count||0)>0&&Number(row?.total_collected||0)===0)return 'Not recorded';if(monetary&&(row?.[key]===null||row?.[key]===undefined))return 'Not recorded';return money(row?.[key]);};
const field:React.CSSProperties={minHeight:40,padding:8,color:'#eef8ff',background:'#061524',border:'1px solid #35516a',borderRadius:6};
export default function FinanceCollectionTotals({refreshKey=0}:{refreshKey?:number}){
 const [from,setFrom]=useState(''),[to,setTo]=useState(''),[group,setGroup]=useState('PERSON');
 const [rows,setRows]=useState<any[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const [ground,setGround]=useState<any>(null),[groundError,setGroundError]=useState('');
 useEffect(()=>{let active=true;(async()=>{try{const {data,error}=await (supabase as any).rpc('be_finance_ground_reported_totals_v1',{p_from:'2026-10-20',p_to:'2026-10-22'});if(error||!data?.ok)throw new Error(error?.message||data?.error||'Unavailable');if(active)setGround(data);}catch(e:any){if(active)setGroundError(e.message);}})();return()=>{active=false};},[refreshKey]);
 useEffect(()=>{let active=true;if(from&&to&&from>to){setError('Start date must be on or before end date.');setRows([]);return;}
 setLoading(true);setRows([]);setError('');
 (async()=>{try{const {data,error}=await (supabase as any).rpc('be_finance_collection_totals_v215',{p_from:from||null,p_to:to||null,p_group:group});if(error||!data?.ok)throw new Error(error?.message||data?.message||data?.error||'Unable to load collection totals.');if(active)setRows(Array.isArray(data.rows)?data.rows:[]);}catch(e:any){if(active)setError(e.message);}finally{if(active)setLoading(false);}})();return()=>{active=false;};
 },[from,to,group,refreshKey]);
 const dailyPosted=(ground?.days||[]).map((d:any)=>{
   const dayRows=rows.filter(r=>String(r.service_date||'')===String(d.service_date));
   return {date:d.service_date,ways:Number(d.ways||0),reported:Number(d.reported_final_cod||0),posted:dayRows.reduce((s:number,r:any)=>s+Number(r.total_collected||0),0),unknown:dayRows.reduce((s:number,r:any)=>s+Number(r.unknown_count||0),0),matched:dayRows.reduce((s:number,r:any)=>s+Number(r.waybill_count||0),0)};
 });
 const columns=[['service_date','Service date'],[group==='VAN'?'vehicle_name':'collector_name',group==='VAN'?'Van':'Delivery person'],['waybill_count','Ways'],['unknown_count','Unknown collection ways'],['total_collected','Total (MMK)'],['cash_collected','Cash'],['digital_collected','Other methods'],['unclassified_collected','Unclassified'],['confirmed_total','Confirmed'],['pending_total','Pending']];
 return <section style={{padding:16,border:'1px solid #35516a',borderRadius:12,background:'#0b2236'}}>
 <h3 style={{marginTop:0}}>Delivery collection totals</h3><p style={{color:'#ffca79',fontSize:12}}>Attention: Historical records without delivery timestamps cannot be assigned to a service date automatically. Do not interpret undated rows as zero or settled; reconcile each Way ID against dispatch, delivery proof and payment evidence.</p><p style={{color:'#ffca79',fontSize:12}}>Expected COD is separate from collected COD. “Not recorded” means collection evidence or allocation is missing, not zero COD. A displayed 0 is not proof of a completed cash handover. Ground-reported schedules are unverified.</p>
 <div style={{marginBottom:16,padding:12,border:'1px solid #42617d',borderRadius:8,background:'#0d2a42'}}>
 <h4 style={{margin:'0 0 6px'}}>Ground-reported collections | 20–22 October 2026</h4>
 <p style={{color:'#ffca79',margin:'4px 0 10px'}}>Reported from ground spreadsheets. NOT verified cash receipts, NOT confirmed Finance collections and NOT settled. Do not add third-party schedules to collected totals.</p>
 {groundError&&<p role="alert">Ground reconciliation not available: {groundError}</p>}
 {ground?.days?.length>0&&<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{['Date','Ways','Reported final COD','Reported cash','Reported KPay','Missing COD','Split mismatches'].map(h=><th key={h} style={{textAlign:'left',padding:6,borderBottom:'1px solid #42617d'}}>{h}</th>)}</tr></thead><tbody>{ground.days.map((d:any)=><tr key={d.service_date}>{[d.service_date,d.ways,money(d.reported_final_cod),money(d.reported_cash),money(d.reported_kpay),d.missing_final_cod,d.payment_split_mismatches].map((v:any,i:number)=><td key={i} style={{padding:6}}>{v}</td>)}</tr>)}</tbody></table></div>}
 {ground?.third_party_schedules?.length>0&&<p style={{margin:'8px 0 0',fontSize:12,color:'#c4d5e1'}}>Third-party outbound schedules: {ground.third_party_schedules.map((x:any)=>`${x.sheet_date}: ${x.schedule_way_rows} scheduled ways / ${money(x.scheduled_final_cod_mmk)} MMK (unverified)`).join(' | ')}</p>}
 </div>

 <div style={{marginBottom:16,padding:12,border:'1px solid #42617d',borderRadius:8}}>
 <h4 style={{margin:'0 0 6px'}}>Reconciliation gap — ground reports versus recorded Finance collection</h4>
 <p style={{color:'#ffca79',fontSize:12,marginTop:4}}>Difference is an investigation amount, not money confirmed received or owed. Counts and amounts come from different datasets and are not parcel-matched.</p>
 <div style={{overflowX:'auto'}}><table style={{width:'100%',fontSize:12,borderCollapse:'collapse'}}>
 <thead><tr>{['Service date','Ground-report ways','Finance dated ways','Ground-reported COD','Finance recorded collected','Unreconciled comparison gap','Unknown Finance ways'].map(h=><th key={h} style={{padding:7,textAlign:'left',borderBottom:'1px solid #42617d'}}>{h}</th>)}</tr></thead>
 <tbody>{dailyPosted.map((d:any)=><tr key={d.date}><td style={{padding:7}}>{d.date}</td><td>{d.ways}</td><td>{d.matched}</td><td>{money(d.reported)}</td><td>{money(d.posted)}</td><td style={{color:'#ffca79'}}>{money(d.reported-d.posted)}</td><td>{d.unknown}</td></tr>)}</tbody>
 </table></div>
 </div>
 <div style={{display:'flex',gap:12,flexWrap:'wrap'}}><label>From <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={field}/></label><label>To <input type="date" value={to} onChange={e=>setTo(e.target.value)} style={field}/></label><label>Group by <select value={group} onChange={e=>setGroup(e.target.value)} style={field}><option value="PERSON">Delivery person</option><option value="VAN">Van</option></select></label></div>
 {error&&<p role="alert">{error}</p>}{loading&&<p role="status">Loading collection totals…</p>}
 {!loading&&!error&&<div style={{overflowX:'auto',marginTop:12}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{columns.map(([key,label])=><th key={key} style={{textAlign:'left',padding:8}}>{label}</th>)}<th>Method breakdown</th></tr></thead><tbody>{rows.map((row,index)=><tr key={`${row.service_date}-${group==='VAN'?row.vehicle_code:row.collector_code}-${index}`}>{columns.map(([key])=><td key={key} style={{padding:8}}>{key==='service_date'?(row[key]||'Service date missing — reconcile'):key.endsWith('_name')?`${row[key]||'Unassigned'} (${row[group==='VAN'?'vehicle_code':'collector_code']||'—'})`:collectionDisplay(row,key)}</td>)}<td style={{padding:8}}>{Object.entries(row.by_method||{}).filter(([,amount])=>Number(amount)>0).map(([method,amount])=>`${codPaymentTypeLabel(method)} ${money(amount)}`).join(' + ')||'—'}</td></tr>)}</tbody></table>{!rows.length&&<p>No collections for these filters.</p>}</div>}
 </section>;
}
