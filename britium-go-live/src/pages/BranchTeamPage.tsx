import {useCallback, useEffect, useMemo, useState, type FormEvent} from 'react';
import {Link, useLocation} from 'react-router-dom';
import {Bike, Car, Users, Wallet, UserCog, RefreshCw, ShieldCheck, Truck, Search} from 'lucide-react';
import {supabase} from '@/integrations/supabase/client';
import {useAuth} from '@/contexts/AuthContext';
import {normalizeRole} from '@/lib/portalRegistry';
import BranchControlWorkbench from '@/components/BranchControlWorkbench';
import BranchWorkforcePanel from '@/components/BranchWorkforcePanel';

type Account={
  email:string; full_name:string; role_code:string; status:string; is_active:boolean;
  mobile_account_linked:boolean; territory_assigned:boolean;
};
type RequestRow={
  request_no:string; email:string; full_name:string|null; role_code:string;
  action:string; status:string; reason:string|null; requested_at:string;
};
type TeamResponse={
  ok:boolean; branch_code:string; account_count:number; accounts:Account[];
  requests:RequestRow[]; account_changes_require_hq_approval:boolean;
};
const tabs=[
  {id:'riders',label:'Riders',icon:Bike},
  {id:'drivers',label:'Drivers',icon:Car},
  {id:'helpers',label:'Helpers',icon:Users},
  {id:'accounts',label:'Branch Accounts',icon:UserCog},
  {id:'finance',label:'Branch Finance',icon:Wallet},
] as const;
type Tab=typeof tabs[number]['id'];
const card='rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5';
const field='h-11 w-full rounded-xl border border-[#365674] bg-[#061524] px-3 text-[#eef8ff]';
const ROLE_OPTIONS=['rider','driver','helper','supervisor','warehouse','customer_service','data_entry','finance','marketing','branch_staff'];
const accountMatches=(a:Account,tab:Tab)=>{
  const role=(a.role_code||'').replaceAll('-','_').toLowerCase();
  return tab==='accounts'||(tab==='riders'&&role==='rider')
    ||(tab==='drivers'&&role==='driver')||(tab==='helpers'&&role==='helper');
};
const pretty=(s:string)=>s.replaceAll('_',' ').replaceAll('-',' ');

export default function BranchTeamPage(){
  const {profile}=useAuth();
  const location=useLocation();
  const normalized=normalizeRole(profile?.role);
  const elevated=['superadmin','super-admin','app-owner','sys'].includes(normalized);
  const manager=['branch-manager','branch-admin'].includes(normalized);
  const fixedBranch=elevated?'':String(profile?.branch_code||'').trim().toUpperCase();
  const [selectedBranch,setSelectedBranch]=useState('MDY');
  const branch=fixedBranch||selectedBranch;
  const segment=location.pathname.split('/').filter(Boolean).pop()||'accounts';
  const tab:Tab=(tabs.find(t=>t.id===segment)?.id||'accounts') as Tab;
  const [directory,setDirectory]=useState<TeamResponse|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [query,setQuery]=useState('');
  const [requesting,setRequesting]=useState(false);
  const [request,setRequest]=useState({
    action:'CREATE_ACCOUNT',email:'',full_name:'',role_code:'rider',reason:''
  });

  const refresh=useCallback(async()=>{
    if(!branch||!(manager||elevated))return;
    setLoading(true);setError('');
    try{
      const {data,error:rpcError}=await (supabase as any).rpc('be_branch_team_directory_v1',{p_branch:branch});
      if(rpcError)throw rpcError;
      if(!data?.ok||data?.branch_code!==branch)throw new Error('Branch scope could not be verified.');
      setDirectory(data as TeamResponse);
    }catch(e:any){setDirectory(null);setError(e?.message||'Unable to load branch team.');}
    finally{setLoading(false);}
  },[branch,manager,elevated]);

  useEffect(()=>{setDirectory(null);setNotice('');void refresh();},[refresh]);
  const accounts=Array.isArray(directory?.accounts)?directory.accounts:[];
  const visible=useMemo(()=>accounts.filter(a=>accountMatches(a,tab)).filter(a=>
    !query.trim()||[a.email,a.full_name,a.role_code,a.status].some(v=>String(v||'').toLowerCase().includes(query.trim().toLowerCase()))
  ),[accounts,tab,query]);
  const active=visible.filter(a=>a.is_active).length;
  const linked=visible.filter(a=>a.mobile_account_linked).length;

  async function submitRequest(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!manager||requesting)return;
    setRequesting(true);setError('');setNotice('');
    try{
      const {data,error:rpcError}=await (supabase as any).rpc('be_branch_account_request_v1',{
        p_payload:{...request,branch_code:branch}
      });
      if(rpcError)throw rpcError;
      if(!data?.ok)throw new Error('Head-office request was not recorded.');
      setNotice('Request '+data.request_no+' submitted for head-office review. No account or password was changed.');
      setRequest({action:'CREATE_ACCOUNT',email:'',full_name:'',role_code:'rider',reason:''});
      await refresh();
    }catch(e:any){setError(e?.message||'Unable to submit request.');}
    finally{setRequesting(false);}
  }

  if(!(manager||elevated))return <section className={card} role="alert">Branch manager authority is required for this screen.</section>;
  return <main className="space-y-5 text-[#eef8ff]">
    <header className={card}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.17em] text-[#f6b84b]">Regional operations / {branch}</p>
          <h1 className="mt-2 text-2xl font-black">Branch team & accounts</h1>
          <p className="mt-2 max-w-3xl text-sm text-[#9cc2d9]">
            Branch-scoped rider, driver, helper, employee-account and finance workspaces.
            Central account creation, credentials and payment approval remain with head office.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {elevated&&<select aria-label="Branch" value={selectedBranch}
            onChange={e=>setSelectedBranch(e.target.value)} className={field}>
            <option value="MDY">Mandalay (MDY)</option>
            <option value="YGN">Yangon (YGN)</option>
            <option value="NPT">Naypyitaw (NPT)</option>
          </select>}
          <button onClick={()=>void refresh()} disabled={loading} className="flex h-11 items-center gap-2 rounded-xl bg-[#f6b84b] px-4 font-bold text-[#061524] disabled:opacity-50">
            <RefreshCw size={16} className={loading?'animate-spin':''}/> Refresh
          </button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link to="/branch-office" className="rounded-lg border border-[#365674] px-3 py-2">Branch Office</Link>
        {(normalized==='branch-manager'||elevated)&&<>
          <Link to="/wayplan-command" className="rounded-lg border border-[#365674] px-3 py-2">Wayplan Command</Link>
          <Link to="/supervisor-wayplan" className="rounded-lg border border-[#365674] px-3 py-2">Supervisor Review</Link>
          <Link to="/warehouse" className="rounded-lg border border-[#365674] px-3 py-2">Warehouse</Link>
        </>}
      </div>
    </header>
    {error&&<div role="alert" className="rounded-xl border border-rose-400/50 bg-rose-950/40 p-3 text-sm">{error}</div>}
    {notice&&<div role="status" className="rounded-xl border border-emerald-400/50 bg-emerald-950/40 p-3 text-sm">{notice}</div>}
    <nav aria-label="Branch team sections" className="flex flex-wrap gap-2">
      {tabs.map(t=>{const Icon=t.icon;return <Link key={t.id} to={'/branch-team/'+t.id}
        aria-current={tab===t.id?'page':undefined}
        className={tab===t.id?'flex items-center gap-2 rounded-xl bg-[#f6b84b] px-4 py-3 text-sm font-bold text-[#061524]':'flex items-center gap-2 rounded-xl border border-[#365674] bg-[#0b2236] px-4 py-3 text-sm font-semibold'}>
        <Icon size={16}/>{t.label}</Link>})}
    </nav>
    {tab==='finance'?<>
      <section className={card}>
        <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldCheck size={18}/> Branch financial coordination</h2>
        <p className="mt-2 text-sm text-[#9cc2d9]">Submit daily closing cash, expenses, assets and contract documentation for head-office review. This is not direct access to merchant settlement, general ledger posting or payment approval.</p>
      </section>
      <BranchControlWorkbench key={branch} branch={branch} initialTab="Administration & Finance"/>
    </>:<>
      <section className="grid gap-3 sm:grid-cols-3">
        {[['Accounts shown',visible.length],['Active',active],['Linked mobile accounts',linked]].map(([label,value])=>
          <div key={String(label)} className={card}><div className="text-xs font-semibold uppercase text-[#9cc2d9]">{label}</div><div className="mt-2 text-2xl font-black">{value}</div></div>)}
      </section>
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-bold">{tabs.find(t=>t.id===tab)?.label} — {branch}</h2>
            <p className="mt-1 text-xs text-[#9cc2d9]">Server-enforced branch scope. Login records are displayed for operations review only.</p></div>
          <label className="relative"><Search size={16} className="absolute left-3 top-3.5 text-[#9cc2d9]"/>
            <input aria-label="Search team accounts" value={query} onChange={e=>setQuery(e.target.value)}
              placeholder="Search name, email or role" className={field+' min-w-[230px] pl-9'}/></label>
        </div>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[#061524] text-xs uppercase text-[#9cc2d9]"><tr>
            <th className="p-3">Name / email</th><th className="p-3">Role</th><th className="p-3">Account</th><th className="p-3">MDY scope</th><th className="p-3">Mobile login</th>
          </tr></thead>
          <tbody>{visible.map(a=><tr key={a.email} className="border-t border-[#365674]/50">
            <td className="p-3"><div className="font-semibold">{a.full_name||'-'}</div><div className="text-xs text-[#9cc2d9]">{a.email}</div></td>
            <td className="p-3 capitalize">{pretty(a.role_code)}</td>
            <td className="p-3">{a.is_active?'Active':a.status||'Inactive'}</td>
            <td className="p-3">{a.territory_assigned?'Assigned':'Review assignment'}</td>
            <td className="p-3">{a.mobile_account_linked?'Linked':'Not linked'}</td>
          </tr>)}</tbody>
        </table>{!loading&&!visible.length&&<p className="p-8 text-center text-[#9cc2d9]">No accounts found for this branch and role.</p>}
        </div>
        {loading&&<p className="mt-3 text-sm text-[#9cc2d9]">Refreshing directory…</p>}
      </section>
      {tab!=='accounts'&&<details className={card}>
        <summary className="cursor-pointer font-bold">Live crew roster, assignment and commission detail</summary>
        <div className="mt-4"><BranchWorkforcePanel branch={branch}/></div>
      </details>}
      {tab==='accounts'&&<section className="grid gap-4 xl:grid-cols-2">
        <div className={card}>
          <h2 className="text-lg font-bold">Request an account change</h2>
          <p className="mt-1 text-sm text-[#9cc2d9]">Only head office can approve and perform login changes. No password or role is changed when you submit.</p>
          {manager?<form onSubmit={e=>void submitRequest(e)} className="mt-4 space-y-3">
            <label className="block text-sm">Action<select className={field+' mt-1'} value={request.action}
              onChange={e=>setRequest({...request,action:e.target.value})}>
              <option value="CREATE_ACCOUNT">Request new account</option><option value="RESET_LOGIN">Request password reset</option>
              <option value="DISABLE_ACCOUNT">Request account suspension</option>
            </select></label>
            <label className="block text-sm">Staff email<input className={field+' mt-1'} type="email" required
              value={request.email} onChange={e=>setRequest({...request,email:e.target.value})}/></label>
            {request.action==='CREATE_ACCOUNT'&&<>
              <label className="block text-sm">Staff name<input className={field+' mt-1'} required value={request.full_name}
                onChange={e=>setRequest({...request,full_name:e.target.value})}/></label>
              <label className="block text-sm">Proposed role<select className={field+' mt-1'} value={request.role_code}
                onChange={e=>setRequest({...request,role_code:e.target.value})}>
                {ROLE_OPTIONS.map(role=><option value={role} key={role}>{pretty(role)}</option>)}
              </select></label>
            </>}
            <label className="block text-sm">Business reason<textarea className="mt-1 min-h-24 w-full rounded-xl border border-[#365674] bg-[#061524] p-3"
              required minLength={8} value={request.reason} onChange={e=>setRequest({...request,reason:e.target.value})}/></label>
            <button type="submit" disabled={requesting} className="rounded-xl bg-[#f6b84b] px-4 py-3 font-bold text-[#061524] disabled:opacity-50">
              Submit to head office</button>
          </form>:<p className="mt-3 text-sm text-[#9cc2d9]">Head-office users manage credentials in the central Accounts screen.</p>}
        </div>
        <div className={card}>
          <h2 className="text-lg font-bold">Branch account requests</h2>
          <p className="mt-1 text-sm text-[#9cc2d9]">Requests pending head-office provisioning or review.</p>
          <div className="mt-4 max-h-[500px] space-y-3 overflow-auto">
            {(directory?.requests||[]).map(r=><article key={r.request_no}
              className="rounded-xl border border-[#365674] bg-[#061524] p-3 text-sm">
              <div className="font-semibold">{r.request_no} · {pretty(r.action||'CREATE_ACCOUNT')}</div>
              <div className="mt-1 break-all text-[#9cc2d9]">{r.email} · {pretty(r.role_code)}</div>
              <div className="mt-1">{r.status}</div>
            </article>)}
            {!directory?.requests?.length&&<p className="text-sm text-[#9cc2d9]">No account requests recorded.</p>}
          </div>
        </div>
      </section>}
    </>}
    <footer className="flex flex-wrap gap-2 text-xs text-[#9cc2d9]">
      <Truck size={15}/> Regional operations only. Pickup custody, route readiness and finance settlement follow their existing approvals.
    </footer>
  </main>;
}
