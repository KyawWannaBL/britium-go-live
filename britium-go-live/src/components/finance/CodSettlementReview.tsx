import React, {useEffect, useRef, useState} from 'react';
import {supabase} from '@/integrations/supabase/client';

export const codPaymentTypes=[['CASH','Cash'],['KBZ_PAY','KBZ Pay'],['WAVE_PAY','Wave Pay'],['AYA_PAY','AYA Pay'],['CB_PAY','CB Pay'],['BANK_TRANSFER','Bank transfer'],['MOBILE_WALLET','Mobile wallet'],['QR','QR']];
export function codPaymentTypeLabel(value:unknown){
 const code=String(value||'').trim().toUpperCase();
 return code ? codPaymentTypes.find(([key])=>key===code)?.[1]||String(value) : 'Not recorded';
}
type Props={row:any;canReview:boolean;onChanged:()=>Promise<unknown>};
const field:React.CSSProperties={width:'100%',minHeight:40,padding:8,color:'#eef8ff',background:'#061524',border:'1px solid #35516a',borderRadius:6};
function operationId(){
 if(crypto.randomUUID)return crypto.randomUUID();
 const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
 const h=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export default function CodSettlementReview({row,canReview,onChanged}:Props){
 const [current,setCurrent]=useState(row),[expanded,setExpanded]=useState(false),[mode,setMode]=useState('CONFIRM');
 const [actual,setActual]=useState(''),[reference,setReference]=useState(''),[method,setMethod]=useState('CASH');
 const [reason,setReason]=useState(''),[adjustment,setAdjustment]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const inFlight=useRef(false),generation=useRef(0),request=useRef<{fingerprint:string;payload:any}|null>(null);
 useEffect(()=>{generation.current++;setCurrent(row);setExpanded(false);setActual('');setReference('');setMethod('CASH');setReason('');setAdjustment('');setMessage('');setBusy(false);inFlight.current=false;request.current=null;},[row.id,row.updated_at]);
 const locked=current?.settlement_status==='SETTLED'||!!current?.settled_at;
 async function act(action:string){
  if(!canReview||locked||inFlight.current)return;
  if(!expanded||mode!==action){setExpanded(true);setMode(action);setMessage('');return;}
  if(action==='CONFIRM'&&actual.trim()===''){setMessage('Enter the actual amount received.');return;}
  if(action==='CONFIRM'&&!reference.trim()){setMessage('Enter the collection reference.');return;}
  if(action!=='CONFIRM'&&!reason.trim()){setMessage('A reason is required.');return;}
  if(action==='ADJUST'&&(!/^-?[0-9]+(?:\.[0-9]{1,2})?$/.test(adjustment)||Number(adjustment)===0)){setMessage('Enter a non-zero adjustment: positive to add, negative to deduct.');return;}
  if(action==='CONFIRM'&&!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(actual)){setMessage('Enter a valid non-negative collection amount.');return;}
  const body={action,row_id:current.id,expected_updated_at:current.updated_at,...(action==='CONFIRM'?{actual_collected:actual,payment_method:method,reference:reference.trim()}:{reason:reason.trim(),...(action==='ADJUST'?{adjustment_mmk:adjustment}:{})})};
  const fingerprint=JSON.stringify(body);
  if(request.current?.fingerprint!==fingerprint)request.current={fingerprint,payload:{...body,operation_id:operationId()}};
  const version=generation.current;inFlight.current=true;setBusy(true);setMessage('');
  try{
   const {data,error}=await (supabase as any).rpc('be_finance_cod_review_action_v213',{p_payload:request.current.payload});
   if(error||!data?.ok)throw new Error(error?.message||data?.message||data?.error||'Review action failed.');
   if(version!==generation.current)return;
   setCurrent(data.row);setActual('');setReason('');setAdjustment('');request.current=null;
   const success=action==='CONFIRM'?'Settlement confirmed.':action==='REJECT'?'Settlement rejected.':'Adjustment saved.';setMessage(success);
   try{await onChanged();}catch(e:any){if(version===generation.current)setMessage(success+' Refresh failed: '+e.message);}
  }catch(e:any){if(version===generation.current)setMessage(e.message);}
  finally{if(version===generation.current){inFlight.current=false;setBusy(false);}}
 }
 const button=(label:string,action:string,color:string)=><button type="button" disabled={!canReview||locked||busy} onClick={()=>act(action)} style={{minHeight:36,padding:'7px 10px',borderRadius:6,border:`1px solid ${color}`,background:'#102b45',color,opacity:!canReview||locked||busy?0.5:1}}>{label}</button>;
 return <div style={{minWidth:260,maxWidth:420,whiteSpace:'normal'}}>
  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>{button('Confirm','CONFIRM','#34d399')}{button('Reject','REJECT','#f87171')}{button('Adjustment','ADJUST','#f6b84b')}</div>
  {expanded&&<div style={{display:'grid',gap:8,paddingTop:10}}>
   <div><strong>{current.delivery_way_id}</strong> · {current.settlement_status}</div>
   <div>Driver: {current.driver_name||current.metadata?.driver_name||'—'} {current.driver_code||current.metadata?.driver_code||''}<br/>Helper: {current.helper_name||current.metadata?.helper_name||'—'} {current.helper_code||current.metadata?.helper_code||''}</div>
   <div>Original: {Number(current.metadata?.original_expected_collection??current.cod_expected??0).toLocaleString()} MMK · Adjustment: {Number(current.metadata?.collection_adjustment_mmk??0).toLocaleString()} MMK<br/><strong>Revised: {Number(current.cod_expected??0).toLocaleString()} MMK</strong></div>
   {mode==='CONFIRM'?<>
    <label>Actual amount received (MMK)<input name="actual_collected" type="number" min="0" step="0.01" value={actual} disabled={!canReview||busy||locked} onChange={e=>setActual(e.target.value)} style={field}/></label>
    <label>Payment type<select name="payment_method" value={method} disabled={!canReview||busy||locked} onChange={e=>setMethod(e.target.value)} style={field}>{codPaymentTypes.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label>Collection reference<input name="reference" value={reference} disabled={!canReview||busy||locked} onChange={e=>setReference(e.target.value)} style={field}/></label>
    <small>Review the received amount and reference, then click Confirm again. If the amount differs, record an explained adjustment first.</small>
   </>:<>
    {mode==='ADJUST'&&<label>Adjustment (MMK)<input name="adjustment_mmk" type="number" step="0.01" value={adjustment} disabled={!canReview||busy||locked} onChange={e=>setAdjustment(e.target.value)} style={field}/></label>}
    <label>Reason<textarea name="reason" value={reason} disabled={!canReview||busy||locked} onChange={e=>setReason(e.target.value)} style={field}/></label>
    <small>{mode==='ADJUST'?'Positive adds; negative deducts. A correction reopens a rejected row for review. Click Adjustment again to save.':'Click Reject again to record the reason and reject this row.'}</small>
   </>}
   {current.metadata?.rejection_reason&&<small>Rejection history: {current.metadata.rejection_reason}</small>}
   {current.metadata?.adjustment_reason&&<small>Latest adjustment: {current.metadata.adjustment_reason}</small>}
  </div>}
  {message&&<div role="status" style={{paddingTop:8,color:'#f6b84b'}}>{message}</div>}
 </div>;
}
