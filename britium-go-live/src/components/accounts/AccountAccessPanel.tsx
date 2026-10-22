import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type Props = {workforceType?:'rider'|'driver'|'helper';workforceCode?:string;branchCode?:string;merchantCode?:string;employeeCode?:string;name?:string;email?:string;phone?:string;defaultOpen?:boolean};
type Account = {auth_user_id:string;full_name:string;email:string;phone_number?:string;role_code?:string;role?:string;status:string;active?:boolean;is_active?:boolean;worker_code?:string};
const administrators=new Set(['admin','superadmin','super-admin','app-owner','sys']);
const roles=['rider','driver','helper','customer-service','data-entry','warehouse','dispatch','supervisor','finance','marketing','business-development','branch-manager'];
const inputClass='w-full rounded-lg border border-[#1a3a5c] bg-[#061524] p-2 text-sm';
const buttonClass='rounded-lg border border-[#1a3a5c] px-3 py-2 text-xs font-bold disabled:opacity-50';

export default function AccountAccessPanel({merchantCode,employeeCode,workforceType,workforceCode,branchCode='',name='',email='',phone='',defaultOpen=false}:Props){
 const {role}=useAuth();const allowed=administrators.has(String(role||'').toLowerCase().replace(/[ _]+/g,'-'));
 const [open,setOpen]=useState(defaultOpen),[rows,setRows]=useState<Account[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[editing,setEditing]=useState<Account|null>(null),[creating,setCreating]=useState(false);
 const [form,setForm]=useState({full_name:name,email,phone,password:'',role:merchantCode?'merchant':workforceType||'rider',branch_code:branchCode,link_type:merchantCode?'merchant':'employee',link_code:merchantCode||employeeCode||''});
 const pending=useRef(false),generation=useRef(0);
 const scope=workforceCode&&workforceType?{workforce_type:workforceType,workforce_code:workforceCode}:merchantCode?{merchant_code:merchantCode}:employeeCode?{employee_code:employeeCode}:{};
 async function request(body:Record<string,unknown>){
  const {data,error}=await supabase.functions.invoke('be-admin-accounts',{body});
  if(error){let detail='';try{const context=(error as any).context;if(context?.json)detail=(await context.json()).error||'';}catch{}throw new Error(detail||error.message||'Account service unavailable.');}
  if(!data?.success)throw new Error(data?.error||'Account action failed.');return data;
 }
 async function load(){
  if(pending.current)return;pending.current=true;setBusy(true);setMessage('');const current=++generation.current;
  try{const data=await request({action:'list_accounts',...scope});if(current===generation.current)setRows(data.rows||[]);}
  catch(error:any){if(current===generation.current)setMessage(error?.message||'Unable to load login access.');}
  finally{pending.current=false;if(current===generation.current)setBusy(false);}
 }
 useEffect(()=>{if(open&&allowed)void load();return()=>{generation.current++;};},[open,allowed,merchantCode,employeeCode,workforceType,workforceCode]);
 async function mutate(body:Record<string,unknown>){
  if(pending.current)return;pending.current=true;setBusy(true);setMessage('');
  try{const data=await request(body);setMessage(data.message||'Login access updated.');setEditing(null);setCreating(false);setForm(f=>({...f,password:''}));const refreshed=await request({action:'list_accounts',...scope});setRows(refreshed.rows||[]);}
  catch(error:any){setMessage(error?.message||'Login action failed. Please retry.');}
  finally{pending.current=false;setBusy(false);}
 }
 function createLogin(){
  const code=form.link_code.trim();const linked=workforceCode&&workforceType?{workforce_type:workforceType,workforce_code:workforceCode}:merchantCode?{merchant_code:merchantCode}:employeeCode?{employee_code:employeeCode}:form.link_type==='merchant'?{merchant_code:code}:{employee_code:code};
  void mutate({action:'create_account',...linked,full_name:form.full_name.trim(),email:form.email.trim(),phone:form.phone,password:form.password,role:('merchant_code'in linked)?'merchant':workforceType||form.role,branch_code:form.branch_code.trim()});
 }
 if(!allowed)return defaultOpen?<p className="rounded-xl border border-[#1a3a5c] p-4 text-sm text-[#9cc2d9]">Login access is managed by an authorized administrator. Merchant and employee master records are managed from their respective screens.</p>:null;
 return <section className="mt-3 rounded-xl border border-[#1a3a5c] bg-[#0b2236] p-3 text-[#eef8ff]">
  <button type="button" className={buttonClass} onClick={()=>setOpen(v=>!v)} aria-expanded={open}>{open?'Hide login access':'Login access'}</button>
  {open&&<div className="mt-3 space-y-3">
   <p className="text-xs text-[#9cc2d9]">Manage the linked sign-in account. Removing login access keeps merchant, employee and operational history.</p>
   <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className={buttonClass} onClick={()=>void load()}>Refresh logins</button><button type="button" disabled={busy||Boolean((merchantCode||employeeCode||workforceCode)&&rows.length)} className={buttonClass} onClick={()=>{setCreating(true);setEditing(null);setForm(f=>({...f,full_name:name,email,phone,password:''}));}}>Create login</button></div>
   {message&&<p role="status" className="rounded-lg border border-[#f6b84b]/40 p-3 text-sm text-[#f6b84b]">{message}</p>}
   {busy&&<p className="text-xs" aria-live="polite">Updating login access…</p>}
   {!busy&&!rows.length&&<p className="text-xs text-[#9cc2d9]">No linked login accounts found.</p>}
   {rows.map(account=><div key={account.auth_user_id} className="rounded-lg border border-[#1a3a5c] p-3">
    <div className="text-sm font-bold">{account.full_name} · {account.email}</div><div className="mt-1 text-xs text-[#9cc2d9]">{account.role_code||account.role} · {account.status} {account.worker_code&&`· ${account.worker_code}`}</div>
    <div className="mt-2 flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={busy} onClick={()=>{setEditing(account);setCreating(false);setForm(f=>({...f,full_name:account.full_name||'',phone:account.phone_number||'',password:''}));}}>Edit login</button>
     <button type="button" className={buttonClass} disabled={busy} onClick={()=>{setEditing(account);setCreating(false);setForm(f=>({...f,full_name:account.full_name||'',phone:account.phone_number||'',password:''}));}}>Reset password</button>
     <button type="button" className={buttonClass} disabled={busy} onClick={()=>{const active=account.active!==false&&account.is_active!==false&&['active','enabled'].includes(String(account.status).toLowerCase());if(window.confirm(`${active?'Block':'Restore'} login access for ${account.email}?`))void mutate({action:active?'block_user':'unblock_user',user_id:account.auth_user_id});}}>{account.active!==false&&account.is_active!==false&&['active','enabled'].includes(String(account.status).toLowerCase())?'Block login':'Restore login'}</button>
     <button type="button" className={buttonClass+' text-rose-300'} disabled={busy} onClick={()=>{if(window.confirm(`Remove login access for ${account.email}? Their operational history is retained.`))void mutate({action:'delete_account',user_id:account.auth_user_id});}}>Delete login</button>
    </div>
   </div>)}
   {(creating||editing)&&<div className="space-y-3 rounded-xl border border-[#4ea8de]/50 p-3">
    <h3 className="font-bold">{creating?'Create linked login':'Edit login access'}</h3>
    <div className="grid gap-3 md:grid-cols-2">
     {creating&&!merchantCode&&!employeeCode&&!workforceCode&&<><label className="text-xs">Link type<select aria-label="Login link type" className={inputClass} disabled={busy} value={form.link_type} onChange={e=>setForm({...form,link_type:e.target.value})}><option value="employee">Employee</option><option value="merchant">Merchant</option></select></label><label className="text-xs">Saved master code<input aria-label="Saved master code" className={inputClass} disabled={busy} value={form.link_code} onChange={e=>setForm({...form,link_code:e.target.value})}/></label></>}
     <label className="text-xs">Name<input aria-label="Login name" className={inputClass} disabled={busy} value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/></label>
     <label className="text-xs">Phone<input aria-label="Login phone" className={inputClass} disabled={busy} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
     {creating&&<label className="text-xs">Email<input aria-label="Login email" type="email" className={inputClass} disabled={busy} value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>}
     {(employeeCode||(!merchantCode&&form.link_type==='employee'&&!workforceCode))&&creating&&<><label className="text-xs">Role<select aria-label="Login role" className={inputClass} disabled={busy} value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>{roles.map(v=><option key={v}>{v}</option>)}</select></label><label className="text-xs">Branch code<input aria-label="Login branch" className={inputClass} disabled={busy} value={form.branch_code} onChange={e=>setForm({...form,branch_code:e.target.value})}/></label></>}
     <label className="text-xs">{creating?'Temporary password':'New temporary password (for reset)'}<input aria-label="Temporary password" type="password" autoComplete="new-password" className={inputClass} disabled={busy} value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/><span className="text-[#9cc2d9]">At least 12 characters. Share securely with the account holder.</span></label>
     {creating&&workforceCode&&<label className="text-xs">Branch code<input aria-label="Login branch" className={inputClass} disabled={busy} value={form.branch_code} onChange={e=>setForm({...form,branch_code:e.target.value})}/><span className="text-[#9cc2d9]">Login role: {workforceType}</span></label>}
    </div>
    <div className="flex flex-wrap gap-2">{creating?<button type="button" className={buttonClass} disabled={busy||!form.full_name.trim()||!form.email.trim()||form.password.length<12||(!merchantCode&&!employeeCode&&!workforceCode&&!form.link_code.trim())} onClick={createLogin}>Create linked login</button>:<><button type="button" className={buttonClass} disabled={busy||!form.full_name.trim()} onClick={()=>void mutate({action:'update_account',user_id:editing!.auth_user_id,full_name:form.full_name.trim(),phone:form.phone})}>Save login</button><button type="button" className={buttonClass} disabled={busy||form.password.length<12} onClick={()=>void mutate({action:'reset_password',user_id:editing!.auth_user_id,password:form.password})}>Set temporary password</button></>}
     <button type="button" className={buttonClass} disabled={busy} onClick={()=>{setCreating(false);setEditing(null);setForm(f=>({...f,password:''}));}}>Cancel</button></div>
   </div>}
  </div>}
 </section>;
}
