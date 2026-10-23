import {useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {useAuth} from '@/contexts/AuthContext';
export default function FieldSettlementSignature({row,date,onChanged}:{row:any;date:string;onChanged:()=>Promise<void>}){
 const {role}=useAuth();
 const [name,setName]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const finance=['finance','accountant','superadmin','super_admin'].includes(String(role||'').toLowerCase());
 const maySign=finance||['rider','driver','helper'].includes(String(role||'').toLowerCase());
 const cleared=String(row.status).toUpperCase()==='CLEARED';
 async function sign(){
  if(busy||!name.trim()||!maySign||cleared)return;
  setBusy(true);setMessage('');
  try{
   const {data,error}=await (supabase as any).rpc('be_finance_field_settlement_sign_v1',{p_work_date:date,p_wayplan_id:row.wayplan_id,p_signed_name:name.trim(),p_note:'Electronic signature entered by signed-in settlement participant'});
   if(error||data?.ok!==true)throw new Error(error?.message||data?.code||'Signature was not recorded.');
   await onChanged();setMessage('Electronic signature recorded. Finance clearance remains separate.');
  }catch(error:any){setMessage(error.message);}finally{setBusy(false);}
 }
 return <div style={{minWidth:220}}>
 {maySign&&!cleared&&<><label style={{display:'block'}}>Your full name<input value={name} onChange={e=>setName(e.target.value)} disabled={busy} style={{display:'block',width:'100%',background:'#fff',color:'#172333',padding:8,borderRadius:6}}/></label><button type="button" onClick={()=>void sign()} disabled={busy||!name.trim()} style={{marginTop:8,padding:10,borderRadius:6,background:'#f6b84b',color:'#172333',fontWeight:800}}>{busy?'Recording…':finance?'Finance Sign':'Sign My Settlement'}</button><p style={{fontSize:11}}>Your signed-in account records your role and signature time. Only assigned staff can sign.</p></>}
 {cleared&&<span>Cleared — signatures locked</span>}
 {message&&<p role="status">{message}</p>}
 </div>;
}
