import React from 'react';

const amount=(value:unknown)=>value===null||value===undefined||String(value).trim()===''||!Number.isFinite(Number(value))?null:Number(value);
const money=(value:unknown)=>{const number=amount(value);return number===null?'Not recorded':`${number.toLocaleString('en-US',{maximumFractionDigits:2})} MMK`;};

export default function FieldSettlementAmounts({row}:{row:any}){
 const pending=Number(row.remaining_ways||0)>0;
 const awaiting=pending&&Number(row.delivered_ways||0)===0;
 const collected=amount(row.actual_collected),cash=amount(row.cash_collected),digital=amount(row.digital_collected);
 const unclassified=collected!==null&&cash!==null&&digital!==null?Math.max(0,collected-cash-digital):null;
 const variance=amount(row.variance_amount);
 const detail:React.CSSProperties={fontSize:11,color:'#9cc2d9',marginTop:4};
 return <div aria-label="Settlement amounts" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(155px,1fr))',gap:12,minWidth:0,marginTop:10}}>
  <div><div style={detail}>Expected collection · all ways</div><strong style={{color:'#f6b84b'}}>{money(row.opening_cod_amount)}</strong></div>
  <div><div style={detail}>Due for delivered ways</div><strong>{money(row.expected_cod)}</strong></div>
  <div><div style={detail}>Recorded collection</div><strong>{money(row.actual_collected)}</strong>
   <div style={detail}>Cash {money(row.cash_collected)} · Digital {money(row.digital_collected)}{unclassified!==null&&unclassified>0?` · Unclassified ${money(unclassified)}`:''}</div>
   {awaiting&&<div style={{...detail,color:'#f6b84b'}}>Awaiting delivery — expected amounts are not collected receipts.</div>}
  </div>
  <div><div style={detail}>Collection variance</div><strong style={{color:pending||variance===null?'#f6b84b':variance===0?'#34d399':'#f87171'}}>{pending?'Pending completion':money(row.variance_amount)}</strong></div>
 </div>;
}
