import React from 'react';
import {codPaymentTypes} from '@/lib/paymentAllocations';
import {CodFilters} from '@/lib/financeCodFilters';
const field:React.CSSProperties={minHeight:42,width:'100%',padding:8,color:'#172333',background:'#fff',border:'1px solid #55718a',borderRadius:7};
export default function CodQueueFilters({value,onChange,statuses,count,total}:{value:CodFilters;onChange:(v:CodFilters)=>void;statuses:string[];count:number;total:number}){
 const set=(key:keyof CodFilters,v:string)=>onChange({...value,[key]:v});
 return <div style={{marginBottom:16}}>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10}}>
 <label>Service date from<input aria-label="COD service date from" type="date" value={value.from||''} onChange={e=>set('from',e.target.value)} style={field}/></label>
 <label>Service date to<input aria-label="COD service date to" type="date" value={value.to||''} onChange={e=>set('to',e.target.value)} style={field}/></label>
 <label>Status<select value={value.status||''} onChange={e=>set('status',e.target.value)} style={field}><option value="">All statuses</option>{statuses.map(s=><option key={s}>{s}</option>)}</select></label>
 <label>Payment type<select value={value.payment||''} onChange={e=>set('payment',e.target.value)} style={field}><option value="">All payment types</option>{codPaymentTypes.map(([code,label])=><option key={code} value={code}>{label}</option>)}<option value="UNKNOWN">Not recorded</option></select></label>
 <label>Rider / Driver / Helper<input value={value.worker||''} onChange={e=>set('worker',e.target.value)} placeholder="Name or staff code" style={field}/></label>
 <label>Van<input value={value.van||''} onChange={e=>set('van',e.target.value)} placeholder="Plate, code or name" style={field}/></label>
 <label>Merchant code<input value={value.merchant||''} onChange={e=>set('merchant',e.target.value)} placeholder="For example KSC" style={field}/></label>
 <label>Settlement duration<select value={value.duration||''} onChange={e=>set('duration',e.target.value)} style={field}><option value="">All durations</option><option value="UNDER_24H">Under 24 hours</option><option value="24_TO_48H">24–48 hours</option><option value="OVER_48H">Over 48 hours</option></select></label>
 <label>Waybill / Wayplan / Reference<input value={value.query||''} onChange={e=>set('query',e.target.value)} placeholder="Search queue" style={field}/></label>
 <button type="button" onClick={()=>onChange({})} style={{...field,alignSelf:'end',cursor:'pointer'}}>Reset filters</button>
 </div>
 {value.from&&value.to&&value.from>value.to&&<p role="alert">Start date must be on or before end date.</p>}
 <p style={{fontSize:12}}>Showing {count} of {total} loaded ways. Dates use Myanmar Time. Duration runs from delivery (or service-day start when delivery time is missing) to settlement, or now while pending.</p>
 {total>=5000&&<p role="alert">The latest 5,000 ways are loaded. Older records are outside this queue view.</p>}
 </div>;
}
