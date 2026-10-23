import React,{useEffect,useState} from 'react';
import {codPaymentTypeLabel} from '@/lib/paymentAllocations';
import {supabase} from '@/integrations/supabase/client';
const money=(value:unknown)=>Number(value||0).toLocaleString('en-US',{maximumFractionDigits:2});
const field:React.CSSProperties={minHeight:40,padding:8,color:'#eef8ff',background:'#061524',border:'1px solid #35516a',borderRadius:6};
export default function FinanceCollectionTotals({refreshKey=0}:{refreshKey?:number}){
 const [from,setFrom]=useState(''),[to,setTo]=useState(''),[group,setGroup]=useState('PERSON');
 const [rows,setRows]=useState<any[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 useEffect(()=>{let active=true;if(from&&to&&from>to){setError('Start date must be on or before end date.');setRows([]);return;}
 setLoading(true);setRows([]);setError('');
 (async()=>{try{const {data,error}=await (supabase as any).rpc('be_finance_collection_totals_v215',{p_from:from||null,p_to:to||null,p_group:group});if(error||!data?.ok)throw new Error(error?.message||data?.message||data?.error||'Unable to load collection totals.');if(active)setRows(Array.isArray(data.rows)?data.rows:[]);}catch(e:any){if(active)setError(e.message);}finally{if(active)setLoading(false);}})();return()=>{active=false;};
 },[from,to,group,refreshKey]);
 const columns=[['service_date','Service date'],[group==='VAN'?'vehicle_name':'collector_name',group==='VAN'?'Van':'Delivery person'],['waybill_count','Ways'],['unknown_count','Unknown collection ways'],['total_collected','Total (MMK)'],['cash_collected','Cash'],['digital_collected','Other methods'],['unclassified_collected','Unclassified'],['confirmed_total','Confirmed'],['pending_total','Pending']];
 return <section style={{padding:16,border:'1px solid #35516a',borderRadius:12,background:'#0b2236'}}>
 <h3 style={{marginTop:0}}>Delivery collection totals</h3>
 <div style={{display:'flex',gap:12,flexWrap:'wrap'}}><label>From <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={field}/></label><label>To <input type="date" value={to} onChange={e=>setTo(e.target.value)} style={field}/></label><label>Group by <select value={group} onChange={e=>setGroup(e.target.value)} style={field}><option value="PERSON">Delivery person</option><option value="VAN">Van</option></select></label></div>
 {error&&<p role="alert">{error}</p>}{loading&&<p role="status">Loading collection totals…</p>}
 {!loading&&!error&&<div style={{overflowX:'auto',marginTop:12}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>{columns.map(([key,label])=><th key={key} style={{textAlign:'left',padding:8}}>{label}</th>)}<th>Method breakdown</th></tr></thead><tbody>{rows.map((row,index)=><tr key={`${row.service_date}-${group==='VAN'?row.vehicle_code:row.collector_code}-${index}`}>{columns.map(([key])=><td key={key} style={{padding:8}}>{key==='service_date'?(row[key]||'Not recorded'):key.endsWith('_name')?`${row[key]||'Unassigned'} (${row[group==='VAN'?'vehicle_code':'collector_code']||'—'})`:money(row[key])}</td>)}<td style={{padding:8}}>{Object.entries(row.by_method||{}).filter(([,amount])=>Number(amount)>0).map(([method,amount])=>`${codPaymentTypeLabel(method)} ${money(amount)}`).join(' + ')||'—'}</td></tr>)}</tbody></table>{!rows.length&&<p>No collections for these filters.</p>}</div>}
 </section>;
}
