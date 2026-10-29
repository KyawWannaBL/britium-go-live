import {useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
export default function BranchWayplanScan({wayplanId,branch,onSaved}:{wayplanId:string;branch:string;onSaved:()=>void}){
 const [scan,setScan]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 return <form className="my-4 flex flex-wrap items-end gap-3 rounded-xl border border-amber-500 p-4" onSubmit={async e=>{
  e.preventDefault();setBusy(true);setMessage('');
  try{const {data,error}=await (supabase as any).rpc('be_branch_wayplan_scan_v1',{p_wayplan:wayplanId,p_way_id:scan.trim()});if(error)throw error;if(data?.ok===false)throw Error(data.message||data.error);setMessage('Dispatch scan saved.');setScan('');onSaved();}catch(e:any){setMessage(e.message||'Scan failed.');}finally{setBusy(false);}
 }}><label>Dispatch scan · {branch}<input required aria-label="Branch dispatch Way ID" className="ml-2 rounded-lg border bg-white p-2 text-black" placeholder="Canonical Way ID" value={scan} onChange={e=>setScan(e.target.value)}/></label><button disabled={busy||!wayplanId} className="rounded-lg bg-amber-400 px-4 py-2 font-bold text-black">Save dispatch scan</button><p role="status" className="w-full text-sm">{message||'Supervisor approval and dispatch-ready status are required. Scan each parcel before dispatch.'}</p></form>;
}
