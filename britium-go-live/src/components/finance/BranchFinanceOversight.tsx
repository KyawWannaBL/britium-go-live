import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {useAuth} from '@/contexts/AuthContext';
import {normalizeRole} from '@/lib/portalRegistry';
import BranchControlWorkbench from '@/components/BranchControlWorkbench';

type BranchRow={branch_code:string;branch_name:string;cash_status:string;cash_report_count:number;counted_cash:number|null;pending_expenses:number;reviewed_expenses:number;funding_requests:number;pending_reviews:number};
const money=(amount:number|null)=>amount===null?'Not reported / requires review':`${Number(amount).toLocaleString()} MMK`;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Yangon',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function BranchFinanceTable({rows,onSelect}:{rows:BranchRow[];onSelect:(code:string)=>void}){
 return <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead><tr><th className="p-3">Branch</th><th>Cash report</th><th>Counted cash</th><th>Expenses awaiting review</th><th>Reviewed expenses</th><th>Funding requested</th><th>Pending reviews</th></tr></thead><tbody>{rows.map(row=><tr key={row.branch_code} className="border-t border-slate-700"><td className="p-3"><button className="font-bold text-cyan-200 underline" onClick={()=>onSelect(row.branch_code)}>{row.branch_code} · {row.branch_name}</button></td><td>{row.cash_status.replaceAll('_',' ')}{row.cash_report_count>1?` (${row.cash_report_count})`:''}</td><td>{money(row.counted_cash)}</td><td>{money(row.pending_expenses)}</td><td>{money(row.reviewed_expenses)}</td><td>{money(row.funding_requests)}</td><td>{row.pending_reviews}</td></tr>)}</tbody></table></div>;
}
export default function BranchFinanceOversight(){
 const {profile}=useAuth();const role=normalizeRole(profile?.role);
 const enterprise=['superadmin','super-admin','app-owner','sys'].includes(role);
 const allowed=enterprise||(String(profile?.branch_code||'').toUpperCase()==='YGN'&&['finance','finance-user','finance-manager','accountant'].includes(role));
 const [day,setDay]=useState(today),[data,setData]=useState<{branches:BranchRow[];as_of?:string}>({branches:[]});
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[branch,setBranch]=useState('');
 const request=useRef(0);
 const load=useCallback(async()=>{
  if(!allowed||!/^\d{4}-\d{2}-\d{2}$/.test(day))return;
  const current=++request.current;setBusy(true);setError('');
  try{const {data:next,error:e}=await (supabase as any).rpc('be_branch_finance_oversight_v1',{p_day:day});if(e)throw e;if(!next?.ok)throw Error('Branch Finance monitoring is unavailable.');if(current===request.current)setData(next);}catch(e:any){if(current===request.current){setData({branches:[]});setError(e.message||'Unable to load branch Finance monitoring.');}}finally{if(current===request.current)setBusy(false);}
 },[allowed,day]);
 useEffect(()=>{setData({branches:[]});void load();const timer=setInterval(()=>{if(!document.hidden)void load();},30000);return()=>{clearInterval(timer);request.current++;};},[load]);
 if(!allowed)return null;
 return <section className="mb-6 space-y-4 rounded-2xl border border-slate-600 bg-[#0b2236] p-5 text-slate-100">
  <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Head Office daily branch Finance monitoring</h2><p className="text-sm text-slate-300">Yangon Finance monitors every active branch. New branches appear automatically.</p></div><div className="flex gap-3"><label>Business date<input aria-label="Branch Finance business date" type="date" value={day} onChange={e=>setDay(e.target.value)} className="ml-2 rounded bg-white p-2 text-black"/></label><button disabled={busy} onClick={()=>void load()} className="rounded bg-amber-400 px-4 py-2 font-bold text-black">{busy?'Refreshing…':'Refresh branches'}</button></div></div>
  <p className="text-sm text-amber-200">Cash counts are branch reports, not verified bank/COD receipts. Reviewed expenses are document approvals, not payments. Complete COD reconciliation, cash handover and settlement in the Finance controls below.</p>
  <p className="text-sm text-slate-300">Expenses cover the selected business date. Funding requests and pending reviews include outstanding records up to that date. Missing or multiple cash reports require follow-up; pre-opening branches are identified separately.</p>
  {error&&<p role="alert" className="rounded bg-rose-950 p-3">{error}</p>}
  <BranchFinanceTable rows={data.branches} onSelect={setBranch}/>
  {!error&&!busy&&!data.branches.length&&<p>No branch monitoring data is available.</p>}
  {data.as_of&&<p className="text-xs text-slate-400">Updated {new Date(data.as_of).toLocaleString('en-GB',{timeZone:'Asia/Yangon'})} Myanmar time · refreshes every 30 seconds</p>}
  {branch&&<><div className="flex items-center justify-between"><h3 className="font-bold">{branch} · submissions and evidence</h3><button onClick={()=>setBranch('')}>Close branch details</button></div><p className="text-sm">The detail list includes all business dates, up to 500 records, with pending requests retained before reviewed documents. The daily totals above use the selected date.</p><BranchControlWorkbench key={branch} branch={branch} initialTab="Administration & Finance"/></>}
 </section>;
}
