import {useCallback,useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {supabase} from '@/integrations/supabase/client';
import {useAuth} from '@/contexts/AuthContext';
import {normalizeRole} from '@/lib/portalRegistry';

type Row=Record<string,any>;
const field='w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-black';
const button='rounded-lg bg-amber-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40';
const split=(v:string)=>[...new Set(v.split(/[\s,]+/).map(x=>x.trim()).filter(Boolean))];
export default function BranchControlWorkbench({branch,initialTab='Transfers'}:{branch:string;initialTab?:'Transfers'|'Administration & Finance'}){
 const {profile}=useAuth();
 const role=normalizeRole(profile?.role);
 const superadmin=['superadmin','super-admin','app-owner','sys'].includes(role);
 const manager=role==='branch-manager';
 const canReview=superadmin||['finance','finance-manager','accountant'].includes(role);
 const [data,setData]=useState<Row>({records:[],transfers:[]});
 const [error,setError]=useState(''); const [notice,setNotice]=useState(''); const [busy,setBusy]=useState(false);
 const [tab,setTab]=useState(initialTab);
 const [record,setRecord]=useState({kind:'SETUP',title:'',amount:'',reference:'',evidence:'',notes:'',business_date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Yangon',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())});
 const [transfer,setTransfer]=useState({from_branch:branch||'MDY',to_branch:branch==='YGN'?'MDY':'YGN',carrier:'',reference:'',reason:'',way_ids:''});
 const [receipt,setReceipt]=useState({id:'',ways:'',reason:''});
 const [review,setReview]=useState({id:'',decision:'APPROVED',reason:''});
 const load=useCallback(async()=>{
  const {data:next,error:e}=await (supabase as any).rpc('be_branch_control_snapshot_v1',{p_branch:branch||null});
  if(e){setError(e.message);return;} setData(next||{records:[],transfers:[]});
 },[branch]);
 useEffect(()=>{setData({records:[],transfers:[]});void load();const timer=setInterval(()=>{if(!document.hidden)void load();},30000);return()=>clearInterval(timer);},[load]);
 useEffect(()=>{setTransfer(v=>({...v,from_branch:branch||'MDY',to_branch:branch==='YGN'?'MDY':'YGN'}));},[branch]);
 async function action(p:Row){
  setBusy(true);setError('');setNotice('');
  try{const {data:r,error:e}=await (supabase as any).rpc('be_branch_control_action_v1',{p});if(e)throw e;if(!r?.ok)throw Error('Action was not saved.');
   setNotice(`Saved ${r.reference||r.title||''} · ${r.status}. No payment or accounting posting was made.`);await load();return true;
  }catch(e:any){setError(e.message||'Unable to save.');return false;}finally{setBusy(false);}
 }
 const records:Row[]=data.records||[],transfers:Row[]=data.transfers||[];
 return <section className="space-y-4 rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5 text-[#eef8ff]">
  <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-bold">Branch coordination & administrative control</h2><p className="mt-1 text-sm text-slate-300">Shared with head office · refreshes every 30 seconds · {data.as_of?new Date(data.as_of).toLocaleString('en-GB',{timeZone:'Asia/Yangon'}):'Loading'}</p></div><button className={button} onClick={()=>void load()}>Refresh branch controls</button></div>
  <p className="text-sm text-amber-200">Mandalay setup: joint operation with DK Delivery. Keep the responsible provider on each parcel. Branch takeover has no effective date yet.</p>
  {(manager||superadmin)&&<div className="flex flex-wrap gap-2"><Link className={button} to="/wayplan-command">Plan branch deliveries</Link><Link className={button} to="/supervisor-wayplan">Review, scan & dispatch</Link></div>}
  <div className="flex flex-wrap gap-2" role="tablist" aria-label="Branch controls">{['Transfers','Administration & Finance'].map(t=><button key={t} role="tab" aria-selected={tab===t} className={tab===t?button:'rounded-lg border border-slate-500 px-4 py-2'} onClick={()=>setTab(t)}>{t}</button>)}</div>
  {error&&<p role="alert" className="rounded-lg bg-rose-950 p-3">{error}</p>}{notice&&<p role="status" className="rounded-lg bg-emerald-950 p-3">{notice}</p>}
  {tab==='Transfers'?<>
   <p className="text-sm text-slate-300">Create the manifest at the sending branch. The receiving branch acknowledges the actual Way IDs received. A receipt records custody; destination warehouse readiness and local delivery wayplans remain separate steps. Expected collection is exposure, not verified cash.</p>
   {(manager||superadmin)&&<form className="grid gap-3 md:grid-cols-2" onSubmit={async e=>{e.preventDefault();if(await action({...transfer,action:'CREATE_TRANSFER',way_ids:split(transfer.way_ids)}))setTransfer(v=>({...v,way_ids:'',reference:'',reason:''}));}}>
    <label>Sending branch<select aria-label="Sending branch" className={field} value={transfer.from_branch} disabled={!superadmin} onChange={e=>setTransfer(v=>({...v,from_branch:e.target.value,to_branch:e.target.value==='MDY'?'YGN':'MDY'}))}><option>MDY</option><option>YGN</option></select></label>
    <label>Receiving branch<input className={field} readOnly value={transfer.to_branch}/></label>
    <label>Carrier / responsible team<input required className={field} value={transfer.carrier} onChange={e=>setTransfer({...transfer,carrier:e.target.value})}/></label>
    <label>Manifest / seal reference<input required className={field} value={transfer.reference} onChange={e=>setTransfer({...transfer,reference:e.target.value})}/></label>
    <label>Canonical Way IDs<textarea required className={field} value={transfer.way_ids} onChange={e=>setTransfer({...transfer,way_ids:e.target.value})}/></label>
    <label>Dispatch / handover evidence and reason<textarea required className={field} value={transfer.reason} onChange={e=>setTransfer({...transfer,reason:e.target.value})}/></label>
    <button disabled={busy} className={button}>Record transfer dispatch</button>
   </form>}
   <div className="max-h-[480px] space-y-3 overflow-auto">{transfers.map(t=><article key={t.id} className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3"><h3 className="font-bold">{t.reference} · {t.from_branch} → {t.to_branch} · {t.status}</h3><p>{t.carrier} · {t.reason}</p><ul className="my-2 text-sm">{(t.items||[]).map((i:Row)=><li key={i.delivery_way_id}>{i.delivery_way_id} · {Number(i.expected_collection).toLocaleString()} MMK expected · {i.received_at?'Received':'In transit'}</li>)}</ul>{t.status!=='RECEIVED'&&(superadmin||branch===t.to_branch)&&<button className={button} onClick={()=>setReceipt({id:t.id,ways:'',reason:''})}>Acknowledge received parcels</button>}</article>)}{!transfers.length&&<p>No interbranch manifests recorded.</p>}</div>
   {receipt.id&&<form className="grid gap-2 rounded-xl border border-amber-500 p-3" onSubmit={async e=>{e.preventDefault();if(await action({action:'RECEIVE_TRANSFER',id:receipt.id,received_way_ids:split(receipt.ways),reason:receipt.reason}))setReceipt({id:'',ways:'',reason:''});}}><h3>Receiving acknowledgement</h3><label>Only Way IDs physically received<textarea required className={field} value={receipt.ways} onChange={e=>setReceipt({...receipt,ways:e.target.value})}/></label><label>Receipt evidence / shortage or damage notes<textarea required className={field} value={receipt.reason} onChange={e=>setReceipt({...receipt,reason:e.target.value})}/></label><button disabled={busy} className={button}>Confirm receipt</button><button type="button" onClick={()=>setReceipt({id:'',ways:'',reason:''})}>Cancel receipt</button></form>}
  </>:<>
   <p className="text-sm text-slate-300">Submit setup requests, expenses, assets, contracts and counted closing cash with evidence references. An approved submission is a document review; payment, verified COD, merchant settlement and GL posting remain in Finance. Record cash-count detail, contract renewal dates and asset custodians in the notes.</p>
   {(manager||superadmin)&&<form className="grid gap-3 md:grid-cols-2" onSubmit={async e=>{e.preventDefault();if(await action({action:'SUBMIT_RECORD',branch,...record,amount:Number(record.amount||0)}))setRecord({...record,title:'',amount:'',reference:'',evidence:'',notes:''});}}>
    <label>Record type<select className={field} value={record.kind} onChange={e=>setRecord({...record,kind:e.target.value})}>{[['SETUP','Setup / budget request'],['EXPENSE','Expense'],['ASSET','Asset'],['CONTRACT','Contract'],['DAILY_CLOSE','Daily counted closing cash']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    <label>Business date<input required type="date" className={field} value={record.business_date} onChange={e=>setRecord({...record,business_date:e.target.value})}/></label>
    <label>Branch<input className={field} readOnly value={branch||'Select one branch above'}/></label>
    <label>Title<input required className={field} value={record.title} onChange={e=>setRecord({...record,title:e.target.value})}/></label>
    <label>Amount (MMK)<input type="number" min="0" step="0.01" required className={field} value={record.amount} onChange={e=>setRecord({...record,amount:e.target.value})}/></label>
    <label>Invoice / record reference<input required className={field} value={record.reference} onChange={e=>setRecord({...record,reference:e.target.value})}/></label>
    <label>Evidence document reference / link<input required className={field} value={record.evidence} onChange={e=>setRecord({...record,evidence:e.target.value})}/></label>
    <label className="md:col-span-2">Details / custodian / due date / cash-count breakdown<textarea required className={field} value={record.notes} onChange={e=>setRecord({...record,notes:e.target.value})}/></label><button disabled={busy||!branch} className={button}>Submit for head-office review</button>
   </form>}
   <div className="max-h-[480px] space-y-3 overflow-auto">{records.map(r=><article key={r.id} className="rounded-xl border border-[#1a3a5c] bg-[#061524] p-3"><h3 className="font-bold">{r.branch_code} · {r.kind} · {r.title} · {r.status}</h3><p>{Number(r.amount).toLocaleString()} MMK · {r.reference}</p><p className="text-sm">Business date: {r.business_date||'Not recorded'}</p><p className="break-all text-sm">Evidence: {r.evidence}</p><p className="whitespace-pre-wrap text-sm">{r.notes}</p>{r.review_reason&&<p>Review: {r.review_reason}</p>}{canReview&&r.status==='SUBMITTED'&&<button className={button} onClick={()=>setReview({id:r.id,decision:'APPROVED',reason:''})}>Review submission</button>}</article>)}{!records.length&&<p>No administrative or financial submissions recorded.</p>}</div>
   {review.id&&<form className="grid gap-2 rounded-xl border border-amber-500 p-3" onSubmit={async e=>{e.preventDefault();if(await action({action:'REVIEW_RECORD',...review}))setReview({id:'',decision:'APPROVED',reason:''});}}><label>Decision<select className={field} value={review.decision} onChange={e=>setReview({...review,decision:e.target.value})}><option>APPROVED</option><option>REJECTED</option></select></label><label>Review reason<textarea required className={field} value={review.reason} onChange={e=>setReview({...review,reason:e.target.value})}/></label><button disabled={busy} className={button}>Save review (no payment)</button><button type="button" onClick={()=>setReview({id:'',decision:'APPROVED',reason:''})}>Cancel review</button></form>}
  </>}
 </section>;
}
