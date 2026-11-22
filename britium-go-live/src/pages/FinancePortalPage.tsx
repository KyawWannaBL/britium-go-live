import {useEffect,useRef,useState,type KeyboardEvent} from "react";
import {useSearchParams} from "react-router-dom";
import {
 LayoutDashboard,WalletCards,ClipboardCheck,FileCheck2,FileBarChart2,
 Building2,SlidersHorizontal,ArrowRight,ShieldCheck,CalendarRange,
 CheckCircle2,Search,BookOpen,ChevronDown,ArrowUpRight,RefreshCw,AlertTriangle
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

const MYANMAR_TRANSLATIONS:Record<string,string> = {"Overview":"ခြုံငုံကြည့်ရှုမှု","Cashier Intake":"ငွေလက်ခံမှတ်တမ်း","Field Settlement":"ဝန်ထမ်းငွေရှင်း","COD Review":"COD စိစစ်ခြင်း","Reports & Audit":"အစီရင်ခံစာနှင့် စာရင်းစစ်","Branch Finance":"ရုံးခွဲငွေကြေး","Controls & Reviews":"ထိန်းချုပ်မှုနှင့် စိစစ်ခြင်း","See today's money, Wayplans and live field-collection health.":"ယနေ့ ငွေကြေးနှင့် Wayplan ကောက်ခံမှု အခြေအနေ","Register verified cash receipts and compare each Way ID with Data Entry.":"အမှန်တကယ် လက်ခံငွေကို မှတ်တမ်းတင်၍ Way ID နှင့် နှိုင်းယှဉ်ပါ","Review Wayplan team signatures and complete authorized settlement.":"အဖွဲ့လက်မှတ်များစစ်ပြီး ငွေရှင်းမှုကို အတည်ပြုပါ","Filter the Way-level COD queue, resolve exceptions and export selected rows.":"COD ကွာခြားချက်များ စစ်ဆေးပြီး စာရင်းထုတ်ယူပါ","Choose report basis, timeline, worker and exception; generate Excel or PDF.":"ရက်စွဲ၊ ဝန်ထမ်းနှင့် အခြေအနေစစ်ထုတ်၍ PDF သို့ Excel ထုတ်ပါ","Inspect branch cash reports, exceptions and approvals.":"ရုံးခွဲငွေကြေးစာရင်းနှင့် ခွင့်ပြုချက်များ စစ်ပါ","Review weight amendments and corporate tariff finance approvals.":"အလေးချိန်ပြင်ဆင်ချက်နှင့် နှုန်းထားခွင့်ပြုချက်များ စစ်ပါ","Review live position":"လက်ရှိအခြေအနေကြည့်ရန်","Record actual receipt":"ငွေလက်ခံမှတ်ရန်","Sign and clear":"လက်မှတ်ထိုး၍ အတည်ပြုရန်","Review Way-level COD":"Way ID အလိုက် COD စစ်ရန်","Generate filtered report":"စစ်ထုတ်အစီရင်ခံစာထုတ်ရန်","Inspect branch position":"ရုံးခွဲအခြေအနေစစ်ရန်","Review special requests":"အထူးတောင်းဆိုချက်များစစ်ရန်","Review":"စစ်ဆေးရန်","Register":"မှတ်တမ်းတင်ရန်","Approve":"အတည်ပြုရန်","Report":"အစီရင်ခံရန်","See source evidence":"အထောက်အထားကြည့်ရန်","Record actual receipts":"အမှန်တကယ်ငွေမှတ်ရန်","Complete authorized steps":"ခွင့်ပြုထားသောလုပ်ငန်းဆောင်ရွက်ရန်","Audit & export":"စာရင်းစစ်၍ ထုတ်ယူရန်","Start with verified sources":"စစ်ဆေးပြီး အချက်အလက်မှ စတင်ပါ","Record real cash custody":"အမှန်တကယ်လက်ခံငွေကို မှတ်ပါ","Finish accountable team settlement":"အဖွဲ့ငွေရှင်းမှု ပြီးစီးစေပါ","Resolve Way-level COD discrepancies":"Way ID အလိုက် COD ကွာခြားချက် ဖြေရှင်းပါ","Select the correct accounting date":"မှန်ကန်သော စာရင်းရက်စွဲကို ရွေးပါ","Inspect branch finance independently":"ရုံးခွဲငွေကြေးကို သီးခြားစစ်ပါ","Review controlled adjustments":"ပြင်ဆင်ချက်များကို စစ်ပါ","Register actual receipt":"ငွေလက်ခံမှတ်ရန်","Clear team settlement":"အဖွဲ့ငွေရှင်းမှု အတည်ပြုရန်","Review COD differences":"COD ကွာခြားချက်စစ်ရန်","Download daily report":"နေ့စဉ်အစီရင်ခံစာထုတ်ရန်","Way ID · amount · payment evidence":"Way ID · ငွေပမာဏ · အထောက်အထား","Signatures · Wayplan · authorization":"လက်မှတ် · Wayplan · ခွင့်ပြုချက်","Expected vs collected · exceptions":"မျှော်မှန်းငွေ · လက်ခံငွေ · ကွာခြားချက်","Date range · worker · PDF / Excel":"ရက်စွဲ · ဝန်ထမ်း · PDF / Excel","Review live collection indicators":"လက်ရှိ ကောက်ခံမှုစာရင်းကြည့်ပါ","Inspect Wayplan and team status":"Wayplan နှင့် အဖွဲ့အခြေအနေစစ်ပါ","Open the relevant workflow tab to act":"ဆောင်ရွက်ရန် သက်ဆိုင်ရာ tab ကို ဖွင့်ပါ","Filter by Myanmar business date and worker":"မြန်မာရက်စွဲနှင့် ဝန်ထမ်းအလိုက် စစ်ထုတ်ပါ","Select an original Way ID and verify the assigned team":"မူရင်း Way ID နှင့် တာဝန်ကျအဖွဲ့ စစ်ပါ","Enter actual MMK, payment type and independent receipt reference":"လက်ခံငွေ၊ ငွေပေးချေမှုအမျိုးအစားနှင့် ပြေစာအမှတ် ဖြည့်ပါ","Review the difference and register the cashier entry":"ကွာခြားချက်စစ်ပြီး ငွေလက်ခံမှတ်ပါ","Choose the settlement date":"ငွေရှင်းရက်ရွေးပါ","Check Rider / Driver / Helper electronic signatures":"Rider / Driver / Helper လက်မှတ်စစ်ပါ","Enter the Finance signer and sign":"ဘဏ္ဍာရေးလက်မှတ်ထိုးသူကို ထည့်ပါ","Clear only when every required check passes":"စစ်ဆေးချက်အားလုံးအောင်မြင်မှ အတည်ပြုပါ","Filter the COD queue by status, merchant or Way ID":"COD ကို အခြေအနေ၊ ကုန်သည်၊ Way ID ဖြင့်စစ်ထုတ်ပါ","Compare expected collection, recorded payment and evidence":"မျှော်မှန်းငွေ၊ မှတ်တမ်းငွေနှင့် အထောက်အထား နှိုင်းယှဉ်ပါ","Use Finance Review only with authorized evidence":"အထောက်အထားရှိမှ ဘဏ္ဍာရေးစိစစ်မှုလုပ်ပါ","Export the filtered queue as PDF or Excel":"စစ်ထုတ်စာရင်းကို PDF သို့မဟုတ် Excel ထုတ်ပါ","Use the Finance SETTLED date report for actual settlement posting days":"အမှန်တကယ် ငွေရှင်းစာရင်းသွင်းရက်အတွက် Finance SETTLED သုံးပါ","Use the Cashier / Wayplan report for dispatch-day accountability":"ပို့ဆောင်ရက်အတွက် Cashier / Wayplan အစီရင်ခံစာသုံးပါ","Set From and Through dates, then worker and discrepancy filters":"ရက်စွဲအပိုင်းအခြား၊ ဝန်ထမ်းနှင့် ကွာခြားချက် စစ်ထုတ်ပါ","Export Excel or open PDF / Print":"Excel ထုတ်ရန် သို့မဟုတ် PDF / Print ဖွင့်ရန်","Choose the operating branch":"ရုံးခွဲရွေးပါ","Check reported cash and outstanding expenses":"ငွေစာရင်းနှင့် ကျန်စရိတ်စစ်ပါ","Review funding and approvals":"ငွေကြေးနှင့် ခွင့်ပြုချက်စစ်ပါ","Record unresolved differences with supporting evidence":"မဖြေရှင်းရသေးသည့်ကွာခြားချက်ကို အထောက်အထားနှင့် မှတ်ပါ","Open an amendment or tariff request":"ပြင်ဆင်ချက် သို့မဟုတ် နှုန်းထားတောင်းဆိုချက် ဖွင့်ပါ","Check source values and supporting documentation":"မူရင်းတန်ဖိုးနှင့် စာရွက်စာတမ်းစစ်ပါ","Apply only authorized approval controls":"ခွင့်ပြုချက်ရှိမှ အတည်ပြုပါ","Return to Reports & Audit to confirm any financial effect":"ငွေကြေးသက်ရောက်မှုကို အစီရင်ခံစာတွင် ပြန်စစ်ပါ"};
export default function FinancePortalPage(){
 const [params,setParams]=useSearchParams();
 const active:FinanceTab=valid(params.get("tab"))?params.get("tab") as FinanceTab:"overview";
 const [showHelp,setShowHelp]=useState(false);
 const [language,setLanguage]=useState<"en"|"my">("en");
 const tr=(v:string)=>language==="my"?(MYANMAR_TRANSLATIONS[v]||v):v;
 useEffect(()=>{try{if(window.localStorage.getItem("britium-finance-language")==="my")setLanguage("my");}catch{}},[]);
 const changeLanguage=(next:"en"|"my")=>{setLanguage(next);try{window.localStorage.setItem("britium-finance-language",next);}catch{}};

 const [showActions,setShowActions]=useState(true);
 const [viewKey,setViewKey]=useState(0);
 const tabsRef=useRef<Array<HTMLButtonElement|null>>([]);
 const current=sections.find(s=>s.id===active)!;
 const Icon=current.icon;
 const setTab=(next:FinanceTab)=>{
  setParams(previous=>{const copy=new URLSearchParams(previous);copy.set("tab",next);return copy;},{replace:true});
 };
 useEffect(()=>{document.title="Finance Workspace | Britium Express";},[]);
 const onTabKey=(event:KeyboardEvent<HTMLButtonElement>,index:number)=>{
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
      <h1 className="text-2xl font-bold tracking-tight md:text-[32px]">{language==="my"?"ဘဏ္ဍာရေးလုပ်ငန်း":"Finance Operations"} <span className="font-normal text-slate-300">{language==="my"?"လုပ်ငန်းခွင်":"Workspace"}</span></h1>
      <p className="max-w-3xl text-sm leading-relaxed text-slate-300">
       {language==="my"?"ငွေလက်ခံမှု၊ COD၊ ဝန်ထမ်းငွေရှင်းမှု၊ ရုံးခွဲငွေကြေးနှင့် အစီရင်ခံစာများကို လုပ်ငန်းအလိုက် စီထားပါသည်။":"Cash custody, COD, team settlement, branch financial control and reports — organized by the action you need to complete."}
      </p>
     </div>
     <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400"/> Live financial sources</span>
      <div role="group" aria-label="Finance screen language" className="inline-flex items-center gap-1 rounded-xl border border-sky-300/25 bg-slate-900/50 p-1">
       <button type="button" lang="en" aria-pressed={language==="en"} onClick={()=>changeLanguage("en")} className={"rounded-lg px-3 py-2 text-xs font-bold transition-all duration-200 "+(language==="en"?"bg-sky-400 text-slate-950":"text-slate-200 hover:bg-white/10")}>English</button>
       <button type="button" lang="my" aria-pressed={language==="my"} onClick={()=>changeLanguage("my")} className={"rounded-lg px-3 py-2 text-xs font-bold transition-all duration-200 "+(language==="my"?"bg-sky-400 text-slate-950":"text-slate-200 hover:bg-white/10")}>မြန်မာ</button>
      </div>
      <button type="button" onClick={()=>setShowHelp(v=>!v)} aria-expanded={showHelp} className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"><BookOpen size={16}/> {language==="my"?"အသုံးပြုနည်း":"How to use"} <ChevronDown size={15} className={showHelp?"rotate-180 transition-transform":"transition-transform"}/></button>
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
      <div className="min-w-0"><div className="text-sm font-semibold">{tr(title)}</div><div className="truncate text-[11px] text-slate-400">{tr(sub)}</div></div>
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
      <span className="whitespace-nowrap"><span className="block text-[13px] font-semibold">{tr(section.label)}</span><span className="block text-[10px] text-slate-400">{section.mm}</span></span>
     </button>;
    })}
   </nav>
  </div>
  <div className="mx-auto max-w-[1800px] px-3 pt-5 md:px-7">
   <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700/70 bg-gradient-to-r from-[#102f49] to-[#0d253b] px-5 py-4">
    <div className="flex items-start gap-3">
     <div className="rounded-xl border border-white/10 bg-white/10 p-3" style={{color:current.color}}><Icon size={22}/></div>
     <div><div className="text-lg font-semibold">{tr(current.label)} <span className="text-sm font-normal text-slate-400">/ {current.mm}</span></div>
      <p className="max-w-2xl text-xs leading-relaxed text-slate-300">{tr(current.description)}</p>
     </div>
    </div>
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200">
     <CheckCircle2 size={15} className="text-emerald-300"/>{tr(current.action)}
    </span>
   </div>
   <section aria-label="Finance quick actions" className="mb-5 overflow-hidden rounded-2xl border border-slate-700/70 bg-[#10293e]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
     <div><h2 className="text-sm font-bold text-white">{language==="my"?"အမြန်လုပ်ဆောင်ရန်":"Quick actions"} <span className="ml-2 font-normal text-slate-400">/ Frequently used tasks</span></h2><p className="mt-1 text-xs text-slate-400">{language==="my"?"သက်ဆိုင်ရာလုပ်ငန်းကို ဖွင့်ရန် အောက်မှရွေးပါ။ Tab ပြောင်းရုံဖြင့် ငွေစာရင်းမတင်ပါ။":"Choose a task to open the existing source-backed workflow. No financial entry is submitted by navigation."}</p></div>
     <button type="button" onClick={()=>setShowActions(v=>!v)} aria-expanded={showActions} className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">{showActions?(language==="my"?"အမြန်လုပ်ဆောင်ချက်ဖျောက်ရန်":"Hide shortcuts"):(language==="my"?"အမြန်လုပ်ဆောင်ချက်ပြရန်":"Show shortcuts")}<ChevronDown size={14} className={showActions?"rotate-180 transition-transform":"transition-transform"}/></button>
    </div>
    {showActions&&<div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4">
     {([
      ["cashier","Register actual receipt","Way ID · amount · payment evidence",WalletCards,"#34d399"],
      ["field","Clear team settlement","Signatures · Wayplan · authorization",ClipboardCheck,"#fbbf24"],
      ["cod","Review COD differences","Expected vs collected · exceptions",AlertTriangle,"#a78bfa"],
      ["reports","Download daily report","Date range · worker · PDF / Excel",FileBarChart2,"#67e8f9"]
     ] as const).map(([tab,title,subtitle,QuickIcon,color])=><button key={tab} type="button" onClick={()=>setTab(tab)} className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.04] px-3 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
      <span className="rounded-lg p-2.5" style={{backgroundColor:color+"1c",color}}><QuickIcon size={19}/></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">{tr(title)}</span><span className="mt-1 block text-[11px] text-slate-400">{tr(subtitle)}</span></span>
      <ArrowUpRight size={15} className="shrink-0 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"/>
     </button>)}
    </div>}
   </section>
   <div className="mb-4 rounded-xl border border-sky-400/15 bg-[#0f2a41] px-4 py-3">
    <div className="flex flex-wrap items-center gap-3">
     <span className="flex items-center gap-2 text-xs font-semibold text-sky-300"><Search size={15}/> {language==="my"?"လုပ်ငန်းလမ်းညွှန်":"Workflow guide"}</span>
     <span className="text-sm font-medium text-white">{tr(guidance[active].headline)}</span>
     <span className="ml-auto text-[11px] text-slate-400">{tr(guidance[active].note)}</span>
    </div>
    <ol className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-300">
     {guidance[active].steps.map((step,i)=><li key={step} className="flex items-start gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-sky-400/30 text-[10px] text-sky-200">{i+1}</span><span>{tr(step)}</span></li>)}
    </ol>
   </div>
   {active==="reports"&&<div className="mb-4 grid gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/[.05] p-4 md:grid-cols-2">
    <div><div className="flex items-center gap-2 text-sm font-semibold text-cyan-200"><CalendarRange size={17}/> {language==="my"?"ငွေရှင်းစာရင်းသွင်းရက်":"Settlement posting date"}</div><p className="mt-1 text-xs leading-relaxed text-slate-300">{language==="my"?"Finance SETTLED ရက်စွဲအရ နေ့စဉ်၊ အပတ်စဉ်၊ သတ်မှတ်ကာလ အစီရင်ခံစာထုတ်ပါ။":"Use for daily, weekly or custom-period reports based on the Finance SETTLED timestamp. Set the date range within the report panel."}</p></div>
    <div><div className="flex items-center gap-2 text-sm font-semibold text-cyan-200"><RefreshCw size={17}/> {language==="my"?"ငွေလက်ခံ / ပို့ဆောင်တာဝန်ခံမှု":"Cashier / dispatch accountability"}</div><p className="mt-1 text-xs leading-relaxed text-slate-300">{language==="my"?"Wayplan အဖွဲ့၊ အမှန်တကယ်လက်ခံငွေနှင့် ပျောက်ဆုံးပြေစာများကို စစ်ပါ။ ဤရက်စွဲသည် စာရင်းသွင်းရက်နှင့် မတူပါ။":"Use for Wayplan-team matching, physically received amounts and missing receipts. It is a different date basis from settlement posting."}</p></div>
   </div>}
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
