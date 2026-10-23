import {useRef,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';

type Outcome={id:string;ok:boolean;message:string};
export default function WarehouseReviewedBatch({onChanged,disabled=false,onBusyChange}:{onChanged:()=>Promise<unknown>;disabled?:boolean;onBusyChange?:(busy:boolean)=>void}){
  const [text,setText]=useState(''),[ids,setIds]=useState<string[]>([]),[confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [received,setReceived]=useState<string[]>([]),[ready,setReady]=useState<string[]>([]),[outcomes,setOutcomes]=useState<Outcome[]>([]);
  const running=useRef(false);
  function review(){
    if(disabled||running.current)return;
    const parsed=[...new Set(text.toUpperCase().split(/[\s,;]+/).filter(Boolean))];
    setIds([]);setConfirmed(false);setReceived([]);setReady([]);setOutcomes([]);
    if(!parsed.length||parsed.length>100||parsed.some(id=>!/^D\d{4}-[A-Z0-9]+-\d{3,}$/.test(id))){setMessage('Enter 1–100 valid D-series Way IDs. No scans were submitted.');return;}
    setIds(parsed);setMessage('Review every Way ID below, then confirm physical receipt.');
  }
  async function run(kind:'inbound'|'ready'){
    if(disabled||running.current||!confirmed||!ids.length)return;
    if(kind==='ready'&&received.length!==ids.length)return;
    const done=kind==='inbound'?received:ready;
    const pending=ids.filter(id=>!done.includes(id));
    if(!pending.length)return;
    running.current=true;setBusy(true);onBusyChange?.(true);setOutcomes([]);
    const results:Outcome[]=[];
    try{
      for(let offset=0;offset<pending.length;offset+=3){
        const batch=await Promise.all(pending.slice(offset,offset+3).map(async id=>{
          try{
            if(kind==='inbound'){
              const lookup=await (supabase as any).rpc('be_warehouse_resolve_scan_v3',{p_scan:id});
              if(lookup.error)throw lookup.error;
              const matches=lookup.data?.matches||[];
              if(lookup.data?.ok===false||matches.length!==1||Number(lookup.data?.resolved_candidate_count||1)>1)throw new Error('Resolve this Way ID individually before scanning.');
              if(String(matches[0].canonical_id||'').toUpperCase()!==id)throw new Error('Use the canonical Way ID shown by the individual scanner.');
            }
            const result=kind==='inbound'
              ?await (supabase as any).rpc('be_warehouse_inbound_scan',{p_tracking_no:id,p_warehouse_code:'YGN-MAIN'})
              :await (supabase as any).rpc('be_warehouse_mark_delivery_ready_v150',{p_delivery_way_id:id});
            if(result.error)throw result.error;
            if(result.data?.ok!==true)throw new Error(result.data?.reason||result.data?.message||result.data?.error||'Operation was not confirmed.');
            return {id,ok:true,message:kind==='inbound'?'Inbound received':'Ready for Wayplan'};
          }catch(error:any){return {id,ok:false,message:error?.message||'Check current status before retrying.'};}
        }));
        results.push(...batch);setOutcomes([...results]);
        const successes=results.filter(r=>r.ok).map(r=>r.id);
        if(kind==='inbound')setReceived([...new Set([...done,...successes])]);
        else setReady([...new Set([...done,...successes])]);
        setMessage(`${kind==='inbound'?'Inbound':'Readiness'}: ${results.length}/${pending.length} checked; ${results.filter(r=>!r.ok).length} require attention.`);
      }
      await onChanged();
    }catch(error:any){setMessage(error?.message||'Refresh the queue to verify committed results.');}
    finally{running.current=false;setBusy(false);onBusyChange?.(false);}
  }
  return <section className="mb-4 rounded-xl border border-slate-700 bg-[#0B2133] p-4">
    <h2 className="font-bold">Reviewed bulk inbound scans</h2>
    <p className="my-2 text-sm text-slate-300">Paste up to 100 D-series Way IDs for parcels physically received at YGN-MAIN. Each scan uses your signed-in warehouse permissions. Finance confirmation remains separate.</p>
    <label className="block text-sm">Inbound Way IDs<textarea aria-label="Inbound Way IDs" rows={4} disabled={busy||disabled} value={text} onChange={e=>{setText(e.target.value);setIds([]);setConfirmed(false);setMessage('');}} className="mt-1 block w-full rounded bg-slate-950 p-2"/></label>
    <button type="button" disabled={busy||disabled} onClick={review} className="my-2 rounded bg-sky-700 px-3 py-2">Review inbound list</button>
    {ids.length>0&&<>
      <p className="font-semibold">Reviewed scope: {ids.length} parcel(s)</p>
      <div className="my-2 max-h-40 overflow-auto rounded bg-slate-950 p-2 text-sm">{ids.map(id=><div key={id}>{id}</div>)}</div>
      <label className="my-2 flex items-center gap-2"><input type="checkbox" checked={confirmed} disabled={busy||disabled} onChange={e=>setConfirmed(e.target.checked)}/>I confirm these parcels have been physically received.</label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={disabled||!confirmed||busy||received.length===ids.length} onClick={()=>void run('inbound')} className="rounded bg-emerald-700 px-3 py-2 disabled:opacity-40">Receive reviewed parcels ({ids.length-received.length})</button>
        <button type="button" disabled={disabled||busy||!confirmed||received.length!==ids.length||ready.length===ids.length} onClick={()=>void run('ready')} className="rounded bg-cyan-700 px-3 py-2 disabled:opacity-40">Mark reviewed parcels ready for Wayplan ({ids.length-ready.length})</button>
      </div>
    </>}
    <p role="status" className="my-2 text-sm">{message}</p>
    {outcomes.length>0&&<ul className="max-h-60 overflow-auto text-sm">{outcomes.map(row=><li key={row.id} className={row.ok?'text-emerald-300':'text-amber-300'}>{row.id}: {row.message}</li>)}</ul>}
  </section>;
}
