// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { Archive, BookOpen, FileUp, Landmark, Plus, RefreshCw, Save, Search, Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const input="h-11 w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3 text-sm text-white outline-none focus:border-[#f6b84b]";
const money=(v:any)=>Number(v||0).toLocaleString()+" MMK";

function SearchMaster({kind,value,onSelect,placeholder}:{kind:string;value:any;onSelect:(r:any)=>void;placeholder:string}){
  const [q,setQ]=useState("");
  const [open,setOpen]=useState(false);
  const [rows,setRows]=useState<any[]>([]);
  async function load(search=q){
    const {data,error}=await (supabase as any).rpc("be_accounting_master_search_v1",{p_kind:kind,p_search:search.trim()||null,p_limit:150});
    if(!error&&data?.ok!==false)setRows(Array.isArray(data?.rows)?data.rows:[]);
  }
  useEffect(()=>{void load("")},[kind]);
  const label=value?(value.account_code?value.account_code+" — "+value.name_en+" / "+value.name_mm:value.journal_type?value.journal_type+" — "+value.name_en+" / "+value.name_mm:value.dimension_code+" — "+value.name_en+" / "+value.name_mm):"";
  return <div className="relative">
    <input value={open?q:label} onFocus={()=>{setOpen(true);setQ("");void load("")}} onChange={e=>{setOpen(true);setQ(e.target.value);void load(e.target.value)}} placeholder={placeholder} className={input}/>
    {open&&<div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[#1a3a5c] bg-[#071b2c] shadow-2xl">
      {rows.map((r:any)=><button key={r.account_code||r.journal_type||r.dimension_code} type="button" onClick={()=>{onSelect(r);setOpen(false);setQ("")}} className="block w-full border-b border-[#1a3a5c]/50 p-3 text-left hover:bg-[#0b2236]">
        <div className="font-mono text-xs font-black text-[#f6b84b]">{r.account_code||r.journal_type||r.dimension_code}</div>
        <div className="text-sm font-bold text-white">{r.name_en}</div><div className="text-xs text-[#8fb2c9]">{r.name_mm}</div>
      </button>)}
      {!rows.length&&<div className="p-4 text-sm text-[#6f91aa]">No matches.</div>}
    </div>}
  </div>
}

export default function AccountingMasterWorkspacePage(){
  const {profile}=useAuth();
  const role=String(profile?.role||"").toLowerCase().replaceAll("-","_");
  const canPost=["accountant","superadmin","super_admin","admin"].includes(role);
  const [tab,setTab]=useState("journal");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [history,setHistory]=useState<any[]>([]);

  const [journalType,setJournalType]=useState<any>(null);
  const [branch,setBranch]=useState<any>({dimension_code:"YGN",name_en:"Yangon",name_mm:"ရန်ကုန်"});
  const [department,setDepartment]=useState<any>(null);
  const [costCenter,setCostCenter]=useState<any>(null);
  const [reference,setReference]=useState("");
  const [journal,setJournal]=useState({date:new Date().toISOString().slice(0,10),merchant_code:"",way_id:"",waybill_no:"",rider_employee_code:"",description:"",source_module:"MANUAL_ACCOUNTING"});
  const [lines,setLines]=useState<any[]>([
    {account:null,debit:"",credit:"",description:""},
    {account:null,debit:"",credit:"",description:""}
  ]);
  const [evidenceFile,setEvidenceFile]=useState<File|null>(null);
  const [evidenceId,setEvidenceId]=useState("");
  const [draftId,setDraftId]=useState("");

  const [asset,setAsset]=useState({asset_code:"",asset_name:"",category:"VEHICLE",acquisition_date:new Date().toISOString().slice(0,10),acquisition_cost:"",residual_value:"0",useful_life_months:"60",department_code:"",branch_code:"YGN",supplier_reference:""});
  const [openItem,setOpenItem]=useState({item_type:"AR",counterparty_type:"MERCHANT",counterparty_code:"",counterparty_name:"",document_reference:"",journal_reference:"",account_code:"113001",offset_account_code:"411001",amount:"",outstanding_amount:"",due_date:"",branch_code:"YGN",department_code:"FIN",cost_center_code:"CC-YGN-FIN01",source_module:"ACCOUNTING",way_id:"",merchant_code:"",status:"OPEN"});
  const [openAccount,setOpenAccount]=useState<any>(null);
  const [openOffset,setOpenOffset]=useState<any>(null);

  const debit=useMemo(()=>lines.reduce((s,l)=>s+Number(l.debit||0),0),[lines]);
  const credit=useMemo(()=>lines.reduce((s,l)=>s+Number(l.credit||0),0),[lines]);
  const balanced=debit>0&&Math.abs(debit-credit)<0.01&&lines.every(l=>l.account&&(Number(l.debit||0)>0)!==(Number(l.credit||0)>0));

  async function loadHistory(){
    const {data,error}=await (supabase as any).rpc("be_accounting_manual_journal_snapshot_v1",{p_limit:100});
    if(!error&&data?.ok!==false)setHistory(Array.isArray(data?.rows)?data.rows:[]);
  }
  useEffect(()=>{void loadHistory()},[]);

  async function generateRef(){
    if(!journalType)return setMessage("Select Journal Type first.");
    const {data,error}=await (supabase as any).rpc("be_accounting_next_reference_v1",{p_journal_type:journalType.journal_type,p_branch:branch?.dimension_code||"YGN",p_date:journal.date});
    if(error||data?.ok===false)return setMessage(error?.message||data?.code||"Reference generation failed.");
    setReference(data.reference);setMessage("System-generated journal reference created.");
  }

  async function uploadEvidence(sourceReference=reference){
    if(!evidenceFile)return "";
    const safe=evidenceFile.name.replace(/[^A-Za-z0-9._-]+/g,"_");
    const path=(reference||"UNREFERENCED")+"/"+crypto.randomUUID()+"-"+safe;
    const up=await supabase.storage.from("accounting-evidence").upload(path,evidenceFile,{upsert:false,contentType:evidenceFile.type||undefined});
    if(up.error)throw up.error;
    const reg=await (supabase as any).rpc("be_accounting_evidence_register_v1",{p_payload:{source_module:journal.source_module,source_reference:sourceReference,journal_reference:reference||null,file_name:evidenceFile.name,mime_type:evidenceFile.type||null,storage_path:path,description:journal.description}});
    if(reg.error||reg.data?.ok===false)throw reg.error||new Error(reg.data?.code||"Evidence registration failed.");
    setEvidenceId(reg.data.id);return reg.data.id;
  }

  async function saveDraft(){
    if(!reference)return setMessage("Generate the system Journal Reference first.");
    if(!balanced)return setMessage("Journal must contain at least two valid lines and Total Debit must equal Total Credit.");
    setBusy(true);setMessage("");
    try{
      const eid=evidenceId||await uploadEvidence(reference);
      const {data,error}=await (supabase as any).rpc("be_accounting_manual_journal_save_v1",{p_payload:{
        id:draftId||null,journal_reference:reference,journal_type:journalType.journal_type,transaction_date:journal.date,
        branch_code:branch?.dimension_code||"YGN",department_code:department?.dimension_code||null,cost_center_code:costCenter?.dimension_code||null,
        merchant_code:journal.merchant_code||null,way_id:journal.way_id||null,waybill_no:journal.waybill_no||null,rider_employee_code:journal.rider_employee_code||null,
        source_module:journal.source_module,description:journal.description,evidence_id:eid||null,
        lines:lines.map(l=>({account_code:l.account.account_code,debit:Number(l.debit||0),credit:Number(l.credit||0),description:l.description||journal.description}))
      }});
      if(error||data?.ok===false)throw error||new Error(data?.code||"Draft save failed.");
      setDraftId(data.id);setMessage("Balanced journal saved as DRAFT. Maker-checker control applies before posting.");await loadHistory();
    }catch(e:any){setMessage(e?.message||"Draft save failed.");}
    finally{setBusy(false)}
  }

  async function postDraft(){
    if(!draftId)return setMessage("Save the journal as Draft first.");
    setBusy(true);
    const {data,error}=await (supabase as any).rpc("be_accounting_manual_journal_post_v1",{p_draft_id:draftId});
    if(error||data?.ok===false){setMessage(error?.message||data?.code||"Posting failed.");setBusy(false);return;}
    setMessage("Journal POSTED to General Ledger: "+data.journal_reference);setBusy(false);await loadHistory();
  }

  async function saveAsset(){
    setBusy(true);
    const {data,error}=await (supabase as any).rpc("be_accounting_register_asset_v1",{p_payload:asset});
    if(error||data?.ok===false)setMessage(error?.message||data?.code||"Asset save failed.");
    else setMessage("Asset "+data.asset_code+" registered in the fixed-asset backend.");
    setBusy(false);
  }

  async function saveOpenItem(){
    setBusy(true);
    const payload={...openItem,account_code:openAccount?.account_code||openItem.account_code,offset_account_code:openOffset?.account_code||openItem.offset_account_code,outstanding_amount:openItem.outstanding_amount||openItem.amount,evidence_id:evidenceId||null};
    const {data,error}=await (supabase as any).rpc("be_accounting_open_item_upsert_v1",{p_payload:payload});
    if(error||data?.ok===false)setMessage(error?.message||data?.code||"AR/AP save failed.");
    else setMessage((payload.item_type==="AR"?"Accounts Receivable":"Accounts Payable")+" item saved to Supabase.");
    setBusy(false);
  }

  const updateLine=(i:number,patch:any)=>setLines(x=>x.map((l,n)=>n===i?{...l,...patch}:l));

  return <div className="space-y-5 p-2 text-[#eef8ff]">
    <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div><div className="text-[11px] font-black uppercase tracking-[.23em] text-[#f6b84b]">ACCOUNTING MASTER & TRANSACTION WORKBENCH</div><h1 className="mt-2 text-3xl font-black">Bilingual Accounting Codes / စာရင်းအကောင့်ကုဒ်များ</h1><p className="mt-2 text-sm text-[#8fb2c9]">Search by account code, English keyword or Myanmar keyword. Journal References are server-generated; users do not type formats manually.</p></div><button onClick={()=>void loadHistory()} className="flex h-11 items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 font-black"><RefreshCw size={16}/>Refresh</button></div>
      {message&&<div className="mt-4 rounded-xl border border-[#1a3a5c] bg-[#061524] p-3 text-sm font-bold text-[#f6b84b]">{message}</div>}
    </section>

    <div className="flex flex-wrap gap-2 border-b border-[#1a3a5c] pb-3">
      {[["journal","Journal Entry / စာရင်းသွင်း"],["assets","Company Assets / ပိုင်ဆိုင်မှု"],["openitems","AR / AP"],["history","Journal Register"]].map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={"rounded-xl px-4 py-2.5 text-sm font-black "+(tab===id?"bg-[#f6b84b] text-[#061524]":"border border-[#1a3a5c] bg-[#0b2236]")}>{label}</button>)}
    </div>

    {tab==="journal"&&<div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
      <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5">
        <h2 className="flex items-center gap-2 font-black"><BookOpen size={18} className="text-[#38bdf8]"/>Accounting Entry / စာရင်းသွင်းခြင်း</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Transaction Date / ရက်စွဲ</span><input type="date" value={journal.date} onChange={e=>{setJournal({...journal,date:e.target.value});setReference("")}} className={input}/></label>
          <label className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Journal Type / စာရင်းအမျိုးအစား</span><SearchMaster kind="JOURNAL" value={journalType} onSelect={r=>{setJournalType(r);setReference("")}} placeholder="Type COD, cash, ငွေသား, JV..."/></label>
          <label className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Branch / ရုံးခွဲ</span><SearchMaster kind="BRANCH" value={branch} onSelect={r=>{setBranch(r);setReference("")}} placeholder="YGN / Yangon / ရန်ကုန်"/></label>
          <label className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Department / ဌာန</span><SearchMaster kind="DEPARTMENT" value={department} onSelect={setDepartment} placeholder="Finance / စာရင်း / OPS..."/></label>
          <label className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Cost Center / ကုန်ကျစရိတ်ဌာန</span><SearchMaster kind="COST_CENTER" value={costCenter} onSelect={setCostCenter} placeholder="Type cost center..."/></label>
          <div className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Journal Reference / စာရင်းရည်ညွှန်း</span><div className="flex gap-2"><input readOnly value={reference} placeholder="System generated" className={input}/><button type="button" onClick={()=>void generateRef()} className="rounded-xl bg-[#38bdf8] px-3 font-black text-[#061524]">Generate</button></div></div>
          {[["merchant_code","Merchant / Merchant"],["way_id","Way ID"],["waybill_no","Waybill"],["rider_employee_code","Rider / Employee"],["source_module","Source Module"]].map(([k,l])=><label key={k} className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">{l}</span><input value={journal[k]} onChange={e=>setJournal({...journal,[k]:e.target.value})} className={input}/></label>)}
          <label className="md:col-span-3 text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Description / အကြောင်းအရာ</span><input value={journal.description} onChange={e=>setJournal({...journal,description:e.target.value})} className={input}/></label>
        </div>

        <div className="mt-5 space-y-3"><div className="flex items-center justify-between"><h3 className="font-black">Journal Lines / စာရင်းလိုင်းများ</h3><button onClick={()=>setLines([...lines,{account:null,debit:"",credit:"",description:""}])} className="flex h-9 items-center gap-1 rounded-lg border border-[#1a3a5c] px-3 text-xs font-black"><Plus size={14}/>Add Line</button></div>
          {lines.map((l,i)=><div key={i} className="grid gap-2 rounded-2xl border border-[#1a3a5c] bg-[#061524] p-3 md:grid-cols-[2fr_1fr_1fr_2fr_auto]">
            <SearchMaster kind="ACCOUNT" value={l.account} onSelect={r=>updateLine(i,{account:r})} placeholder="Type 111, cash, ငွေသား, merchant, rider..."/>
            <input type="number" min="0" placeholder="Debit" value={l.debit} onChange={e=>updateLine(i,{debit:e.target.value,credit:e.target.value?"" : l.credit})} className={input}/>
            <input type="number" min="0" placeholder="Credit" value={l.credit} onChange={e=>updateLine(i,{credit:e.target.value,debit:e.target.value?"" : l.debit})} className={input}/>
            <input placeholder="Line description" value={l.description} onChange={e=>updateLine(i,{description:e.target.value})} className={input}/>
            <button onClick={()=>setLines(lines.filter((_,n)=>n!==i))} disabled={lines.length<=2} className="h-11 rounded-xl border border-rose-500/30 px-3 text-rose-300 disabled:opacity-30"><Trash2 size={15}/></button>
          </div>)}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3"><div className="rounded-xl bg-[#061524] p-3"><div className="text-xs text-[#8fb2c9]">Total Debit</div><div className="font-black text-emerald-300">{money(debit)}</div></div><div className="rounded-xl bg-[#061524] p-3"><div className="text-xs text-[#8fb2c9]">Total Credit</div><div className="font-black text-emerald-300">{money(credit)}</div></div><div className="rounded-xl bg-[#061524] p-3"><div className="text-xs text-[#8fb2c9]">Balance Status</div><div className={"font-black "+(balanced?"text-emerald-300":"text-rose-300")}>{balanced?"BALANCED":"NOT BALANCED"}</div></div></div>
        <label className="mt-4 block text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Attachment / Evidence / ပူးတွဲစာရွက်စာတမ်း</span><input type="file" accept="image/*,.pdf" onChange={e=>setEvidenceFile(e.target.files?.[0]||null)} className="w-full rounded-xl border border-[#1a3a5c] bg-[#061524] p-3"/></label>
        <div className="mt-4 flex flex-wrap gap-2"><button onClick={()=>void saveDraft()} disabled={busy||!balanced||!reference} className="flex h-11 items-center gap-2 rounded-xl bg-[#f6b84b] px-5 font-black text-[#061524] disabled:opacity-40"><Save size={16}/>Save Draft</button>{canPost&&<button onClick={()=>void postDraft()} disabled={busy||!draftId} className="flex h-11 items-center gap-2 rounded-xl bg-emerald-500 px-5 font-black text-[#061524] disabled:opacity-40"><Send size={16}/>Approve & Post</button>}</div>
      </section>
      <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5"><h2 className="font-black">Input Principle</h2><div className="mt-4 space-y-2 text-sm text-[#9cc2d9]"><div className="rounded-xl bg-[#061524] p-3">Type <b>cash</b>, <b>ငွေသား</b>, or <b>111</b> to find cash accounts.</div><div className="rounded-xl bg-[#061524] p-3">Type <b>merchant</b> to find Merchant AR, Advances and Payables.</div><div className="rounded-xl bg-[#061524] p-3">Journal number is read-only and generated as <b>TYPE-YYYYMMDD-BRANCH-SEQUENCE</b>.</div><div className="rounded-xl bg-[#061524] p-3">Attachments are stored in the private Accounting Evidence vault.</div><div className="rounded-xl bg-[#061524] p-3">Non-Superadmin makers cannot post their own draft; maker-checker is enforced in Supabase.</div></div></section>
    </div>}

    {tab==="assets"&&<section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5"><h2 className="flex items-center gap-2 font-black"><Landmark size={18} className="text-[#38bdf8]"/>Company Asset Register / ကုမ္ပဏီပိုင်ဆိုင်မှု</h2><div className="mt-4 grid gap-3 md:grid-cols-3">{[["asset_code","Asset Code"],["asset_name","Asset Name"],["category","Category"],["acquisition_date","Acquisition Date"],["acquisition_cost","Acquisition Cost"],["residual_value","Residual Value"],["useful_life_months","Useful Life (Months)"],["department_code","Department"],["branch_code","Branch"],["supplier_reference","Supplier / Invoice Reference"]].map(([k,l])=><label key={k} className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">{l}</span><input type={k==="acquisition_date"?"date":k.includes("cost")||k.includes("value")||k.includes("months")?"number":"text"} value={asset[k]} onChange={e=>setAsset({...asset,[k]:e.target.value})} className={input}/></label>)}</div><button onClick={()=>void saveAsset()} disabled={busy||!asset.asset_code||!asset.asset_name||!asset.acquisition_cost} className="mt-4 flex h-11 items-center gap-2 rounded-xl bg-[#f6b84b] px-5 font-black text-[#061524] disabled:opacity-40"><Archive size={16}/>Save Asset to Supabase</button></section>}

    {tab==="openitems"&&<section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5"><h2 className="font-black">Accounts Receivable / Payable</h2><div className="mt-4 grid gap-3 md:grid-cols-3">
      <label className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Type</span><select value={openItem.item_type} onChange={e=>{const type=e.target.value;setOpenItem({...openItem,item_type:type,account_code:type==="AR"?"113001":"211001"});setOpenAccount(null)}} className={input}><option value="AR">Accounts Receivable / ရရန်</option><option value="AP">Accounts Payable / ပေးရန်</option></select></label>
      {[["counterparty_type","Counterparty Type"],["counterparty_code","Counterparty Code"],["counterparty_name","Counterparty Name"],["document_reference","Invoice / Document Reference"],["journal_reference","Journal Reference"],["amount","Amount"],["due_date","Due Date"],["branch_code","Branch"],["department_code","Department"],["cost_center_code","Cost Center"],["way_id","Way ID"],["merchant_code","Merchant Code"]].map(([k,l])=><label key={k} className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">{l}</span><input type={k==="amount"?"number":k==="due_date"?"date":"text"} value={openItem[k]} onChange={e=>setOpenItem({...openItem,[k]:e.target.value})} className={input}/></label>)}
      <label className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">AR / AP Account</span><SearchMaster kind="ACCOUNT" value={openAccount} onSelect={r=>{setOpenAccount(r);setOpenItem({...openItem,account_code:r.account_code})}} placeholder="Type merchant, payable, receivable..."/></label>
      <label className="text-xs font-bold text-[#9cc2d9]"><span className="mb-1 block">Offset Account</span><SearchMaster kind="ACCOUNT" value={openOffset} onSelect={r=>{setOpenOffset(r);setOpenItem({...openItem,offset_account_code:r.account_code})}} placeholder="Type revenue / expense account..."/></label>
    </div><button onClick={()=>void saveOpenItem()} disabled={busy||!openItem.counterparty_name||!openItem.amount} className="mt-4 flex h-11 items-center gap-2 rounded-xl bg-[#38bdf8] px-5 font-black text-[#061524] disabled:opacity-40"><Save size={16}/>Save {openItem.item_type}</button></section>}

    {tab==="history"&&<section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-5"><h2 className="font-black">Manual Journal Register</h2><div className="mt-4 max-h-[700px] overflow-auto"><table className="w-full min-w-[1100px] text-left text-xs"><thead className="sticky top-0 bg-[#061524] text-[#8fb2c9]"><tr><th className="p-3">Date</th><th>Journal Ref</th><th>Type</th><th>Description</th><th>Branch</th><th>Status</th><th>Created</th><th>Posted</th></tr></thead><tbody>{history.map((r:any)=><tr key={r.id} className="border-t border-[#1a3a5c]/60"><td className="p-3">{r.transaction_date}</td><td className="font-mono font-black text-[#38bdf8]">{r.journal_reference}</td><td>{r.journal_type}</td><td>{r.description||"-"}</td><td>{r.branch_code}</td><td>{r.status}</td><td>{r.created_at?new Date(r.created_at).toLocaleString():"-"}</td><td>{r.posted_at?new Date(r.posted_at).toLocaleString():"-"}</td></tr>)}</tbody></table>{!history.length&&<div className="p-10 text-center text-[#6f91aa]">No manual journal records.</div>}</div></section>}
  </div>;
}
