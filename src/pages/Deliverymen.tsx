

import React, { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Bell,
  CalendarClock,
  Camera,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  FileText,
  Flag,
  Headphones,
  History,
  Home,
  Inbox,
  Loader2,
  MapPinned,
  Package2,
  Phone,
  QrCode,
  Route,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Truck,
  Upload,
  User,
  Wallet,
  XCircle,
} from "lucide-react";

type Bi = { en: string; my: string };
type LanguageMode = "en" | "my" | "both";
type AsyncState = "ready" | "loading" | "empty" | "error";
type Tone = "blue" | "amber" | "green" | "rose" | "violet" | "slate";
type TabKey =
  | "dashboard"
  | "jobs"
  | "active"
  | "route"
  | "pickup"
  | "delivery"
  | "cod"
  | "earnings"
  | "history"
  | "support"
  | "profile"
  | "notifications";

type JobStatus =
  | "Assigned"
  | "Accepted"
  | "Heading to Pickup"
  | "Picked Up"
  | "At Hub"
  | "Out for Delivery"
  | "Delivered"
  | "Failed"
  | "Returned";

type RiderJob = {
  id: string;
  trackingNo: string;
  merchant: string;
  receiver: string;
  phone: string;
  pickupAddress: string;
  deliveryAddress: string;
  township: string;
  parcelCount: number;
  codAmount: number;
  serviceType: string;
  status: JobStatus;
  eta: string;
  distanceKm: number;
  note: string;
  proofStatus: Bi;
  timeline: Array<{ label: Bi; time: string; done: boolean }>;
};

type CashRecord = {
  id: string;
  trackingNo: string;
  collectedAt: string;
  receiver: string;
  codAmount: number;
  handoverStatus: Bi;
  settlementRef: string;
};

type EarningRecord = {
  id: string;
  date: string;
  completedTrips: number;
  basePay: number;
  bonus: number;
  deduction: number;
  net: number;
};

type NotificationItem = {
  id: string;
  title: Bi;
  body: Bi;
  time: string;
  unread: boolean;
  tone: Tone;
};

const BI = (en: string, my: string): Bi => ({ en, my });

const tabs: Array<{ id: TabKey; label: Bi; icon: React.ComponentType<{ size?: string | number; className?: string }> }> = [
  { id: "dashboard", label: BI("Dashboard", "ပင်မအနှစ်ချုပ်"), icon: Home },
  { id: "jobs", label: BI("Assigned Jobs", "တာဝန်ပေးထားသောအလုပ်များ"), icon: Package2 },
  { id: "active", label: BI("Active Delivery", "လက်ရှိပို့ဆောင်မှု"), icon: Truck },
  { id: "route", label: BI("Route & Stops", "လမ်းကြောင်းနှင့် stop များ"), icon: Route },
  { id: "pickup", label: BI("Pickup Proof", "pickup အထောက်အထား"), icon: ClipboardCheck },
  { id: "delivery", label: BI("Delivery Proof", "delivery အထောက်အထား"), icon: Camera },
  { id: "cod", label: BI("COD Handover", "COD လွှဲပြောင်းမှု"), icon: Wallet },
  { id: "earnings", label: BI("Earnings", "ဝင်ငွေ"), icon: CircleDollarSign },
  { id: "history", label: BI("Trip History", "ခရီးစဉ်မှတ်တမ်း"), icon: History },
  { id: "support", label: BI("Support", "အကူအညီ"), icon: Headphones },
  { id: "profile", label: BI("Profile", "ပရိုဖိုင်"), icon: User },
  { id: "notifications", label: BI("Notifications", "အသိပေးချက်များ"), icon: Bell },
];

const jobs: RiderJob[] = [
  {
    id: "j1",
    trackingNo: "BEX-R-240201",
    merchant: "Britium Ventures",
    receiver: "Daw Ei Ei",
    phone: "09 785 552 114",
    pickupAddress: "No. 28, Alan Pya Pagoda Road, Dagon",
    deliveryAddress: "No. 17, Kyee Myint Daing Road, Sanchaung",
    township: "Sanchaung",
    parcelCount: 1,
    codAmount: 35000,
    serviceType: "Same Day",
    status: "Out for Delivery",
    eta: "4:00 PM - 6:00 PM",
    distanceKm: 4.8,
    note: "Call before arrival",
    proofStatus: BI("Pending Delivery Proof", "delivery proof စောင့်ဆိုင်း"),
    timeline: [
      { label: BI("Assigned", "တာဝန်ပေးထားသည်"), time: "09:05 AM", done: true },
      { label: BI("Accepted", "လက်ခံခဲ့သည်"), time: "09:07 AM", done: true },
      { label: BI("Heading to Pickup", "pickup သို့သွားနေသည်"), time: "09:30 AM", done: true },
      { label: BI("Picked Up", "လာယူပြီး"), time: "10:15 AM", done: true },
      { label: BI("Out for Delivery", "ပို့ဆောင်ရန်ထွက်ခွာပြီး"), time: "12:30 PM", done: true },
      { label: BI("Delivered", "ပို့ဆောင်ပြီး"), time: "Pending", done: false },
    ],
  },
  {
    id: "j2",
    trackingNo: "BEX-R-240202",
    merchant: "City Fresh",
    receiver: "Ko Thant Zin",
    phone: "09 456 001 223",
    pickupAddress: "Hlaing Industrial Block",
    deliveryAddress: "64th Street, Chanmyathazi, Mandalay",
    township: "Chanmyathazi",
    parcelCount: 2,
    codAmount: 0,
    serviceType: "Standard",
    status: "Heading to Pickup",
    eta: "Before 5:00 PM",
    distanceKm: 7.3,
    note: "Warehouse loading bay",
    proofStatus: BI("Pending Pickup Proof", "pickup proof စောင့်ဆိုင်း"),
    timeline: [
      { label: BI("Assigned", "တာဝန်ပေးထားသည်"), time: "08:42 AM", done: true },
      { label: BI("Accepted", "လက်ခံခဲ့သည်"), time: "08:45 AM", done: true },
      { label: BI("Heading to Pickup", "pickup သို့သွားနေသည်"), time: "09:10 AM", done: true },
      { label: BI("Picked Up", "လာယူပြီး"), time: "Pending", done: false },
    ],
  },
  {
    id: "j3",
    trackingNo: "BEX-R-240198",
    merchant: "Golden Shop",
    receiver: "Ko Yadanar Htun",
    phone: "09 798 555 002",
    pickupAddress: "North Okkalapa Branch",
    deliveryAddress: "Yadanar Road, North Okkalapa",
    township: "North Okkalapa",
    parcelCount: 1,
    codAmount: 18000,
    serviceType: "Standard",
    status: "Failed",
    eta: "Reattempt required",
    distanceKm: 3.2,
    note: "Receiver unreachable in previous attempt",
    proofStatus: BI("Failure Reason Submitted", "မအောင်မြင်ရသည့်အကြောင်းရင်းတင်ပြီး"),
    timeline: [
      { label: BI("Assigned", "တာဝန်ပေးထားသည်"), time: "Yesterday 10:00 AM", done: true },
      { label: BI("Picked Up", "လာယူပြီး"), time: "Yesterday 11:15 AM", done: true },
      { label: BI("Out for Delivery", "ပို့ဆောင်ရန်ထွက်ခွာပြီး"), time: "Yesterday 01:40 PM", done: true },
      { label: BI("Failed", "မအောင်မြင်"), time: "Yesterday 04:10 PM", done: true },
    ],
  },
];

const codRecords: CashRecord[] = [
  {
    id: "c1",
    trackingNo: "BEX-R-240188",
    collectedAt: "2026-04-05 03:20 PM",
    receiver: "Daw Hnin Pwint",
    codAmount: 42000,
    handoverStatus: BI("Handed Over", "လွှဲပြောင်းပြီး"),
    settlementRef: "SET-R-4401",
  },
  {
    id: "c2",
    trackingNo: "BEX-R-240201",
    collectedAt: "Pending",
    receiver: "Daw Ei Ei",
    codAmount: 35000,
    handoverStatus: BI("Pending Collection", "ကောက်ခံရန်စောင့်ဆိုင်း"),
    settlementRef: "-",
  },
  {
    id: "c3",
    trackingNo: "BEX-R-240177",
    collectedAt: "2026-04-04 06:05 PM",
    receiver: "Ko Min Thu",
    codAmount: 28000,
    handoverStatus: BI("Awaiting Handover", "လွှဲပြောင်းရန်စောင့်ဆိုင်း"),
    settlementRef: "TEMP-R-221",
  },
];

const earnings: EarningRecord[] = [
  { id: "e1", date: "2026-04-06", completedTrips: 7, basePay: 21000, bonus: 4000, deduction: 0, net: 25000 },
  { id: "e2", date: "2026-04-05", completedTrips: 9, basePay: 26000, bonus: 6000, deduction: 1000, net: 31000 },
  { id: "e3", date: "2026-04-04", completedTrips: 6, basePay: 18000, bonus: 2000, deduction: 0, net: 20000 },
];

const notifications: NotificationItem[] = [
  {
    id: "n1",
    title: BI("New job assigned", "အလုပ်အသစ်တာဝန်ပေးထားသည်"),
    body: BI("Shipment BEX-R-240202 has been assigned to your queue.", "Shipment BEX-R-240202 ကို သင့် queue သို့တာဝန်ပေးထားသည်။"),
    time: "8 min ago",
    unread: true,
    tone: "blue",
  },
  {
    id: "n2",
    title: BI("COD handover reminder", "COD လွှဲပြောင်းရန်သတိပေးချက်"),
    body: BI("You still have 28,000 Ks pending handover from yesterday’s completed jobs.", "မနေ့ကပြီးစီးသောအလုပ်များမှ 28,000 Ks ကို လွှဲပြောင်းရန်ကျန်ရှိနေသေးသည်။"),
    time: "35 min ago",
    unread: true,
    tone: "amber",
  },
  {
    id: "n3",
    title: BI("Delivery failure review", "delivery failure ပြန်လည်စစ်ဆေးရန်"),
    body: BI("Please confirm the failed attempt reason for BEX-R-240198.", "BEX-R-240198 အတွက် မအောင်မြင်သည့်အကြောင်းရင်းကို အတည်ပြုပါ။"),
    time: "Today",
    unread: false,
    tone: "rose",
  },
];

function tw(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function bilingual(mode: LanguageMode, text: Bi) {
  if (mode === "en") return text.en;
  if (mode === "my") return text.my;
  return `${text.en} / ${text.my}`;
}

function statusTone(status: string): Tone {
  if (["Delivered", "Handed Over", "Completed"].includes(status)) return "green";
  if (["Assigned", "Accepted", "Heading to Pickup", "Picked Up", "Out for Delivery"].includes(status)) return "blue";
  if (["Pending Collection", "Awaiting Handover"].includes(status)) return "amber";
  if (["Failed", "Returned"].includes(status)) return "rose";
  return "slate";
}

function BiText({ text, mode, className = "", secondaryClassName = "", align = "left" }: { text: Bi; mode: LanguageMode; className?: string; secondaryClassName?: string; align?: "left" | "center" }) {
  if (mode === "en") return <div className={tw(align === "center" && "text-center", className)}>{text.en}</div>;
  if (mode === "my") return <div className={tw(align === "center" && "text-center", secondaryClassName || className)}>{text.my}</div>;
  return (
    <div className={align === "center" ? "text-center" : "text-left"}>
      <div className={className}>{text.en}</div>
      <div className={secondaryClassName}>{text.my}</div>
    </div>
  );
}

function SurfaceCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} whileHover={{ y: -2 }} className={tw("rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl", className)}>
      {children}
    </motion.section>
  );
}

function DarkCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className={tw("relative overflow-hidden rounded-[30px] border border-[#17375f] bg-[linear-gradient(180deg,#0d2c54_0%,#0a2343_100%)] p-6 text-white shadow-[0_24px_64px_rgba(13,44,84,0.36)]", className)}>
      <div className="absolute -right-14 -top-14 h-44 w-44 rounded-full bg-[#ffd700]/10 blur-3xl" />
      <div className="absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-sky-400/10 blur-3xl" />
      <div className="relative z-10">{children}</div>
    </motion.section>
  );
}

function SectionTitle({ icon, title, subtitle, mode }: { icon: ReactNode; title: Bi; subtitle?: Bi; mode: LanguageMode }) {
  return (
    <div className="mb-5 flex items-start gap-3 border-b border-slate-200/80 pb-5">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-[#0d2c54] shadow-inner">{icon}</div>
      <div>
        <BiText mode={mode} text={title} className="text-lg font-black tracking-tight text-[#0d2c54]" secondaryClassName="mt-1 text-sm font-semibold text-slate-500" />
        {subtitle ? <BiText mode={mode} text={subtitle} className="mt-3 text-sm font-medium leading-6 text-slate-500" secondaryClassName="mt-1 text-sm font-medium leading-6 text-slate-500" /> : null}
      </div>
    </div>
  );
}

function Label({ label, mode }: { label: Bi; mode: LanguageMode }) {
  return <BiText mode={mode} text={label} className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500" secondaryClassName="mb-2 text-xs font-semibold text-slate-400" />;
}

function InputShell({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="group relative rounded-2xl border border-slate-200/90 bg-white/95 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)] focus-within:border-[#0d2c54]/35 focus-within:shadow-[0_0_0_4px_rgba(13,44,84,0.08)]">
      {icon ? <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">{icon}</div> : null}
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text", icon }: { value: string; onChange: (value: string) => void; placeholder: string; type?: string; icon?: ReactNode }) {
  return (
    <InputShell icon={icon}>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={tw("w-full rounded-2xl bg-transparent px-4 py-3.5 text-sm font-semibold text-[#0d2c54] outline-none placeholder:font-medium placeholder:text-slate-300", icon ? "pl-11" : "")} />
    </InputShell>
  );
}

function TextArea({ value, onChange, placeholder, rows = 4 }: { value: string; onChange: (value: string) => void; placeholder: string; rows?: number }) {
  return (
    <InputShell>
      <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full resize-none rounded-2xl bg-transparent px-4 py-3.5 text-sm font-semibold text-[#0d2c54] outline-none placeholder:font-medium placeholder:text-slate-300" />
    </InputShell>
  );
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <InputShell>
      <ChevronRight size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-slate-400" />
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full appearance-none rounded-2xl bg-transparent px-4 py-3.5 pr-10 text-sm font-semibold text-[#0d2c54] outline-none">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </InputShell>
  );
}

function ActionButton({ children, tone = "primary", onClick }: { children: ReactNode; tone?: "primary" | "secondary" | "danger"; onClick?: () => void }) {
  return (
    <motion.button type="button" onClick={onClick} whileHover={{ y: -1, scale: 1.01 }} whileTap={{ scale: 0.985 }} transition={{ type: "spring", stiffness: 420, damping: 28 }} className={tw("inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-[0.16em] outline-none", tone === "primary" && "bg-[#0d2c54] text-white shadow-[0_18px_36px_rgba(13,44,84,0.2)]", tone === "secondary" && "border border-slate-200 bg-white text-slate-700 shadow-[0_12px_24px_rgba(15,23,42,0.05)]", tone === "danger" && "bg-rose-600 text-white shadow-[0_18px_36px_rgba(225,29,72,0.18)]")}>
      {children}
    </motion.button>
  );
}

function StatusBadge({ text, tone = "blue", mode }: { text: Bi; tone?: Tone; mode: LanguageMode }) {
  const palette = {
    blue: "bg-sky-50 text-sky-700 border-sky-100 before:bg-sky-500",
    amber: "bg-amber-50 text-amber-700 border-amber-100 before:bg-amber-500",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100 before:bg-emerald-500",
    rose: "bg-rose-50 text-rose-700 border-rose-100 before:bg-rose-500",
    violet: "bg-violet-50 text-violet-700 border-violet-100 before:bg-violet-500",
    slate: "bg-slate-50 text-slate-700 border-slate-200 before:bg-slate-500",
  }[tone];
  return (
    <span className={tw("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 before:h-2 before:w-2 before:rounded-full before:content-['']", palette)}>
      <span className="text-xs font-black uppercase tracking-[0.16em]">{text.en}</span>
      {mode !== "en" ? <span className="text-xs font-semibold">{text.my}</span> : null}
    </span>
  );
}

function MetricCard({ label, value, icon, mode }: { label: Bi; value: string; icon: ReactNode; mode: LanguageMode }) {
  return (
    <SurfaceCard className="relative overflow-hidden p-5">
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[#0d2c54]/[0.04] blur-2xl" />
      <div className="relative z-10 flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-[#0d2c54] shadow-inner">{icon}</div>
      <BiText mode={mode} text={label} className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500" secondaryClassName="mt-1 text-xs font-semibold text-slate-400" />
      <div className="mt-3 text-3xl font-black tracking-tight text-[#0d2c54]">{value}</div>
    </SurfaceCard>
  );
}

function AsyncStateView({ state, mode }: { state: AsyncState; mode: LanguageMode }) {
  if (state === "ready") return null;
  if (state === "loading") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-[28px] border border-dashed border-slate-200 bg-white/60">
        <Loader2 className="animate-spin text-[#0d2c54]" size={28} />
        <BiText mode={mode} text={BI("Loading rider workspace...", "rider workspace ကို တင်နေသည်...")} align="center" className="text-base font-black text-[#0d2c54]" secondaryClassName="mt-1 text-sm font-semibold text-slate-500" />
      </motion.div>
    );
  }
  if (state === "empty") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-[28px] border border-dashed border-slate-200 bg-white/60 px-8">
        <Inbox size={28} className="text-slate-400" />
        <BiText mode={mode} text={BI("No rider data available here", "ဤနေရာတွင် rider ဒေတာမရှိသေးပါ")} align="center" className="text-lg font-black text-[#0d2c54]" secondaryClassName="mt-2 text-sm font-semibold text-slate-500" />
      </motion.div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-[28px] border border-rose-200 bg-rose-50/70 px-8">
      <XCircle size={28} className="text-rose-500" />
      <BiText mode={mode} text={BI("Unable to load this rider section", "ဤ rider အပိုင်းကို မတင်နိုင်ပါ")} align="center" className="text-lg font-black text-rose-700" secondaryClassName="mt-2 text-sm font-semibold text-rose-600" />
    </motion.div>
  );
}

function Timeline({ job, mode }: { job: RiderJob; mode: LanguageMode }) {
  return (
    <div className="space-y-4">
      {job.timeline.map((step, index) => (
        <div key={`${step.label.en}-${index}`} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className={tw("flex h-8 w-8 items-center justify-center rounded-full border text-xs font-black", step.done ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-slate-200 bg-white text-slate-400")}>
              {step.done ? <CheckCircle2 size={16} /> : index + 1}
            </div>
            {index < job.timeline.length - 1 ? <div className={tw("mt-2 h-10 w-px", step.done ? "bg-emerald-200" : "bg-slate-200")} /> : null}
          </div>
          <div className="pb-4">
            <BiText mode={mode} text={step.label} className="text-sm font-black text-[#0d2c54]" secondaryClassName="mt-1 text-sm font-semibold text-slate-500" />
            <div className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">{step.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReadTile({ label, value, mode }: { label: Bi; value: string; mode: LanguageMode }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <BiText mode={mode} text={label} className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400" secondaryClassName="mt-1 text-xs font-semibold text-slate-400" />
      <div className="mt-3 text-base font-black text-[#0d2c54]">{value}</div>
    </div>
  );
}

export default function RiderDriverPortalPremium() {
  const [mode, setMode] = useState<LanguageMode>("both");
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [screenState, setScreenState] = useState<Record<TabKey, AsyncState>>({
    dashboard: "ready",
    jobs: "ready",
    active: "ready",
    route: "ready",
    pickup: "ready",
    delivery: "ready",
    cod: "ready",
    earnings: "ready",
    history: "ready",
    support: "ready",
    profile: "ready",
    notifications: "ready",
  });
  const [selectedJobId, setSelectedJobId] = useState<string>(jobs[0].id);
  const [trackingSearch, setTrackingSearch] = useState("BEX-R-240201");
  const [pickupNote, setPickupNote] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [supportForm, setSupportForm] = useState({ subject: "", category: "delivery_issue", message: "" });
  const [supportSuccess, setSupportSuccess] = useState(false);

  const activeState = screenState[tab];
  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) ?? jobs[0], [selectedJobId]);
  const searchedJob = useMemo(() => jobs.find((job) => job.trackingNo.toLowerCase() === trackingSearch.toLowerCase()) ?? null, [trackingSearch]);

  const metrics = useMemo(() => {
    const assigned = jobs.filter((j) => ["Assigned", "Accepted", "Heading to Pickup"].includes(j.status)).length;
    const active = jobs.filter((j) => ["Picked Up", "Out for Delivery", "At Hub"].includes(j.status)).length;
    const delivered = jobs.filter((j) => j.status === "Delivered").length;
    const failed = jobs.filter((j) => j.status === "Failed").length;
    const pendingCod = codRecords.filter((c) => c.handoverStatus.en !== "Handed Over").reduce((sum, row) => sum + row.codAmount, 0);
    const handedOver = codRecords.filter((c) => c.handoverStatus.en === "Handed Over").reduce((sum, row) => sum + row.codAmount, 0);
    const todayNet = earnings[0]?.net ?? 0;
    return { assigned, active, delivered, failed, pendingCod, handedOver, todayNet };
  }, []);

  const dashboardView = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        <MetricCard mode={mode} label={BI("Assigned Jobs", "တာဝန်ပေးထားသောအလုပ်များ")} value={String(metrics.assigned)} icon={<Package2 size={18} />} />
        <MetricCard mode={mode} label={BI("Active Deliveries", "လက်ရှိပို့ဆောင်မှုများ")} value={String(metrics.active)} icon={<Truck size={18} />} />
        <MetricCard mode={mode} label={BI("Delivered Today", "ယနေ့ပို့ဆောင်ပြီးမှုများ")} value={String(metrics.delivered)} icon={<CheckCircle2 size={18} />} />
        <MetricCard mode={mode} label={BI("Failed Attempts", "မအောင်မြင်သောကြိုးပမ်းမှုများ")} value={String(metrics.failed)} icon={<AlertTriangle size={18} />} />
        <MetricCard mode={mode} label={BI("Pending COD Handover", "လွှဲပြောင်းရန်ကျန် COD")} value={`${metrics.pendingCod.toLocaleString()} Ks`} icon={<Wallet size={18} />} />
        <MetricCard mode={mode} label={BI("COD Handed Over", "လွှဲပြောင်းပြီး COD")} value={`${metrics.handedOver.toLocaleString()} Ks`} icon={<CircleDollarSign size={18} />} />
        <MetricCard mode={mode} label={BI("Today’s Net Earnings", "ယနေ့အသားတင်ဝင်ငွေ")} value={`${metrics.todayNet.toLocaleString()} Ks`} icon={<Sparkles size={18} />} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-8">
          <SurfaceCard>
            <SectionTitle mode={mode} icon={<Sparkles size={18} />} title={BI("Quick Rider Actions", "rider အမြန်လုပ်ဆောင်မှုများ")} subtitle={BI("Fast operational shortcuts for pickup, delivery, COD handover, route checks, and support.", "pickup၊ delivery၊ COD handover၊ route check နှင့် support အတွက်အမြန်လုပ်ဆောင်နိုင်သော shortcut များ။")} />
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[
                ["Open Active Job", "လက်ရှိအလုပ်ဖွင့်မည်", <Truck size={18} />, "active"],
                ["Route Planner", "လမ်းကြောင်းစီမံမည်", <Route size={18} />, "route"],
                ["Pickup Proof", "pickup proof", <ClipboardCheck size={18} />, "pickup"],
                ["Delivery Proof", "delivery proof", <Camera size={18} />, "delivery"],
                ["COD Handover", "COD လွှဲပြောင်းမည်", <Wallet size={18} />, "cod"],
                ["Trip History", "ခရီးစဉ်မှတ်တမ်း", <History size={18} />, "history"],
                ["Support", "အကူအညီ", <Headphones size={18} />, "support"],
                ["Profile", "ပရိုဖိုင်", <User size={18} />, "profile"],
              ].map(([en, my, icon, next]) => (
                <motion.button key={String(en)} whileHover={{ y: -2 }} whileTap={{ scale: 0.985 }} type="button" onClick={() => setTab(next as TabKey)} className="rounded-[24px] border border-slate-200 bg-white p-5 text-left shadow-[0_12px_28px_rgba(15,23,42,0.05)] transition hover:border-slate-300">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-[#0d2c54] shadow-inner">{icon}</div>
                  <div className="mt-4 text-sm font-black text-[#0d2c54]">{en}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-500">{my}</div>
                </motion.button>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle mode={mode} icon={<Truck size={18} />} title={BI("Assigned and Active Jobs", "တာဝန်ပေးထားသောနှင့် လက်ရှိအလုပ်များ")} subtitle={BI("Live queue of pickup and delivery jobs with priority visibility, ETA, and proof status.", "pickup နှင့် delivery job များကို ETA နှင့် proof status ဖြင့်တိုက်ရိုက်ကြည့်ရှုနိုင်သည်။")} />
            <div className="space-y-4">
              {jobs.map((job) => (
                <div key={job.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="text-base font-black text-[#0d2c54]">{job.trackingNo}</div>
                        <StatusBadge mode={mode} text={BI(job.status, job.status)} tone={statusTone(job.status)} />
                      </div>
                      <div className="mt-3 text-sm font-semibold text-slate-600">{job.merchant} → {job.receiver}</div>
                      <div className="mt-2 text-sm font-medium text-slate-500">{job.deliveryAddress}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-[#0d2c54]">{job.distanceKm} km • ETA {job.eta}</div>
                  </div>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>

        <div className="space-y-6 xl:col-span-4">
          <DarkCard>
            <BiText mode={mode} text={BI("Rider Summary", "rider အနှစ်ချုပ်")} className="text-2xl font-black text-white" secondaryClassName="mt-2 text-sm font-medium leading-6 text-white/60" />
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-base font-black text-white">Ko Zaw Min</div>
                <div className="mt-2 text-sm font-semibold text-white/70">Rider ID RD-0098 • Yangon Central Zone</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/45">Shift</div>
                  <div className="mt-2 text-xl font-black text-[#ffd700]">Day</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/45">Vehicle</div>
                  <div className="mt-2 text-xl font-black text-white">Bike</div>
                </div>
              </div>
            </div>
          </DarkCard>

          <SurfaceCard>
            <SectionTitle mode={mode} icon={<Bell size={18} />} title={BI("Notifications", "အသိပေးချက်များ")} subtitle={BI("Job assignment, COD reminders, and delivery exception notices for riders.", "job assignment၊ COD reminder နှင့် delivery exception notice များကို rider အတွက်ပြသသည်။")} />
            <div className="space-y-3">
              {notifications.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <StatusBadge mode={mode} text={BI(item.time, item.time)} tone={item.tone} />
                    {item.unread ? <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> : null}
                  </div>
                  <BiText mode={mode} text={item.title} className="mt-3 text-sm font-black text-[#0d2c54]" secondaryClassName="mt-1 text-sm font-semibold text-slate-500" />
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>
      </div>
    </div>
  );

  const jobsView = (
    <div className="space-y-6">
      <SurfaceCard>
        <SectionTitle mode={mode} icon={<Package2 size={18} />} title={BI("Assigned Jobs Queue", "တာဝန်ပေးထားသောအလုပ်ဇယား")} subtitle={BI("Searchable rider queue with address context, COD visibility, customer contact, and action readiness.", "လိပ်စာ၊ COD၊ customer contact နှင့် action readiness များပါဝင်သော rider queue ဖြစ်သည်။")} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <TextInput value="" onChange={() => {}} placeholder={bilingual(mode, BI("Search tracking / receiver", "tracking / လက်ခံသူရှာမည်"))} icon={<Search size={15} />} />
          <SelectInput value="all" onChange={() => {}} options={[{ value: "all", label: bilingual(mode, BI("All Statuses", "အခြေအနေအားလုံး")) }, { value: "assigned", label: "Assigned" }, { value: "active", label: "Out for Delivery" }]} />
          <TextInput value="2026-04-01" onChange={() => {}} placeholder="Start" type="date" />
          <TextInput value="2026-04-30" onChange={() => {}} placeholder="End" type="date" />
          <ActionButton tone="secondary"><Phone size={15} /> Call Receiver</ActionButton>
          <ActionButton tone="secondary"><MapPinned size={15} /> Open Map</ActionButton>
        </div>
        <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-9 gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
            <div>Tracking</div><div>Merchant</div><div>Receiver</div><div>Township</div><div>COD</div><div>Distance</div><div>Status</div><div>Proof</div><div>Action</div>
          </div>
          {jobs.map((job) => (
            <div key={job.id} className="grid grid-cols-9 gap-4 border-b border-slate-100 px-4 py-4 text-sm font-semibold text-[#0d2c54] last:border-b-0">
              <div>{job.trackingNo}</div><div>{job.merchant}</div><div>{job.receiver}</div><div>{job.township}</div><div>{job.codAmount.toLocaleString()}</div><div>{job.distanceKm} km</div><div><StatusBadge mode={mode} text={BI(job.status, job.status)} tone={statusTone(job.status)} /></div><div><StatusBadge mode={mode} text={job.proofStatus} tone="violet" /></div><div><button type="button" onClick={() => setSelectedJobId(job.id)} className="font-black text-[#0d2c54] hover:text-sky-600">Open</button></div>
            </div>
          ))}
        </div>
      </SurfaceCard>
    </div>
  );

  const activeView = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-8">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<Truck size={18} />} title={BI("Active Delivery Workspace", "လက်ရှိပို့ဆောင်မှု workspace") } subtitle={BI("Current shipment detail, contact shortcuts, timeline, and operational notes for the rider’s active job.", "rider ၏လက်ရှိအလုပ်အတွက် shipment detail၊ contact shortcut၊ timeline နှင့် operational note များကိုပြသသည်။")} />
          <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-lg font-black text-[#0d2c54]">{selectedJob.trackingNo}</div>
              <StatusBadge mode={mode} text={BI(selectedJob.status, selectedJob.status)} tone={statusTone(selectedJob.status)} />
            </div>
            <div className="mt-3 text-sm font-semibold text-slate-600">{selectedJob.receiver} • {selectedJob.phone}</div>
            <div className="mt-2 text-sm font-medium text-slate-500">{selectedJob.deliveryAddress}</div>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ReadTile label={BI("COD Amount", "COD ငွေပမာဏ")} value={`${selectedJob.codAmount.toLocaleString()} Ks`} mode={mode} />
            <ReadTile label={BI("Service Type", "ဝန်ဆောင်မှုအမျိုးအစား")} value={selectedJob.serviceType} mode={mode} />
            <ReadTile label={BI("ETA", "ခန့်မှန်းချိန်")} value={selectedJob.eta} mode={mode} />
            <ReadTile label={BI("Note", "မှတ်ချက်")} value={selectedJob.note} mode={mode} />
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <SectionTitle mode={mode} icon={<History size={18} />} title={BI("Job Timeline", "အလုပ် timeline") } subtitle={BI("Progress from assignment to delivery with clear rider-facing state tracking.", "တာဝန်ပေးခြင်းမှ delivery အထိ rider-facing state tracking ကိုရှင်းလင်းစွာပြသသည်။")} />
          <Timeline job={selectedJob} mode={mode} />
        </SurfaceCard>
      </div>
      <div className="space-y-6 xl:col-span-4">
        <DarkCard>
          <BiText mode={mode} text={BI("Quick Contact", "အမြန်ဆက်သွယ်ရန်") } className="text-xl font-black text-white" secondaryClassName="mt-2 text-sm font-medium leading-6 text-white/60" />
          <div className="mt-5 grid grid-cols-1 gap-3">
            <ActionButton tone="secondary"><Phone size={15} /> Call Receiver</ActionButton>
            <ActionButton tone="secondary"><Phone size={15} /> Call Merchant</ActionButton>
            <ActionButton tone="secondary"><MapPinned size={15} /> Open Map</ActionButton>
            <ActionButton><Headphones size={15} /> Escalate Support</ActionButton>
          </div>
        </DarkCard>
      </div>
    </div>
  );

  const routeView = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-7">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<Route size={18} />} title={BI("Route & Stops Planner", "လမ်းကြောင်းနှင့် stop စီစဉ်မှု") } subtitle={BI("Operational route guidance with grouped stops, travel distance, stop priority, and current movement visibility.", "grouped stop၊ travel distance၊ stop priority နှင့် current movement visibility ပါဝင်သော route guidance ဖြစ်သည်။")} />
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-[linear-gradient(180deg,#f8fafc_0%,#eef4fb_100%)] p-8 text-center">
            <MapPinned size={34} className="mx-auto text-slate-400" />
            <BiText mode={mode} text={BI("Map canvas placeholder", "map canvas placeholder") } align="center" className="mt-4 text-lg font-black text-[#0d2c54]" secondaryClassName="mt-2 text-sm font-semibold text-slate-500" />
            <BiText mode={mode} text={BI("Integrate live rider map, route optimization, and stop sequencing here.", "live rider map၊ route optimization နှင့် stop sequencing ကို ဤနေရာတွင်ပေါင်းစပ်နိုင်သည်။") } align="center" className="mt-3 text-sm font-medium text-slate-500" secondaryClassName="mt-1 text-sm font-medium text-slate-500" />
          </div>
        </SurfaceCard>
      </div>
      <div className="space-y-6 xl:col-span-5">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<Flag size={18} />} title={BI("Stop List", "stop စာရင်း") } subtitle={BI("Prioritized stops for current shift with distance and COD context.", "လက်ရှိ shift အတွက် distance နှင့် COD context ပါဝင်သော prioritized stop များ။")} />
          <div className="space-y-3">
            {jobs.map((job, index) => (
              <div key={job.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-black text-[#0d2c54]">Stop {index + 1} • {job.trackingNo}</div>
                  <div className="text-sm font-semibold text-slate-500">{job.distanceKm} km</div>
                </div>
                <div className="mt-2 text-sm font-medium text-slate-500">{job.deliveryAddress}</div>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </div>
    </div>
  );

  const pickupView = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-8">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<ClipboardCheck size={18} />} title={BI("Pickup Proof Capture", "pickup proof capture") } subtitle={BI("Capture parcel count, merchant confirmation, condition notes, and supporting proof before leaving pickup point.", "pickup point မှမထွက်ခွာမီ parcel count၊ merchant confirmation၊ condition note နှင့် supporting proof များကို capture လုပ်နိုင်သည်။")} />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div><Label mode={mode} label={BI("Tracking Number", "tracking number") } /><TextInput value={selectedJob.trackingNo} onChange={() => {}} placeholder="Tracking" /></div>
            <div><Label mode={mode} label={BI("Parcel Count", "parcel အရေအတွက်") } /><TextInput value={String(selectedJob.parcelCount)} onChange={() => {}} placeholder="Parcel count" type="number" /></div>
            <div className="md:col-span-2"><Label mode={mode} label={BI("Pickup Note", "pickup မှတ်ချက်") } /><TextArea value={pickupNote} onChange={setPickupNote} placeholder={bilingual(mode, BI("Add parcel condition, merchant remarks, or mismatch notes", "parcel condition၊ merchant remark သို့မဟုတ် mismatch note များထည့်ပါ"))} rows={4} /></div>
            <div className="md:col-span-2">
              <Label mode={mode} label={BI("Proof Upload", "proof upload") } />
              <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }} type="button" className="flex w-full items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-sm font-bold text-slate-500 transition hover:border-[#0d2c54]/30 hover:bg-white">
                <Upload size={18} /> {bilingual(mode, BI("Upload pickup photo / signature", "pickup photo / signature တင်မည်"))}
              </motion.button>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <ActionButton><Camera size={15} /> Save Pickup Proof</ActionButton>
            <ActionButton tone="secondary"><CheckCircle2 size={15} /> Confirm Pickup</ActionButton>
          </div>
        </SurfaceCard>
      </div>
      <div className="space-y-6 xl:col-span-4">
        <DarkCard>
          <BiText mode={mode} text={BI("Pickup Checklist", "pickup checklist") } className="text-xl font-black text-white" secondaryClassName="mt-2 text-sm font-medium leading-6 text-white/60" />
          <div className="mt-5 space-y-3 text-sm font-semibold text-white/75">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Verify parcel count / parcel အရေအတွက်စစ်ဆေးပါ</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Confirm merchant handover / merchant handover အတည်ပြုပါ</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Capture proof before leaving / မထွက်ခွာမီ proof capture လုပ်ပါ</div>
          </div>
        </DarkCard>
      </div>
    </div>
  );

  const deliveryView = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-8">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<Camera size={18} />} title={BI("Delivery Proof & Completion", "delivery proof နှင့် completion") } subtitle={BI("Complete delivery with receiver proof, COD confirmation, signature/photo, failure reason, and QR or OTP check support.", "receiver proof၊ COD confirmation၊ signature/photo၊ failure reason နှင့် QR/OTP check ဖြင့် delivery completion လုပ်နိုင်သည်။")} />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div><Label mode={mode} label={BI("Tracking Number", "tracking number") } /><TextInput value={selectedJob.trackingNo} onChange={() => {}} placeholder="Tracking" /></div>
            <div><Label mode={mode} label={BI("COD Collected", "COD ကောက်ခံပြီး") } /><TextInput value={String(selectedJob.codAmount)} onChange={() => {}} placeholder="COD" type="number" /></div>
            <div><Label mode={mode} label={BI("Receiver Verification", "လက်ခံသူအတည်ပြုမှု") } /><SelectInput value="signature" onChange={() => {}} options={[{ value: "signature", label: "Signature" }, { value: "photo", label: "Photo Proof" }, { value: "otp", label: "OTP / PIN" }, { value: "qr", label: "QR Scan" }]} /></div>
            <div><Label mode={mode} label={BI("Failure Mode", "မအောင်မြင်မှုအမျိုးအစား") } /><SelectInput value="none" onChange={() => {}} options={[{ value: "none", label: "No Failure" }, { value: "unreachable", label: "Receiver Unreachable" }, { value: "refused", label: "Receiver Refused" }, { value: "address_issue", label: "Address Issue" }]} /></div>
            <div className="md:col-span-2"><Label mode={mode} label={BI("Delivery Note", "delivery မှတ်ချက်") } /><TextArea value={deliveryNote} onChange={setDeliveryNote} placeholder={bilingual(mode, BI("Add delivery note or failed attempt reason", "delivery မှတ်ချက် သို့မဟုတ် မအောင်မြင်သည့်အကြောင်းရင်းကိုထည့်ပါ"))} rows={4} /></div>
            <div className="md:col-span-2">
              <Label mode={mode} label={BI("Proof Upload", "proof upload") } />
              <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }} type="button" className="flex w-full items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-sm font-bold text-slate-500 transition hover:border-[#0d2c54]/30 hover:bg-white">
                <Camera size={18} /> {bilingual(mode, BI("Upload delivery photo / signature", "delivery photo / signature တင်မည်"))}
              </motion.button>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <ActionButton><CheckCircle2 size={15} /> Complete Delivery</ActionButton>
            <ActionButton tone="secondary"><QrCode size={15} /> QR / OTP Check</ActionButton>
            <ActionButton tone="danger"><XCircle size={15} /> Mark Failed</ActionButton>
          </div>
        </SurfaceCard>
      </div>
      <div className="space-y-6 xl:col-span-4">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<ShieldCheck size={18} />} title={BI("Proof Guidance", "proof လမ်းညွှန်") } subtitle={BI("Use clear and consistent evidence for delivery completion or failure logging.", "delivery completion သို့မဟုတ် failure logging အတွက် ရှင်းလင်းပြီးတည်ငြိမ်သော evidence ကိုအသုံးပြုပါ။")} />
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-sm font-semibold text-slate-600">Take clear parcel + receiver photo / parcel နှင့် လက်ခံသူကိုရှင်းလင်းစွာဓာတ်ပုံရိုက်ပါ</div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-sm font-semibold text-slate-600">Confirm COD amount before completion / completion မလုပ်မီ COD ပမာဏကိုအတည်ပြုပါ</div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-sm font-semibold text-slate-600">Document failed attempt accurately / မအောင်မြင်သည့်ကြိုးပမ်းမှုကိုတိကျစွာမှတ်တမ်းတင်ပါ</div>
          </div>
        </SurfaceCard>
      </div>
    </div>
  );

  const codView = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-8">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<Wallet size={18} />} title={BI("COD Collection & Handover", "COD ကောက်ခံမှုနှင့် လွှဲပြောင်းမှု") } subtitle={BI("Track rider COD collections, pending handovers, references, and settlement visibility in one financial workspace.", "rider COD collection၊ pending handover၊ reference နှင့် settlement visibility ကိုတစ်နေရာတည်းတွင်ကြည့်ရှုနိုင်သည်။")} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <MetricCard mode={mode} label={BI("Pending COD", "စောင့်ဆိုင်း COD") } value={`${metrics.pendingCod.toLocaleString()} Ks`} icon={<Clock3 size={18} />} />
            <MetricCard mode={mode} label={BI("Handed Over", "လွှဲပြောင်းပြီး") } value={`${metrics.handedOver.toLocaleString()} Ks`} icon={<CheckCircle2 size={18} />} />
            <MetricCard mode={mode} label={BI("Collected Today", "ယနေ့ကောက်ခံပြီး") } value={`${codRecords.reduce((sum, row) => sum + row.codAmount, 0).toLocaleString()} Ks`} icon={<CircleDollarSign size={18} />} />
          </div>
          <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-6 gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
              <div>Tracking</div><div>Collected At</div><div>Receiver</div><div>COD</div><div>Status</div><div>Reference</div>
            </div>
            {codRecords.map((row) => (
              <div key={row.id} className="grid grid-cols-6 gap-4 border-b border-slate-100 px-4 py-4 text-sm font-semibold text-[#0d2c54] last:border-b-0">
                <div>{row.trackingNo}</div><div>{row.collectedAt}</div><div>{row.receiver}</div><div>{row.codAmount.toLocaleString()}</div><div><StatusBadge mode={mode} text={row.handoverStatus} tone={statusTone(row.handoverStatus.en)} /></div><div>{row.settlementRef}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <ActionButton><Send size={15} /> Submit COD Handover</ActionButton>
            <ActionButton tone="secondary"><FileText size={15} /> View Settlement Ref</ActionButton>
          </div>
        </SurfaceCard>
      </div>
      <div className="space-y-6 xl:col-span-4">
        <DarkCard>
          <BiText mode={mode} text={BI("Handover Rules", "handover စည်းကမ်းများ") } className="text-xl font-black text-white" secondaryClassName="mt-2 text-sm font-medium leading-6 text-white/60" />
          <div className="mt-5 space-y-3 text-sm font-semibold text-white/75">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Count COD before submission / submit မလုပ်မီ COD ပမာဏကိုရေတွက်ပါ</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Match against completed jobs / completed job များနှင့်တူညီမှုစစ်ဆေးပါ</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Keep settlement reference / settlement reference ကိုမှတ်သားထားပါ</div>
          </div>
        </DarkCard>
      </div>
    </div>
  );

  const earningsView = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard mode={mode} label={BI("Today’s Net", "ယနေ့အသားတင်") } value={`${earnings[0].net.toLocaleString()} Ks`} icon={<Sparkles size={18} />} />
        <MetricCard mode={mode} label={BI("Completed Trips", "ပြီးစီးသောခရီးစဉ်များ") } value={`${earnings[0].completedTrips}`} icon={<Truck size={18} />} />
        <MetricCard mode={mode} label={BI("Bonus", "ဆုကြေး") } value={`${earnings[0].bonus.toLocaleString()} Ks`} icon={<CheckCircle2 size={18} />} />
        <MetricCard mode={mode} label={BI("Deductions", "လျှော့ငွေ") } value={`${earnings[0].deduction.toLocaleString()} Ks`} icon={<AlertTriangle size={18} />} />
      </div>
      <SurfaceCard>
        <SectionTitle mode={mode} icon={<CircleDollarSign size={18} />} title={BI("Earnings Summary", "ဝင်ငွေအနှစ်ချုပ်") } subtitle={BI("Trip-based earnings, bonuses, deductions, and net payout visibility for riders.", "ခရီးစဉ်အလိုက်ဝင်ငွေ၊ bonus၊ deduction နှင့် net payout ကိုကြည့်ရှုနိုင်သည်။")} />
        <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-6 gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
            <div>Date</div><div>Trips</div><div>Base Pay</div><div>Bonus</div><div>Deduction</div><div>Net</div>
          </div>
          {earnings.map((row) => (
            <div key={row.id} className="grid grid-cols-6 gap-4 border-b border-slate-100 px-4 py-4 text-sm font-semibold text-[#0d2c54] last:border-b-0">
              <div>{row.date}</div><div>{row.completedTrips}</div><div>{row.basePay.toLocaleString()}</div><div>{row.bonus.toLocaleString()}</div><div>{row.deduction.toLocaleString()}</div><div>{row.net.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </SurfaceCard>
    </div>
  );

  const historyView = (
    <div className="space-y-6">
      <SurfaceCard>
        <SectionTitle mode={mode} icon={<History size={18} />} title={BI("Trip History", "ခရီးစဉ်မှတ်တမ်း") } subtitle={BI("Historical deliveries, outcomes, COD details, and previous work performance for the rider.", "delivery history၊ outcome၊ COD detail နှင့် rider ၏အတိတ်လုပ်ဆောင်မှုများကိုပြသသည်။")} />
        <div className="space-y-4">
          {jobs.map((job) => (
            <div key={job.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-base font-black text-[#0d2c54]">{job.trackingNo}</div>
                    <StatusBadge mode={mode} text={BI(job.status, job.status)} tone={statusTone(job.status)} />
                  </div>
                  <div className="mt-3 text-sm font-semibold text-slate-600">{job.receiver} • {job.deliveryAddress}</div>
                </div>
                <div className="text-sm font-bold text-slate-500">{job.eta}</div>
              </div>
            </div>
          ))}
        </div>
      </SurfaceCard>
    </div>
  );

  const supportView = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-8">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<Headphones size={18} />} title={BI("Rider Support Center", "rider support center") } subtitle={BI("Raise support issues for address problems, receiver issues, COD disputes, app issues, or delivery escalation.", "လိပ်စာပြဿနာ၊ လက်ခံသူပြဿနာ၊ COD dispute၊ app ပြဿနာ သို့မဟုတ် delivery escalation များအတွက် support တောင်းဆိုနိုင်သည်။")} />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div><Label mode={mode} label={BI("Subject", "အကြောင်းအရာ") } /><TextInput value={supportForm.subject} onChange={(v) => setSupportForm((p) => ({ ...p, subject: v }))} placeholder={bilingual(mode, BI("Support subject", "support အကြောင်းအရာ"))} /></div>
            <div><Label mode={mode} label={BI("Issue Category", "ပြဿနာအမျိုးအစား") } /><SelectInput value={supportForm.category} onChange={(v) => setSupportForm((p) => ({ ...p, category: v }))} options={[{ value: "delivery_issue", label: "Delivery Issue" }, { value: "cod_issue", label: "COD Issue" }, { value: "app_issue", label: "App Issue" }]} /></div>
            <div className="md:col-span-2"><Label mode={mode} label={BI("Message", "မက်ဆေ့ချ်") } /><TextArea value={supportForm.message} onChange={(v) => setSupportForm((p) => ({ ...p, message: v }))} placeholder={bilingual(mode, BI("Describe the issue clearly", "ပြဿနာကို ရှင်းလင်းစွာဖော်ပြပါ"))} /></div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <ActionButton onClick={() => setSupportSuccess(true)}><Send size={15} /> Submit Support</ActionButton>
            <ActionButton tone="secondary"><Upload size={15} /> Upload Evidence</ActionButton>
          </div>
          <AnimatePresence>
            {supportSuccess ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                <BiText mode={mode} text={BI("Support request submitted successfully", "support request ကို အောင်မြင်စွာတင်သွင်းပြီး") } className="text-sm font-black text-emerald-700" secondaryClassName="mt-1 text-sm font-semibold text-emerald-600" />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </SurfaceCard>
      </div>
      <div className="space-y-6 xl:col-span-4">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<FileText size={18} />} title={BI("Help Tips", "အကူအညီအကြံပြုချက်များ") } subtitle={BI("Common support shortcuts for riders on the road.", "လမ်းပေါ်တွင်ရှိနေသော rider များအတွက် အသုံးများသောအကူအညီ shortcut များ။")} />
          <div className="space-y-3">
            {[BI("Call receiver before marking failed", "failed မတင်မီ လက်ခံသူကိုဖုန်းခေါ်ပါ"), BI("Upload proof immediately", "proof ကိုချက်ချင်းတင်ပါ"), BI("Escalate COD mismatch at once", "COD mismatch ဖြစ်ပါကချက်ချင်းတိုင်ကြားပါ")].map((item) => (
              <div key={item.en} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-sm font-semibold text-slate-600">{bilingual(mode, item)}</div>
            ))}
          </div>
        </SurfaceCard>
      </div>
    </div>
  );

  const profileView = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-4">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<User size={18} />} title={BI("Rider Profile", "rider ပရိုဖိုင်") } subtitle={BI("Identity, shift profile, zone assignment, and core rider account information.", "identity၊ shift၊ zone assignment နှင့် rider account အခြေခံအချက်အလက်များ။")} />
          <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-inner">
            <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-slate-200 bg-white text-xl font-black text-[#0d2c54] shadow-sm">KZ</div>
            <div className="mt-4 text-xl font-black text-[#0d2c54]">Ko Zaw Min</div>
            <div className="mt-2 text-sm font-semibold text-slate-500">Rider ID RD-0098 • Yangon Central</div>
            <div className="mt-5 space-y-3 text-sm font-semibold text-slate-600">
              <div className="flex items-center gap-3"><Phone size={15} /> 09 777 123 445</div>
              <div className="flex items-center gap-3"><CalendarClock size={15} /> Shift: 8:00 AM - 6:00 PM</div>
              <div className="flex items-center gap-3"><Truck size={15} /> Vehicle: Motorbike</div>
            </div>
          </div>
        </SurfaceCard>
      </div>
      <div className="space-y-6 xl:col-span-8">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<ShieldCheck size={18} />} title={BI("Rider Settings", "rider setting များ") } subtitle={BI("Notification, language, session awareness, and profile preferences for the rider app experience.", "notification၊ language၊ session awareness နှင့် rider app preference များ။")} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ReadTile label={BI("Preferred Language", "ဦးစားပေးဘာသာစကား") } value="English + Myanmar" mode={mode} />
            <ReadTile label={BI("Assigned Zone", "တာဝန်ပေးထားသောဇုန်") } value="Yangon Central" mode={mode} />
            <ReadTile label={BI("Vehicle Type", "ယာဉ်အမျိုးအစား") } value="Motorbike" mode={mode} />
            <ReadTile label={BI("Status", "အခြေအနေ") } value="Active" mode={mode} />
          </div>
        </SurfaceCard>
      </div>
    </div>
  );

  const notificationsView = (
    <div className="space-y-6">
      <SurfaceCard>
        <SectionTitle mode={mode} icon={<Bell size={18} />} title={BI("Notifications & Alerts", "အသိပေးချက်များနှင့် alert များ") } subtitle={BI("Job updates, COD reminders, shift alerts, and exception notices grouped for the rider workflow.", "job update၊ COD reminder၊ shift alert နှင့် exception notice များကို rider workflow အတွက်အုပ်စုဖွဲ့ပြသထားသည်။")} />
        <div className="space-y-4">
          {notifications.map((item) => (
            <motion.div key={item.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className={tw("rounded-[24px] border bg-white p-5 shadow-sm", item.unread ? "border-sky-200" : "border-slate-200")}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <BiText mode={mode} text={item.title} className="text-base font-black text-[#0d2c54]" secondaryClassName="mt-1 text-sm font-semibold text-slate-500" />
                  <BiText mode={mode} text={item.body} className="mt-3 text-sm font-medium leading-6 text-slate-600" secondaryClassName="mt-1 text-sm font-medium leading-6 text-slate-500" />
                </div>
                <div className="flex items-center gap-3">
                  {item.unread ? <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> : null}
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{item.time}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </SurfaceCard>
    </div>
  );

  const views: Record<TabKey, ReactNode> = {
    dashboard: dashboardView,
    jobs: jobsView,
    active: activeView,
    route: routeView,
    pickup: pickupView,
    delivery: deliveryView,
    cod: codView,
    earnings: earningsView,
    history: historyView,
    support: supportView,
    profile: profileView,
    notifications: notificationsView,
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(13,44,84,0.12),transparent_24%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.08),transparent_20%),linear-gradient(180deg,#f8fbff_0%,#eef4fb_54%,#f8fafc_100%)] px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1800px] space-y-6">
        <motion.header initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white/76 p-6 shadow-[0_24px_56px_rgba(15,23,42,0.08)] backdrop-blur-xl md:p-7">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/70 to-transparent" />
          <div className="absolute -right-10 top-0 h-40 w-40 rounded-full bg-sky-500/10 blur-3xl" />
          <div className="absolute left-0 top-0 h-32 w-32 rounded-full bg-[#ffd700]/10 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/90 px-3 py-1.5 shadow-sm">
                <Sparkles size={14} className="text-[#0d2c54]" />
                <span className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Rider / Driver Portal</span>
              </div>
              <BiText mode={mode} text={BI("Britium Express Rider Workspace", "Britium Express rider workspace") } className="mt-4 text-3xl font-black tracking-tight text-[#0d2c54] md:text-5xl" secondaryClassName="mt-3 text-base font-semibold text-slate-500 md:text-lg" />
              <BiText mode={mode} text={BI("A premium operations portal for riders to manage jobs, routes, proofs, COD handovers, earnings, and support in one place.", "job၊ route၊ proof၊ COD handover၊ ဝင်ငွေ နှင့် support များကိုတစ်နေရာတည်းတွင်စီမံနိုင်သော premium rider portal ဖြစ်သည်။") } className="mt-4 text-sm font-medium leading-6 text-slate-500 md:text-[15px]" secondaryClassName="mt-1 text-sm font-medium leading-6 text-slate-500 md:text-[15px]" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:w-[560px]">
              <SurfaceCard className="p-4">
                <BiText mode={mode} text={BI("Rider Identity", "rider အချက်အလက်") } className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400" secondaryClassName="mt-1 text-xs font-semibold text-slate-400" />
                <div className="mt-3 text-base font-black text-[#0d2c54]">Ko Zaw Min</div>
                <div className="mt-1 text-sm font-semibold text-slate-500">Rider ID RD-0098 • Central Zone</div>
              </SurfaceCard>
              <SurfaceCard className="p-4">
                <BiText mode={mode} text={BI("Language Mode", "ဘာသာစကား mode") } className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400" secondaryClassName="mt-1 text-xs font-semibold text-slate-400" />
                <div className="mt-3 flex flex-wrap gap-2">
                  {[["en", "EN"], ["my", "မြန်မာ"], ["both", "EN + မြန်မာ"]].map(([value, label]) => (
                    <ActionButton key={value} tone={mode === value ? "primary" : "secondary"} onClick={() => setMode(value as LanguageMode)}>{label}</ActionButton>
                  ))}
                </div>
              </SurfaceCard>
            </div>
          </div>

          <div className="relative z-10 mt-6 flex flex-wrap gap-3">
            <ActionButton onClick={() => setTab("active")}><Truck size={15} /> Active Delivery</ActionButton>
            <ActionButton tone="secondary" onClick={() => setTab("route")}><Route size={15} /> Route Planner</ActionButton>
            <ActionButton tone="secondary" onClick={() => setTab("pickup")}><ClipboardCheck size={15} /> Pickup Proof</ActionButton>
            <ActionButton tone="secondary" onClick={() => setTab("cod")}><Wallet size={15} /> COD Handover</ActionButton>
          </div>
        </motion.header>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
          <motion.aside initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }} className="xl:sticky xl:top-6 xl:self-start">
            <SurfaceCard className="p-3">
              <div className="mb-3 px-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Portal Navigation / Portal လမ်းညွှန်</div>
              <nav className="flex flex-row flex-wrap gap-2 xl:flex-col">
                {tabs.map((item) => {
                  const Icon = item.icon;
                  const active = tab === item.id;
                  return (
                    <motion.button key={item.id} type="button" onClick={() => setTab(item.id)} whileHover={{ x: 2 }} whileTap={{ scale: 0.985 }} className={tw("flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition", active ? "bg-[#0d2c54] text-white shadow-[0_16px_30px_rgba(13,44,84,0.22)]" : "text-slate-600 hover:bg-slate-50")}>
                      <Icon size={17} />
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.16em]">{item.label.en}</div>
                        <div className={tw("mt-1 text-xs font-semibold", active ? "text-white/70" : "text-slate-400")}>{item.label.my}</div>
                      </div>
                    </motion.button>
                  );
                })}
              </nav>
              <div className="mt-5 border-t border-slate-200 pt-4">
                <div className="mb-3 px-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Demo States / စမ်းသပ်အခြေအနေများ</div>
                <div className="grid grid-cols-2 gap-2">
                  <ActionButton tone="secondary" onClick={() => setScreenState((prev) => ({ ...prev, [tab]: "loading" }))}>Loading</ActionButton>
                  <ActionButton tone="secondary" onClick={() => setScreenState((prev) => ({ ...prev, [tab]: "empty" }))}>Empty</ActionButton>
                  <ActionButton tone="secondary" onClick={() => setScreenState((prev) => ({ ...prev, [tab]: "error" }))}>Error</ActionButton>
                  <ActionButton tone="secondary" onClick={() => setScreenState((prev) => ({ ...prev, [tab]: "ready" }))}>Ready</ActionButton>
                </div>
              </div>
            </SurfaceCard>
          </motion.aside>

          <main>
            <AnimatePresence mode="wait">
              <motion.div key={`${tab}-${activeState}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28 }}>
                {activeState !== "ready" ? <AsyncStateView state={activeState} mode={mode} /> : views[tab]}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  );
}
