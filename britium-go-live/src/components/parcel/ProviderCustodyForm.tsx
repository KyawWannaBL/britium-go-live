import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const input = { background: "#f8fafc", color: "#111827", padding: 9, borderRadius: 6, width: "100%", border: "1px solid #64748b" };

export default function ProviderCustodyForm() {
 const [providerCustodyEnabled,setProviderCustodyEnabled]=useState(false);
 useEffect(()=>{
  let active=true;
  void (async()=>{
   try{
    const {data,error}=await (supabase as any).rpc('be_provider_transfer_capabilities_v1');
    if(!active)return;
    setProviderCustodyEnabled(!error && data?.ok===true && data?.custody_enabled===true);
   }catch{if(active){setProviderCustodyEnabled(false);}}
  })();
  return()=>{active=false;};
 },[]);
 const [custodyInput,setCustodyInput]=useState({way:'',plan:'',provider:'',site:'',manifest:'',receiver:'',receipt:'',proof:''});
 const [custodyBusy,setCustodyBusy]=useState(false),[custodyResult,setCustodyResult]=useState('');
 const setCustodyField=(key:keyof typeof custodyInput,value:string)=>setCustodyInput(old=>({...old,[key]:value}));
 async function confirmProviderCustody(){
  if(!providerCustodyEnabled||custodyBusy)return;
  if(Object.values(custodyInput).some(v=>!v.trim())){setCustodyResult('All physical handover fields and evidence are mandatory.');return;}
  if(!window.confirm('Confirm actual physical provider receipt for '+custodyInput.way+'? This records custody, NOT customer delivery.'))return;
  setCustodyBusy(true);setCustodyResult('');
  try{
   const {data,error}=await (supabase as any).rpc('be_provider_transfer_confirm_handover_v1',{
     p_way_id:custodyInput.way,p_wayplan_id:custodyInput.plan,
     p_provider_code:custodyInput.provider,p_location_code:custodyInput.site,
     p_manifest_ref:custodyInput.manifest,p_receiver_name:custodyInput.receiver,
     p_provider_receipt_ref:custodyInput.receipt,p_proof_reference:custodyInput.proof
   });
   if(error||data?.ok!==true)throw new Error(error?.message||data?.error||'Custody confirmation rejected');
   setCustodyResult('Provider custody recorded for '+data.delivery_way_id+
      '. Customer delivery and COD settlement remain separate.');
   setCustodyInput({way:'',plan:'',provider:'',site:'',manifest:'',receiver:'',receipt:'',proof:''});
  }catch(err:any){setCustodyResult('Custody was NOT recorded: '+(err?.message||'Unexpected error'));}
  finally{setCustodyBusy(false);}
 }
 return <section aria-label="Physical provider custody verification" style={{border:'1px solid #486a88',borderRadius:8,padding:12,margin:'12px 0'}}>
   <h2 style={{fontSize:17,fontWeight:700}}>Provider physical handover / ပြင်ပပို့ဆောင်ရေး လက်ခံလွှဲပြောင်းမှု</h2>
   {!providerCustodyEnabled ? <p style={{color:'#fbbf24',marginTop:6}}>Physical custody confirmation is disabled until the approved backend migration, site verification, and dispatch-scan UAT pass. Existing CS delivery confirmation remains separate.</p> : <>
    <p style={{color:'#fcd58c',fontSize:13}}>Record only after Supervisor DISPATCH_READY, a genuine Way ID dispatch scan, and a signed provider receipt. This does NOT mark customer delivery or settle COD.</p>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:8,marginTop:9}}>
     {([
       ['way','Delivery Way ID'],['plan','Transfer Wayplan ID'],
       ['provider','Provider Code'],['site','Approved Site Code'],
       ['manifest','Manifest Reference'],['receiver','Physical Receiver Name'],
       ['receipt','Signed Provider Receipt Reference'],['proof','Evidence / Photo Reference']
      ] as [keyof typeof custodyInput,string][]).map(([key,label])=>
       <label key={key} style={{fontSize:12}}>{label}
        <input value={custodyInput[key]} onChange={e=>setCustodyField(key,e.target.value)} aria-label={label} style={{...input,marginTop:4}}/>
       </label>)}
    </div>
    <button type="button" disabled={custodyBusy} onClick={()=>void confirmProviderCustody()} style={{background:'#0e7490',color:'#fff',padding:'9px 14px',borderRadius:6,marginTop:10}}>
      {custodyBusy?'Confirming...':'Confirm physical provider custody'}
    </button>
    {custodyResult&&<p role="status" style={{color:'#fcd58c',marginTop:8}}>{custodyResult}</p>}
   </>}
  </section>;
}
