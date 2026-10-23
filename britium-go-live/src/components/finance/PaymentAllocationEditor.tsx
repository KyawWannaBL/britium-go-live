import React from 'react';
import {codPaymentTypes,type PaymentAllocation} from '@/lib/paymentAllocations';
const field:React.CSSProperties={width:'100%',minHeight:40,padding:8,color:'#eef8ff',background:'#061524',border:'1px solid #35516a',borderRadius:6};
export default function PaymentAllocationEditor({value,onChange,disabled=false}:{value:PaymentAllocation[];onChange:(value:PaymentAllocation[])=>void;disabled?:boolean}){
 const update=(index:number,key:keyof PaymentAllocation,next:string)=>onChange(value.map((line,i)=>i===index?{...line,[key]:next}:line));
 return <fieldset disabled={disabled} style={{border:'1px solid #35516a',borderRadius:8,padding:8,minWidth:0}}><legend>Payment breakdown (MMK)</legend>
 {value.map((line,index)=><div key={index} style={{display:'grid',gap:6,marginBottom:10}}>
 <label>Payment type {index+1}<select name={`payment_method_${index}`} value={line.method} onChange={e=>update(index,'method',e.target.value)} style={field}>{codPaymentTypes.map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></label>
 <label>Amount {index+1}<input name={`payment_amount_${index}`} type="number" min="0.01" step="0.01" value={line.amount} onChange={e=>update(index,'amount',e.target.value)} style={field}/></label>
 <label>{line.method==='CASH'?'Reference (optional)':'Payment reference (required)'}<input name={`payment_reference_${index}`} value={line.reference} onChange={e=>update(index,'reference',e.target.value)} style={field}/></label>
 <button type="button" onClick={()=>onChange(value.filter((_,i)=>i!==index))}>Remove payment {index+1}</button></div>)}
 <button type="button" disabled={value.length>=20} onClick={()=>onChange([...value,{method:'CASH',amount:'',reference:''}])}>Add payment</button>
 <small style={{display:'block',marginTop:6}}>Cash and digital amounts must add up to the collected amount. Leave the breakdown empty for zero collection.</small>
 </fieldset>;
}
