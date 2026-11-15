import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {Building2, RefreshCw, ShieldAlert, ShieldCheck} from 'lucide-react';
import {useAuth} from '@/contexts/AuthContext';
import {normalizeRole} from '@/lib/portalRegistry';
import {canRoleOpenPath} from '@/lib/accessControl';
import {supabase} from '@/integrations/supabase/client';

type Workspace={title:string;summary:string;paths:{label:string;path:string}[]};
const WORKSPACES:Workspace[]=[
 {title:'Branch Manager / မြို့နယ်ရုံးတာဝန်ခံ',summary:'Local control, workforce, exceptions and approvals. Requests do not override HQ financial authority.',paths:[{label:'Branch Office',path:'/branch-office'},{label:'Branch workforce',path:'/branch-team/accounts'},{label:'Supervisor pickup',path:'/supervisor-pickup'},{label:'Supervisor review',path:'/supervisor-wayplan'},{label:'Warehouse custody',path:'/warehouse'},{label:'Branch Finance submissions',path:'/branch-team/finance'}]},
 {title:'Operations Supervisor / လုပ်ငန်းကြီးကြပ်ရေး',summary:'Assign pickup teams, review routes and verify dispatch readiness.',paths:[{label:'Pickup assignment',path:'/supervisor-pickup'},{label:'Wayplan review',path:'/supervisor-wayplan'},{label:'Dispatch',path:'/dispatch-command'},{label:'Delivery exceptions',path:'/exceptions'}]},
 {title:'Warehouse / ဂိုဒေါင်',summary:'Scan Way IDs, acknowledge custody, prepare outbound and record returns.',paths:[{label:'Warehouse',path:'/warehouse'},{label:'Warehouse operations',path:'/warehouse-operations'},{label:'Pending parcels',path:'/warehouse-pending'},{label:'RTO report',path:'/rto-report'}]},
 {title:'Data Entry / စာရင်းသွင်း',summary:'Register canonical Way IDs, verify recipient, township, COD and print authorized waybills.',paths:[{label:'Parcel Data Entry V2',path:'/data-entry'},{label:'Pickup form',path:'/pickup-form'},{label:'Waybill Studio',path:'/waybill-studio'}]},
 {title:'Customer Service / ဝန်ဆောင်မှု',summary:'Resolve complaints, customer delivery changes and third-party confirmations with evidence.',paths:[{label:'CS Command',path:'/cs-command'},{label:'CS Portal',path:'/cs-portal'},{label:'Third-party Confirmation',path:'/cs-third-party'},{label:'RTO report',path:'/rto-report'}]},
 {title:'Branch Finance / ဘဏ္ဍာရေး',summary:'Count and submit branch cash, monitor COD differences; settlement approval remains separate.',paths:[{label:'Branch Finance',path:'/branch-team/finance'},{label:'Finance Portal',path:'/finance'},{label:'COD Settlement',path:'/cod-settlement'}]},
 {title:'Field Team / Rider, Driver, Helper',summary:'Use assigned mobile jobs for pickup, delivery, proof and return; no branch-wide financial authority.',paths:[{label:'Field Mobile Portal',path:'/rider-app'}]},
 {title:'HQ / Regional oversight',summary:'Review cross-branch exceptions, staffing and financial submissions under existing central controls.',paths:[{label:'Branch Admin',path:'/branch-admin'},{label:'Finance Portal',path:'/finance'},{label:'Audit Logs',path:'/audit-logs'}]}
];
const card='rounded-2xl border border-[#31516c] bg-[#0b2236] p-5';
const allowed=['branch-manager','branch-office','branch-admin','branch-staff','superadmin','super-admin','app-owner','sys','admin','management','director','operation-manager','operations','operations-admin','supervisor','dispatch','wayplan-manager','warehouse','warehouse-staff','sorter','data-entry','encoder','customer-service','cs','support','finance','finance-user','accountant','rider','driver','helper'];
export default function TownshipBranchWorkbenchPage(){
 const {profile}=useAuth();
 const role=normalizeRole(profile?.role);
 const privileged=['superadmin','super-admin','app-owner','sys','admin'].includes(role);
 const branch=String(profile?.branch_code||'').trim().toUpperCase();
 const [snapshot,setSnapshot]=useState<any>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 useEffect(()=>{
  let active=true;
  if(!branch||!['branch-manager','branch-office','branch-admin','branch-staff'].includes(role))return;
  setLoading(true);
  void (async()=>{
   const {data,error:rpcError}=await (supabase as any).rpc('be_branch_office_snapshot',{p_branch_code:branch,p_limit:100});
   if(!active)return;
   if(rpcError||data?.ok===false){setError(rpcError?.message||data?.error||'Branch snapshot unavailable');setSnapshot(null);}
   else {setSnapshot(data);setError('');}
   setLoading(false);
  })();
  return()=>{active=false};
 },[branch,role]);
 if(!allowed.includes(role))return <section role="alert" className={card}>This workspace is unavailable for your assigned role.</section>;
 const visible=WORKSPACES.map(w=>({...w,paths:w.paths.filter(p=>canRoleOpenPath(profile?.role,p.path))})).filter(w=>w.paths.length>0);
 return <main className="space-y-5 text-[#eef8ff]">
  <header className={card}>
   <div className="flex flex-wrap justify-between gap-3">
    <div><div className="text-xs font-bold uppercase tracking-widest text-[#f6b84b]">Britium Express · Township Branch Workbench</div>
     <h1 className="mt-2 text-3xl font-black">Township branch operations / မြို့နယ်ရုံးလုပ်ငန်းများ</h1>
     <p className="mt-2 text-sm text-[#9cc2d9]">Role: {role} · Assigned branch: {branch||'Unassigned'} · One canonical Way ID across pickup, custody, dispatch, delivery, RTO and Finance.</p></div>
    <Link to="/branch-office" className="self-start rounded-xl border border-[#365674] px-4 py-3 font-semibold">Regional Branch Office</Link>
   </div>
  </header>
  <section role="note" className="flex gap-3 rounded-xl border border-amber-500/60 bg-amber-950/20 p-4 text-sm text-amber-100">
   <ShieldAlert size={22} className="shrink-0"/>
   <div><strong>Township activation gate:</strong> This page reuses existing role-authorized workspaces. It does not create township-level RLS, a township staff assignment, branch-specific COD authority or new financial permissions. A township may operate only after HQ verifies the account territory, receiving custody and applicable backend access.</div>
  </section>
  {!branch&&!privileged&&<div role="alert" className="rounded-xl border border-rose-400 p-4">Your account has no assigned branch. Contact HQ Admin before processing township parcels.</div>}
  {snapshot&&<section className="grid gap-3 sm:grid-cols-3">
   {([['Branch shipments',snapshot?.summary?.shipments],['Pending shipments',snapshot?.summary?.pending_shipments],['Assigned staff',snapshot?.summary?.staff]] as const).map(([name,count])=><div key={name} className={card}><div className="text-xs text-[#9cc2d9]">{name}</div><div className="mt-2 text-2xl font-bold">{count==null?'Not reported':Number(count).toLocaleString()}</div></div>)}
  </section>}
  {loading&&<p role="status">Loading authorized branch summary…</p>}
  {error&&<p role="alert" className="rounded-xl border border-rose-400/70 p-3">Branch summary unavailable: {error}</p>}
  <section className="grid gap-4 lg:grid-cols-2">
   {visible.map(w=><article key={w.title} className={card}>
    <h2 className="flex items-start gap-2 text-lg font-bold"><Building2 size={19} className="mt-1 shrink-0 text-[#f6b84b]"/>{w.title}</h2>
    <p className="mt-2 text-sm text-[#9cc2d9]">{w.summary}</p>
    <div className="mt-4 flex flex-wrap gap-2">{w.paths.map(p=><Link key={p.path} to={p.path} className="rounded-lg border border-[#365674] bg-[#061524] px-3 py-2 text-sm font-semibold hover:border-[#f6b84b]">{p.label}</Link>)}</div>
   </article>)}
  </section>
  <footer className="flex items-start gap-2 text-sm text-[#9cc2d9]"><ShieldCheck size={18} className="shrink-0"/>Visible links are filtered by portal role. Supabase RPC/RLS and custody checks—not this navigation—must authorize every write, approval and financial action.</footer>
 </main>;
}
