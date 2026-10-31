import {useCallback,useEffect,useState} from 'react';
import type {GoLivePreviewClient} from '@/lib/goLiveCutover';
type Plan={batch_id:string;status:string;cutoff_at:string;expires_at:string;total_rows:number;tables:{table:string;records:number}[];technical_evidence?:Record<string,string>};
type Status={ok:true;plan:Plan|null;execution_enabled:false;current_isolation?:{status:string;cutoff_at:string;recoverable_archive?:boolean;rows_removed?:number;archived_rows?:number;balance_accounts_reset?:number};current_wallet_exposure?:{britium_owes:number;owes_britium:number};archived_financial_exposure?:{britium_owes:number;owes_britium:number};acceptance:{name:string;status:string}[]};
const count=(n:number|undefined)=>Number(n||0).toLocaleString('en-US');
export default function GoLiveCutoverStatus({client}:{client:GoLivePreviewClient}){
 const [data,setData]=useState<Status|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{setBusy(true);setError('');setData(null);try{const {data:r,error:e}=await client.rpc('be_go_live_cutover_status_v3',{});if(e)throw Error(e.message);const s=r as Status;if(!s||s.ok!==true||s.execution_enabled!==false||!Array.isArray(s.acceptance))throw Error('Verified cutover status is unavailable.');setData(s);}catch(e){setError(e instanceof Error?e.message:'Status unavailable.');}finally{setBusy(false);}},[client]);
 useEffect(()=>{void refresh()},[refresh]);
 const active=data?.current_isolation?.recoverable_archive===true&&data.current_isolation.status==='ACTIVE';
 return <section className="space-y-4 rounded-3xl border border-amber-500/30 bg-[#0b2236] p-6 text-[#eef8ff]">
 <h2 className="text-xl font-black">Production cutover · operational and financial archive</h2>
 <p>Accounts, master data, tariffs, configuration, audit history and numbering are preserved. An archive is not a payment or forgiveness of historical claims.</p>
 <button type="button" disabled={busy} onClick={()=>void refresh()} className="rounded-xl bg-amber-500 px-4 py-2 font-bold text-slate-950">{busy?'Loading…':'Refresh cutover status'}</button>
 {error&&<p role="alert">{error}</p>}
 {data&&<>
 <p role="status" className="font-bold">{active?'Recoverable isolation is active. Production acceptance is separate.':data.plan?'Archive manifest prepared. Isolation has not been activated.':'No current archive manifest. Previous isolation does not establish readiness for the new opening.'}</p>
 {data.plan&&<div><p>Target opening: {new Date(data.plan.cutoff_at).toLocaleString('en-GB',{timeZone:'Asia/Yangon'})} Myanmar Time</p><p>Manifest: {data.plan.batch_id} · {data.plan.status}</p><p>{count(data.plan.total_rows)} rows inventoried across {data.plan.tables.length} transaction and balance tables.</p>{!active&&<p>Preview expiry: {new Date(data.plan.expires_at).toLocaleString('en-GB',{timeZone:'Asia/Yangon'})} Myanmar Time. Refreshing this screen does not renew the manifest.</p>}<div>{data.plan.tables.filter(t=>['be_data_entry_parcel_details','be_portal_pickup_requests','be_wayplan_dispatches','be_party_wallet_accounts'].includes(t.table)).map(t=><p key={t.table}>{t.table}: {count(t.records)}</p>)}</div></div>}
 {active&&<p>{count(data.current_isolation?.rows_removed)} transaction rows removed from active tables; {count(data.current_isolation?.balance_accounts_reset)} account balance projections reset. All {count(data.current_isolation?.archived_rows)} source rows remain in the restricted archive.</p>}
 <p>{active?'Archived historical claims':'Current recorded wallet claims'}: Britium owes MMK {count((active?data.archived_financial_exposure:data.current_wallet_exposure)?.britium_owes)}; receivables MMK {count((active?data.archived_financial_exposure:data.current_wallet_exposure)?.owes_britium)}. These figures are not proof of settlement.</p>
 {data.current_isolation?.cutoff_at&&!active&&<p className="text-sm">Previous isolation cutoff: {new Date(data.current_isolation.cutoff_at).toLocaleString('en-GB',{timeZone:'Asia/Yangon'})} Myanmar Time.</p>}
 <div>{data.acceptance.map(g=><p key={g.name}>{g.name}: <strong>{g.status}</strong></p>)}</div>
 <p className="text-sm">Archive activation and recovery require the administrator maintenance procedure. This screen cannot clear data or approve acceptance.</p>
 </>}
 </section>;
}
