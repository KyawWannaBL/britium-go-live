// Branch collection/transfer workbench. Does not create permanent Way IDs or
// set COD/tariffs. Existing QR generation remains in the Pickup workflow.
import {useCallback,useEffect,useMemo,useState} from "react";
import {supabase} from "@/integrations/supabase/client";
import {PackageCheck,Truck,RefreshCw,ScanLine,ArrowRight,ShieldAlert} from "lucide-react";

type Intake={id:string;branch_code:string;intake_type:"EXISTING_WAY"|"TEMP_QR";parcel_reference:string;status:string;manifest_id:string|null;permanent_way_id:string|null;received_at:string};
type Manifest={id:string;branch_code:string;bag_code:string;seal_code:string;vehicle_ref:string;status:string;created_at:string;};
const date=(value:string)=>value?new Date(value).toLocaleString("en-GB",{timeZone:"Asia/Yangon"}):"-";
export default function BranchHQIntakeWorkbench({branch,isHeadOffice=false}:{branch:string;isHeadOffice?:boolean}){
  const [intakes,setIntakes]=useState<Intake[]>([]);
  const [manifests,setManifests]=useState<Manifest[]>([]);
  const [kind,setKind]=useState<"EXISTING_WAY"|"TEMP_QR">("EXISTING_WAY");
  const [reference,setReference]=useState("");
  const [note,setNote]=useState("");
  const [selected,setSelected]=useState<string[]>([]);
  const [bag,setBag]=useState("");
  const [seal,setSeal]=useState("");
  const [vehicle,setVehicle]=useState("");
  const [manifestId,setManifestId]=useState("");
  const [scanReference,setScanReference]=useState("");
  const [linkWay,setLinkWay]=useState("");
  const [linkIntakeId,setLinkIntakeId]=useState("");
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const b=branch.trim().toUpperCase();
  const refresh=useCallback(async()=>{
    if(!b||b==="YGN")return;
    const {data,error:e}=await (supabase as any).rpc("be_branch_intake_snapshot_v1",{p_branch:b});
    if(e||data?.ok===false){setError(e?.message||data?.error||"Branch intake not available");return;}
    setIntakes(Array.isArray(data?.intakes)?data.intakes:[]);
    setManifests(Array.isArray(data?.manifests)?data.manifests:[]);
    setError("");
  },[b]);
  useEffect(()=>{void refresh()},[refresh]);
  const open=intakes.filter(x=>x.status==="RECEIVED");
  const pending=intakes.filter(x=>x.intake_type==="TEMP_QR" && x.status==="HQ_RECEIVED");
  const activeManifest=manifests.find(x=>x.id===manifestId);
  const manifestItems=useMemo(()=>intakes.filter(x=>x.manifest_id===manifestId),[intakes,manifestId]);
  const loaded=manifestItems.filter(x=>["LOADED","HQ_RECEIVED","HQ_REGISTERED"].includes(x.status)).length;
  const hqReceived=manifestItems.filter(x=>["HQ_RECEIVED","HQ_REGISTERED"].includes(x.status)).length;
  const isLocked=!b||b==="YGN";
  const work=async(label:string,fn:()=>Promise<any>)=>{
    setLoading(true);setError("");setMessage("");
    try {
      const {data,error:e}=await fn();
      if(e||data?.ok===false)throw new Error(e?.message||data?.error||label+" rejected");
      setMessage(label+" confirmed");
      await refresh();
      return data;
    }catch(e:any){setError(e?.message||"Action failed");}
    finally{setLoading(false);}
  };
  const input="w-full rounded-lg border border-[#365674] bg-[#061524] px-3 py-2 text-sm text-white";
  const btn="rounded-lg bg-[#f6b84b] px-4 py-2 text-sm font-bold text-[#061524] disabled:opacity-40";
  return <section className="space-y-4 rounded-3xl border border-[#365674] bg-[#0b2236] p-5" data-branch-intake-workbench="true">
    <div className="flex items-center justify-between gap-2">
      <div><h2 className="flex items-center gap-2 text-lg font-black text-[#f6b84b]"><PackageCheck size={20}/>Branch intake & evening HQ consolidation</h2>
      <p className="mt-1 text-xs text-[#a9bfd2]">No full registration at branches. Scan an existing Way ID or a temporary QR created in Pickup. HQ creates and links any new permanent Way ID.</p></div>
      <button type="button" onClick={()=>void refresh()} className="rounded-xl border border-[#365674] p-2" aria-label="Refresh branch intakes"><RefreshCw size={17}/></button>
    </div>
    {isLocked&&<p className="rounded-lg border border-amber-500/40 p-3 text-sm">Select a collection branch (for example YGN-INS or MDY). Yangon HQ is the receiving destination, not a collection branch in this workflow.</p>}
    {error&&<p role="alert" className="rounded-lg border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}
    {message&&<p role="status" className="rounded-lg border border-green-500/40 p-3 text-sm text-green-200">{message}</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      {[[ "At branch",open.length],["Evening manifests",manifests.filter(x=>x.status!=="RECEIVED").length],["HQ registration pending",pending.length]].map(([t,n])=>
        <div key={t} className="rounded-xl bg-[#061524] p-4"><div className="text-xs text-[#9bb7ce]">{t}</div><div className="text-xl font-black">{n}</div></div>)}
    </div>
    {!isHeadOffice&&<div className="grid gap-3 rounded-xl border border-[#365674] p-4 lg:grid-cols-2">
      <div className="space-y-2">
        <h3 className="font-bold">1 · Physical receipt / အဝင်လက်ခံ</h3>
        <select className={input} value={kind} onChange={e=>setKind(e.target.value as any)}>
          <option value="EXISTING_WAY">Existing Way ID — inbound scan</option>
          <option value="TEMP_QR">Pickup temporary QR — no permanent Way ID</option>
        </select>
        <input className={input} value={reference} onChange={e=>setReference(e.target.value)}
          placeholder={kind==="EXISTING_WAY"?"Scan existing Way ID":"Scan Pickup temporary QR reference"}/>
        <input className={input} value={note} onChange={e=>setNote(e.target.value)} placeholder="Merchant / bag / condition note (optional)"/>
        {kind==="TEMP_QR"&&<p className="text-xs text-[#9bb7ce]">Generate the temporary QR through the existing Pickup process first. This action receives that identifier; it does not generate a permanent Way ID.</p>}
        <button type="button" className={btn} disabled={loading||isLocked||reference.trim().length<3}
          onClick={()=>void work("Branch receipt",()=> (supabase as any).rpc("be_branch_intake_register_v1",{
            p_branch:b,p_type:kind,p_reference:reference.trim(),p_note:note.trim()
          })).then(()=>{setReference("");setNote("");})}>Confirm physical receipt</button>
      </div>
      <div className="space-y-2">
        <h3 className="font-bold">2 · Evening bag / seal / manifest</h3>
        <input className={input} value={bag} onChange={e=>setBag(e.target.value)} placeholder="Bag code"/>
        <input className={input} value={seal} onChange={e=>setSeal(e.target.value)} placeholder="Seal code"/>
        <input className={input} value={vehicle} onChange={e=>setVehicle(e.target.value)} placeholder="Shuttle vehicle / trip reference"/>
        <button type="button" className={btn} disabled={loading||isLocked||selected.length===0||!bag.trim()||!seal.trim()||!vehicle.trim()}
          onClick={()=>void work("Evening manifest",()=> (supabase as any).rpc("be_branch_evening_manifest_prepare_v1",{
            p_branch:b,p_intake_ids:selected,p_bag_code:bag,p_seal_code:seal,p_vehicle_ref:vehicle
          })).then(()=>{setSelected([]);setBag("");setSeal("");setVehicle("");})}>
            Prepare evening manifest ({selected.length})
        </button>
      </div>
    </div>}
    {!isHeadOffice&&<div className="rounded-xl border border-[#365674] p-3">
      <h3 className="mb-2 font-bold">Received parcels — select for evening shuttle</h3>
      <div className="max-h-52 overflow-auto text-sm">
        {open.map(x=><label key={x.id} className="flex items-center gap-3 border-b border-[#365674]/40 px-2 py-2">
          <input type="checkbox" checked={selected.includes(x.id)}
            onChange={e=>setSelected(v=>e.target.checked?[...v,x.id]:v.filter(y=>y!==x.id))}/>
          <span className="font-mono">{x.parcel_reference}</span>
          <span className="ml-auto text-xs text-[#9bb7ce]">{x.intake_type}</span>
        </label>)}
        {!open.length&&<p className="text-[#9bb7ce]">No unmanifested intakes</p>}
      </div>
    </div>}
    <div className="grid gap-3 rounded-xl border border-[#365674] p-4 lg:grid-cols-2">
      <div className="space-y-2">
        <h3 className="flex items-center gap-2 font-bold"><Truck size={17}/>3 · Scan handover and HQ receipt</h3>
        <select className={input} value={manifestId} onChange={e=>setManifestId(e.target.value)}>
          <option value="">Select evening manifest</option>
          {manifests.map(x=><option key={x.id} value={x.id}>{date(x.created_at)} · {x.bag_code} / {x.seal_code} · {x.status}</option>)}
        </select>
        <input className={input} value={scanReference} onChange={e=>setScanReference(e.target.value)} placeholder="Scan exact Way ID or temporary QR reference"/>
        <button type="button" className={btn} disabled={loading||!manifestId||!scanReference.trim()}
          onClick={()=>void work(isHeadOffice?"HQ receipt scan":"Shuttle load scan",()=> (supabase as any).rpc("be_branch_intake_scan_v1",{
            p_manifest_id:manifestId,p_reference:scanReference.trim(),p_event:isHeadOffice?"HQ_RECEIVE":"LOAD"
          })).then(()=>setScanReference(""))}>
          <ScanLine size={15} className="mr-1 inline"/>{isHeadOffice?"Confirm physical receipt at HQ":"Confirm loading at branch"}
        </button>
      </div>
      <div className="space-y-2">
        <h3 className="font-bold">Manifest reconciliation</h3>
        <p className="text-sm">Manifest: <b>{activeManifest?.status||"-"}</b></p>
        <p className="text-sm">Identifiers: {manifestItems.length} · Loaded: {loaded} · HQ received: {hqReceived}</p>
        <p className="text-sm">Unreceived: {Math.max(0,manifestItems.length-hqReceived)}</p>
        <div className="max-h-32 overflow-auto text-xs">{manifestItems.map(x=><div key={x.id} className="flex justify-between border-b border-[#365674]/40 py-1">
          <span className="font-mono">{x.parcel_reference}</span><span>{x.status}</span></div>)}</div>
      </div>
    </div>
    {isHeadOffice&&<div className="space-y-2 rounded-xl border border-[#365674] p-4">
      <h3 className="flex items-center gap-2 font-bold"><ArrowRight size={18}/>4 · HQ permanent Way ID linkage</h3>
      <p className="text-xs text-[#9bb7ce]">Only after physical HQ receipt and full HQ Data Entry. Link the existing temporary intake to the permanent Way ID; never re-register an existing Way ID.</p>
      <select className={input} value={linkIntakeId} onChange={e=>setLinkIntakeId(e.target.value)}>
        <option value="">Choose received temporary QR</option>
        {pending.map(x=><option key={x.id} value={x.id}>{x.parcel_reference}</option>)}
      </select>
      <input className={input} value={linkWay} onChange={e=>setLinkWay(e.target.value)} placeholder="Permanent Way ID generated by HQ"/>
      <button type="button" className={btn} disabled={loading||!linkIntakeId||!linkWay.trim()}
        onClick={()=>void work("HQ Way ID linkage",()=> (supabase as any).rpc("be_branch_temp_qr_link_way_v1",{
          p_intake_id:linkIntakeId,p_way_id:linkWay.trim()
        })).then(()=>{setLinkWay("");setLinkIntakeId("");})}>Link permanent Way ID</button>
    </div>}
    <p className="flex items-start gap-2 text-xs text-[#9bb7ce]"><ShieldAlert size={17} className="shrink-0"/>A manifest is not dispatch proof. Each physical parcel must receive a load scan and an HQ receipt scan. Discrepancies remain visible; no automatic custody or COD settlement is created.</p>
  </section>;
}
