import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type Request={
  id:string;way_id:string;automatic_provider:string;requested_provider:string;
  reason:string;requested_at:string;
};
const reviewerRoles=["superadmin","operation_manager","operations_manager","operation_supervisor"];

export default function ProviderCorrectionQueue(){
  const {profile}=useAuth();
  const canReview=reviewerRoles.includes(String(profile?.role||"").toLowerCase());
  const [open,setOpen]=useState(false);
  const [requests,setRequests]=useState<Request[]>([]);
  const [loading,setLoading]=useState(false);
  const [acting,setActing]=useState("");
  const [notes,setNotes]=useState<Record<string,string>>({});
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const load=useCallback(async()=>{
    if(!canReview)return;
    setLoading(true);setError("");
    try{
      const {data,error:e}=await (supabase as any).rpc("be_review_provider_change_requests_v1");
      if(e)throw e;
      if(data?.ok!==true)throw new Error(data?.error||"Review queue unavailable");
      setRequests(Array.isArray(data.requests)?data.requests:[]);
    }catch(e:any){setError(e?.message||"Unable to load provider corrections");}
    finally{setLoading(false);}
  },[canReview]);
  useEffect(()=>{if(open)void load();},[open,load]);
  async function decide(r:Request,action:"approve"|"reject"){
    const note=String(notes[r.id]||"").trim();
    if(note.length<10||acting)return;
    if(!window.confirm(action==="approve"?
      "Approve provider change for "+r.way_id+"? Server will reject if custody, tariff or financial controls are not met.":
      "Reject provider correction for "+r.way_id+"?"))return;
    setActing(r.id);setError("");setMessage("");
    try{
      const {data,error:e}=await (supabase as any).rpc(action==="approve"?
        "be_approve_provider_change_request_v1":"be_reject_provider_change_request_v1",{
          p_id:r.id,p_note:note
        });
      if(e)throw e;
      if(data?.ok!==true)throw new Error(data?.error||"Review was not completed");
      setMessage(r.way_id+": "+String(data.status||action)+". "+(action==="approve"?"An authorized provider override is now recorded.":"The proposed override was rejected."));
      setNotes(old=>({...old,[r.id]:""}));
      await load();
    }catch(e:any){setError(e?.message||"Review denied by existing maker-checker, tariff or workflow safeguards");}
    finally{setActing("");}
  }
  if(!canReview)return null;
  return <section aria-label="Provider correction approvals" className="rounded-xl border border-blue-200 bg-white p-4 text-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="font-bold">Provider correction review / ဝန်ဆောင်မှုပေးသူ အတည်ပြုချက်</h2><p className="text-xs text-slate-500">Manager review; never replaces custody evidence or financial reconciliation.</p></div>
      <button type="button" onClick={()=>setOpen(v=>!v)} className="min-h-10 rounded-lg border border-blue-300 px-3 text-xs font-bold text-blue-900">{open?"Hide queue":"Review pending corrections"}</button>
    </div>
    {open&&<div className="mt-3 space-y-3">
      <div className="flex items-center justify-between gap-2"><span className="text-xs text-slate-600">{requests.length} pending provider requests</span><button type="button" disabled={loading||!!acting} onClick={()=>void load()} className="rounded-lg border px-3 py-2 text-xs font-semibold">Refresh</button></div>
      {requests.map(r=><article key={r.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{r.way_id}</strong><span className="text-xs text-slate-500">{r.requested_at?new Date(r.requested_at).toLocaleString():""}</span></div>
        <p className="mt-1 text-xs">Territory: <b>{r.automatic_provider}</b> · Requested: <b>{r.requested_provider}</b></p>
        <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">Reason: {r.reason}</p>
        <label className="mt-2 block text-xs font-bold">Review note / evidence reference (10+ characters)
          <textarea value={notes[r.id]||""} onChange={e=>setNotes(old=>({...old,[r.id]:e.target.value}))} maxLength={500} rows={2} className="mt-1 w-full rounded-lg border bg-white p-2 text-sm" placeholder="Document the approval or rejection and relevant tariff review"/>
        </label>
        <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={loading||!!acting||(notes[r.id]||"").trim().length<10} onClick={()=>void decide(r,"approve")} className="min-h-10 rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white disabled:opacity-40">Approve if eligible</button>
          <button type="button" disabled={loading||!!acting||(notes[r.id]||"").trim().length<10} onClick={()=>void decide(r,"reject")} className="min-h-10 rounded-lg border border-rose-300 px-3 text-xs font-bold text-rose-800 disabled:opacity-40">Reject</button>
        </div>
      </article>)}
      {!requests.length&&!loading&&<p className="rounded-lg bg-slate-50 p-4 text-xs text-slate-500">No pending provider corrections.</p>}
      {error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-900">{error}</p>}
      {message&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">{message}</p>}
    </div>}
  </section>;
}
