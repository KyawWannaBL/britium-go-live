import {useEffect,useRef,useState} from "react";
import {useSearchParams} from "react-router-dom";
import {
 LayoutDashboard,WalletCards,ClipboardCheck,FileCheck2,FileBarChart2,
 Building2,SlidersHorizontal,ArrowRight,ShieldCheck,CalendarRange,
 CheckCircle2,Search,BookOpen,ChevronDown,RefreshCcw
} from "lucide-react";
import {FinancePortalLivePage} from "./EnterpriseLiveCenterPages";
import BranchFinanceOversight from "@/components/finance/BranchFinanceOversight";
import {CorporateFinanceReviewPanel} from "@/components/tariff/CorporateTariffPanel";
import RiderWeightAmendmentReviews from "@/components/finance/RiderWeightAmendmentReviews";
import DailyCashierSettlementPanel from "@/components/finance/DailyCashierSettlementPanel";
import FinanceSettlementDayEvents from "@/components/finance/FinanceSettlementDayEvents";

const sections=[
 {id:"overview",label:"Overview",mm:"ခြုံငုံကြည့်ရှုမှု",icon:LayoutDashboard,color:"#38bdf8",description:"See today's money, Wayplans and live field-collection health.",action:"Review live position"},
 {id:"cashier",label:"Cashier Intake",mm:"ငွေလက်ခံမှတ်တမ်း",icon:WalletCards,color:"#34d399",description:"Register verified cash receipts and compare each Way ID with Data Entry.",action:"Record actual receipt"},
 {id:"field",label:"Field Settlement",mm:"တာဝန်ကျဝန်ထမ်း ငွေရှင်း",icon:ClipboardCheck,color:"#fbbf24",description:"Review Wayplan team signatures and complete authorized settlement.",action:"Sign and clear"},
 {id:"cod",label:"COD Review",mm:"COD စိစစ်ခြင်း",icon:FileCheck2,color:"#a78bfa",description:"Filter the Way-level COD queue, resolve exceptions and export selected rows.",action:"Review Way-level COD"},
 {id:"reports",label:"Reports & Audit",mm:"အစီရင်ခံစာများ",icon:FileBarChart2,color:"#67e8f9",description:"Choose report basis, timeline, worker and exception; generate Excel or PDF.",action:"Generate filtered report"},
 {id:"branches",label:"Branch Finance",mm:"ရုံးခွဲ ငွေကြေး",icon:Building2,color:"#fb923c",description:"Inspect branch cash reports, exceptions and approvals.",action:"Inspect branch position"},
 {id:"controls",label:"Controls & Reviews",mm:"ပြင်ဆင်/အတည်ပြုခြင်း",icon:SlidersHorizontal,color:"#f472b6",description:"Review weight amendments and corporate tariff finance approvals.",action:"Review special requests"},
] as const;
type FinanceTab=typeof sections[number]["id"];
const valid=(v:string|null):v is FinanceTab=>sections.some(s=>s.id===v);
const guidance:Record<FinanceTab,{headline:string;steps:string[];note:string}>={
 overview:{headline:"Start with verified sources",steps:["Review live collection indicators","Inspect Wayplan and team status","Open the relevant workflow tab to act"],note:"An amount shown in the overview is not, by itself, evidence of bank receipt."},
 cashier:{headline:"Record real cash custody",steps:["Filter by Myanmar business date and worker","Select an original Way ID and verify the assigned team","Enter actual MMK, payment type and independent receipt reference","Review the difference and register the cashier entry"],note:"A cashier receipt never automatically marks COD SETTLED or the parcel DELIVERED."},
 field:{headline:"Finish accountable team settlement",steps:["Choose the settlement date","Check Rider / Driver / Helper electronic signatures","Enter the Finance signer and sign","Clear only when every required check passes"],note:"Settlement clearance is a controlled operation; it cannot substitute for physical delivery proof."},
 cod:{headline:"Resolve Way-level COD discrepancies",steps:["Filter the COD queue by status, merchant or Way ID","Compare expected collection, recorded payment and evidence","Use Finance Review only with authorized evidence","Export the filtered queue as PDF or Excel"],note:"Exports represent the currently loaded and filtered COD queue; confirm the count before using."},
 reports:{headline:"Select the correct accounting date",steps:["Use the Finance SETTLED date report for actual settlement posting days","Use the Cashier / Wayplan report for dispatch-day accountability","Set From and Through dates, then worker and discrepancy filters","Export Excel or open PDF / Print"],note:"These date bases are deliberately separate; matching the wrong dates can create false discrepancies."},
 branches:{headline:"Inspect branch finance independently",steps:["Choose the operating branch","Check reported cash and outstanding expenses","Review funding and approvals","Record unresolved differences with supporting evidence"],note:"A branch report is not a replacement for central COD reconciliation."},
 controls:{headline:"Review controlled adjustments",steps:["Open an amendment or tariff request","Check source values and supporting documentation","Apply only authorized approval controls","Return to Reports & Audit to confirm any financial effect"],note:"Review actions must preserve auditable original Way ID and original charge."}
};

export default function FinancePortalPage(){
 const [params,setParams]=useSearchParams();
 const active:FinanceTab=valid(params.get("tab"))?params.get("tab") as FinanceTab:"overview";
 const [showHelp,setShowHelp]=useState(false);
 const [viewKey,setViewKey]=useState(0);
 const tabsRef=useRef<Array<HTMLButtonElement|null>>([]);
 const current=sections.find(s=>s.id===active)!;
 const Icon=current.icon;
 const setTab=(next:FinanceTab)=>{
  setParams(previous=>{const copy=new URLSearchParams(previous);copy.set("tab",next);return copy;},{replace:true});
 };
 useEffect(()=>{document.title="Finance Workspace | Britium Express";},[]);
 const onTabKey=(event:React.KeyboardEvent<HTMLButtonElement>,index:number)=>{
  if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
  event.preventDefault();
  const n=event.key==="Home"?0:event.key==="End"?sections.length-1:
   (index+(event.key==="ArrowRight"?1:-1)+sections.length)%sections.length;
  setTab(sections[n].id);
  requestAnimationFrame(()=>tabsRef.current[n]?.focus());
 };
 return <main className="min-h-screen bg-[#071827] pb-12 text-slate-100">
  <div className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-[#09263f] via-[#0b2336] to-[#071827]">
   <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl"/>
   <div aria-hidden="true" className="pointer-events-none absolute bottom-[-100px] left-1/3 h-60 w-60 rounded-full bg-amber-400/10 blur-3xl"/>
   <div className="relative mx-auto max-w-[1800px] px-4 pb-6 pt-7 md:px-7">
    <div className="flex flex-wrap items-start justify-between gap-5">
     <div className="space-y-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.22em] text-sky-300">
       <ShieldCheck size={15}/> Britium Express <span className="text-slate-500">/</span> Enterprise Finance
      </div>
      <h1 className="text-2xl font-bold tracking-tight md:text-[32px]">Finance Operations <span className="font-normal text-slate-300">Workspace</span></h1>
      <p className="max-w-3xl text-sm leading-relaxed text-slate-300">
       Cash custody, COD, team settlement, branch financial control and reports — organized by the action you need to complete.
      </p>
     </div>
     <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400"/> Live financial sources</span>
      <button type="button" onClick={()=>setShowHelp(v=>!v)} aria-expanded={showHelp} className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"><BookOpen size={16}/> How to use <ChevronDown size={15} className={showHelp?"rotate-180 transition-transform":"transition-transform"}/></button>
     </div>
    </div>
    <div className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
     {[
      ["01","Review","See source evidence"],
      ["02","Register","Record actual receipts"],
      ["03","Approve","Complete authorized steps"],
      ["04","Report","Audit & export"]
     ].map(([number,title,sub],i)=><div key={number} className="flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-white/[.045] px-3 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-300/10 text-xs font-bold text-sky-200">{number}</span>
      <div className="min-w-0"><div className="text-sm font-semibold">{title}</div><div className="truncate text-[11px] text-slate-400">{sub}</div></div>
      {i<3&&<ArrowRight className="ml-auto hidden shrink-0 text-slate-500 xl:block" size={15}/>}
     </div>)}
    </div>
    {showHelp&&<div className="mt-4 rounded-xl border border-sky-400/20 bg-sky-400/[.07] p-4 text-sm text-slate-200 transition-all duration-300">
     <div className="flex items-start gap-2"><BookOpen className="mt-0.5 shrink-0 text-sky-300" size={18}/>
      <div><strong className="text-white">Working method / အသုံးပြုနည်း</strong>
       <p className="mt-1 leading-relaxed">Choose a workflow below; read its three-line guidance; select an original Way ID and appropriate date; verify differences and supporting evidence before approving. Reports may be printed or downloaded using the buttons inside their respective tab. Changing tabs does not submit a form.</p>
      </div>
     </div>
    </div>}
   </div>
  </div>
  <div className="sticky top-0 z-20 border-b border-slate-700/60 bg-[#0b2235]/95 shadow-lg shadow-black/10 backdrop-blur-xl">
   <nav role="tablist" aria-label="Finance workflow sections" className="mx-auto flex max-w-[1800px] gap-1 overflow-x-auto px-3 py-2 md:px-7">
    {sections.map((section,index)=>{
     const TabIcon=section.icon;
     const selected=section.id===active;
     return <button key={section.id} id={"finance-tab-"+section.id} ref={el=>{tabsRef.current[index]=el;}} role="tab" aria-selected={selected} aria-controls={"finance-panel-"+section.id} tabIndex={selected?0:-1}
      onClick={()=>setTab(section.id)} onKeyDown={e=>onTabKey(e,index)} type="button"
      style={{borderBottomColor:selected?section.color:"transparent",color:selected?section.color:undefined}}
      className={"group relative flex shrink-0 items-center gap-2 rounded-t-xl border-b-[3px] px-4 py-3 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 "+(selected?"bg-white/10 shadow-inner":"text-slate-300 hover:bg-white/5 hover:text-white")}>
      <TabIcon size={18} className={selected?"":"transition-transform duration-200 group-hover:-translate-y-0.5"}/>
      <span className="whitespace-nowrap"><span className="block text-[13px] font-semibold">{section.label}</span><span className="block text-[10px] text-slate-400">{section.mm}</span></span>
     </button>;
    })}
   </nav>
  </div>
  <div className="mx-auto max-w-[1800px] px-3 pt-5 md:px-7">
   <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700/70 bg-gradient-to-r from-[#102f49] to-[#0d253b] px-5 py-4">
    <div className="flex items-start gap-3">
     <div className="rounded-xl border border-white/10 bg-white/10 p-3" style={{color:current.color}}><Icon size={22}/></div>
     <div><div className="text-lg font-semibold">{current.label} <span className="text-sm font-normal text-slate-400">/ {current.mm}</span></div>
      <p className="max-w-2xl text-xs leading-relaxed text-slate-300">{current.description}</p>
     </div>
    </div>
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200">
     <CheckCircle2 size={15} className="text-emerald-300"/>{current.action}
    </span>
   </div>
   <div className="mb-4 rounded-xl border border-sky-400/15 bg-[#0f2a41] px-4 py-3">
    <div className="flex flex-wrap items-center gap-3">
     <span className="flex items-center gap-2 text-xs font-semibold text-sky-300"><Search size={15}/> Workflow guide</span>
     <span className="text-sm font-medium text-white">{guidance[active].headline}</span>
     <span className="ml-auto text-[11px] text-slate-400">{guidance[active].note}</span>
    </div>
    <ol className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-300">
     {guidance[active].steps.map((step,i)=><li key={step} className="flex items-start gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-sky-400/30 text-[10px] text-sky-200">{i+1}</span><span>{step}</span></li>)}
    </ol>
   </div>
   <div id={"finance-panel-"+active} role="tabpanel" aria-labelledby={"finance-tab-"+active} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
    {active==="overview"&&<FinancePortalLivePage section="overview"/>}
    {active==="cashier"&&<DailyCashierSettlementPanel mode="finance"/>}
    {active==="field"&&<FinancePortalLivePage section="wayplans"/>}
    {active==="cod"&&<FinancePortalLivePage section="cod"/>}
    {active==="reports"&&<div className="space-y-5"><FinanceSettlementDayEvents/><DailyCashierSettlementPanel mode="finance" readOnly/></div>}
    {active==="branches"&&<BranchFinanceOversight/>}
    {active==="controls"&&<div className="space-y-5"><RiderWeightAmendmentReviews/><CorporateFinanceReviewPanel/></div>}
   </div>
   <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/70 bg-[#10293e] px-4 py-3 text-xs text-slate-400">
    <span className="flex items-center gap-2"><ShieldCheck size={15} className="text-emerald-300"/> Records are source-backed; Finance SETTLED does not prove physical custody.</span>
    <span className="flex items-center gap-2"><CalendarRange size={15}/> Myanmar business day • UTC+06:30</span>
   </div>
  </div>
 </main>;
}
