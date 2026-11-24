import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type Provider = { provider_code:string; provider_type:string; is_active:boolean };
type Route = { provider_code?:string|null; reason?:string|null; matched_destination?:string|null; selection_mode?:string|null };
type Provisional = { ok?:boolean; provisional_provider?:string|null; provisional_reason?:string|null; reviewed_at?:string|null; territory_suggestion?:string|null };
type Preview = { ok?:boolean; default_provider?:string|null; effective_provider?:string|null; override_reason?:string|null; requires_manual_pricing_review?:boolean; error?:string };

const preferred = ["BRITIUM", "NPT BRANCH", "MDY BRANCH", "DK DELIVERY", "ROYAL EXPRESS", "H.TERMINAL DROP-OFF"];
const descriptions:Record<string,string> = {
  "BRITIUM":"Britium direct territory (e.g. Yangon)",
  "NPT BRANCH":"Naypyitaw branch",
  "MDY BRANCH":"Mandalay branch",
  "DK DELIVERY":"DK Delivery (third party)",
  "ROYAL EXPRESS":"Royal Express (outside directly served areas)",
  "H.TERMINAL DROP-OFF":"ဂိတ်ချ / Highway terminal drop-off"
};

export default function ProviderTerritoryReview({
  wayId, township, recordedProvider, onChanged
}:{
  wayId:string; township:string|null; recordedProvider:string|null;
  onChanged?:()=>void;
}) {
  const {profile}=useAuth();
  const canSaveTemporary=["superadmin","operation_manager","operations_manager","operation_supervisor"].includes(String(profile?.role||"").toLowerCase());
  const [provisional,setProvisional]=useState<Provisional|null>(null);
  const [providers,setProviders]=useState<Provider[]>([]);
  const [route,setRoute]=useState<Route|null>(null);
  const [preview,setPreview]=useState<Preview|null>(null);
  const [chosen,setChosen]=useState("");
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [info,setInfo]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [canRequestChange,setCanRequestChange]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);setError("");setInfo("");
    try {
      const [catalog,territory,effective,temporary]=await Promise.all([
        (supabase.from("be_data_entry_service_providers") as any)
          .select("provider_code,provider_type,is_active").eq("is_active",true).order("provider_code"),
        (supabase as any).rpc("be_data_entry_service_provider_route_v17",{p_township:township||""}),
        (supabase as any).rpc("be_effective_parcel_provider_preview_v1",{p_way_id:wayId}),
        (supabase as any).rpc("be_parcel_temp_provider_snapshot_v1",{p_way_id:wayId})
      ]);
      if(catalog.error)throw catalog.error;
      if(territory.error)throw territory.error;
      // Warehouse viewers may inspect suggestions without parcel-provider edit authority.
      // The server will always enforce permissions for review and requests.
      const previewAllowed=!effective.error&&effective.data?.ok!==false;
      setCanRequestChange(previewAllowed);
      const list=(catalog.data||[]) as Provider[];
      const suggested=(territory.data||{}) as Route;
      const current=(effective.data||{}) as Preview;
      const tempAllowed=!temporary.error&&temporary.data?.ok===true;
      const tempValue=tempAllowed?(temporary.data as Provisional):null;
      setProviders(list);
      setRoute(suggested);
      setPreview(previewAllowed?current:null);
      setProvisional(tempValue);
      setChosen(String(tempValue?.provisional_provider||(previewAllowed?current.effective_provider:null)||suggested.provider_code||""));
      if(!tempAllowed)setInfo("Temporary provider lookup unavailable for this waybill; canonical provider controls remain unchanged.");
      if(!previewAllowed&&tempAllowed)setInfo("Effective provider assignment is restricted. Territory and provisional classification remain available for review.");
    } catch(e:any) {setCanRequestChange(false);setError(e?.message||"Provider information unavailable");}
    finally{setLoading(false);}
  },[wayId,township]);

  useEffect(()=>{void load();},[load]);
  const suggested=String(route?.provider_code||preview?.default_provider||"");
  const effective=preview?String(preview.effective_provider||""):"";
  const provisionalValue=String(provisional?.provisional_provider||"");
  const unavailable=Boolean(chosen)&&!providers.some(p=>p.provider_code===chosen);
  const isChanged=Boolean(chosen)&&chosen!==effective;
  const temporaryChanged=Boolean(chosen)&&chosen!==provisionalValue;
  const canSave=canSaveTemporary&&temporaryChanged&&!unavailable&&!busy&&!loading&&reason.trim().length>=12&&confirmed&&!error;
  const canRequest=canRequestChange&&isChanged&&!unavailable&&!busy&&!loading&&reason.trim().length>=12&&confirmed&&!error;
  const ordered=[...providers].sort((a,b)=>{
    const ai=preferred.indexOf(a.provider_code),bi=preferred.indexOf(b.provider_code);
    return (ai<0?999:ai)-(bi<0?999:bi)||a.provider_code.localeCompare(b.provider_code);
  });
  async function saveTemporary(){
    if(!canSave)return;
    setBusy(true);setError("");setInfo("");
    try{
      const {data,error:e}=await (supabase as any).rpc("be_parcel_temp_provider_set_v1",{
        p_way_id:wayId,p_provider_code:chosen,p_reason:reason.trim()
      });
      if(e)throw e;
      if(data?.ok!==true)throw new Error(data?.error||"Temporary provider was not saved");
      setProvisional({
        ok:true,provisional_provider:data.provisional_provider,
        provisional_reason:reason.trim(),reviewed_at:new Date().toISOString()
      });
      setInfo("Temporary provider saved and audited. Actual booked provider, wayplan, tariff, custody and Finance are unchanged.");
      setReason("");setConfirmed(false);
      onChanged?.();
    }catch(e:any){setError(e?.message||"Temporary provider classification failed");}
    finally{setBusy(false);}
  }
  async function submit(){
    if(!canRequest)return;
    setBusy(true);setInfo("");setError("");
    try {
      // This RPC creates an auditable PENDING_REVIEW request. It never rewrites
      // wayplans, custody scans, provider assignments, tariffs or finance data.
      const {data,error:rpcError}=await (supabase as any).rpc("be_request_parcel_provider_change_v1",{
        p_way_id:wayId,p_provider_code:chosen,p_reason:reason.trim()
      });
      if(rpcError)throw rpcError;
      if(data?.ok!==true)throw new Error(data?.error||"Provider correction was not accepted");
      setInfo("Correction submitted for approval (reference "+String(data.request_id||"pending")+"). Effective assignment and pricing remain unchanged until authorized review.");
      setReason("");setConfirmed(false);
      onChanged?.();
    }catch(e:any){setError(e?.message||"Provider correction request failed");}
    finally{setBusy(false);}
  }
  return <section aria-label="Territory provider review" className="space-y-3 rounded-xl border border-cyan-200 bg-cyan-50/40 p-4 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-bold text-slate-900">Temporary Provider Review / ဝန်ဆောင်မှုပေးသူ စစ်ဆေးရန်</h3>
      <button type="button" disabled={busy||loading} onClick={()=>void load()} className="rounded-lg border border-cyan-300 bg-white px-3 py-2 text-xs font-semibold">Refresh suggestion</button>
    </div>
    <p className="text-xs leading-5 text-slate-600">Territory-based provisional classification is for operational tracking only, not physical handover evidence. Authorized Operations can save it immediately with audit; permanent provider changes require separate maker-checker approval. Wayplan, COD, tariffs and custody records are preserved.</p>
    <dl className="grid gap-2 rounded-lg border bg-white p-3 sm:grid-cols-3">
      <div><dt className="text-xs text-slate-500">Recorded provider</dt><dd className="font-bold">{recordedProvider||"Unverified"}</dd></div>
      <div><dt className="text-xs text-slate-500">Territory suggested</dt><dd className="font-bold text-blue-900">{loading?"Checking...":suggested||"Review required"}</dd></div>
      <div><dt className="text-xs text-slate-500">Current effective</dt><dd className="font-bold">{loading?"Checking...":effective||(canRequestChange?"Unverified":"Restricted — use Operations") }</dd></div>
      <div><dt className="text-xs text-slate-500">Temporary classification</dt><dd className="font-bold text-indigo-800">{provisionalValue||"Not yet reviewed"}</dd></div>
    </dl>
    {provisional?.provisional_reason&&<p className="rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-xs text-indigo-900">Temporary selection reason: {provisional.provisional_reason} · {provisional.reviewed_at?new Date(provisional.reviewed_at).toLocaleString():""}</p>}
    {recordedProvider&&effective&&recordedProvider!==effective&&<p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs font-semibold text-amber-900">Recorded provider differs from current effective routing. The recorded value is historical evidence and is not silently overwritten; investigate the discrepancy before treating this parcel as reconciled.</p>}
    <p className="text-xs text-slate-500">Destination: {township||"Unknown"} · Routing basis: {route?.reason||"Unverified"} {route?.matched_destination?"· Matched: "+route.matched_destination:""}</p>
    {preview?.requires_manual_pricing_review&&<p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-900">Provider-specific tariff unavailable. Finance/pricing review is needed before commercial changes.</p>}
    <label className="block text-xs font-bold text-slate-700">Confirm or correct provider
      <select value={chosen} disabled={loading||busy} onChange={e=>{setChosen(e.target.value);setConfirmed(false);setInfo("");}} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900">
        <option value="">Select provider for review...</option>
        {ordered.map(p=><option key={p.provider_code} value={p.provider_code}>{p.provider_code}{descriptions[p.provider_code]?" — "+descriptions[p.provider_code]:" — Other active provider"}</option>)}
      </select>
    </label>
    {chosen&&<p className="text-xs text-slate-600">{chosen===effective?"Selected provider matches current effective provider. No correction needed.":chosen===suggested?"Matches system territory suggestion.":"Manual correction differs from territory suggestion; document the operational reason."}</p>}
    {(temporaryChanged&&canSaveTemporary||isChanged&&canRequestChange)&&<div className="space-y-2">
      <label className="block text-xs font-bold text-slate-700">Reason and supporting reference (minimum 12 characters)
        <textarea value={reason} maxLength={600} onChange={e=>setReason(e.target.value)} placeholder="Actual branch / territory / terminal / dispatch instruction, document reference..." rows={2} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm"/>
      </label>
      <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-0.5"/>I confirm this is an operational provider classification/correction, not proof of parcel handover or financial settlement.</label>
      <div className="flex flex-wrap gap-2">
        {canSaveTemporary&&<button type="button" disabled={!canSave} onClick={()=>void saveTemporary()} className="min-h-10 rounded-lg bg-indigo-700 px-4 py-2 font-bold text-white disabled:opacity-40">{busy?"Saving...":"Save temporary provider (audited)"}</button>}
        {canRequestChange&&isChanged&&<button type="button" disabled={!canRequest} onClick={()=>void submit()} className="min-h-10 rounded-lg border border-blue-600 bg-white px-4 py-2 font-bold text-blue-800 disabled:opacity-40">Request permanent change / approval</button>}
      </div>
    </div>}
    {error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-900">{error}</p>}
    {info&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">{info}</p>}
  </section>;
}
