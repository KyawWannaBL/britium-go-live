import React, { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Bell,
  Boxes,
  CalendarClock,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileSpreadsheet,
  FileText,
  Filter,
  Flag,
  Forklift,
  Handshake,
  Home,
  Inbox,
  Loader2,
  MapPinned,
  Package2,
  QrCode,
  ScanLine,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Truck,
  Upload,
  User,
  Users,
  Warehouse,
  Wrench,
  XCircle,
} from "lucide-react";

type Bi = { en: string; my: string };
type LanguageMode = "en" | "my" | "both";
type AsyncState = "ready" | "loading" | "empty" | "error";
type Tone = "blue" | "amber" | "green" | "rose" | "violet" | "slate";
type TabKey =
  | "dashboard"
  | "intake"
  | "sorting"
  | "transfers"
  | "inventory"
  | "staging"
  | "exceptions"
  | "returns"
  | "handover"
  | "scanqc"
  | "workforce"
  | "reports"
  | "notifications"
  | "profile";

type ParcelStatus =
  | "Received"
  | "Scanned"
  | "Sorted"
  | "Staged"
  | "Transferred"
  | "Exception"
  | "Returned"
  | "Handed Over";

type ParcelRecord = {
  id: string;
  trackingNo: string;
  merchant: string;
  destination: string;
  zone: string;
  pieces: number;
  codAmount: number;
  currentBin: string;
  currentStatus: ParcelStatus;
  inboundTime: string;
  nextAction: string;
};

type TransferRecord = {
  id: string;
  batchNo: string;
  route: string;
  vehicle: string;
  parcelCount: number;
  status: Bi;
  departureTime: string;
  arrivalEta: string;
};

type ExceptionRecord = {
  id: string;
  trackingNo: string;
  issue: Bi;
  severity: Tone;
  note: Bi;
  status: Bi;
  updatedAt: string;
};

type WorkforceTask = {
  id: string;
  member: string;
  role: string;
  station: string;
  assignedCount: number;
  completion: number;
  shift: string;
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
  { id: "intake", label: BI("Inbound Intake", "ဝင်လာသောကုန်လက်ခံမှု"), icon: Package2 },
  { id: "sorting", label: BI("Sorting Lane", "ခွဲခြားသတ်မှတ်မှုလိုင်း"), icon: Boxes },
  { id: "transfers", label: BI("Hub Transfers", "hub လွှဲပြောင်းမှုများ"), icon: ArrowRightLeft },
  { id: "inventory", label: BI("Bins & Inventory", "bin နှင့် inventory") , icon: Warehouse },
  { id: "staging", label: BI("Dispatch Staging", "dispatch staging") , icon: Truck },
  { id: "exceptions", label: BI("Exceptions", "exception များ"), icon: AlertTriangle },
  { id: "returns", label: BI("Returns / RTS", "return / RTS") , icon: Flag },
  { id: "handover", label: BI("Rider Handover", "rider လွှဲပြောင်းမှု") , icon: Handshake },
  { id: "scanqc", label: BI("Scan & QC", "scan နှင့် QC") , icon: ScanLine },
  { id: "workforce", label: BI("Workforce", "လုပ်သားအင်အား") , icon: Users },
  { id: "reports", label: BI("Reports", "အစီရင်ခံစာများ"), icon: FileSpreadsheet },
  { id: "notifications", label: BI("Notifications", "အသိပေးချက်များ"), icon: Bell },
  { id: "profile", label: BI("Hub Profile", "hub ပရိုဖိုင်") , icon: User },
];

const parcels: ParcelRecord[] = [
  {
    id: "p1",
    trackingNo: "BEX-W-51001",
    merchant: "Britium Ventures",
    destination: "Sanchaung, Yangon",
    zone: "YGN-Central",
    pieces: 1,
    codAmount: 35000,
    currentBin: "BIN-A12",
    currentStatus: "Staged",
    inboundTime: "09:15 AM",
    nextAction: "Rider handover",
  },
  {
    id: "p2",
    trackingNo: "BEX-W-51002",
    merchant: "City Fresh",
    destination: "Chanmyathazi, Mandalay",
    zone: "MDY-Central",
    pieces: 2,
    codAmount: 0,
    currentBin: "BIN-T03",
    currentStatus: "Transferred",
    inboundTime: "08:50 AM",
    nextAction: "In linehaul",
  },
  {
    id: "p3",
    trackingNo: "BEX-W-51003",
    merchant: "Golden Shop",
    destination: "North Okkalapa, Yangon",
    zone: "YGN-North",
    pieces: 1,
    codAmount: 18000,
    currentBin: "QC-HOLD-02",
    currentStatus: "Exception",
    inboundTime: "10:05 AM",
    nextAction: "Damage review",
  },
  {
    id: "p4",
    trackingNo: "BEX-W-51004",
    merchant: "Style Hub",
    destination: "Bahan, Yangon",
    zone: "YGN-East",
    pieces: 3,
    codAmount: 42000,
    currentBin: "SORT-C05",
    currentStatus: "Sorted",
    inboundTime: "11:12 AM",
    nextAction: "Dispatch staging",
  },
];

const transfers: TransferRecord[] = [
  {
    id: "t1",
    batchNo: "TR-APR-110",
    route: "Yangon Hub → Mandalay Hub",
    vehicle: "Van 3A",
    parcelCount: 128,
    status: BI("Loading", "တင်ဆောင်နေသည်"),
    departureTime: "04:00 PM",
    arrivalEta: "Tomorrow 06:30 AM",
  },
  {
    id: "t2",
    batchNo: "TR-APR-108",
    route: "Yangon Hub → Bago Branch",
    vehicle: "Truck 11B",
    parcelCount: 72,
    status: BI("Dispatched", "ထွက်ခွာပြီး"),
    departureTime: "12:30 PM",
    arrivalEta: "03:00 PM",
  },
  {
    id: "t3",
    batchNo: "TR-APR-103",
    route: "Yangon Hub → Naypyitaw Hub",
    vehicle: "Van 2C",
    parcelCount: 96,
    status: BI("Received", "လက်ခံပြီး"),
    departureTime: "Yesterday 07:00 PM",
    arrivalEta: "Completed",
  },
];

const exceptions: ExceptionRecord[] = [
  {
    id: "e1",
    trackingNo: "BEX-W-51003",
    issue: BI("Damaged Outer Packaging", "အပြင်ထုပ်ပိုးမှု ပျက်စီးနေသည်"),
    severity: "rose",
    note: BI("Corner tear found during inbound QC inspection.", "Inbound QC စစ်ဆေးစဉ်အတွင်း ထောင့်ပိုင်းကွဲနေသည်ကိုတွေ့ရှိသည်။"),
    status: BI("Pending Review", "စစ်ဆေးရန်စောင့်ဆိုင်း"),
    updatedAt: "11:25 AM",
  },
  {
    id: "e2",
    trackingNo: "BEX-W-50998",
    issue: BI("Label Mismatch", "label မကိုက်ညီမှု"),
    severity: "amber",
    note: BI("Printed label differs from manifest destination zone.", "ပုံနှိပ်ထားသော label သည် manifest destination zone နှင့်မကိုက်ညီပါ။"),
    status: BI("Sorting Hold", "sorting hold") ,
    updatedAt: "10:10 AM",
  },
  {
    id: "e3",
    trackingNo: "BEX-W-50974",
    issue: BI("Missing Parcel Piece", "parcel အပိုင်းတစ်ခု ပျောက်ဆုံး"),
    severity: "rose",
    note: BI("Shipment count 2 but only 1 piece scanned at dock.", "Shipment count 2 ဖြစ်သော်လည်း dock တွင် 1 piece သာ scan ဝင်ထားသည်။"),
    status: BI("Escalated", "တိုးမြှင့်တင်ပြပြီး"),
    updatedAt: "09:32 AM",
  },
];

const workforce: WorkforceTask[] = [
  { id: "w1", member: "Ko Min Thu", role: "Inbound Lead", station: "Dock A", assignedCount: 82, completion: 74, shift: "Morning" },
  { id: "w2", member: "Daw Hnin Wai", role: "Sorter", station: "Lane C", assignedCount: 126, completion: 88, shift: "Morning" },
  { id: "w3", member: "Ko Thet Naing", role: "QC Officer", station: "QC Desk 1", assignedCount: 28, completion: 62, shift: "Morning" },
  { id: "w4", member: "Daw Ei Cho", role: "Dispatch Clerk", station: "Staging 2", assignedCount: 51, completion: 79, shift: "Afternoon" },
];

const notifications: NotificationItem[] = [
  {
    id: "n1",
    title: BI("Inbound volume exceeded threshold", "ဝင်လာသောကုန်ပမာဏ သတ်မှတ်ချက်ကျော်လွန်နေသည်"),
    body: BI("Dock A has received 18% more parcels than hourly target.", "Dock A သည် တစ်နာရီပစ်မှတ်ထက် parcel 18% ပိုမိုလက်ခံထားသည်။"),
    time: "12 min ago",
    unread: true,
    tone: "amber",
  },
  {
    id: "n2",
    title: BI("Transfer batch ready for dispatch", "လွှဲပြောင်း batch ထွက်ခွာရန်အဆင်သင့်ဖြစ်နေသည်"),
    body: BI("TR-APR-110 has completed loading and awaits final scan release.", "TR-APR-110 သည် loading ပြီးစီးပြီး final scan release ကိုစောင့်ဆိုင်းနေသည်။"),
    time: "25 min ago",
    unread: true,
    tone: "blue",
  },
  {
    id: "n3",
    title: BI("Damage exception escalated", "ပျက်စီးမှု exception ကိုတိုးမြှင့်တင်ပြထားသည်"),
    body: BI("BEX-W-50974 requires manager review before staging release.", "BEX-W-50974 ကို staging release မလုပ်မီ မန်နေဂျာစစ်ဆေးရန်လိုအပ်သည်။"),
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

function statusTone(value: string): Tone {
  if (["Received", "Handed Over", "Scanned", "Sorted", "Staged", "Transferred", "Dispatched"].includes(value)) return "green";
  if (["Loading", "Pending Review", "Sorting Hold"].includes(value)) return "amber";
  if (["Exception", "Escalated", "Returned"].includes(value)) return "rose";
  return "blue";
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

function InputShell({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="group relative rounded-2xl border border-slate-200/90 bg-white/95 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)] focus-within:border-[#0d2c54]/35 focus-within:shadow-[0_0_0_4px_rgba(13,44,84,0.08)]">
      {icon ? <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">{icon}</div> : null}
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text", icon }: { value: string; onChange: (value: string) => void; placeholder: string; type?: string; icon?: ReactNode }) {
  return <InputShell icon={icon}><input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={tw("w-full rounded-2xl bg-transparent px-4 py-3.5 text-sm font-semibold text-[#0d2c54] outline-none placeholder:font-medium placeholder:text-slate-300", icon ? "pl-11" : "")} /></InputShell>;
}

function TextArea({ value, onChange, placeholder, rows = 4 }: { value: string; onChange: (value: string) => void; placeholder: string; rows?: number }) {
  return <InputShell><textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full resize-none rounded-2xl bg-transparent px-4 py-3.5 text-sm font-semibold text-[#0d2c54] outline-none placeholder:font-medium placeholder:text-slate-300" /></InputShell>;
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

function Label({ label, mode }: { label: Bi; mode: LanguageMode }) {
  return <BiText mode={mode} text={label} className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500" secondaryClassName="mb-2 text-xs font-semibold text-slate-400" />;
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
    return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-[28px] border border-dashed border-slate-200 bg-white/60"><Loader2 className="animate-spin text-[#0d2c54]" size={28} /><BiText mode={mode} text={BI("Loading warehouse workspace...", "warehouse workspace ကို တင်နေသည်...")} align="center" className="text-base font-black text-[#0d2c54]" secondaryClassName="mt-1 text-sm font-semibold text-slate-500" /></motion.div>;
  }
  if (state === "empty") {
    return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-[28px] border border-dashed border-slate-200 bg-white/60 px-8"><Inbox size={28} className="text-slate-400" /><BiText mode={mode} text={BI("No warehouse records available here", "ဤနေရာတွင် warehouse မှတ်တမ်းမရှိသေးပါ")} align="center" className="text-lg font-black text-[#0d2c54]" secondaryClassName="mt-2 text-sm font-semibold text-slate-500" /></motion.div>;
  }
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-[28px] border border-rose-200 bg-rose-50/70 px-8"><XCircle size={28} className="text-rose-500" /><BiText mode={mode} text={BI("Unable to load this warehouse section", "ဤ warehouse အပိုင်းကို မတင်နိုင်ပါ")} align="center" className="text-lg font-black text-rose-700" secondaryClassName="mt-2 text-sm font-semibold text-rose-600" /></motion.div>;
}

function ReadTile({ label, value, mode }: { label: Bi; value: string; mode: LanguageMode }) {
  return <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm"><BiText mode={mode} text={label} className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400" secondaryClassName="mt-1 text-xs font-semibold text-slate-400" /><div className="mt-3 text-base font-black text-[#0d2c54]">{value}</div></div>;
}

export default function WarehouseHubOperationsPortalPremium() {
  const [mode, setMode] = useState<LanguageMode>("both");
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [screenState, setScreenState] = useState<Record<TabKey, AsyncState>>({
    dashboard: "ready",
    intake: "ready",
    sorting: "ready",
    transfers: "ready",
    inventory: "ready",
    staging: "ready",
    exceptions: "ready",
    returns: "ready",
    handover: "ready",
    scanqc: "ready",
    workforce: "ready",
    reports: "ready",
    notifications: "ready",
    profile: "ready",
  });
  const [selectedParcelId, setSelectedParcelId] = useState<string>(parcels[0].id);
  const [scanValue, setScanValue] = useState("BEX-W-51001");
  const [intakeNote, setIntakeNote] = useState("");
  const [exceptionNote, setExceptionNote] = useState("");
  const [releaseSuccess, setReleaseSuccess] = useState(false);

  const activeState = screenState[tab];
  const selectedParcel = useMemo(() => parcels.find((p) => p.id === selectedParcelId) ?? parcels[0], [selectedParcelId]);
  const scannedParcel = useMemo(() => parcels.find((p) => p.trackingNo.toLowerCase() === scanValue.toLowerCase()) ?? null, [scanValue]);

  const metrics = useMemo(() => {
    const received = parcels.filter((p) => p.currentStatus === "Received" || p.currentStatus === "Scanned").length;
    const sorted = parcels.filter((p) => p.currentStatus === "Sorted").length;
    const staged = parcels.filter((p) => p.currentStatus === "Staged").length;
    const transferred = parcels.filter((p) => p.currentStatus === "Transferred").length;
    const exceptionsCount = parcels.filter((p) => p.currentStatus === "Exception").length;
    const codValue = parcels.reduce((sum, p) => sum + p.codAmount, 0);
    return { received, sorted, staged, transferred, exceptionsCount, codValue };
  }, []);

  const dashboardView = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard mode={mode} label={BI("Inbound Received", "ဝင်လာသောကုန်လက်ခံပြီး") } value={String(metrics.received)} icon={<Package2 size={18} />} />
        <MetricCard mode={mode} label={BI("Sorted Parcels", "ခွဲပြီး parcel များ") } value={String(metrics.sorted)} icon={<Boxes size={18} />} />
        <MetricCard mode={mode} label={BI("Staged for Dispatch", "dispatch staging ပြီး") } value={String(metrics.staged)} icon={<Truck size={18} />} />
        <MetricCard mode={mode} label={BI("Transfers In Motion", "လွှဲပြောင်းမှုလုပ်ဆောင်နေ") } value={String(transfers.filter((t) => t.status.en !== "Received").length)} icon={<ArrowRightLeft size={18} />} />
        <MetricCard mode={mode} label={BI("Exception Queue", "exception ဇယား") } value={String(metrics.exceptionsCount)} icon={<AlertTriangle size={18} />} />
        <MetricCard mode={mode} label={BI("COD Value in Hub", "hub အတွင်း COD တန်ဖိုး") } value={`${metrics.codValue.toLocaleString()} Ks`} icon={<FileText size={18} />} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-8">
          <SurfaceCard>
            <SectionTitle mode={mode} icon={<Sparkles size={18} />} title={BI("Quick Warehouse Actions", "warehouse အမြန်လုပ်ဆောင်မှုများ") } subtitle={BI("Fast shortcuts for scan intake, sorting, staging, transfers, QC, and rider handover.", "scan intake၊ sorting၊ staging၊ transfer၊ QC နှင့် rider handover အတွက်အမြန်လုပ်ဆောင်နိုင်သော shortcut များ။")} />
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[
                ["Inbound Intake", "ဝင်လာသောကုန်လက်ခံမှု", <Package2 size={18} />, "intake"],
                ["Sorting Lane", "ခွဲခြားသတ်မှတ်မှု", <Boxes size={18} />, "sorting"],
                ["Dispatch Staging", "dispatch staging", <Truck size={18} />, "staging"],
                ["Hub Transfers", "hub လွှဲပြောင်းမှု", <ArrowRightLeft size={18} />, "transfers"],
                ["Scan & QC", "scan နှင့် QC", <ScanLine size={18} />, "scanqc"],
                ["Rider Handover", "rider လွှဲပြောင်းမှု", <Handshake size={18} />, "handover"],
                ["Exceptions", "exception များ", <AlertTriangle size={18} />, "exceptions"],
                ["Reports", "အစီရင်ခံစာများ", <FileSpreadsheet size={18} />, "reports"],
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
            <SectionTitle mode={mode} icon={<Activity size={18} />} title={BI("Operational Flow Summary", "လုပ်ငန်းစဉ်အနှစ်ချုပ်") } subtitle={BI("Live parcel visibility from intake through sorting, staging, transfer, and exception handling.", "intake မှ sorting၊ staging၊ transfer နှင့် exception handling အထိ parcel အခြေအနေကိုတိုက်ရိုက်မြင်နိုင်သည်။")} />
            <div className="space-y-4">
              {parcels.map((parcel) => (
                <div key={parcel.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="text-base font-black text-[#0d2c54]">{parcel.trackingNo}</div>
                        <StatusBadge mode={mode} text={BI(parcel.currentStatus, parcel.currentStatus)} tone={statusTone(parcel.currentStatus)} />
                      </div>
                      <div className="mt-3 text-sm font-semibold text-slate-600">{parcel.merchant} • {parcel.destination}</div>
                      <div className="mt-2 text-sm font-medium text-slate-500">Bin {parcel.currentBin} • Next: {parcel.nextAction}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-[#0d2c54]">{parcel.zone} • {parcel.pieces} pcs</div>
                  </div>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>

        <div className="space-y-6 xl:col-span-4">
          <DarkCard>
            <BiText mode={mode} text={BI("Hub Summary", "hub အနှစ်ချုပ်") } className="text-2xl font-black text-white" secondaryClassName="mt-2 text-sm font-medium leading-6 text-white/60" />
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-base font-black text-white">Yangon Central Hub</div>
                <div className="mt-2 text-sm font-semibold text-white/70">Hub ID HUB-YGN-01 • Morning Shift</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/45">Dock Status</div>
                  <div className="mt-2 text-xl font-black text-[#ffd700]">Busy</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/45">Sort Lane</div>
                  <div className="mt-2 text-xl font-black text-white">Lane C</div>
                </div>
              </div>
            </div>
          </DarkCard>

          <SurfaceCard>
            <SectionTitle mode={mode} icon={<Bell size={18} />} title={BI("Operational Alerts", "လုပ်ငန်းသတိပေးချက်များ") } subtitle={BI("Inbound surges, transfer readiness, and exception escalations grouped for the hub team.", "inbound surge၊ transfer readiness နှင့် exception escalation များကို hub team အတွက်အုပ်စုဖွဲ့ပြသထားသည်။")} />
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

  const intakeView = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-7">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<Package2 size={18} />} title={BI("Inbound Intake Desk", "ဝင်လာသောကုန်လက်ခံရေး") } subtitle={BI("Receive inbound parcels, scan manifests, confirm pieces, and record intake notes at the dock.", "dock တွင် inbound parcel များကိုလက်ခံ၍ manifest scan လုပ်ခြင်း၊ piece count အတည်ပြုခြင်းနှင့် intake note မှတ်တမ်းတင်ခြင်း။")} />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div><Label mode={mode} label={BI("Scan Tracking / Manifest", "tracking / manifest scan") } /><TextInput value={scanValue} onChange={setScanValue} placeholder={bilingual(mode, BI("Scan or enter tracking number", "tracking number ကို scan လုပ်ပါ သို့မဟုတ် ထည့်ပါ"))} icon={<ScanLine size={15} />} /></div>
            <div><Label mode={mode} label={BI("Inbound Dock", "ဝင်ကုန် dock") } /><SelectInput value="Dock A" onChange={() => {}} options={[{ value: "Dock A", label: "Dock A" }, { value: "Dock B", label: "Dock B" }]} /></div>
            <div><Label mode={mode} label={BI("Piece Count", "piece အရေအတွက်") } /><TextInput value={scannedParcel ? String(scannedParcel.pieces) : ""} onChange={() => {}} placeholder="0" type="number" /></div>
            <div><Label mode={mode} label={BI("Initial Bin", "မူလ bin") } /><TextInput value={scannedParcel?.currentBin ?? ""} onChange={() => {}} placeholder="BIN-A12" /></div>
            <div className="md:col-span-2"><Label mode={mode} label={BI("Intake Notes", "လက်ခံမှတ်ချက်") } /><TextArea value={intakeNote} onChange={setIntakeNote} placeholder={bilingual(mode, BI("Add seal condition, package remarks, or discrepancy notes", "seal condition၊ package remark သို့မဟုတ် discrepancy note များထည့်ပါ"))} rows={4} /></div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <ActionButton><ScanLine size={15} /> Confirm Intake</ActionButton>
            <ActionButton tone="secondary"><ClipboardCheck size={15} /> Save Manifest Check</ActionButton>
          </div>
        </SurfaceCard>
      </div>
      <div className="space-y-6 xl:col-span-5">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<ClipboardCheck size={18} />} title={BI("Scanned Parcel Detail", "scan ဝင်ထားသော parcel အသေးစိတ်") } subtitle={BI("Immediate parcel detail preview to reduce intake mismatch and manual errors.", "intake mismatch နှင့် manual error များလျော့နည်းစေရန် parcel detail ကိုချက်ချင်းမြင်နိုင်သည်။")} />
          {scannedParcel ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ReadTile label={BI("Tracking", "tracking") } value={scannedParcel.trackingNo} mode={mode} />
              <ReadTile label={BI("Merchant", "merchant") } value={scannedParcel.merchant} mode={mode} />
              <ReadTile label={BI("Destination", "destination") } value={scannedParcel.destination} mode={mode} />
              <ReadTile label={BI("Current Status", "လက်ရှိအခြေအနေ") } value={scannedParcel.currentStatus} mode={mode} />
              <ReadTile label={BI("Current Bin", "လက်ရှိ bin") } value={scannedParcel.currentBin} mode={mode} />
              <ReadTile label={BI("Next Action", "နောက်လုပ်ဆောင်ရန်") } value={scannedParcel.nextAction} mode={mode} />
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-sm font-semibold text-slate-500">{bilingual(mode, BI("No parcel matched this scan input.", "ဤ scan input နှင့်ကိုက်ညီသော parcel မတွေ့ရှိပါ။"))}</div>
          )}
        </SurfaceCard>
      </div>
    </div>
  );

  const sortingView = (
    <div className="space-y-6">
      <SurfaceCard>
        <SectionTitle mode={mode} icon={<Boxes size={18} />} title={BI("Sorting Lane Operations", "sorting lane လုပ်ငန်းစဉ်") } subtitle={BI("Sort by zone, route, rider batch, and transfer line with clear bin assignment visibility.", "zone၊ route၊ rider batch နှင့် transfer line အလိုက်ခွဲပြီး bin assignment ကိုရှင်းလင်းစွာပြသထားသည်။")} />
        <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-8 gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
            <div>Tracking</div><div>Destination</div><div>Zone</div><div>Pieces</div><div>Bin</div><div>Status</div><div>Next Action</div><div>Action</div>
          </div>
          {parcels.map((parcel) => (
            <div key={parcel.id} className="grid grid-cols-8 gap-4 border-b border-slate-100 px-4 py-4 text-sm font-semibold text-[#0d2c54] last:border-b-0">
              <div>{parcel.trackingNo}</div><div>{parcel.destination}</div><div>{parcel.zone}</div><div>{parcel.pieces}</div><div>{parcel.currentBin}</div><div><StatusBadge mode={mode} text={BI(parcel.currentStatus, parcel.currentStatus)} tone={statusTone(parcel.currentStatus)} /></div><div>{parcel.nextAction}</div><div><button type="button" onClick={() => setSelectedParcelId(parcel.id)} className="font-black text-[#0d2c54] hover:text-sky-600">Assign</button></div>
            </div>
          ))}
        </div>
      </SurfaceCard>
    </div>
  );

  const transfersView = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-8">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<ArrowRightLeft size={18} />} title={BI("Hub Transfer Management", "hub လွှဲပြောင်းမှုစီမံခန့်ခွဲမှု") } subtitle={BI("Prepare inter-hub batches, loading status, vehicle assignment, transfer release, and ETA visibility.", "inter-hub batch ပြင်ဆင်ခြင်း၊ loading status၊ vehicle assignment၊ transfer release နှင့် ETA ကိုပြသသည်။")} />
          <div className="space-y-4">
            {transfers.map((transfer) => (
              <div key={transfer.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-base font-black text-[#0d2c54]">{transfer.batchNo}</div>
                    <div className="mt-2 text-sm font-semibold text-slate-600">{transfer.route}</div>
                    <div className="mt-2 text-sm font-medium text-slate-500">{transfer.vehicle} • {transfer.parcelCount} parcels</div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <StatusBadge mode={mode} text={transfer.status} tone={statusTone(transfer.status.en)} />
                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{transfer.departureTime} → {transfer.arrivalEta}</div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <ActionButton tone="secondary"><Forklift size={15} /> Loading Scan</ActionButton>
                  <ActionButton><Send size={15} /> Release Transfer</ActionButton>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </div>
      <div className="space-y-6 xl:col-span-4">
        <DarkCard>
          <BiText mode={mode} text={BI("Transfer Controls", "transfer ထိန်းချုပ်မှု") } className="text-xl font-black text-white" secondaryClassName="mt-2 text-sm font-medium leading-6 text-white/60" />
          <div className="mt-5 space-y-3 text-sm font-semibold text-white/75">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Verify parcel count before release / release မလုပ်မီ parcel count စစ်ဆေးပါ</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Confirm vehicle assignment / vehicle assignment အတည်ပြုပါ</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Complete final linehaul scan / final linehaul scan ပြီးစီးရမည်</div>
          </div>
        </DarkCard>
      </div>
    </div>
  );

  const inventoryView = (
    <div className="space-y-6">
      <SurfaceCard>
        <SectionTitle mode={mode} icon={<Warehouse size={18} />} title={BI("Bin & Inventory Visibility", "bin နှင့် inventory မြင်သာမှု") } subtitle={BI("Monitor where parcels are held across intake, sort, QC, staging, hold, and return bins.", "intake၊ sort၊ QC၊ staging၊ hold နှင့် return bin များအတွင်း parcel များတည်နေရာကိုစောင့်ကြည့်နိုင်သည်။")} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["BIN-A12", "12 parcels"],
            ["SORT-C05", "31 parcels"],
            ["QC-HOLD-02", "6 parcels"],
            ["STAGE-RIDER-1", "18 parcels"],
          ].map(([bin, count]) => (
            <motion.div key={String(bin)} whileHover={{ y: -2 }} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-base font-black text-[#0d2c54]">{bin}</div>
              <div className="mt-2 text-sm font-semibold text-slate-500">{count}</div>
            </motion.div>
          ))}
        </div>
      </SurfaceCard>
    </div>
  );

  const stagingView = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-8">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<Truck size={18} />} title={BI("Dispatch Staging", "dispatch staging") } subtitle={BI("Prepare rider-ready dispatch lanes with parcel grouping, route readiness, and final release checks.", "rider-ready dispatch lane များကို parcel grouping၊ route readiness နှင့် final release check များဖြင့်ပြင်ဆင်နိုင်သည်။")} />
          <div className="space-y-4">
            {parcels.filter((p) => ["Sorted", "Staged"].includes(p.currentStatus)).map((parcel) => (
              <div key={parcel.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3"><div className="text-base font-black text-[#0d2c54]">{parcel.trackingNo}</div><StatusBadge mode={mode} text={BI(parcel.currentStatus, parcel.currentStatus)} tone={statusTone(parcel.currentStatus)} /></div>
                    <div className="mt-2 text-sm font-semibold text-slate-600">{parcel.destination} • {parcel.zone}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-[#0d2c54]">Bin {parcel.currentBin}</div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <ActionButton tone="secondary"><MapPinned size={15} /> Assign Staging Lane</ActionButton>
                  <ActionButton><Send size={15} /> Mark Ready for Handover</ActionButton>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </div>
      <div className="space-y-6 xl:col-span-4">
        <DarkCard>
          <BiText mode={mode} text={BI("Staging Checklist", "staging checklist") } className="text-xl font-black text-white" secondaryClassName="mt-2 text-sm font-medium leading-6 text-white/60" />
          <div className="mt-5 space-y-3 text-sm font-semibold text-white/75">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Confirm route grouping / route grouping စစ်ဆေးပါ</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Perform final scan / final scan ပြုလုပ်ပါ</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Release to rider lane / rider lane သို့ထုတ်ပေးပါ</div>
          </div>
        </DarkCard>
      </div>
    </div>
  );

  const exceptionsView = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-8">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<AlertTriangle size={18} />} title={BI("Exception Management", "exception စီမံခန့်ခွဲမှု") } subtitle={BI("Damage, mismatch, missing piece, hold, and escalation cases with evidence and action notes.", "damage၊ mismatch၊ missing piece၊ hold နှင့် escalation case များကို evidence နှင့် action note များဖြင့်စီမံနိုင်သည်။")} />
          <div className="space-y-4">
            {exceptions.map((item) => (
              <div key={item.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-base font-black text-[#0d2c54]">{item.trackingNo}</div>
                    <BiText mode={mode} text={item.issue} className="mt-2 text-sm font-black text-[#0d2c54]" secondaryClassName="mt-1 text-sm font-semibold text-slate-500" />
                    <BiText mode={mode} text={item.note} className="mt-3 text-sm font-medium leading-6 text-slate-600" secondaryClassName="mt-1 text-sm font-medium leading-6 text-slate-500" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <StatusBadge mode={mode} text={item.status} tone={item.severity} />
                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{item.updatedAt}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </div>
      <div className="space-y-6 xl:col-span-4">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<Camera size={18} />} title={BI("Exception Note", "exception မှတ်ချက်") } subtitle={BI("Capture extra notes, photo evidence, and review actions for exception handling.", "exception handling အတွက် note၊ photo evidence နှင့် review action များကိုမှတ်တမ်းတင်ပါ။")} />
          <div className="space-y-4">
            <div><Label mode={mode} label={BI("Review Note", "review မှတ်ချက်") } /><TextArea value={exceptionNote} onChange={setExceptionNote} placeholder={bilingual(mode, BI("Add exception review note", "exception review note ထည့်ပါ"))} /></div>
            <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }} type="button" className="flex w-full items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-sm font-bold text-slate-500 transition hover:border-[#0d2c54]/30 hover:bg-white">
              <Upload size={18} /> {bilingual(mode, BI("Upload damage / exception photo", "damage / exception photo တင်မည်"))}
            </motion.button>
            <ActionButton><CheckCircle2 size={15} /> Save Exception Review</ActionButton>
          </div>
        </SurfaceCard>
      </div>
    </div>
  );

  const returnsView = (
    <div className="space-y-6">
      <SurfaceCard>
        <SectionTitle mode={mode} icon={<Flag size={18} />} title={BI("Returns / RTS Handling", "return / RTS ကိုင်တွယ်မှု") } subtitle={BI("Manage returned parcels, merchant-return instructions, hold bins, and reverse staging workflows.", "return parcel များ၊ merchant-return instruction၊ hold bin နှင့် reverse staging workflow များကိုစီမံနိုင်သည်။")} />
        <div className="space-y-4">
          {parcels.filter((p) => ["Exception", "Returned"].includes(p.currentStatus)).map((parcel) => (
            <div key={parcel.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-base font-black text-[#0d2c54]">{parcel.trackingNo}</div>
                  <div className="mt-2 text-sm font-semibold text-slate-600">{parcel.merchant} • {parcel.destination}</div>
                </div>
                <StatusBadge mode={mode} text={BI(parcel.currentStatus, parcel.currentStatus)} tone={statusTone(parcel.currentStatus)} />
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <ActionButton tone="secondary"><MapPinned size={15} /> Move to RTS Bin</ActionButton>
                <ActionButton><Send size={15} /> Prepare Return Transfer</ActionButton>
              </div>
            </div>
          ))}
        </div>
      </SurfaceCard>
    </div>
  );

  const handoverView = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-8">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<Handshake size={18} />} title={BI("Rider Handover Desk", "rider လွှဲပြောင်းရေး desk") } subtitle={BI("Release staged parcels to rider batches with final scan confirmation and route-ready checks.", "staged parcel များကို rider batch များသို့ final scan နှင့် route-ready check ဖြင့်ထုတ်ပေးနိုင်သည်။")} />
          <div className="space-y-4">
            {parcels.filter((p) => p.currentStatus === "Staged").map((parcel) => (
              <div key={parcel.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-base font-black text-[#0d2c54]">{parcel.trackingNo}</div>
                    <div className="mt-2 text-sm font-semibold text-slate-600">{parcel.destination} • {parcel.zone}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-[#0d2c54]">{parcel.currentBin}</div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <ActionButton tone="secondary"><ScanLine size={15} /> Final Handover Scan</ActionButton>
                  <ActionButton onClick={() => setReleaseSuccess(true)}><Handshake size={15} /> Release to Rider</ActionButton>
                </div>
              </div>
            ))}
          </div>
          <AnimatePresence>
            {releaseSuccess ? <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4"><BiText mode={mode} text={BI("Rider handover recorded successfully", "rider လွှဲပြောင်းမှုကိုအောင်မြင်စွာမှတ်တမ်းတင်ပြီး") } className="text-sm font-black text-emerald-700" secondaryClassName="mt-1 text-sm font-semibold text-emerald-600" /></motion.div> : null}
          </AnimatePresence>
        </SurfaceCard>
      </div>
      <div className="space-y-6 xl:col-span-4">
        <DarkCard>
          <BiText mode={mode} text={BI("Release Rules", "release စည်းကမ်းများ") } className="text-xl font-black text-white" secondaryClassName="mt-2 text-sm font-medium leading-6 text-white/60" />
          <div className="mt-5 space-y-3 text-sm font-semibold text-white/75">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Final scan must pass / final scan အောင်မြင်ရမည်</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Route must be assigned / route ချထားပေးပြီးဖြစ်ရမည်</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Exception parcels cannot release / exception parcel များကိုထုတ်မပေးနိုင်ပါ</div>
          </div>
        </DarkCard>
      </div>
    </div>
  );

  const scanQcView = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-7">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<ScanLine size={18} />} title={BI("Scan & QC Station", "scan နှင့် QC station") } subtitle={BI("Scan parcel IDs, validate labels, verify counts, and flag quality issues before next process steps.", "parcel ID scan လုပ်ခြင်း၊ label စစ်ဆေးခြင်း၊ count အတည်ပြုခြင်းနှင့် quality issue များကိုနောက်အဆင့်မတိုင်မီ flag လုပ်ခြင်း။")} />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div><Label mode={mode} label={BI("Scan Input", "scan input") } /><TextInput value={scanValue} onChange={setScanValue} placeholder={bilingual(mode, BI("Scan parcel ID", "parcel ID ကို scan လုပ်ပါ"))} icon={<QrCode size={15} />} /></div>
            <div><Label mode={mode} label={BI("QC Result", "QC ရလဒ်") } /><SelectInput value="pass" onChange={() => {}} options={[{ value: "pass", label: "Pass" }, { value: "hold", label: "Hold" }, { value: "damage", label: "Damage" }]} /></div>
            <div className="md:col-span-2"><Label mode={mode} label={BI("QC Notes", "QC မှတ်ချက်") } /><TextArea value={exceptionNote} onChange={setExceptionNote} placeholder={bilingual(mode, BI("Add QC findings or mismatch note", "QC finding သို့မဟုတ် mismatch note ထည့်ပါ"))} rows={4} /></div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <ActionButton><ScanLine size={15} /> Save Scan Result</ActionButton>
            <ActionButton tone="secondary"><Camera size={15} /> Attach QC Photo</ActionButton>
          </div>
        </SurfaceCard>
      </div>
      <div className="space-y-6 xl:col-span-5">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<ShieldCheck size={18} />} title={BI("QC Output", "QC output") } subtitle={BI("Immediate result view from scan station to reduce downstream warehouse errors.", "နောက်ပိုင်း warehouse error များလျော့နည်းစေရန် scan station ရလဒ်ကိုချက်ချင်းပြသသည်။")} />
          {scannedParcel ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><ReadTile label={BI("Tracking", "tracking") } value={scannedParcel.trackingNo} mode={mode} /><ReadTile label={BI("Bin", "bin") } value={scannedParcel.currentBin} mode={mode} /><ReadTile label={BI("Status", "အခြေအနေ") } value={scannedParcel.currentStatus} mode={mode} /><ReadTile label={BI("Zone", "ဇုန်") } value={scannedParcel.zone} mode={mode} /></div> : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-sm font-semibold text-slate-500">{bilingual(mode, BI("No parcel matched this scan input.", "ဤ scan input နှင့်ကိုက်ညီသော parcel မတွေ့ရှိပါ။"))}</div>}
        </SurfaceCard>
      </div>
    </div>
  );

  const workforceView = (
    <div className="space-y-6">
      <SurfaceCard>
        <SectionTitle mode={mode} icon={<Users size={18} />} title={BI("Workforce & Task Allocation", "လုပ်သားအင်အားနှင့် task ချထားပေးမှု") } subtitle={BI("Track station assignments, workload, completion, and operational balance across the shift.", "station assignment၊ workload၊ completion နှင့် shift အတွင်း operational balance ကိုစောင့်ကြည့်နိုင်သည်။")} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {workforce.map((member) => (
            <motion.div key={member.id} whileHover={{ y: -2 }} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-base font-black text-[#0d2c54]">{member.member}</div>
              <div className="mt-2 text-sm font-semibold text-slate-500">{member.role} • {member.station}</div>
              <div className="mt-4 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-[linear-gradient(90deg,#0d2c54_0%,#2563eb_100%)]" style={{ width: `${member.completion}%` }} /></div>
              <div className="mt-3 text-sm font-semibold text-slate-600">{member.assignedCount} assigned • {member.completion}% complete</div>
            </motion.div>
          ))}
        </div>
      </SurfaceCard>
    </div>
  );

  const reportsView = (
    <div className="space-y-6">
      <SurfaceCard>
        <SectionTitle mode={mode} icon={<FileSpreadsheet size={18} />} title={BI("Warehouse Reports", "warehouse အစီရင်ခံစာများ") } subtitle={BI("Inbound volume, sort productivity, staging backlog, transfer throughput, exception rate, and labor utilization summary.", "inbound volume၊ sort productivity၊ staging backlog၊ transfer throughput၊ exception rate နှင့် labor utilization summary များကိုပြသသည်။")} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard mode={mode} label={BI("Inbound Volume", "ဝင်လာသောကုန်ပမာဏ") } value="1,248" icon={<Package2 size={18} />} />
          <MetricCard mode={mode} label={BI("Sort Productivity", "sorting ထိရောက်မှု") } value="94%" icon={<Boxes size={18} />} />
          <MetricCard mode={mode} label={BI("Staging Backlog", "staging backlog") } value="26" icon={<Truck size={18} />} />
          <MetricCard mode={mode} label={BI("Transfer Throughput", "transfer throughput") } value="296" icon={<ArrowRightLeft size={18} />} />
          <MetricCard mode={mode} label={BI("Exception Rate", "exception နှုန်း") } value="1.8%" icon={<AlertTriangle size={18} />} />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <ActionButton tone="secondary"><FileSpreadsheet size={15} /> CSV</ActionButton>
          <ActionButton tone="secondary"><FileSpreadsheet size={15} /> XLSX</ActionButton>
          <ActionButton tone="secondary"><FileText size={15} /> PDF</ActionButton>
        </div>
      </SurfaceCard>
    </div>
  );

  const notificationsView = (
    <div className="space-y-6">
      <SurfaceCard>
        <SectionTitle mode={mode} icon={<Bell size={18} />} title={BI("Warehouse Notifications", "warehouse အသိပေးချက်များ") } subtitle={BI("Operational alerts, transfer notices, inbound pressure, and exception escalation grouped for hub teams.", "operational alert၊ transfer notice၊ inbound pressure နှင့် exception escalation များကို hub team အတွက်အုပ်စုဖွဲ့ပြသထားသည်။")} />
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

  const profileView = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-4">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<Warehouse size={18} />} title={BI("Hub Profile", "hub ပရိုဖိုင်") } subtitle={BI("Hub identity, operating shift, routing coverage, and basic operational metadata.", "hub identity၊ operating shift၊ routing coverage နှင့် operational metadata များ။")} />
          <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-inner">
            <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-slate-200 bg-white text-xl font-black text-[#0d2c54] shadow-sm">YH</div>
            <div className="mt-4 text-xl font-black text-[#0d2c54]">Yangon Central Hub</div>
            <div className="mt-2 text-sm font-semibold text-slate-500">Hub ID HUB-YGN-01 • Central Region Ops</div>
            <div className="mt-5 space-y-3 text-sm font-semibold text-slate-600">
              <div className="flex items-center gap-3"><CalendarClock size={15} /> Shift: 7:00 AM - 11:00 PM</div>
              <div className="flex items-center gap-3"><MapPinned size={15} /> Routes: Yangon / Bago / Naypyitaw / Mandalay</div>
              <div className="flex items-center gap-3"><Wrench size={15} /> Dock Count: 4 • Sort Lanes: 6</div>
            </div>
          </div>
        </SurfaceCard>
      </div>
      <div className="space-y-6 xl:col-span-8">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<ShieldCheck size={18} />} title={BI("Hub Settings", "hub setting များ") } subtitle={BI("Notification, language, release rules, and operational preference visibility for the hub workspace.", "hub workspace အတွက် notification၊ language၊ release rule နှင့် operational preference များ။")} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ReadTile label={BI("Primary Language", "အဓိကဘာသာစကား") } value="English + Myanmar" mode={mode} />
            <ReadTile label={BI("Dispatch Cutoff", "dispatch cutoff") } value="06:00 PM" mode={mode} />
            <ReadTile label={BI("Hub Status", "hub အခြေအနေ") } value="Operational" mode={mode} />
            <ReadTile label={BI("Dock Capacity", "dock စွမ်းရည်") } value="High Volume" mode={mode} />
          </div>
        </SurfaceCard>
      </div>
    </div>
  );

  const views: Record<TabKey, ReactNode> = {
    dashboard: dashboardView,
    intake: intakeView,
    sorting: sortingView,
    transfers: transfersView,
    inventory: inventoryView,
    staging: stagingView,
    exceptions: exceptionsView,
    returns: returnsView,
    handover: handoverView,
    scanqc: scanQcView,
    workforce: workforceView,
    reports: reportsView,
    notifications: notificationsView,
    profile: profileView,
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
                <span className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Warehouse / Hub Operations</span>
              </div>
              <BiText mode={mode} text={BI("Britium Express Warehouse Workspace", "Britium Express warehouse workspace") } className="mt-4 text-3xl font-black tracking-tight text-[#0d2c54] md:text-5xl" secondaryClassName="mt-3 text-base font-semibold text-slate-500 md:text-lg" />
              <BiText mode={mode} text={BI("A premium hub operations portal for intake, sorting, transfers, staging, exceptions, returns, and rider handover in one place.", "intake၊ sorting၊ transfer၊ staging၊ exception၊ return နှင့် rider handover များကိုတစ်နေရာတည်းတွင်စီမံနိုင်သော premium hub portal ဖြစ်သည်။") } className="mt-4 text-sm font-medium leading-6 text-slate-500 md:text-[15px]" secondaryClassName="mt-1 text-sm font-medium leading-6 text-slate-500 md:text-[15px]" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:w-[560px]">
              <SurfaceCard className="p-4">
                <BiText mode={mode} text={BI("Hub Identity", "hub အချက်အလက်") } className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400" secondaryClassName="mt-1 text-xs font-semibold text-slate-400" />
                <div className="mt-3 text-base font-black text-[#0d2c54]">Yangon Central Hub</div>
                <div className="mt-1 text-sm font-semibold text-slate-500">HUB-YGN-01 • Morning Shift</div>
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
            <ActionButton onClick={() => setTab("intake")}><Package2 size={15} /> Inbound Intake</ActionButton>
            <ActionButton tone="secondary" onClick={() => setTab("sorting")}><Boxes size={15} /> Sorting Lane</ActionButton>
            <ActionButton tone="secondary" onClick={() => setTab("handover")}><Handshake size={15} /> Rider Handover</ActionButton>
            <ActionButton tone="secondary" onClick={() => setTab("exceptions")}><AlertTriangle size={15} /> Exceptions</ActionButton>
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
