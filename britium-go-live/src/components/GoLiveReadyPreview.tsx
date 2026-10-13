import { useEffect, useState } from 'react';
import {previewGoLiveCutover, type GoLivePreview, type GoLivePreviewClient, type GoLiveRoot} from '@/lib/goLiveCutover';
const rootTables:Record<string,GoLiveRoot['table']>={parcel:'be_data_entry_parcel_details',pickup:'be_pickup_requests',wayplan:'be_wayplan_dispatches'};
export default function GoLiveReadyPreview({client}:{client:GoLivePreviewClient}) {
 const [roots,setRoots]=useState('');
 const [cutoff,setCutoff]=useState(()=>new Date().toISOString());
 const [preview,setPreview]=useState<GoLivePreview|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 useEffect(()=>{if(!preview)return;const timer=window.setTimeout(()=>{setPreview(null);setMessage('Preview expired. Generate a new preview.');},Math.max(0,Date.parse(preview.expires_at)-Date.now()));return()=>window.clearTimeout(timer);},[preview]);
 function invalidate(){setPreview(null);setMessage('Selection changed. Generate a new preview.');}
 async function generate(){
  setBusy(true);setPreview(null);setMessage('');
  try{
   const rootKeys:GoLiveRoot[]=roots.split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{
    const separator=line.indexOf(':');const table=rootTables[line.slice(0,separator)];const key=line.slice(separator+1).trim();
    if(separator<0||!table||!key) throw new Error('Use parcel:ID, pickup:ID or wayplan:ID, one per line.');
    return {table,key};
   });
   const date=new Date(cutoff);if(!Number.isFinite(date.getTime())) throw new Error('Enter a valid ISO cutoff timestamp.');
   setPreview(await previewGoLiveCutover(client,{cutoffAt:date.toISOString(),rootKeys}));
  }catch(error){setMessage(error instanceof Error?error.message:'Go-live preview failed.');}
  finally{setBusy(false);}
 }
 return <section className="space-y-4 rounded-3xl border border-amber-500/30 bg-[#0b2236] p-6 text-[#eef8ff]">
  <div><h2 className="text-xl font-black">Go-Live Ready · Test-data preview</h2><p className="mt-2 text-sm text-[#a9c2d4]">Review approved testing transactions and preserved masters, tariffs, accounts and billing controls. This preview does not change data. Complete isolation and recovery evidence is required before activation.</p></div>
  <label className="block text-sm">Preview cutoff (ISO timestamp)<input aria-label="Preview cutoff" disabled={busy} className="mt-1 w-full rounded-lg bg-white p-2 text-slate-950" value={cutoff} onChange={e=>{setCutoff(e.target.value);invalidate();}}/></label>
  <label className="block text-sm">Explicit test roots (optional for preliminary counts)<textarea aria-label="Explicit test roots" disabled={busy} className="mt-1 min-h-24 w-full rounded-lg bg-white p-2 text-slate-950" placeholder={'parcel:TEST-ID\npickup:TEST-PICKUP\nwayplan:TEST-WAYPLAN'} value={roots} onChange={e=>{setRoots(e.target.value);invalidate();}}/></label>
  <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={()=>void generate()} className="rounded-xl bg-amber-500 px-5 py-3 font-black text-slate-950 disabled:opacity-50">{busy?'Loading preview…':'Go-Live Ready · Preview'}</button><button type="button" disabled className="rounded-xl border border-slate-500 px-5 py-3 font-black opacity-50">Activate isolation · blocked</button></div>
  <p role="status" className="text-sm text-amber-200">{message||(!preview?'PENDING · A preliminary preview has not been reviewed.':'BLOCKED · No executable isolation manifest is available.')}</p>
  {preview&&<div className="space-y-4">
   <p className="text-xs text-[#a9c2d4]">Preview expires: {preview.expires_at}</p>
   <div><h3 className="font-black">Selected roots · linked scope incomplete</h3>{preview.table_counts.map(row=><p key={row.table} className="mt-1 text-sm">{row.table}: {row.selected_roots} selected / {row.records} total</p>)}</div>
   <div><h3 className="font-black">Preserved master and configuration counts</h3>{preview.preserved_counts.map(row=><p key={row.table} className="mt-1 text-sm">{row.table}: {row.records}</p>)}<p className="mt-1 text-xs text-[#a9c2d4]">This is a partial protected inventory. Unclassified tables remain untouched.</p></div>
   <div><h3 className="font-black">Blocking conditions</h3>{[...preview.blockers,...preview.financial_exceptions].map((row,i)=><p key={row.code+':'+i} className="mt-1 text-sm text-amber-200">{row.detail}</p>)}</div>
   <div><h3 className="font-black">Required evidence</h3>{preview.gates.map(row=><p key={row.name} className="mt-1 text-sm">{row.name}: <strong>{row.status}</strong></p>)}</div>
  </div>}
 </section>;
}
