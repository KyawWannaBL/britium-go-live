import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Claim = {
  id: string; original_delivery_way_id: string; reported_outcome: string;
  source_document_reference: string; provider_code: string | null;
  observed_at: string | null; submitted_at: string; reported_by_user_id: string;
  claimed_cod_collected_mmk: number | null; review_state: string;
  review_note: string | null; reviewer_user_id: string | null;
};
const outcomes = [
  ["DELIVERED","Delivered (requires POD)"],
  ["RTO_MERCHANT_RECEIVED","RTO received by merchant (signed receipt)"],
  ["RETURN_IN_TRANSIT","Return in transit"],
  ["FAILED_ATTEMPT","Failed delivery attempt"],
  ["PENDING_WAREHOUSE","Pending warehouse"],
  ["PENDING_PROVIDER","Pending provider"],
  ["PENDING_NEXT_ATTEMPT","Pending next delivery attempt"],
  ["CANCELLED_WITH_PROOF","Cancelled with evidence"],
  ["UNKNOWN_DISPUTED","Unknown / disputed"]
] as const;
const reviewChoices = ["NEEDS_EVIDENCE","VERIFIED","REJECTED","CONFLICT"] as const;
const inputClass = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 w-full";

export default function GroundEvidenceReviewPanel({wayId}:{wayId:string}) {
  const [claims,setClaims]=useState<Claim[]>([]);
  const [actor,setActor]=useState<string|null>(null);
  const [outcome,setOutcome]=useState<string>("UNKNOWN_DISPUTED");
  const [source,setSource]=useState("");
  const [provider,setProvider]=useState("");
  const [observed,setObserved]=useState("");
  const [cod,setCod]=useState("");
  const [reviewTarget,setReviewTarget]=useState("");
  const [reviewState,setReviewState]=useState<string>("NEEDS_EVIDENCE");
  const [reviewNote,setReviewNote]=useState("");
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  const refresh=useCallback(async()=>{
    const {data,error:qErr}=await (supabase.from("be_parcel_ground_outcome_claims_v1" as never) as any)
      .select("id,original_delivery_way_id,reported_outcome,source_document_reference,provider_code,observed_at,submitted_at,reported_by_user_id,claimed_cod_collected_mmk,review_state,review_note,reviewer_user_id")
      .eq("original_delivery_way_id",wayId).order("submitted_at",{ascending:false}).limit(50);
    if(qErr){setError("Ground-evidence review is unavailable until approved UAT database access is enabled: "+qErr.message);setClaims([]);}
    else{setClaims((data||[]) as Claim[]);setError("");}
  },[wayId]);
  useEffect(()=>{
    void supabase.auth.getUser().then(({data})=>setActor(data.user?.id||null));
    void refresh();
  },[refresh]);

  async function submit(e:React.FormEvent){
    e.preventDefault();setMessage("");setError("");
    if(!actor){setError("Authenticated staff identity is required.");return;}
    if(!source.trim()){setError("A verifiable source document reference is mandatory.");return;}
    const money=cod.trim()===""?null:Number(cod);
    if(money!==null&&(!Number.isFinite(money)||money<0)){setError("Claimed collected amount must be a non-negative amount or blank.");return;}
    setLoading(true);
    // Stable idempotency fingerprint rejects repeated submissions of the same document/outcome/way.
    const fingerprint=["GROUND_V1",wayId.trim().toUpperCase(),outcome,source.trim().toUpperCase()].join("|");
    const {error:insertError}=await (supabase.from("be_parcel_ground_outcome_claims_v1" as never) as any)
       .insert({original_delivery_way_id:wayId,reported_outcome:outcome,
        source_document_reference:source.trim(),provider_code:provider.trim()||null,
        observed_at:observed?new Date(observed).toISOString():null,
        claimed_cod_collected_mmk:money,reported_by_user_id:actor,
        source_fingerprint:fingerprint});
    if(insertError) setError(insertError.message);
    else{setMessage("Ground claim submitted for independent review. No parcel status or settlement was posted.");setSource("");setCod("");await refresh();}
    setLoading(false);
  }
  async function review(){
    if(!actor||!reviewTarget||!reviewNote.trim()){setError("Select a claim, decision and review reason.");return;}
    const claim=claims.find(c=>c.id===reviewTarget);
    if(!claim){setError("Claim not found; refresh.");return;}
    if(claim.reported_by_user_id===actor){setError("Maker-checker: you cannot approve your own claim.");return;}
    setLoading(true);setError("");setMessage("");
    const {data,error:reviewErr}=await (supabase.from("be_parcel_ground_outcome_claims_v1" as never) as any)
      .update({review_state:reviewState,reviewer_user_id:actor,
               reviewed_at:new Date().toISOString(),review_note:reviewNote.trim()})
      .eq("id",reviewTarget).in("review_state",["UNREVIEWED","NEEDS_EVIDENCE"])
      .select("id");
    if(reviewErr)setError(reviewErr.message);
    else if(!data?.length)setError("Review not applied. This claim may have changed or access may be restricted.");
    else{setMessage("Ground claim review recorded. Operational and financial posting remains separate.");setReviewNote("");setReviewTarget("");await refresh();}
    setLoading(false);
  }
  return <section className="mt-5 space-y-4 border-t pt-5">
    <h3 className="text-base font-semibold">Real-world outcome evidence intake</h3>
    <p className="text-sm text-amber-800">Claims are unverified until reviewed. Even VERIFIED claims do not mark parcels delivered, received by merchants, or settled. Do not enter an invented timestamp or amount.</p>
    <form onSubmit={e=>void submit(e)} className="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
      <label className="text-xs font-medium">Reported physical outcome
        <select className={inputClass} value={outcome} onChange={e=>setOutcome(e.target.value)}>{outcomes.map(([k,label])=><option key={k} value={k}>{label}</option>)}</select>
      </label>
      <label className="text-xs font-medium">Service provider / branch (as reported)
        <input className={inputClass} value={provider} onChange={e=>setProvider(e.target.value)} placeholder="Britium, DK, Royal, Insein, Mandalay, ဂိတ်ချ…" />
      </label>
      <label className="text-xs font-medium">Evidence reference (required)
        <input className={inputClass} required value={source} onChange={e=>setSource(e.target.value)} placeholder="Signed sheet / POD / manifest / receipt reference" />
      </label>
      <label className="text-xs font-medium">Actual observation date/time (optional)
        <input className={inputClass} type="datetime-local" value={observed} onChange={e=>setObserved(e.target.value)} />
      </label>
      <label className="text-xs font-medium">Claimed COD collected (MMK; blank if unknown)
        <input className={inputClass} type="number" min={0} step="0.01" value={cod} onChange={e=>setCod(e.target.value)} placeholder="Not recorded" />
      </label>
      <div className="flex items-end"><button type="submit" disabled={loading||!actor||!source.trim()} className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Submit evidence claim</button></div>
    </form>
    {error&&<p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
    {message&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    <div className="overflow-x-auto rounded-lg border">
      <table className="min-w-[880px] w-full text-left text-xs"><thead className="bg-slate-100"><tr>{["Submitted","Ground outcome","Provider","Source document","Claimed COD","Review state","Reviewer note"].map(x=><th key={x} className="px-3 py-2">{x}</th>)}</tr></thead>
        <tbody>{claims.map(c=><tr key={c.id} className="border-t">
          <td className="px-3 py-2">{new Date(c.submitted_at).toLocaleString()}</td>
          <td className="px-3 py-2">{c.reported_outcome}</td>
          <td className="px-3 py-2">{c.provider_code||"Unverified"}</td>
          <td className="px-3 py-2">{c.source_document_reference}</td>
          <td className="px-3 py-2">{c.claimed_cod_collected_mmk==null?"Not recorded":Number(c.claimed_cod_collected_mmk).toLocaleString()}</td>
          <td className="px-3 py-2">{c.review_state}</td><td className="px-3 py-2">{c.review_note||"—"}</td>
        </tr>)}</tbody>
      </table>
      {!claims.length&&<p className="p-4 text-sm text-slate-500">No reviewed or unreviewed ground evidence is available for this Way ID.</p>}
    </div>
    <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
      <label className="text-xs font-medium">Claim for independent review
        <select className={inputClass} value={reviewTarget} onChange={e=>setReviewTarget(e.target.value)}>
          <option value="">Choose claim</option>
          {claims.filter(c=>["UNREVIEWED","NEEDS_EVIDENCE"].includes(c.review_state)&&c.reported_by_user_id!==actor)
            .map(c=><option key={c.id} value={c.id}>{c.reported_outcome} · {c.source_document_reference}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium">Decision
        <select className={inputClass} value={reviewState} onChange={e=>setReviewState(e.target.value)}>{reviewChoices.map(x=><option key={x} value={x}>{x}</option>)}</select>
      </label>
      <label className="text-xs font-medium md:col-span-2">Decision reason (required)
        <textarea className={inputClass} rows={2} value={reviewNote} onChange={e=>setReviewNote(e.target.value)} placeholder="Describe the signed evidence and any unresolved discrepancy"/>
      </label>
      <button type="button" disabled={!actor||!reviewTarget||!reviewNote.trim()||loading} onClick={()=>void review()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Record independent review</button>
    </div>
  </section>;
}
