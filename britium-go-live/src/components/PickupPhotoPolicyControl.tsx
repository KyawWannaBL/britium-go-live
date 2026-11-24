import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Photo waiver is temporary; weight, parcel count, role, verified/collected
 * pickup and financial segregation continue to be enforced by the backend.
 * This UI is informational for staff. Only the designated Super Admin can
 * change the rule; the server rechecks both account identity and role.
 */
export default function PickupPhotoPolicyControl() {
  const [required,setRequired]=useState<boolean|null>(null);
  const [admin,setAdmin]=useState(false);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [reason,setReason]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [error,setError]=useState("");
  const [note,setNote]=useState("");
  async function refresh() {
    setLoading(true);
    try {
      const [rule,user]=await Promise.all([
        (supabase as any).rpc("be_pickup_photo_required_v1"),
        supabase.auth.getUser()
      ]);
      if(rule.error)throw rule.error;
      setRequired(rule.data!==false);
      setAdmin(String(user.data.user?.email||"").toLowerCase()==="superadmin@britiumexpress.com");
      setError("");
    }catch(e:any){setRequired(null);setError(e?.message||"Pickup photo rule could not be loaded.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void refresh();},[]);
  async function change(nextRequired:boolean){
    if(!admin || busy || !confirmed || reason.trim().length<10)return;
    setBusy(true);setError("");setNote("");
    try{
      const {data,error}=await (supabase as any).rpc("be_set_pickup_photo_required_v1",{
        p_required:nextRequired,p_reason:reason.trim()
      });
      if(error)throw error;
      if(data?.ok!==true)throw new Error(data?.error||"The Super Admin rule was not updated.");
      setRequired(nextRequired);setReason("");setConfirmed(false);
      setNote(nextRequired?"Mandatory pickup photos restored.":"Temporary photo-optional rule activated.");
    }catch(e:any){setError(e?.message||"Could not change pickup photo rule.");}
    finally{setBusy(false);}
  }
  return <section data-temporary-pickup-photo-rule="true" className="rounded-xl border border-amber-500/35 bg-[#132236] px-3 py-3 text-xs text-slate-100">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-black text-amber-300">PICKUP PHOTO POLICY</span>
          <span className={`rounded-md px-2 py-1 font-black ${required===false?"bg-amber-300 text-[#101725]":required===true?"bg-emerald-500/20 text-emerald-300":"bg-slate-700 text-white"}`}>
            {loading?"Loading...":required===false?"TEMPORARILY OPTIONAL":required===true?"MANDATORY":"UNAVAILABLE"}
          </span>
        </div>
        <p className="mt-1 text-slate-300">
          {required===false
            ?"Photos may be omitted while clearing the backlog. Recorded parcel weights, verified pickup and confirmed collection remain required."
            :"Pickup photos are required under the current rule."}
        </p>
      </div>
      <button type="button" onClick={()=>void refresh()} disabled={loading||busy} className="rounded-lg border border-slate-500 px-3 py-2 font-bold disabled:opacity-50">Refresh rule</button>
    </div>
    {admin&&required!==null&&<div className="mt-3 grid gap-2 border-t border-slate-600 pt-3">
      <p className="font-bold text-amber-300">Super Admin only — change the rule after backlog reconciliation.</p>
      <input value={reason} onChange={e=>setReason(e.target.value)} maxLength={400} placeholder="Reason for changing photo requirement (minimum 10 characters)" className="min-h-10 w-full rounded-lg border border-slate-500 bg-white px-3 text-sm text-slate-950"/>
      <label className="flex items-start gap-2 text-slate-200"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1"/>I confirm that this policy change affects future pickup verification and waybill creation.</label>
      <button type="button" disabled={busy||!confirmed||reason.trim().length<10} onClick={()=>void change(!required)} className="w-fit rounded-lg bg-amber-300 px-4 py-2.5 font-black text-[#0b1629] disabled:opacity-40">
        {busy?"Saving...":required?"Allow pickup without photos temporarily":"Restore mandatory pickup photographs"}
      </button>
    </div>}
    {error&&<p role="alert" className="mt-2 font-semibold text-rose-300">{error}</p>}
    {note&&<p role="status" className="mt-2 font-semibold text-emerald-300">{note}</p>}
  </section>;
}
