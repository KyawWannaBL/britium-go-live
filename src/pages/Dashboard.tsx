import React, { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Bell,
  BookOpen,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  CreditCard,
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  Filter,
  Headphones,
  History,
  Home,
  Inbox,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Package2,
  Phone,
  PieChart,
  Printer,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  Upload,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";

type Bi = { en: string; my: string };
type LanguageMode = "en" | "my" | "both";
type AsyncState = "ready" | "loading" | "empty" | "error";
type Tone = "blue" | "amber" | "green" | "rose" | "violet" | "slate";
type TabKey =
  | "dashboard"
  | "profile"
  | "booking"
  | "bulk"
  | "shipments"
  | "tracking"
  | "pickups"
  | "cod"
  | "billing"
  | "exceptions"
  | "reports"
  | "receivers"
  | "support"
  | "notifications";

type ShipmentStatus =
  | "Booked"
  | "Pickup Scheduled"
  | "Picked Up"
  | "At Hub"
  | "In Transit"
  | "Out for Delivery"
  | "Delivered"
  | "Failed Delivery"
  | "Returned";

type TransferStatus = "Pending" | "Transferred" | "On Hold";

type Shipment = {
  id: string;
  trackingNo: string;
  bookingDate: string;
  receiver: string;
  phone: string;
  destination: string;
  serviceType: string;
  codAmount: number;
  deliveryFee: number;
  pickupStatus: string;
  paymentStatus: string;
  returnStatus: string;
  status: ShipmentStatus;
  eta: string;
  location: string;
  rider?: string;
  proof?: string;
  failedReason?: string;
  returnReason?: string;
  timeline: Array<{ label: Bi; time: string; done: boolean }>;
};

type PickupRequest = {
  id: string;
  pickupDate: string;
  timeWindow: string;
  parcelCount: number;
  address: string;
  contact: string;
  status: Bi;
  riderStatus: Bi;
};

type CodStatement = {
  id: string;
  shipmentId: string;
  deliveredDate: string;
  receiver: string;
  codAmount: number;
  serviceFee: number;
  deduction: number;
  netPayable: number;
  transferStatus: TransferStatus;
  settlementBatch: string;
  transferDate: string;
};

type Invoice = {
  id: string;
  invoiceNo: string;
  billingPeriod: string;
  totalCharges: number;
  codFees: number;
  deductions: number;
  paymentStatus: Bi;
  dueDate: string;
};

type ExceptionCase = {
  id: string;
  trackingNo: string;
  receiver: string;
  issue: Bi;
  reason: Bi;
  status: Bi;
  updatedAt: string;
};

type Receiver = {
  id: string;
  name: string;
  phone: string;
  address: string;
  township: string;
  city: string;
  note: string;
  frequent?: boolean;
  recent?: boolean;
};

type Ticket = {
  id: string;
  subject: Bi;
  issueType: Bi;
  relatedShipmentId?: string;
  priority: Bi;
  status: Bi;
  lastUpdated: string;
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

const tabs: Array<{
  id: TabKey;
  label: Bi;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
}> = [
  { id: "dashboard", label: BI("Dashboard", "ပင်မအနှစ်ချုပ်"), icon: Home },
  { id: "profile", label: BI("Business Profile", "လုပ်ငန်းပရိုဖိုင်"), icon: Store },
  { id: "booking", label: BI("Create Shipment", "Shipment ဖန်တီးမည်"), icon: Package2 },
  { id: "bulk", label: BI("Bulk Upload", "အစုလိုက် upload"), icon: Upload },
  { id: "shipments", label: BI("Shipment Management", "Shipment စီမံခန့်ခွဲမှု"), icon: Boxes },
  { id: "tracking", label: BI("Cargo Tracking", "ကုန်ပစ္စည်းခြေရာခံမှု"), icon: Truck },
  { id: "pickups", label: BI("Pickup Requests", "Pickup တောင်းဆိုချက်များ"), icon: CalendarClock },
  { id: "cod", label: BI("COD & Settlement", "COD နှင့် စာရင်းရှင်းလင်းမှု"), icon: Wallet },
  { id: "billing", label: BI("Billing & Statements", "ငွေတောင်းခံမှုနှင့် statement များ"), icon: FileText },
  { id: "exceptions", label: BI("Returns & Exceptions", "Returns နှင့် Exception များ"), icon: AlertTriangle },
  { id: "reports", label: BI("Reports & Analytics", "အစီရင်ခံစာနှင့် Analytics"), icon: PieChart },
  { id: "receivers", label: BI("Receiver Directory", "လက်ခံသူစာရင်း"), icon: Users },
  { id: "support", label: BI("Support Center", "အကူအညီစင်တာ"), icon: Headphones },
  { id: "notifications", label: BI("Notifications", "အသိပေးချက်များ"), icon: Bell },
];

const shipments: Shipment[] = [
  {
    id: "1",
    trackingNo: "BEX-M-240101",
    bookingDate: "2026-04-05",
    receiver: "Daw Ei Ei",
    phone: "09 785 552 114",
    destination: "Sanchaung, Yangon",
    serviceType: "Same Day",
    codAmount: 35000,
    deliveryFee: 3500,
    pickupStatus: "Picked Up",
    paymentStatus: "COD Pending",
    returnStatus: "None",
    status: "Out for Delivery",
    eta: "Today 4:00 PM - 6:00 PM",
    location: "Sanchaung delivery zone",
    rider: "Ko Zaw Min",
    timeline: [
      { label: BI("Booked", "booking တင်ပြီး"), time: "Apr 5, 08:10", done: true },
      { label: BI("Pickup Scheduled", "pickup schedule ချပြီး"), time: "Apr 5, 09:00", done: true },
      { label: BI("Picked Up", "လာယူပြီး"), time: "Apr 5, 10:20", done: true },
      { label: BI("At Hub", "hub သို့ရောက်ရှိပြီး"), time: "Apr 5, 12:05", done: true },
      { label: BI("Out for Delivery", "ပို့ဆောင်ရန်ထွက်ခွာပြီး"), time: "Apr 6, 11:40", done: true },
      { label: BI("Delivered", "ပို့ဆောင်ပြီး"), time: "Pending", done: false },
    ],
  },
  {
    id: "2",
    trackingNo: "BEX-M-240102",
    bookingDate: "2026-04-04",
    receiver: "Ko Thant Zin",
    phone: "09 456 001 223",
    destination: "Chanmyathazi, Mandalay",
    serviceType: "Standard",
    codAmount: 0,
    deliveryFee: 5200,
    pickupStatus: "Picked Up",
    paymentStatus: "Paid",
    returnStatus: "None",
    status: "In Transit",
    eta: "Tomorrow by 8:00 PM",
    location: "Pyinmana transit hub",
    timeline: [
      { label: BI("Booked", "booking တင်ပြီး"), time: "Apr 4, 09:00", done: true },
      { label: BI("Pickup Scheduled", "pickup schedule ချပြီး"), time: "Apr 4, 09:40", done: true },
      { label: BI("Picked Up", "လာယူပြီး"), time: "Apr 4, 11:00", done: true },
      { label: BI("At Hub", "hub သို့ရောက်ရှိပြီး"), time: "Apr 4, 05:50", done: true },
      { label: BI("In Transit", "လမ်းကြောင်းပေါ်တွင်"), time: "Apr 5, 01:00", done: true },
      { label: BI("Delivered", "ပို့ဆောင်ပြီး"), time: "Pending", done: false },
    ],
  },
  {
    id: "3",
    trackingNo: "BEX-M-240097",
    bookingDate: "2026-04-02",
    receiver: "Daw Hnin Pwint",
    phone: "09 669 887 441",
    destination: "Bahan, Yangon",
    serviceType: "Express",
    codAmount: 42000,
    deliveryFee: 4200,
    pickupStatus: "Completed",
    paymentStatus: "Transferred",
    returnStatus: "None",
    status: "Delivered",
    eta: "Delivered",
    location: "Completed",
    proof: "Signed by receiver",
    timeline: [
      { label: BI("Booked", "booking တင်ပြီး"), time: "Apr 2, 08:30", done: true },
      { label: BI("Pickup Scheduled", "pickup schedule ချပြီး"), time: "Apr 2, 09:10", done: true },
      { label: BI("Picked Up", "လာယူပြီး"), time: "Apr 2, 11:25", done: true },
      { label: BI("At Hub", "hub သို့ရောက်ရှိပြီး"), time: "Apr 2, 12:50", done: true },
      { label: BI("Out for Delivery", "ပို့ဆောင်ရန်ထွက်ခွာပြီး"), time: "Apr 2, 03:20", done: true },
      { label: BI("Delivered", "ပို့ဆောင်ပြီး"), time: "Apr 2, 05:06", done: true },
    ],
  },
  {
    id: "4",
    trackingNo: "BEX-M-240090",
    bookingDate: "2026-04-01",
    receiver: "Ko Yadanar Htun",
    phone: "09 798 555 002",
    destination: "North Okkalapa, Yangon",
    serviceType: "Standard",
    codAmount: 18000,
    deliveryFee: 3000,
    pickupStatus: "Completed",
    paymentStatus: "COD On Hold",
    returnStatus: "Return in Progress",
    status: "Failed Delivery",
    eta: "Reattempt pending",
    location: "North Okkalapa branch",
    failedReason: "Receiver unreachable",
    returnReason: "Merchant instruction pending",
    timeline: [
      { label: BI("Booked", "booking တင်ပြီး"), time: "Apr 1, 09:20", done: true },
      { label: BI("Pickup Scheduled", "pickup schedule ချပြီး"), time: "Apr 1, 10:00", done: true },
      { label: BI("Picked Up", "လာယူပြီး"), time: "Apr 1, 12:15", done: true },
      { label: BI("At Hub", "hub သို့ရောက်ရှိပြီး"), time: "Apr 1, 03:00", done: true },
      { label: BI("Out for Delivery", "ပို့ဆောင်ရန်ထွက်ခွာပြီး"), time: "Apr 2, 10:40", done: true },
      { label: BI("Failed Delivery", "ပို့ဆောင်မှုမအောင်မြင်"), time: "Apr 2, 04:35", done: true },
      { label: BI("Returned", "ပြန်ပို့ပြီး"), time: "Pending", done: false },
    ],
  },
];

const pickupRequests: PickupRequest[] = [
  {
    id: "PU-0021",
    pickupDate: "2026-04-07",
    timeWindow: "10:00 AM - 12:00 PM",
    parcelCount: 18,
    address: "No. 28, Alan Pya Pagoda Road, Dagon, Yangon",
    contact: "Daw Thiri Mon",
    status: BI("Scheduled", "schedule ချပြီး"),
    riderStatus: BI("Assignment Pending", "rider ချထားပေးရန်စောင့်ဆိုင်း"),
  },
  {
    id: "PU-0019",
    pickupDate: "2026-04-05",
    timeWindow: "02:00 PM - 04:00 PM",
    parcelCount: 9,
    address: "Warehouse Lane 3, Hlaing Industrial Block",
    contact: "Ko Min Thu",
    status: BI("Completed", "ပြီးစီးပြီး"),
    riderStatus: BI("Collected", "လာယူပြီး"),
  },
];

const codStatements: CodStatement[] = [
  {
    id: "COD-01",
    shipmentId: "BEX-M-240097",
    deliveredDate: "2026-04-02",
    receiver: "Daw Hnin Pwint",
    codAmount: 42000,
    serviceFee: 4200,
    deduction: 600,
    netPayable: 37200,
    transferStatus: "Transferred",
    settlementBatch: "SET-APR-011",
    transferDate: "2026-04-04",
  },
  {
    id: "COD-02",
    shipmentId: "BEX-M-240101",
    deliveredDate: "Pending",
    receiver: "Daw Ei Ei",
    codAmount: 35000,
    serviceFee: 3500,
    deduction: 500,
    netPayable: 31000,
    transferStatus: "Pending",
    settlementBatch: "SET-APR-015",
    transferDate: "2026-04-08",
  },
  {
    id: "COD-03",
    shipmentId: "BEX-M-240090",
    deliveredDate: "Failed",
    receiver: "Ko Yadanar Htun",
    codAmount: 18000,
    serviceFee: 3000,
    deduction: 0,
    netPayable: 0,
    transferStatus: "On Hold",
    settlementBatch: "HOLD-APR-004",
    transferDate: "TBD",
  },
];

const invoices: Invoice[] = [
  {
    id: "INV-APR-001",
    invoiceNo: "INV-APR-001",
    billingPeriod: "April 1 - April 7, 2026",
    totalCharges: 215000,
    codFees: 8800,
    deductions: 2600,
    paymentStatus: BI("Partially Paid", "တစ်စိတ်တစ်ပိုင်းပေးချေပြီး"),
    dueDate: "2026-04-10",
  },
  {
    id: "INV-MAR-004",
    invoiceNo: "INV-MAR-004",
    billingPeriod: "March 1 - March 31, 2026",
    totalCharges: 745000,
    codFees: 36800,
    deductions: 9100,
    paymentStatus: BI("Paid", "ပေးချေပြီး"),
    dueDate: "2026-04-05",
  },
];

const exceptionCases: ExceptionCase[] = [
  {
    id: "EX-001",
    trackingNo: "BEX-M-240090",
    receiver: "Ko Yadanar Htun",
    issue: BI("Failed Delivery", "ပို့ဆောင်မှုမအောင်မြင်"),
    reason: BI("Receiver unreachable", "လက်ခံသူနှင့်မဆက်သွယ်နိုင်"),
    status: BI("Awaiting Merchant Instruction", "merchant ညွှန်ကြားချက်စောင့်ဆိုင်း"),
    updatedAt: "Today, 10:10 AM",
  },
  {
    id: "EX-002",
    trackingNo: "BEX-M-240085",
    receiver: "Daw San Myint",
    issue: BI("Return to Sender", "ပြန်ပို့ရန်"),
    reason: BI("Address incomplete", "လိပ်စာမပြည့်စုံ"),
    status: BI("Reschedule Requested", "ပြန်စီစဉ်ရန်တောင်းဆိုထား"),
    updatedAt: "Yesterday, 03:25 PM",
  },
];

const receivers: Receiver[] = [
  {
    id: "R-01",
    name: "Daw Ei Ei",
    phone: "09 785 552 114",
    address: "No. 17, Kyee Myint Daing Road",
    township: "Sanchaung",
    city: "Yangon",
    note: "Call before arrival",
    frequent: true,
  },
  {
    id: "R-02",
    name: "Ko Thant Zin",
    phone: "09 456 001 223",
    address: "64th Street, Near Diamond Plaza",
    township: "Chanmyathazi",
    city: "Mandalay",
    note: "Leave at reception",
    recent: true,
  },
  {
    id: "R-03",
    name: "Daw Hnin Pwint",
    phone: "09 669 887 441",
    address: "U Htaung Bo Road, Apartment 6A",
    township: "Bahan",
    city: "Yangon",
    note: "Fragile items only",
  },
];

const tickets: Ticket[] = [
  {
    id: "SUP-4401",
    subject: BI("COD transfer inquiry", "COD လွှဲပြောင်းမှုဆိုင်ရာမေးမြန်းချက်"),
    issueType: BI("COD Inquiry", "COD မေးမြန်းချက်"),
    relatedShipmentId: "BEX-M-240101",
    priority: BI("High", "မြင့်"),
    status: BI("In Review", "စစ်ဆေးနေသည်"),
    lastUpdated: "Today, 11:40 AM",
  },
  {
    id: "SUP-4388",
    subject: BI("Address correction for failed delivery", "failed delivery အတွက်လိပ်စာပြင်ဆင်ရန်"),
    issueType: BI("Shipment Complaint", "shipment တိုင်ကြားချက်"),
    relatedShipmentId: "BEX-M-240090",
    priority: BI("Normal", "ပုံမှန်"),
    status: BI("Open", "ဖွင့်ထားသည်"),
    lastUpdated: "Yesterday, 02:15 PM",
  },
];

const notifications: NotificationItem[] = [
  {
    id: "N1",
    title: BI("Shipment is out for delivery", "shipment ကိုပို့ဆောင်ရန်ထွက်ခွာပြီး"),
    body: BI("BEX-M-240101 will likely arrive today between 4:00 PM and 6:00 PM.", "BEX-M-240101 ကို ယနေ့ 4:00 PM နှင့် 6:00 PM ကြားတွင်ရောက်ရှိနိုင်သည်။"),
    time: "10 min ago",
    unread: true,
    tone: "blue",
  },
  {
    id: "N2",
    title: BI("COD settlement scheduled", "COD စာရင်းရှင်းလင်းမှု schedule ချပြီး"),
    body: BI("Your next COD transfer batch is planned for April 8, 2026.", "နောက်တစ်ကြိမ် COD လွှဲပြောင်းမှုကို 2026 ခုနှစ် ဧပြီ 8 ရက်တွင် စီစဉ်ထားသည်။"),
    time: "1 hour ago",
    unread: true,
    tone: "green",
  },
  {
    id: "N3",
    title: BI("Failed delivery requires your action", "failed delivery အတွက်သင့်ညွှန်ကြားချက်လိုအပ်သည်"),
    body: BI("Shipment BEX-M-240090 failed due to unreachable receiver. Please choose reattempt or return.", "လက်ခံသူနှင့်မဆက်သွယ်နိုင်သောကြောင့် BEX-M-240090 ပို့ဆောင်မှုမအောင်မြင်ပါ။ ပြန်ပို့မည် သို့မဟုတ် ထပ်မံပို့ဆောင်မည်ကိုရွေးချယ်ပါ။"),
    time: "Today",
    unread: false,
    tone: "rose",
  },
];

const knowledgeBase = [
  BI("How COD settlement works", "COD စာရင်းရှင်းလင်းပုံ"),
  BI("How to request reattempt delivery", "ပြန်လည်ပို့ဆောင်ရန်တောင်းဆိုပုံ"),
  BI("How to upload bulk shipments", "shipment များကိုအစုလိုက် upload လုပ်ပုံ"),
  BI("How to update receiver address", "လက်ခံသူလိပ်စာပြင်ဆင်ပုံ"),
  BI("How to download settlement statements", "settlement statement များကို download လုပ်ပုံ"),
];

const statusTone = (status: string): Tone => {
  if (["Delivered", "Transferred", "Paid", "Completed"].includes(status)) return "green";
  if (["Out for Delivery", "Booked", "Pickup Scheduled", "In Review"].includes(status)) return "blue";
  if (["Pending", "COD Pending", "On Hold", "Awaiting Merchant Instruction", "Partially Paid"].includes(status)) return "amber";
  if (["Failed Delivery", "Returned", "Open"].includes(status)) return "rose";
  return "slate";
};

function tw(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function bilingualText(mode: LanguageMode, text: Bi) {
  if (mode === "en") return text.en;
  if (mode === "my") return text.my;
  return `${text.en} / ${text.my}`;
}

function BiText({
  text,
  mode,
  className = "",
  secondaryClassName = "",
  align = "left",
}: {
  text: Bi;
  mode: LanguageMode;
  className?: string;
  secondaryClassName?: string;
  align?: "left" | "center";
}) {
  if (mode === "en") {
    return <div className={tw(align === "center" && "text-center", className)}>{text.en}</div>;
  }
  if (mode === "my") {
    return <div className={tw(align === "center" && "text-center", secondaryClassName || className)}>{text.my}</div>;
  }
  return (
    <div className={align === "center" ? "text-center" : "text-left"}>
      <div className={className}>{text.en}</div>
      <div className={secondaryClassName}>{text.my}</div>
    </div>
  );
}

function SurfaceCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2 }}
      className={tw(
        "rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </motion.section>
  );
}

function DarkCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={tw(
        "relative overflow-hidden rounded-[30px] border border-[#17375f] bg-[linear-gradient(180deg,#0d2c54_0%,#0a2343_100%)] p-6 text-white shadow-[0_24px_64px_rgba(13,44,84,0.36)]",
        className,
      )}
    >
      <div className="absolute -right-14 -top-14 h-44 w-44 rounded-full bg-[#ffd700]/10 blur-3xl" />
      <div className="absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-sky-400/10 blur-3xl" />
      <div className="relative z-10">{children}</div>
    </motion.section>
  );
}

function SectionTitle({
  icon,
  title,
  subtitle,
  mode,
}: {
  icon: ReactNode;
  title: Bi;
  subtitle?: Bi;
  mode: LanguageMode;
}) {
  return (
    <div className="mb-5 flex items-start gap-3 border-b border-slate-200/80 pb-5">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-[#0d2c54] shadow-inner">
        {icon}
      </div>
      <div>
        <BiText text={title} mode={mode} className="text-lg font-black tracking-tight text-[#0d2c54]" secondaryClassName="mt-1 text-sm font-semibold text-slate-500" />
        {subtitle ? (
          <BiText text={subtitle} mode={mode} className="mt-3 text-sm font-medium leading-6 text-slate-500" secondaryClassName="mt-1 text-sm font-medium leading-6 text-slate-500" />
        ) : null}
      </div>
    </div>
  );
}

function Label({ label, helper, mode }: { label: Bi; helper?: Bi; mode: LanguageMode }) {
  return (
    <div className="mb-2">
      <BiText text={label} mode={mode} className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500" secondaryClassName="mt-1 text-xs font-semibold text-slate-400" />
      {helper ? <BiText text={helper} mode={mode} className="mt-2 text-xs font-medium text-slate-400" secondaryClassName="mt-1 text-xs font-medium text-slate-400" /> : null}
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

function TextInput({ value, onChange, placeholder, icon, type = "text" }: { value: string; onChange: (value: string) => void; placeholder: string; icon?: ReactNode; type?: string }) {
  return (
    <InputShell icon={icon}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        className={tw(
          "w-full rounded-2xl bg-transparent px-4 py-3.5 text-sm font-semibold text-[#0d2c54] outline-none placeholder:font-medium placeholder:text-slate-300",
          icon ? "pl-11" : "",
        )}
        placeholder={placeholder}
      />
    </InputShell>
  );
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <InputShell>
      <ChevronRight size={16} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-slate-400" />
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full appearance-none rounded-2xl bg-transparent px-4 py-3.5 pr-10 text-sm font-semibold text-[#0d2c54] outline-none">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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

function ActionButton({ children, tone = "primary", onClick }: { children: ReactNode; tone?: "primary" | "secondary" | "danger"; onClick?: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -1, scale: 1.01 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      className={tw(
        "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-[0.16em] outline-none",
        tone === "primary" && "bg-[#0d2c54] text-white shadow-[0_18px_36px_rgba(13,44,84,0.2)]",
        tone === "secondary" && "border border-slate-200 bg-white text-slate-700 shadow-[0_12px_24px_rgba(15,23,42,0.05)]",
        tone === "danger" && "bg-rose-600 text-white shadow-[0_18px_36px_rgba(225,29,72,0.18)]",
      )}
    >
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
      <BiText text={label} mode={mode} className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500" secondaryClassName="mt-1 text-xs font-semibold text-slate-400" />
      <div className="mt-3 text-3xl font-black tracking-tight text-[#0d2c54]">{value}</div>
    </SurfaceCard>
  );
}

function ToggleCard({ checked, onChange, title, description, mode }: { checked: boolean; onChange: (next: boolean) => void; title: Bi; description: Bi; mode: LanguageMode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={tw("flex w-full items-center justify-between gap-4 rounded-2xl border px-4 py-4 text-left transition", checked ? "border-[#0d2c54]/15 bg-[#0d2c54]/[0.03]" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80")}>
      <div>
        <BiText text={title} mode={mode} className="text-sm font-bold text-[#0d2c54]" secondaryClassName="mt-1 text-xs font-semibold text-slate-500" />
        <BiText text={description} mode={mode} className="mt-2 text-xs font-medium leading-5 text-slate-500" secondaryClassName="mt-1 text-xs font-medium leading-5 text-slate-500" />
      </div>
      <motion.span animate={{ backgroundColor: checked ? "#ffd700" : "#e2e8f0" }} className="relative flex h-7 w-12 items-center rounded-full p-1">
        <motion.span layout transition={{ type: "spring", stiffness: 700, damping: 34 }} className="h-5 w-5 rounded-full bg-white shadow-sm" style={{ marginLeft: checked ? 20 : 0 }} />
      </motion.span>
    </button>
  );
}

function AsyncStateView({ state, mode }: { state: AsyncState; mode: LanguageMode }) {
  if (state === "ready") return null;
  if (state === "loading") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-[340px] flex-col items-center justify-center gap-4 rounded-[28px] border border-dashed border-slate-200 bg-white/60">
        <Loader2 className="animate-spin text-[#0d2c54]" size={28} />
        <BiText text={BI("Loading merchant workspace...", "merchant workspace ကို တင်နေသည်...")} mode={mode} align="center" className="text-base font-black text-[#0d2c54]" secondaryClassName="mt-1 text-sm font-semibold text-slate-500" />
      </motion.div>
    );
  }
  if (state === "empty") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-[340px] flex-col items-center justify-center gap-4 rounded-[28px] border border-dashed border-slate-200 bg-white/60 px-8">
        <Inbox size={28} className="text-slate-400" />
        <BiText text={BI("No merchant records available here", "ဤနေရာတွင် merchant မှတ်တမ်းမရှိသေးပါ") } mode={mode} align="center" className="text-lg font-black text-[#0d2c54]" secondaryClassName="mt-2 text-sm font-semibold text-slate-500" />
      </motion.div>
    );
  }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-[340px] flex-col items-center justify-center gap-4 rounded-[28px] border border-rose-200 bg-rose-50/70 px-8">
      <XCircle size={28} className="text-rose-500" />
      <BiText text={BI("Unable to load this section", "ဤအပိုင်းကို မတင်နိုင်ပါ") } mode={mode} align="center" className="text-lg font-black text-rose-700" secondaryClassName="mt-2 text-sm font-semibold text-rose-600" />
    </motion.div>
  );
}

function Timeline({ shipment, mode }: { shipment: Shipment; mode: LanguageMode }) {
  return (
    <div className="space-y-4">
      {shipment.timeline.map((step, index) => (
        <div key={`${step.label.en}-${index}`} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className={tw("flex h-8 w-8 items-center justify-center rounded-full border text-xs font-black", step.done ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-slate-200 bg-white text-slate-400")}>
              {step.done ? <CheckCircle2 size={16} /> : index + 1}
            </div>
            {index < shipment.timeline.length - 1 ? <div className={tw("mt-2 h-10 w-px", step.done ? "bg-emerald-200" : "bg-slate-200")} /> : null}
          </div>
          <div className="pb-4">
            <BiText text={step.label} mode={mode} className="text-sm font-black text-[#0d2c54]" secondaryClassName="mt-1 text-sm font-semibold text-slate-500" />
            <div className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">{step.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MerchantPortalPremium() {
  const [mode, setMode] = useState<LanguageMode>("both");
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [screenState, setScreenState] = useState<Record<TabKey, AsyncState>>({
    dashboard: "ready",
    profile: "ready",
    booking: "ready",
    bulk: "ready",
    shipments: "ready",
    tracking: "ready",
    pickups: "ready",
    cod: "ready",
    billing: "ready",
    exceptions: "ready",
    reports: "ready",
    receivers: "ready",
    support: "ready",
    notifications: "ready",
  });

  const [searchTracking, setSearchTracking] = useState("BEX-M-240101");
  const [selectedShipmentId, setSelectedShipmentId] = useState<string>(shipments[0].id);
  const [showShipmentDetail, setShowShipmentDetail] = useState(false);
  const [bulkUploaded, setBulkUploaded] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [ticketSuccess, setTicketSuccess] = useState(false);
  const [profileEdit, setProfileEdit] = useState(false);

  const [profile, setProfile] = useState({
    businessName: "Britium Ventures Company Limited",
    ownerName: "Daw Thiri Mon",
    merchantId: "MER-100248",
    phone: "09 421 556 221",
    email: "merchant@britiumexpress.com",
    registeredAddress: "No. 28, Alan Pya Pagoda Road, 5th Floor",
    pickupAddress: "No. 28, Alan Pya Pagoda Road, 5th Floor",
    township: "Dagon",
    city: "Yangon",
    region: "Yangon Region",
    businessType: "Fashion & Lifestyle Retail",
    preferredPaymentMethod: "Bank Transfer",
    bankAccount: "AYA Bank - 0013344558",
    settlementPreference: "Every 3 business days",
    memberSince: "January 2024",
    accountStatus: "Verified",
    languagePreference: "English + Myanmar",
  });

  const [booking, setBooking] = useState({
    merchantName: "Britium Ventures Company Limited",
    senderContact: "Daw Thiri Mon",
    pickupAddress: "No. 28, Alan Pya Pagoda Road, 5th Floor",
    pickupTownship: "Dagon",
    pickupCity: "Yangon",
    pickupInstructions: "Call before arrival",
    receiverName: "",
    receiverPhone: "",
    receiverEmail: "",
    deliveryAddress: "",
    deliveryTownship: "",
    deliveryCity: "Yangon",
    deliveryRegion: "Yangon Region",
    landmark: "",
    parcelType: "Parcel",
    itemDescription: "",
    quantity: "1",
    weight: "",
    length: "",
    width: "",
    height: "",
    fragile: false,
    urgent: false,
    declaredValue: "0",
    codAmount: "",
    deliveryNote: "",
    serviceType: "standard",
    pickupDate: "",
    deliverySlot: "",
    insurance: false,
    paymentResponsibility: "merchant",
    specialHandling: "",
  });

  const [pickupForm, setPickupForm] = useState({
    pickupDate: "",
    timeWindow: "10:00 AM - 12:00 PM",
    parcelCount: "10",
    notes: "",
    contactPerson: "Daw Thiri Mon",
    pickupAddress: "No. 28, Alan Pya Pagoda Road, Dagon, Yangon",
  });

  const [ticketForm, setTicketForm] = useState({
    ticketId: "SUP-4405",
    subject: "",
    issueType: "shipment",
    relatedShipmentId: "",
    priority: "normal",
    description: "",
  });

  const selectedShipment = useMemo(
    () => shipments.find((shipment) => shipment.id === selectedShipmentId) ?? shipments[0],
    [selectedShipmentId],
  );

  const searchedShipment = useMemo(
    () => shipments.find((shipment) => shipment.trackingNo.toLowerCase() === searchTracking.toLowerCase()) ?? null,
    [searchTracking],
  );

  const bookingEstimate = useMemo(() => {
    const baseRate = booking.serviceType === "same_day" ? 4200 : booking.serviceType === "next_day" ? 3600 : 3000;
    const weightCharge = Math.max(0, (parseFloat(booking.weight) || 0) - 1) * 600;
    const codFee = booking.codAmount ? 700 : 0;
    const insuranceFee = booking.insurance ? 800 : 0;
    const urgentFee = booking.urgent ? 900 : 0;
    const total = baseRate + weightCharge + codFee + insuranceFee + urgentFee;
    return { baseRate, weightCharge, codFee, insuranceFee, urgentFee, total };
  }, [booking]);

  const kpis = useMemo(() => {
    const delivered = shipments.filter((s) => s.status === "Delivered").length;
    const active = shipments.filter((s) => !["Delivered", "Returned"].includes(s.status)).length;
    const failed = shipments.filter((s) => s.status === "Failed Delivery").length;
    const pendingPickups = pickupRequests.filter((p) => p.status.en !== "Completed").length;
    const codCollected = codStatements.reduce((sum, item) => sum + item.codAmount, 0);
    const codPendingTransfer = codStatements.filter((item) => item.transferStatus === "Pending").reduce((sum, item) => sum + item.netPayable, 0);
    const codTransferred = codStatements.filter((item) => item.transferStatus === "Transferred").reduce((sum, item) => sum + item.netPayable, 0);
    const returns = shipments.filter((s) => s.status === "Returned" || s.returnStatus !== "None").length;
    return { delivered, active, failed, pendingPickups, codCollected, codPendingTransfer, codTransferred, returns };
  }, []);

  const activeState = screenState[tab];

  const dashboardView = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        <MetricCard mode={mode} label={BI("Today’s Shipments", "ယနေ့ shipment များ")} value="22" icon={<Package2 size={18} />} />
        <MetricCard mode={mode} label={BI("Active Shipments", "လက်ရှိ shipment များ")} value={String(kpis.active)} icon={<Truck size={18} />} />
        <MetricCard mode={mode} label={BI("Delivered Shipments", "ပို့ဆောင်ပြီး shipment များ")} value={String(kpis.delivered)} icon={<CheckCircle2 size={18} />} />
        <MetricCard mode={mode} label={BI("Failed Delivery Attempts", "ပို့ဆောင်မှုမအောင်မြင်မှုများ")} value={String(kpis.failed)} icon={<AlertTriangle size={18} />} />
        <MetricCard mode={mode} label={BI("Pending Pickups", "pickup စောင့်ဆိုင်းမှုများ")} value={String(kpis.pendingPickups)} icon={<CalendarClock size={18} />} />
        <MetricCard mode={mode} label={BI("Total COD Collected", "COD စုစုပေါင်းရရှိငွေ") } value={`${kpis.codCollected.toLocaleString()} Ks`} icon={<CircleDollarSign size={18} />} />
        <MetricCard mode={mode} label={BI("COD Pending Transfer", "လွှဲပြောင်းရန်ကျန် COD") } value={`${kpis.codPendingTransfer.toLocaleString()} Ks`} icon={<Clock3 size={18} />} />
        <MetricCard mode={mode} label={BI("COD Transferred", "လွှဲပြောင်းပြီး COD") } value={`${kpis.codTransferred.toLocaleString()} Ks`} icon={<Wallet size={18} />} />
        <MetricCard mode={mode} label={BI("Return Shipments", "return shipment များ") } value={String(kpis.returns)} icon={<History size={18} />} />
        <MetricCard mode={mode} label={BI("Open Support Tickets", "ဖွင့်ထားသော support ticket များ") } value={String(tickets.filter((t) => t.status.en !== "Resolved").length)} icon={<Headphones size={18} />} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-8">
          <SurfaceCard>
            <SectionTitle mode={mode} icon={<Sparkles size={18} />} title={BI("Quick Actions", "အမြန်လုပ်ဆောင်ရန်") } subtitle={BI("Common merchant actions surfaced as premium shortcuts for daily operations.", "နေ့စဉ်လုပ်ငန်းဆောင်ရွက်မှုအတွက် အသုံးများသော merchant action များကိုအမြန်အသုံးပြုနိုင်ရန် ပြသထားသည်။")} />
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[
                ["Create Shipment", "Shipment ဖန်တီးမည်", <Package2 size={18} />, "booking"],
                ["Bulk Upload", "အစုလိုက် upload", <Upload size={18} />, "bulk"],
                ["Request Pickup", "Pickup တောင်းဆိုမည်", <CalendarClock size={18} />, "pickups"],
                ["Track Shipments", "shipment များကိုခြေရာခံမည်", <Truck size={18} />, "tracking"],
                ["View COD Statement", "COD statement ကြည့်မည်", <Wallet size={18} />, "cod"],
                ["View Reports", "Report ကြည့်မည်", <PieChart size={18} />, "reports"],
                ["Shipment Management", "Shipment စီမံမည်", <Boxes size={18} />, "shipments"],
                ["Contact Support", "အကူအညီတောင်းမည်", <Headphones size={18} />, "support"],
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
            <SectionTitle mode={mode} icon={<Truck size={18} />} title={BI("Shipment & Pickup Summary", "shipment နှင့် pickup အနှစ်ချုပ်") } subtitle={BI("Live visibility into active shipments, pickup workload, and current delivery momentum.", "လက်ရှိ shipment၊ pickup workload နှင့် ပို့ဆောင်မှုအခြေအနေကိုတိုက်ရိုက်မြင်သာစွာကြည့်ရှုနိုင်သည်။")} />
            <div className="space-y-4">
              {shipments.slice(0, 3).map((shipment) => (
                <div key={shipment.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="text-base font-black text-[#0d2c54]">{shipment.trackingNo}</div>
                        <StatusBadge mode={mode} text={BI(shipment.status, shipment.status)} tone={statusTone(shipment.status)} />
                      </div>
                      <div className="mt-3 text-sm font-semibold text-slate-600">{shipment.receiver} • {shipment.destination}</div>
                      <div className="mt-2 text-sm font-medium text-slate-500">{shipment.location}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-[#0d2c54]">ETA: {shipment.eta}</div>
                  </div>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle mode={mode} icon={<Activity size={18} />} title={BI("Recent Activities", "မကြာသေးမီလှုပ်ရှားမှုများ") } subtitle={BI("An operational merchant feed across bookings, delivery updates, COD, and support workflows.", "booking၊ delivery update၊ COD နှင့် support workflow များဆိုင်ရာ merchant activity feed ဖြစ်သည်။")} />
            <div className="space-y-3">
              {notifications.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <BiText mode={mode} text={item.title} className="text-sm font-black text-[#0d2c54]" secondaryClassName="mt-1 text-sm font-semibold text-slate-500" />
                      <BiText mode={mode} text={item.body} className="mt-3 text-sm font-medium leading-6 text-slate-600" secondaryClassName="mt-1 text-sm font-medium leading-6 text-slate-500" />
                    </div>
                    {item.unread ? <span className="mt-1 h-3 w-3 rounded-full bg-sky-500" /> : null}
                  </div>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>

        <div className="space-y-6 xl:col-span-4">
          <DarkCard>
            <BiText mode={mode} text={BI("Merchant Summary", "merchant အနှစ်ချုပ်") } className="text-2xl font-black text-white" secondaryClassName="mt-2 text-sm font-medium leading-6 text-white/60" />
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-base font-black text-white">{profile.businessName}</div>
                <div className="mt-2 text-sm font-semibold text-white/70">{profile.ownerName} • {profile.merchantId}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/45">Account Status</div>
                  <div className="mt-2 text-xl font-black text-[#ffd700]">Verified</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/45">Settlement</div>
                  <div className="mt-2 text-xl font-black text-white">3 Days</div>
                </div>
              </div>
            </div>
          </DarkCard>

          <SurfaceCard>
            <SectionTitle mode={mode} icon={<Bell size={18} />} title={BI("Notification Center", "အသိပေးချက်စင်တာ") } subtitle={BI("COD alerts, pickup reminders, invoice notices, and shipment events in one place.", "COD alert၊ pickup reminder၊ invoice notice နှင့် shipment event များကို တစ်နေရာတည်းတွင်ကြည့်ရှုနိုင်သည်။")} />
            <div className="space-y-3">
              {notifications.slice(0, 3).map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <StatusBadge mode={mode} text={BI(item.time, item.time)} tone={item.tone} />
                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{item.time}</span>
                  </div>
                  <BiText mode={mode} text={item.title} className="mt-3 text-sm font-black text-[#0d2c54]" secondaryClassName="mt-1 text-sm font-semibold text-slate-500" />
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <SectionTitle mode={mode} icon={<Headphones size={18} />} title={BI("Support Overview", "Support အနှစ်ချုပ်") } subtitle={BI("Visibility into shipment complaints, COD inquiries, and billing support cases.", "shipment complaint၊ COD inquiry နှင့် billing support case များကိုမြင်သာစွာပြသသည်။")} />
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <div key={ticket.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-black text-[#0d2c54]">{ticket.id}</div>
                    <StatusBadge mode={mode} text={ticket.status} tone={statusTone(ticket.status.en)} />
                  </div>
                  <BiText mode={mode} text={ticket.subject} className="mt-3 text-sm font-black text-[#0d2c54]" secondaryClassName="mt-1 text-sm font-semibold text-slate-500" />
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>
      </div>
    </div>
  );

  const profileView = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-4">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<Store size={18} />} title={BI("Business Profile", "လုပ်ငန်းပရိုဖိုင်") } subtitle={BI("Merchant identity, sign-up details, and account trust indicators.", "merchant ၏အခြေခံအချက်အလက်များနှင့် ယုံကြည်စိတ်ချရမှုဆိုင်ရာအချက်များ။")} />
          <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-inner">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-slate-200 bg-white text-xl font-black text-[#0d2c54] shadow-sm">BV</div>
              </div>
              <StatusBadge mode={mode} text={BI(profile.accountStatus, "အတည်ပြုပြီး")} tone="green" />
            </div>
            <div className="mt-4 text-xl font-black text-[#0d2c54]">{profile.businessName}</div>
            <div className="mt-2 text-sm font-semibold text-slate-500">{profile.ownerName} • {profile.merchantId}</div>
            <div className="mt-5 space-y-3 text-sm font-semibold text-slate-600">
              <div className="flex items-center gap-3"><Phone size={15} /> {profile.phone}</div>
              <div className="flex items-center gap-3"><Mail size={15} /> {profile.email}</div>
              <div className="flex items-center gap-3"><MapPin size={15} /> {profile.registeredAddress}</div>
              <div className="flex items-center gap-3"><CalendarClock size={15} /> {profile.memberSince}</div>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <SectionTitle mode={mode} icon={<ShieldCheck size={18} />} title={BI("Security & Access", "လုံခြုံရေးနှင့် အသုံးပြုခွင့်") } subtitle={BI("Merchant account safety, device awareness, password updates, and sub-user readiness.", "account လုံခြုံရေး၊ device awareness၊ password update နှင့် sub-user readiness ဆိုင်ရာအချက်များ။")} />
          <div className="space-y-3">
            <ToggleCard mode={mode} checked title={BI("Device Session Awareness", "device session awareness") } description={BI("Notify this merchant when a new device signs in.", "device အသစ်ဖြင့်ဝင်ရောက်လျှင် merchant ကိုအသိပေးမည်။")} onChange={() => {}} />
            <ToggleCard mode={mode} checked title={BI("Financial Action Logging", "ငွေကြေးဆိုင်ရာလုပ်ဆောင်ချက်မှတ်တမ်း") } description={BI("Keep action logging for sensitive COD and billing actions.", "COD နှင့် billing ဆိုင်ရာအရေးကြီးလုပ်ဆောင်ချက်များကိုမှတ်တမ်းတင်ထားမည်။")} onChange={() => {}} />
            <ActionButton tone="secondary"><Lock size={15} /> Update Password / စကားဝှက်ပြင်မည်</ActionButton>
          </div>
        </SurfaceCard>
      </div>

      <div className="space-y-6 xl:col-span-8">
        <SurfaceCard>
          <div className="mb-5 flex items-center justify-between gap-3 border-b border-slate-200/80 pb-5">
            <div>
              <BiText mode={mode} text={BI("Merchant Profile & Business Settings", "merchant profile နှင့် business setting များ") } className="text-lg font-black tracking-tight text-[#0d2c54]" secondaryClassName="mt-1 text-sm font-semibold text-slate-500" />
              <BiText mode={mode} text={BI("Read-only overview with premium edit mode for merchant operational and financial preferences.", "merchant ၏ operational နှင့် financial preference များကို premium edit mode ဖြင့်ပြင်ဆင်နိုင်သော read-only overview ဖြစ်သည်။")} className="mt-3 text-sm font-medium leading-6 text-slate-500" secondaryClassName="mt-1 text-sm font-medium leading-6 text-slate-500" />
            </div>
            <ActionButton tone={profileEdit ? "primary" : "secondary"} onClick={() => setProfileEdit((prev) => !prev)}><Edit3 size={15} /> {profileEdit ? "Save Mode" : "Edit Mode"}</ActionButton>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <Label mode={mode} label={BI("Business Name", "လုပ်ငန်းအမည်")} />
              {profileEdit ? <TextInput value={profile.businessName} onChange={(v) => setProfile((prev) => ({ ...prev, businessName: v }))} placeholder="Business name" /> : <ReadField value={profile.businessName} />}
            </div>
            <div>
              <Label mode={mode} label={BI("Owner / Contact Name", "ပိုင်ရှင် / ဆက်သွယ်ရန်အမည်")} />
              {profileEdit ? <TextInput value={profile.ownerName} onChange={(v) => setProfile((prev) => ({ ...prev, ownerName: v }))} placeholder="Owner name" /> : <ReadField value={profile.ownerName} />}
            </div>
            <div>
              <Label mode={mode} label={BI("Phone Number", "ဖုန်းနံပါတ်")} />
              {profileEdit ? <TextInput value={profile.phone} onChange={(v) => setProfile((prev) => ({ ...prev, phone: v }))} placeholder="Phone" /> : <ReadField value={profile.phone} />}
            </div>
            <div>
              <Label mode={mode} label={BI("Email", "အီးမေးလ်")} />
              {profileEdit ? <TextInput value={profile.email} onChange={(v) => setProfile((prev) => ({ ...prev, email: v }))} placeholder="Email" /> : <ReadField value={profile.email} />}
            </div>
            <div>
              <Label mode={mode} label={BI("Registered Address", "မှတ်ပုံတင်လိပ်စာ")} />
              {profileEdit ? <TextArea value={profile.registeredAddress} onChange={(v) => setProfile((prev) => ({ ...prev, registeredAddress: v }))} placeholder="Registered address" /> : <ReadField value={profile.registeredAddress} />}
            </div>
            <div>
              <Label mode={mode} label={BI("Default Pickup Address", "မူလ pickup လိပ်စာ")} />
              {profileEdit ? <TextArea value={profile.pickupAddress} onChange={(v) => setProfile((prev) => ({ ...prev, pickupAddress: v }))} placeholder="Pickup address" /> : <ReadField value={profile.pickupAddress} />}
            </div>
            <div>
              <Label mode={mode} label={BI("Business Type", "လုပ်ငန်းအမျိုးအစား")} />
              {profileEdit ? <TextInput value={profile.businessType} onChange={(v) => setProfile((prev) => ({ ...prev, businessType: v }))} placeholder="Business type" /> : <ReadField value={profile.businessType} />}
            </div>
            <div>
              <Label mode={mode} label={BI("Preferred Payment Method", "ဦးစားပေးငွေပေးချေမှုပုံစံ")} />
              {profileEdit ? <SelectInput value={profile.preferredPaymentMethod} onChange={(v) => setProfile((prev) => ({ ...prev, preferredPaymentMethod: v }))} options={[{ value: "Bank Transfer", label: "Bank Transfer" }, { value: "Wallet", label: "Wallet" }, { value: "Cash Settlement", label: "Cash Settlement" }]} /> : <ReadField value={profile.preferredPaymentMethod} />}
            </div>
            <div>
              <Label mode={mode} label={BI("Bank Account Details", "ဘဏ်အကောင့်အချက်အလက်")} />
              {profileEdit ? <TextInput value={profile.bankAccount} onChange={(v) => setProfile((prev) => ({ ...prev, bankAccount: v }))} placeholder="Bank details" /> : <ReadField value={profile.bankAccount} />}
            </div>
            <div>
              <Label mode={mode} label={BI("COD Settlement Preference", "COD စာရင်းရှင်းလင်းမှုပုံစံ")} />
              {profileEdit ? <SelectInput value={profile.settlementPreference} onChange={(v) => setProfile((prev) => ({ ...prev, settlementPreference: v }))} options={[{ value: "Every 3 business days", label: "Every 3 business days" }, { value: "Weekly", label: "Weekly" }, { value: "On demand", label: "On demand" }]} /> : <ReadField value={profile.settlementPreference} />}
            </div>
          </div>
        </SurfaceCard>
      </div>
    </div>
  );

  const bookingView = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-8">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<Package2 size={18} />} title={BI("Create Shipment / Booking", "Shipment / Booking ဖန်တီးမည်") } subtitle={BI("A merchant-grade booking form with grouped sender, receiver, parcel, and service sections plus live pricing summary.", "sender၊ receiver၊ parcel၊ service အပိုင်းများအလိုက်စနစ်တကျဖွဲ့စည်းထားပြီး live pricing summary ပါဝင်သော merchant-grade booking form ဖြစ်သည်။")} />

          <div className="space-y-6">
            <div>
              <div className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-slate-400">Sender / Merchant Info</div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div><Label mode={mode} label={BI("Merchant Name", "merchant အမည်")}/><TextInput value={booking.merchantName} onChange={(v) => setBooking((prev) => ({ ...prev, merchantName: v }))} placeholder="Merchant name" /></div>
                <div><Label mode={mode} label={BI("Sender Contact", "ပေးပို့သူဆက်သွယ်ရန်")}/><TextInput value={booking.senderContact} onChange={(v) => setBooking((prev) => ({ ...prev, senderContact: v }))} placeholder="Contact name" /></div>
                <div className="md:col-span-2"><Label mode={mode} label={BI("Pickup Address", "pickup လိပ်စာ")}/><TextArea value={booking.pickupAddress} onChange={(v) => setBooking((prev) => ({ ...prev, pickupAddress: v }))} placeholder="Pickup address" /></div>
                <div><Label mode={mode} label={BI("Township", "မြို့နယ်")}/><TextInput value={booking.pickupTownship} onChange={(v) => setBooking((prev) => ({ ...prev, pickupTownship: v }))} placeholder="Township" /></div>
                <div><Label mode={mode} label={BI("City", "မြို့")}/><TextInput value={booking.pickupCity} onChange={(v) => setBooking((prev) => ({ ...prev, pickupCity: v }))} placeholder="City" /></div>
                <div className="md:col-span-2"><Label mode={mode} label={BI("Pickup Instructions", "pickup ညွှန်ကြားချက်")}/><TextArea value={booking.pickupInstructions} onChange={(v) => setBooking((prev) => ({ ...prev, pickupInstructions: v }))} placeholder="Pickup instructions" rows={3} /></div>
              </div>
            </div>

            <div>
              <div className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-slate-400">Receiver Info</div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div><Label mode={mode} label={BI("Receiver Name", "လက်ခံသူအမည်")}/><TextInput value={booking.receiverName} onChange={(v) => setBooking((prev) => ({ ...prev, receiverName: v }))} placeholder="Receiver name" /></div>
                <div><Label mode={mode} label={BI("Receiver Phone", "လက်ခံသူဖုန်း")}/><TextInput value={booking.receiverPhone} onChange={(v) => setBooking((prev) => ({ ...prev, receiverPhone: v }))} placeholder="Phone number" /></div>
                <div><Label mode={mode} label={BI("Receiver Email", "လက်ခံသူအီးမေးလ်")}/><TextInput value={booking.receiverEmail} onChange={(v) => setBooking((prev) => ({ ...prev, receiverEmail: v }))} placeholder="Optional email" /></div>
                <div><Label mode={mode} label={BI("Region", "တိုင်း / ပြည်နယ်")}/><TextInput value={booking.deliveryRegion} onChange={(v) => setBooking((prev) => ({ ...prev, deliveryRegion: v }))} placeholder="Region" /></div>
                <div className="md:col-span-2"><Label mode={mode} label={BI("Delivery Address", "ပို့ဆောင်လိပ်စာ")}/><TextArea value={booking.deliveryAddress} onChange={(v) => setBooking((prev) => ({ ...prev, deliveryAddress: v }))} placeholder="Delivery address" /></div>
                <div><Label mode={mode} label={BI("Township", "မြို့နယ်")}/><TextInput value={booking.deliveryTownship} onChange={(v) => setBooking((prev) => ({ ...prev, deliveryTownship: v }))} placeholder="Township" /></div>
                <div><Label mode={mode} label={BI("City", "မြို့")}/><TextInput value={booking.deliveryCity} onChange={(v) => setBooking((prev) => ({ ...prev, deliveryCity: v }))} placeholder="City" /></div>
                <div className="md:col-span-2"><Label mode={mode} label={BI("Landmark / Instructions", "မှတ်တိုင် / ညွှန်ကြားချက်")}/><TextArea value={booking.landmark} onChange={(v) => setBooking((prev) => ({ ...prev, landmark: v }))} placeholder="Landmark or delivery instruction" rows={3} /></div>
              </div>
            </div>

            <div>
              <div className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-slate-400">Shipment / Parcel Info</div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                <div><Label mode={mode} label={BI("Parcel Type", "parcel အမျိုးအစား")}/><SelectInput value={booking.parcelType} onChange={(v) => setBooking((prev) => ({ ...prev, parcelType: v }))} options={[{ value: "Parcel", label: "Parcel" }, { value: "Document", label: "Document" }, { value: "Fragile Item", label: "Fragile Item" }]} /></div>
                <div className="xl:col-span-2"><Label mode={mode} label={BI("Item Description", "ပစ္စည်းအမည်")}/><TextInput value={booking.itemDescription} onChange={(v) => setBooking((prev) => ({ ...prev, itemDescription: v }))} placeholder="Item description" /></div>
                <div><Label mode={mode} label={BI("Quantity", "အရေအတွက်")}/><TextInput value={booking.quantity} onChange={(v) => setBooking((prev) => ({ ...prev, quantity: v }))} placeholder="1" type="number" /></div>
                <div><Label mode={mode} label={BI("Weight (kg)", "အလေးချိန် (kg)")}/><TextInput value={booking.weight} onChange={(v) => setBooking((prev) => ({ ...prev, weight: v }))} placeholder="0" type="number" /></div>
                <div><Label mode={mode} label={BI("Declared Value", "ကြေညာထားသောတန်ဖိုး")}/><TextInput value={booking.declaredValue} onChange={(v) => setBooking((prev) => ({ ...prev, declaredValue: v }))} placeholder="0" type="number" /></div>
                <div><Label mode={mode} label={BI("Length", "အလျား")}/><TextInput value={booking.length} onChange={(v) => setBooking((prev) => ({ ...prev, length: v }))} placeholder="L" type="number" /></div>
                <div><Label mode={mode} label={BI("Width", "အနံ")}/><TextInput value={booking.width} onChange={(v) => setBooking((prev) => ({ ...prev, width: v }))} placeholder="W" type="number" /></div>
                <div><Label mode={mode} label={BI("Height", "အမြင့်")}/><TextInput value={booking.height} onChange={(v) => setBooking((prev) => ({ ...prev, height: v }))} placeholder="H" type="number" /></div>
                <div><Label mode={mode} label={BI("COD Amount", "COD ငွေပမာဏ")}/><TextInput value={booking.codAmount} onChange={(v) => setBooking((prev) => ({ ...prev, codAmount: v }))} placeholder="0" type="number" /></div>
                <div className="xl:col-span-2"><Label mode={mode} label={BI("Delivery Note", "ပို့ဆောင်မှုမှတ်ချက်")}/><TextInput value={booking.deliveryNote} onChange={(v) => setBooking((prev) => ({ ...prev, deliveryNote: v }))} placeholder="Delivery note" /></div>
              </div>
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <ToggleCard mode={mode} checked={booking.fragile} onChange={(next) => setBooking((prev) => ({ ...prev, fragile: next }))} title={BI("Fragile", "ကွဲလွယ်သည်") } description={BI("Enable careful handling for breakable parcels.", "ကွဲလွယ်သောပစ္စည်းအတွက် ဂရုတစိုက်ကိုင်တွယ်မှုကိုဖွင့်ပါ။")} />
                <ToggleCard mode={mode} checked={booking.urgent} onChange={(next) => setBooking((prev) => ({ ...prev, urgent: next }))} title={BI("Urgent", "အရေးပေါ်") } description={BI("Prioritize this booking for faster handling.", "ဤ booking ကို ဦးစားပေးကိုင်တွယ်မည်။")} />
              </div>
            </div>

            <div>
              <div className="mb-4 text-sm font-black uppercase tracking-[0.18em] text-slate-400">Service Options</div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                <div><Label mode={mode} label={BI("Service Type", "ဝန်ဆောင်မှုအမျိုးအစား")}/><SelectInput value={booking.serviceType} onChange={(v) => setBooking((prev) => ({ ...prev, serviceType: v }))} options={[{ value: "standard", label: "Standard" }, { value: "next_day", label: "Next Day" }, { value: "same_day", label: "Same Day" }]} /></div>
                <div><Label mode={mode} label={BI("Pickup Date", "pickup ရက်")}/><TextInput value={booking.pickupDate} onChange={(v) => setBooking((prev) => ({ ...prev, pickupDate: v }))} placeholder="Pickup date" type="date" /></div>
                <div><Label mode={mode} label={BI("Preferred Delivery Slot", "ဦးစားပေးပို့ဆောင်ချိန်")}/><TextInput value={booking.deliverySlot} onChange={(v) => setBooking((prev) => ({ ...prev, deliverySlot: v }))} placeholder="Preferred slot" type="time" /></div>
                <div><Label mode={mode} label={BI("Payment Responsibility", "ပို့ခပေးမည့်သူ")}/><SelectInput value={booking.paymentResponsibility} onChange={(v) => setBooking((prev) => ({ ...prev, paymentResponsibility: v }))} options={[{ value: "merchant", label: "Merchant" }, { value: "receiver", label: "Receiver" }]} /></div>
                <div className="xl:col-span-2"><Label mode={mode} label={BI("Special Handling", "အထူးကိုင်တွယ်မှု")}/><TextInput value={booking.specialHandling} onChange={(v) => setBooking((prev) => ({ ...prev, specialHandling: v }))} placeholder="Optional special handling" /></div>
              </div>
              <div className="mt-5">
                <ToggleCard mode={mode} checked={booking.insurance} onChange={(next) => setBooking((prev) => ({ ...prev, insurance: next }))} title={BI("Insurance Option", "အာမခံရွေးချယ်မှု") } description={BI("Add optional shipment insurance for declared value protection.", "ကြေညာထားသောတန်ဖိုးအတွက် optional shipment insurance ထည့်သွင်းပါ။")} />
              </div>
            </div>
          </div>
        </SurfaceCard>
      </div>

      <div className="space-y-6 xl:col-span-4 xl:sticky xl:top-6 xl:self-start">
        <DarkCard>
          <BiText mode={mode} text={BI("Booking Summary", "booking အနှစ်ချုပ်") } className="text-2xl font-black text-white" secondaryClassName="mt-2 text-sm font-medium leading-6 text-white/60" />
          <div className="mt-5 space-y-3 rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
            <Line label={BI("Base Delivery Fee", "မူလပို့ဆောင်ခ")} value={bookingEstimate.baseRate} mode={mode} dark />
            <Line label={BI("Weight Surcharge", "အလေးချိန်ပိုကြေး")} value={bookingEstimate.weightCharge} mode={mode} dark />
            <Line label={BI("COD Handling Fee", "COD ဝန်ဆောင်မှုကြေး")} value={bookingEstimate.codFee} mode={mode} dark />
            <Line label={BI("Insurance Fee", "အာမခံကြေး")} value={bookingEstimate.insuranceFee} mode={mode} dark />
            <Line label={BI("Urgent Surcharge", "အရေးပေါ်ဝန်ဆောင်မှုကြေး")} value={bookingEstimate.urgentFee} mode={mode} dark />
            <div className="mt-3 border-t border-white/10 pt-3 flex items-center justify-between text-base font-black text-[#ffd700]">
              <span>{bilingualText(mode, BI("Total Estimated Charge", "ခန့်မှန်းစုစုပေါင်းကျသင့်ငွေ"))}</span>
              <span>{bookingEstimate.total.toLocaleString()} Ks</span>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-3">
            <ActionButton onClick={() => setBookingSuccess(true)}><CheckCircle2 size={15} /> Submit Booking / booking အတည်ပြုမည်</ActionButton>
            <ActionButton tone="secondary"><FileText size={15} /> Save Draft / draft သိမ်းမည်</ActionButton>
          </div>
          <AnimatePresence>
            {bookingSuccess ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-4 rounded-2xl border border-emerald-300/50 bg-emerald-50/10 px-4 py-4">
                <BiText mode={mode} text={BI("Booking submitted successfully", "booking ကို အောင်မြင်စွာတင်သွင်းပြီး") } className="text-sm font-black text-[#ffd700]" secondaryClassName="mt-2 text-sm font-medium leading-6 text-white/70" />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </DarkCard>
      </div>
    </div>
  );

  const bulkView = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-8">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<Upload size={18} />} title={BI("Bulk Shipment Upload", "shipment များကိုအစုလိုက် upload လုပ်မည်") } subtitle={BI("A merchant-friendly CSV/XLSX workflow with template download, row validation, duplicate detection, preview, and retry tools.", "template download၊ row validation၊ duplicate detection၊ preview နှင့် retry tool များပါဝင်သော merchant-friendly CSV/XLSX workflow ဖြစ်သည်။")} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <ActionButton tone="secondary"><Download size={15} /> Download Template / template download</ActionButton>
            <ActionButton tone="secondary"><FileSpreadsheet size={15} /> CSV Import / CSV import</ActionButton>
            <ActionButton tone="secondary"><FileSpreadsheet size={15} /> XLSX Import / XLSX import</ActionButton>
          </div>
          <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.995 }} className="mt-5 flex min-h-[180px] flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-slate-50/80 px-8 text-center">
            <Upload size={28} className="text-slate-400" />
            <BiText mode={mode} text={BI("Drag and drop CSV/XLSX file here", "CSV/XLSX ဖိုင်ကို ဤနေရာသို့ဆွဲချပါ") } align="center" className="mt-4 text-base font-black text-[#0d2c54]" secondaryClassName="mt-2 text-sm font-semibold text-slate-500" />
            <div className="mt-4"><ActionButton onClick={() => setBulkUploaded(true)}>Upload File / ဖိုင်တင်မည်</ActionButton></div>
          </motion.div>
        </SurfaceCard>

        <AnimatePresence>
          {bulkUploaded ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <SurfaceCard>
                <SectionTitle mode={mode} icon={<ClipboardList size={18} />} title={BI("Column Mapping Preview", "column mapping preview") } subtitle={BI("Preview imported columns before batch submission.", "batch submit မလုပ်မီ imported column များကိုကြည့်ရှုနိုင်သည်။")} />
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {[
                    ["receiver_name", "receiver_name"],
                    ["phone", "phone"],
                    ["address", "address"],
                    ["cod_amount", "cod_amount"],
                  ].map(([source, target]) => (
                    <div key={source} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-sm font-semibold text-slate-600">{source} → {target}</div>
                  ))}
                </div>
              </SurfaceCard>

              <SurfaceCard>
                <SectionTitle mode={mode} icon={<AlertCircle size={18} />} title={BI("Validation & Duplicate Detection", "validation နှင့် duplicate detection") } subtitle={BI("Review row issues, duplicates, and required corrections before upload approval.", "upload approve မလုပ်မီ row error များ၊ duplicate များနှင့်ပြင်ဆင်ရန်လိုအပ်သောအချက်များကိုစစ်ဆေးပါ။")} />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <MetricCard mode={mode} label={BI("Imported Rows", "import လုပ်ထားသော row များ")} value="124" icon={<FileSpreadsheet size={18} />} />
                  <MetricCard mode={mode} label={BI("Failed Rows", "မအောင်မြင်သော row များ")} value="06" icon={<XCircle size={18} />} />
                  <MetricCard mode={mode} label={BI("Duplicate Rows", "duplicate row များ")} value="03" icon={<AlertTriangle size={18} />} />
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <ActionButton tone="secondary"><FileText size={15} /> Save Draft Batch / batch draft သိမ်းမည်</ActionButton>
                  <ActionButton><Send size={15} /> Submit Batch / batch တင်သွင်းမည်</ActionButton>
                  <ActionButton tone="secondary"><Download size={15} /> Export Failed Rows / failed row များထုတ်ယူမည်</ActionButton>
                </div>
              </SurfaceCard>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="space-y-6 xl:col-span-4">
        <DarkCard>
          <BiText mode={mode} text={BI("Bulk Upload Guide", "bulk upload လမ်းညွှန်") } className="text-xl font-black text-white" secondaryClassName="mt-2 text-sm font-medium leading-6 text-white/60" />
          <div className="mt-5 space-y-3 text-sm font-semibold text-white/75">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Download the latest merchant template / merchant template နောက်ဆုံးဗားရှင်းကို download လုပ်ပါ</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Preview column mapping before submission / submit မလုပ်မီ column mapping ကိုစစ်ဆေးပါ</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Retry failed records after correction / ပြင်ဆင်ပြီးသော failed record များကိုပြန်တင်နိုင်သည်</div>
          </div>
        </DarkCard>
      </div>
    </div>
  );

  const shipmentsView = (
    <div className="space-y-6">
      <SurfaceCard>
        <SectionTitle mode={mode} icon={<Boxes size={18} />} title={BI("Shipment Management", "shipment စီမံခန့်ခွဲမှု") } subtitle={BI("Searchable merchant shipment list with operational filters, actions, invoices, and reorder tools.", "search၊ filter၊ action၊ invoice နှင့် reorder tool များပါသော merchant shipment list ဖြစ်သည်။")} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <TextInput value="" onChange={() => {}} placeholder={bilingualText(mode, BI("Search tracking / receiver / destination", "tracking / လက်ခံသူ / destination ရှာဖွေမည်"))} icon={<Search size={15} />} />
          <SelectInput value="all" onChange={() => {}} options={[{ value: "all", label: bilingualText(mode, BI("All Statuses", "အခြေအနေအားလုံး")) }, { value: "delivered", label: "Delivered" }, { value: "in_transit", label: "In Transit" }]} />
          <SelectInput value="all" onChange={() => {}} options={[{ value: "all", label: bilingualText(mode, BI("All Destinations", "destination အားလုံး")) }, { value: "yangon", label: "Yangon" }, { value: "mandalay", label: "Mandalay" }]} />
          <SelectInput value="all" onChange={() => {}} options={[{ value: "all", label: bilingualText(mode, BI("COD Filter", "COD filter")) }, { value: "cod", label: "COD" }, { value: "non_cod", label: "Non-COD" }]} />
          <TextInput value="2026-04-01" onChange={() => {}} placeholder="Start" type="date" />
          <TextInput value="2026-04-30" onChange={() => {}} placeholder="End" type="date" />
        </div>

        <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-11 gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
            <div>Tracking</div><div>Booking Date</div><div>Receiver</div><div>Destination</div><div>Service</div><div>COD</div><div>Fee</div><div>Status</div><div>Pickup</div><div>Return</div><div>Actions</div>
          </div>
          {shipments.map((shipment) => (
            <div key={shipment.id} className="grid grid-cols-11 gap-4 border-b border-slate-100 px-4 py-4 text-sm font-semibold text-[#0d2c54] last:border-b-0">
              <div>{shipment.trackingNo}</div>
              <div>{shipment.bookingDate}</div>
              <div>{shipment.receiver}</div>
              <div>{shipment.destination}</div>
              <div>{shipment.serviceType}</div>
              <div>{shipment.codAmount.toLocaleString()}</div>
              <div>{shipment.deliveryFee.toLocaleString()}</div>
              <div><StatusBadge mode={mode} text={BI(shipment.status, shipment.status)} tone={statusTone(shipment.status)} /></div>
              <div>{shipment.pickupStatus}</div>
              <div>{shipment.returnStatus}</div>
              <div className="flex flex-wrap gap-2 text-xs">
                <button type="button" onClick={() => { setSelectedShipmentId(shipment.id); setShowShipmentDetail(true); }} className="font-black text-[#0d2c54] hover:text-sky-600">View</button>
                <button type="button" onClick={() => { setSearchTracking(shipment.trackingNo); setTab("tracking"); }} className="font-black text-[#0d2c54] hover:text-sky-600">Track</button>
              </div>
            </div>
          ))}
        </div>
      </SurfaceCard>

      <AnimatePresence>
        {showShipmentDetail ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/30 p-4 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }} className="h-full w-full max-w-2xl overflow-y-auto rounded-[28px] border border-white/60 bg-white p-6 shadow-[0_24px_56px_rgba(15,23,42,0.18)]">
              <div className="mb-5 flex items-center justify-between gap-3 border-b border-slate-200 pb-5">
                <BiText mode={mode} text={BI("Shipment Detail", "shipment အသေးစိတ်") } className="text-xl font-black text-[#0d2c54]" secondaryClassName="mt-1 text-sm font-semibold text-slate-500" />
                <ActionButton tone="secondary" onClick={() => setShowShipmentDetail(false)}><XCircle size={15} /> Close</ActionButton>
              </div>
              <div className="space-y-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-lg font-black text-[#0d2c54]">{selectedShipment.trackingNo}</div>
                    <StatusBadge mode={mode} text={BI(selectedShipment.status, selectedShipment.status)} tone={statusTone(selectedShipment.status)} />
                  </div>
                  <div className="mt-3 text-sm font-semibold text-slate-600">{selectedShipment.receiver} • {selectedShipment.phone}</div>
                  <div className="mt-2 text-sm font-medium text-slate-500">{selectedShipment.destination}</div>
                </div>
                <Timeline shipment={selectedShipment} mode={mode} />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <ReadTile label={BI("COD Status", "COD အခြေအနေ")} value={selectedShipment.paymentStatus} mode={mode} />
                  <ReadTile label={BI("Current Location", "လက်ရှိတည်နေရာ")} value={selectedShipment.location} mode={mode} />
                  <ReadTile label={BI("Delivery Proof", "ပို့ဆောင်မှုအထောက်အထား")} value={selectedShipment.proof ?? "Pending"} mode={mode} />
                  <ReadTile label={BI("Failed / Return Reason", "မအောင်မြင်မှု / return အကြောင်းရင်း")} value={selectedShipment.failedReason ?? selectedShipment.returnReason ?? "-"} mode={mode} />
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );

  const trackingView = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-4">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<Search size={18} />} title={BI("Track Shipment", "shipment ခြေရာခံမည်") } subtitle={BI("Search by merchant tracking number to instantly view shipment progress and delivery status.", "merchant tracking number ဖြင့် shipment progress နှင့် delivery status ကို ချက်ချင်းကြည့်ရှုနိုင်သည်။")} />
          <div className="space-y-4">
            <div>
              <Label mode={mode} label={BI("Tracking Number / AWB", "Tracking Number / AWB") } />
              <TextInput value={searchTracking} onChange={setSearchTracking} placeholder={bilingualText(mode, BI("Enter tracking number", "tracking number ထည့်ပါ"))} icon={<Search size={15} />} />
            </div>
            {searchedShipment ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-black text-[#0d2c54]">{searchedShipment.trackingNo}</div>
                  <StatusBadge mode={mode} text={BI(searchedShipment.status, searchedShipment.status)} tone={statusTone(searchedShipment.status)} />
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-600">{searchedShipment.receiver} • {searchedShipment.destination}</div>
                <div className="mt-2 text-sm font-medium text-slate-500">ETA: {searchedShipment.eta}</div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-sm font-semibold text-slate-500">{bilingualText(mode, BI("No shipment found for this tracking number.", "ဤ tracking number အတွက် shipment မတွေ့ရှိပါ။"))}</div>
            )}
          </div>
        </SurfaceCard>
      </div>
      <div className="space-y-6 xl:col-span-8">
        {searchedShipment ? (
          <>
            <SurfaceCard>
              <SectionTitle mode={mode} icon={<Truck size={18} />} title={BI("Shipment Status Overview", "shipment status အနှစ်ချုပ်") } subtitle={BI("Current shipment location, ETA, rider details, proof, COD visibility, and exception reasons.", "လက်ရှိတည်နေရာ၊ ETA၊ rider အသေးစိတ်၊ proof၊ COD visibility နှင့် exception reason များကို ပြသထားသည်။")} />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <ReadTile label={BI("Current Status", "လက်ရှိအခြေအနေ")} value={searchedShipment.status} mode={mode} />
                <ReadTile label={BI("Current Location", "လက်ရှိတည်နေရာ")} value={searchedShipment.location} mode={mode} />
                <ReadTile label={BI("Estimated Delivery", "ခန့်မှန်းပို့ဆောင်ချိန်")} value={searchedShipment.eta} mode={mode} />
                <ReadTile label={BI("Assigned Rider", "တာဝန်ခံ rider")} value={searchedShipment.rider ?? "Pending"} mode={mode} />
              </div>
            </SurfaceCard>
            <SurfaceCard>
              <SectionTitle mode={mode} icon={<History size={18} />} title={BI("Milestone Timeline", "အဆင့်လိုက် timeline") } subtitle={BI("Booking to delivery lifecycle with premium visual progress tracking.", "booking မှ delivery အထိ premium visual progress tracking ဖြင့် ပြသထားသည်။")} />
              <Timeline shipment={searchedShipment} mode={mode} />
            </SurfaceCard>
          </>
        ) : null}
      </div>
    </div>
  );

  const pickupsView = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-5">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<CalendarClock size={18} />} title={BI("New Pickup Request", "pickup တောင်းဆိုချက်အသစ်") } subtitle={BI("Submit merchant pickup requests with time windows, parcel count, notes, and contact info.", "pickup time window၊ parcel count၊ note နှင့် contact information များဖြင့် pickup request တင်သွင်းနိုင်သည်။")} />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div><Label mode={mode} label={BI("Pickup Date", "pickup ရက်")}/><TextInput value={pickupForm.pickupDate} onChange={(v) => setPickupForm((prev) => ({ ...prev, pickupDate: v }))} placeholder="Pickup date" type="date" /></div>
            <div><Label mode={mode} label={BI("Pickup Time Window", "pickup အချိန်အပိုင်းအခြား")}/><SelectInput value={pickupForm.timeWindow} onChange={(v) => setPickupForm((prev) => ({ ...prev, timeWindow: v }))} options={[{ value: "10:00 AM - 12:00 PM", label: "10:00 AM - 12:00 PM" }, { value: "01:00 PM - 03:00 PM", label: "01:00 PM - 03:00 PM" }, { value: "03:00 PM - 05:00 PM", label: "03:00 PM - 05:00 PM" }]} /></div>
            <div><Label mode={mode} label={BI("Estimated Parcel Count", "ခန့်မှန်း parcel အရေအတွက်")}/><TextInput value={pickupForm.parcelCount} onChange={(v) => setPickupForm((prev) => ({ ...prev, parcelCount: v }))} placeholder="Parcel count" type="number" /></div>
            <div><Label mode={mode} label={BI("Contact Person", "ဆက်သွယ်ရန်ပုဂ္ဂိုလ်")}/><TextInput value={pickupForm.contactPerson} onChange={(v) => setPickupForm((prev) => ({ ...prev, contactPerson: v }))} placeholder="Contact person" /></div>
            <div className="md:col-span-2"><Label mode={mode} label={BI("Pickup Address", "pickup လိပ်စာ")}/><TextArea value={pickupForm.pickupAddress} onChange={(v) => setPickupForm((prev) => ({ ...prev, pickupAddress: v }))} placeholder="Pickup address" rows={3} /></div>
            <div className="md:col-span-2"><Label mode={mode} label={BI("Notes", "မှတ်ချက်")}/><TextArea value={pickupForm.notes} onChange={(v) => setPickupForm((prev) => ({ ...prev, notes: v }))} placeholder="Pickup notes" rows={3} /></div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <ActionButton><Send size={15} /> Request Pickup / pickup တောင်းဆိုမည်</ActionButton>
            <ActionButton tone="secondary"><XCircle size={15} /> Cancel / ပယ်ဖျက်မည်</ActionButton>
          </div>
        </SurfaceCard>
      </div>
      <div className="space-y-6 xl:col-span-7">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<ClipboardList size={18} />} title={BI("Pickup Schedules & History", "pickup schedule နှင့် မှတ်တမ်း") } subtitle={BI("Scheduled, pending, completed, rescheduled, and cancellable pickup requests in one merchant view.", "scheduled၊ pending၊ completed၊ rescheduled နှင့် cancellable pickup request များကို တစ်နေရာတည်းတွင်ကြည့်ရှုနိုင်သည်။")} />
          <div className="space-y-4">
            {pickupRequests.map((pickup) => (
              <div key={pickup.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-base font-black text-[#0d2c54]">{pickup.id}</div>
                    <div className="mt-2 text-sm font-semibold text-slate-600">{pickup.pickupDate} • {pickup.timeWindow}</div>
                    <div className="mt-2 text-sm font-medium text-slate-500">{pickup.address}</div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <StatusBadge mode={mode} text={pickup.status} tone={statusTone(pickup.status.en)} />
                    <StatusBadge mode={mode} text={pickup.riderStatus} tone="violet" />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <ActionButton tone="secondary"><Edit3 size={15} /> Reschedule</ActionButton>
                  <ActionButton tone="secondary"><XCircle size={15} /> Cancel</ActionButton>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </div>
    </div>
  );

  const codView = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard mode={mode} label={BI("COD Collected", "COD ရရှိငွေ") } value={`${codStatements.reduce((sum, row) => sum + row.codAmount, 0).toLocaleString()} Ks`} icon={<CircleDollarSign size={18} />} />
        <MetricCard mode={mode} label={BI("COD Pending", "စောင့်ဆိုင်း COD") } value={`${codStatements.filter((row) => row.transferStatus === "Pending").reduce((sum, row) => sum + row.netPayable, 0).toLocaleString()} Ks`} icon={<Clock3 size={18} />} />
        <MetricCard mode={mode} label={BI("COD Transferred", "လွှဲပြောင်းပြီး COD") } value={`${codStatements.filter((row) => row.transferStatus === "Transferred").reduce((sum, row) => sum + row.netPayable, 0).toLocaleString()} Ks`} icon={<Wallet size={18} />} />
        <MetricCard mode={mode} label={BI("COD On Hold", "ကိုင်ဆောင်ထားသော COD") } value={`${codStatements.filter((row) => row.transferStatus === "On Hold").reduce((sum, row) => sum + row.codAmount, 0).toLocaleString()} Ks`} icon={<AlertTriangle size={18} />} />
        <MetricCard mode={mode} label={BI("Upcoming Transfer", "လာမည့်လွှဲပြောင်းရက်") } value="Apr 8" icon={<CalendarClock size={18} />} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:col-span-8">
          <SurfaceCard>
            <SectionTitle mode={mode} icon={<Wallet size={18} />} title={BI("COD Statement Table", "COD statement ဇယား") } subtitle={BI("Shipment-level COD statement with deductions, fees, transfer status, and batch references.", "shipment အလိုက် COD statement ကို deduction၊ fee၊ transfer status နှင့် batch reference များဖြင့်ပြသသည်။")} />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <TextInput value="2026-04-01" onChange={() => {}} placeholder="Start" type="date" />
              <TextInput value="2026-04-30" onChange={() => {}} placeholder="End" type="date" />
              <SelectInput value="all" onChange={() => {}} options={[{ value: "all", label: bilingualText(mode, BI("All Branches", "ရုံးခွဲအားလုံး")) }, { value: "ygn", label: "Yangon" }]} />
              <ActionButton tone="secondary"><Filter size={15} /> Filter</ActionButton>
            </div>
            <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-9 gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                <div>Shipment</div><div>Delivered</div><div>Receiver</div><div>COD</div><div>Fee</div><div>Deduction</div><div>Net</div><div>Transfer</div><div>Batch</div>
              </div>
              {codStatements.map((row) => (
                <div key={row.id} className="grid grid-cols-9 gap-4 border-b border-slate-100 px-4 py-4 text-sm font-semibold text-[#0d2c54] last:border-b-0">
                  <div>{row.shipmentId}</div><div>{row.deliveredDate}</div><div>{row.receiver}</div><div>{row.codAmount.toLocaleString()}</div><div>{row.serviceFee.toLocaleString()}</div><div>{row.deduction.toLocaleString()}</div><div>{row.netPayable.toLocaleString()}</div><div><StatusBadge mode={mode} text={BI(row.transferStatus, row.transferStatus)} tone={statusTone(row.transferStatus)} /></div><div>{row.settlementBatch}</div>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>
        <div className="space-y-6 xl:col-span-4">
          <DarkCard>
            <BiText mode={mode} text={BI("Settlement Actions", "settlement လုပ်ဆောင်ချက်များ") } className="text-xl font-black text-white" secondaryClassName="mt-2 text-sm font-medium leading-6 text-white/60" />
            <div className="mt-5 grid grid-cols-1 gap-3">
              <ActionButton tone="secondary"><Download size={15} /> Export Statement</ActionButton>
              <ActionButton tone="secondary"><Printer size={15} /> Printable Summary</ActionButton>
              <ActionButton><Headphones size={15} /> Dispute / Inquiry</ActionButton>
            </div>
          </DarkCard>
        </div>
      </div>
    </div>
  );

  const billingView = (
    <div className="space-y-6">
      <SurfaceCard>
        <SectionTitle mode={mode} icon={<FileText size={18} />} title={BI("Billing, Invoices & Statements", "ငွေတောင်းခံမှု၊ invoice နှင့် statement များ") } subtitle={BI("Merchant financial documents including invoices, statements, transaction history, payment status, and export tools.", "invoice၊ statement၊ transaction history၊ payment status နှင့် export tool များပါဝင်သော merchant financial document area ဖြစ်သည်။")} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MetricCard mode={mode} label={BI("Pending Invoices", "ပေးချေရန်ကျန် invoice များ")} value="01" icon={<AlertCircle size={18} />} />
          <MetricCard mode={mode} label={BI("Paid Invoices", "ပေးချေပြီး invoice များ")} value="11" icon={<CheckCircle2 size={18} />} />
          <MetricCard mode={mode} label={BI("Billing Summary", "ငွေတောင်းခံမှုအနှစ်ချုပ်")} value="215,000 Ks" icon={<CreditCard size={18} />} />
        </div>
        <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-7 gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
            <div>Invoice</div><div>Period</div><div>Total</div><div>COD Fees</div><div>Deductions</div><div>Status</div><div>Due</div>
          </div>
          {invoices.map((invoice) => (
            <div key={invoice.id} className="grid grid-cols-7 gap-4 border-b border-slate-100 px-4 py-4 text-sm font-semibold text-[#0d2c54] last:border-b-0">
              <div>{invoice.invoiceNo}</div><div>{invoice.billingPeriod}</div><div>{invoice.totalCharges.toLocaleString()}</div><div>{invoice.codFees.toLocaleString()}</div><div>{invoice.deductions.toLocaleString()}</div><div><StatusBadge mode={mode} text={invoice.paymentStatus} tone={statusTone(invoice.paymentStatus.en)} /></div><div>{invoice.dueDate}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <ActionButton tone="secondary"><Download size={15} /> Download PDF</ActionButton>
          <ActionButton tone="secondary"><FileSpreadsheet size={15} /> Export Spreadsheet</ActionButton>
        </div>
      </SurfaceCard>
    </div>
  );

  const exceptionsView = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-8">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<AlertTriangle size={18} />} title={BI("Returns, Failed Deliveries & Exceptions", "return၊ failed delivery နှင့် exception များ") } subtitle={BI("A merchant exception queue for reattempts, contact updates, returns, holds, and support escalation.", "reattempt၊ contact update၊ return၊ hold နှင့် support escalation များအတွက် merchant exception queue ဖြစ်သည်။")} />
          <div className="space-y-4">
            {exceptionCases.map((item) => (
              <div key={item.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-base font-black text-[#0d2c54]">{item.trackingNo}</div>
                    <div className="mt-2 text-sm font-semibold text-slate-600">{item.receiver}</div>
                    <BiText mode={mode} text={item.issue} className="mt-3 text-sm font-black text-[#0d2c54]" secondaryClassName="mt-1 text-sm font-semibold text-slate-500" />
                    <BiText mode={mode} text={item.reason} className="mt-2 text-sm font-medium text-slate-600" secondaryClassName="mt-1 text-sm font-medium text-slate-500" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <StatusBadge mode={mode} text={item.status} tone="amber" />
                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{item.updatedAt}</div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <ActionButton tone="secondary"><Send size={15} /> Reattempt Delivery</ActionButton>
                  <ActionButton tone="secondary"><Edit3 size={15} /> Update Contact</ActionButton>
                  <ActionButton tone="secondary"><History size={15} /> Return to Sender</ActionButton>
                  <ActionButton tone="secondary"><Headphones size={15} /> Escalate Support</ActionButton>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </div>
      <div className="space-y-6 xl:col-span-4">
        <DarkCard>
          <BiText mode={mode} text={BI("Merchant Actions", "merchant လုပ်ဆောင်ချက်များ") } className="text-xl font-black text-white" secondaryClassName="mt-2 text-sm font-medium leading-6 text-white/60" />
          <div className="mt-5 space-y-3">
            {[
              BI("Reattempt delivery", "ပြန်လည်ပို့ဆောင်မည်"),
              BI("Update receiver phone/address", "လက်ခံသူဖုန်း / လိပ်စာပြင်မည်"),
              BI("Return to sender", "ပေးပို့သူထံပြန်ပို့မည်"),
              BI("Hold shipment", "shipment ကိုခဏရပ်ထားမည်"),
            ].map((item) => (
              <div key={item.en} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-semibold text-white/75">{bilingualText(mode, item)}</div>
            ))}
          </div>
        </DarkCard>
      </div>
    </div>
  );

  const reportsView = (
    <div className="space-y-6">
      <SurfaceCard>
        <SectionTitle mode={mode} icon={<PieChart size={18} />} title={BI("Merchant Reports & Analytics", "merchant အစီရင်ခံစာနှင့် analytics") } subtitle={BI("Operational and financial reporting for shipment volume, delivery success, COD settlement history, destinations, and fee performance.", "shipment volume၊ delivery success၊ COD settlement history၊ destination နှင့် fee performance ဆိုင်ရာ operational / financial report များ။")} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard mode={mode} label={BI("Shipment Volume", "shipment ပမာဏ")} value="1,284" icon={<Boxes size={18} />} />
          <MetricCard mode={mode} label={BI("Delivery Success Rate", "ပို့ဆောင်မှုအောင်မြင်နှုန်း")} value="96.2%" icon={<CheckCircle2 size={18} />} />
          <MetricCard mode={mode} label={BI("Failed Delivery Rate", "failed delivery နှုန်း")} value="2.8%" icon={<AlertTriangle size={18} />} />
          <MetricCard mode={mode} label={BI("Return Rate", "return နှုန်း")} value="1.4%" icon={<History size={18} />} />
          <MetricCard mode={mode} label={BI("COD Settlement History", "COD စာရင်းရှင်းမှတ်တမ်း")} value="148 batches" icon={<Wallet size={18} />} />
          <MetricCard mode={mode} label={BI("Revenue / Fee Summary", "ဝင်ငွေ / ကြေးအနှစ်ချုပ်")} value="1.2M Ks" icon={<CreditCard size={18} />} />
        </div>
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-12">
          <SurfaceCard className="xl:col-span-7">
            <SectionTitle mode={mode} icon={<Activity size={18} />} title={BI("Shipment Trend", "shipment အနေအထား") } subtitle={BI("Volume by day/week/month with premium lightweight visualization blocks.", "day/week/month အလိုက် volume ကို premium lightweight visualization ဖြင့်ပြသထားသည်။")} />
            <div className="space-y-4">
              {[
                ["Mon", 58],
                ["Tue", 74],
                ["Wed", 66],
                ["Thu", 81],
                ["Fri", 92],
                ["Sat", 61],
                ["Sun", 44],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-600"><span>{label}</span><span>{value}</span></div>
                  <div className="h-3 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-[linear-gradient(90deg,#0d2c54_0%,#2563eb_100%)]" style={{ width: `${value}%` }} /></div>
                </div>
              ))}
            </div>
          </SurfaceCard>
          <DarkCard className="xl:col-span-5">
            <BiText mode={mode} text={BI("Report Exports", "report export များ") } className="text-xl font-black text-white" secondaryClassName="mt-2 text-sm font-medium leading-6 text-white/60" />
            <div className="mt-5 grid grid-cols-1 gap-3">
              <ActionButton tone="secondary"><Download size={15} /> CSV</ActionButton>
              <ActionButton tone="secondary"><Download size={15} /> XLSX</ActionButton>
              <ActionButton tone="secondary"><Printer size={15} /> PDF</ActionButton>
            </div>
          </DarkCard>
        </div>
      </SurfaceCard>
    </div>
  );

  const receiversView = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-8">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<Users size={18} />} title={BI("Receiver Directory", "လက်ခံသူစာရင်း") } subtitle={BI("Saved receivers, recent contacts, frequently used destinations, and reusable address details for fast merchant booking.", "saved receiver၊ recent contact၊ frequently used destination နှင့် reusable address detail များပါဝင်သော merchant address book ဖြစ်သည်။")} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <TextInput value="" onChange={() => {}} placeholder={bilingualText(mode, BI("Search phone / address / receiver", "ဖုန်း / လိပ်စာ / လက်ခံသူရှာမည်"))} icon={<Search size={15} />} />
            <ActionButton tone="secondary"><Filter size={15} /> Filter</ActionButton>
            <ActionButton><Users size={15} /> Add Receiver</ActionButton>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {receivers.map((receiver) => (
              <motion.div key={receiver.id} whileHover={{ y: -2 }} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-black text-[#0d2c54]">{receiver.name}</div>
                    <div className="mt-2 text-sm font-semibold text-slate-600">{receiver.phone}</div>
                  </div>
                  {receiver.frequent ? <StatusBadge mode={mode} text={BI("Frequent", "မကြာခဏအသုံးပြု") } tone="violet" /> : receiver.recent ? <StatusBadge mode={mode} text={BI("Recent", "မကြာသေးမီ") } tone="blue" /> : null}
                </div>
                <div className="mt-4 text-sm font-medium leading-6 text-slate-500">{receiver.address}, {receiver.township}, {receiver.city}</div>
                <div className="mt-3 text-sm font-semibold text-slate-600">{receiver.note}</div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <ActionButton tone="secondary"><Edit3 size={15} /> Edit</ActionButton>
                  <ActionButton tone="secondary"><XCircle size={15} /> Delete</ActionButton>
                </div>
              </motion.div>
            ))}
          </div>
        </SurfaceCard>
      </div>
      <div className="space-y-6 xl:col-span-4">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<MapPin size={18} />} title={BI("Receiver Insights", "လက်ခံသူအနှစ်ချုပ်") } subtitle={BI("Top receivers, frequent destinations, and note patterns for faster reuse.", "top receiver၊ frequent destination နှင့် note pattern များကိုမြင်သာစွာပြသသည်။")} />
          <div className="space-y-3">
            {[
              BI("Top receiver: Daw Ei Ei", "မကြာခဏအသုံးပြုလက်ခံသူ - Daw Ei Ei"),
              BI("Frequent destination: Sanchaung, Yangon", "မကြာခဏပို့ဆောင်ရာနေရာ - Sanchaung, Yangon"),
              BI("Preferred note: Call before arrival", "အသုံးများသောမှတ်ချက် - မရောက်မီဖုန်းခေါ်ပါ"),
            ].map((item) => (
              <div key={item.en} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-sm font-semibold text-slate-600">{bilingualText(mode, item)}</div>
            ))}
          </div>
        </SurfaceCard>
      </div>
    </div>
  );

  const supportView = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-8">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<Headphones size={18} />} title={BI("Merchant Support Center", "merchant support center") } subtitle={BI("Shipment complaints, COD inquiries, billing inquiries, attachments, escalation requests, and ticket tracking built for merchants.", "shipment complaint၊ COD inquiry၊ billing inquiry၊ attachment၊ escalation request နှင့် ticket tracking များပါဝင်သော merchant support center ဖြစ်သည်။")} />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div><Label mode={mode} label={BI("Ticket ID", "ticket ID")}/><TextInput value={ticketForm.ticketId} onChange={(v) => setTicketForm((prev) => ({ ...prev, ticketId: v }))} placeholder="Ticket ID" /></div>
            <div><Label mode={mode} label={BI("Priority", "ဦးစားပေးအဆင့်")}/><SelectInput value={ticketForm.priority} onChange={(v) => setTicketForm((prev) => ({ ...prev, priority: v }))} options={[{ value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }]} /></div>
            <div className="md:col-span-2"><Label mode={mode} label={BI("Subject", "အကြောင်းအရာ")}/><TextInput value={ticketForm.subject} onChange={(v) => setTicketForm((prev) => ({ ...prev, subject: v }))} placeholder="Subject" /></div>
            <div><Label mode={mode} label={BI("Issue Type", "ပြဿနာအမျိုးအစား")}/><SelectInput value={ticketForm.issueType} onChange={(v) => setTicketForm((prev) => ({ ...prev, issueType: v }))} options={[{ value: "shipment", label: "Shipment Complaint" }, { value: "cod", label: "COD Inquiry" }, { value: "billing", label: "Billing Inquiry" }]} /></div>
            <div><Label mode={mode} label={BI("Related Shipment ID", "ဆက်စပ် shipment ID")}/><TextInput value={ticketForm.relatedShipmentId} onChange={(v) => setTicketForm((prev) => ({ ...prev, relatedShipmentId: v }))} placeholder="Tracking number" /></div>
            <div className="md:col-span-2"><Label mode={mode} label={BI("Description", "ဖော်ပြချက်")}/><TextArea value={ticketForm.description} onChange={(v) => setTicketForm((prev) => ({ ...prev, description: v }))} placeholder="Describe your issue" /></div>
            <div className="md:col-span-2">
              <Label mode={mode} label={BI("Attachment Upload", "attachment upload")}/>
              <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }} type="button" className="flex w-full items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-8 text-sm font-bold text-slate-500 transition hover:border-[#0d2c54]/30 hover:bg-white">
                <Upload size={18} /> {bilingualText(mode, BI("Upload attachment", "attachment တင်မည်"))}
              </motion.button>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <ActionButton onClick={() => setTicketSuccess(true)}><Send size={15} /> Submit Ticket / ticket တင်မည်</ActionButton>
            <ActionButton tone="secondary"><Headphones size={15} /> Live Chat Preview</ActionButton>
          </div>
          <AnimatePresence>
            {ticketSuccess ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                <BiText mode={mode} text={BI("Support ticket submitted successfully", "support ticket ကို အောင်မြင်စွာတင်သွင်းပြီး") } className="text-sm font-black text-emerald-700" secondaryClassName="mt-1 text-sm font-semibold text-emerald-600" />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </SurfaceCard>

        <SurfaceCard>
          <SectionTitle mode={mode} icon={<History size={18} />} title={BI("Support Ticket List", "support ticket စာရင်း") } subtitle={BI("Current and historical merchant tickets with status, shipment references, and priority visibility.", "လက်ရှိနှင့်အတိတ် merchant ticket များကို status၊ shipment reference နှင့် priority ဖြင့်ပြသထားသည်။")} />
          <div className="space-y-3">
            {tickets.map((ticket) => (
              <div key={ticket.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-sm font-black text-[#0d2c54]">{ticket.id}</div>
                    <BiText mode={mode} text={ticket.subject} className="mt-2 text-sm font-black text-[#0d2c54]" secondaryClassName="mt-1 text-sm font-semibold text-slate-500" />
                  </div>
                  <div className="flex flex-col items-start gap-2 md:items-end">
                    <StatusBadge mode={mode} text={ticket.status} tone={statusTone(ticket.status.en)} />
                    <StatusBadge mode={mode} text={ticket.priority} tone="amber" />
                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{ticket.lastUpdated}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </div>
      <div className="space-y-6 xl:col-span-4">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<BookOpen size={18} />} title={BI("FAQ / Help Articles", "FAQ / အကူအညီဆောင်းပါးများ") } subtitle={BI("Self-service support content for merchants before raising tickets.", "ticket မတင်မီ merchant များအတွက် self-service support content များ။")} />
          <div className="space-y-3">
            {knowledgeBase.map((item) => (
              <div key={item.en} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <BiText mode={mode} text={item} className="text-sm font-black text-[#0d2c54]" secondaryClassName="mt-1 text-sm font-semibold text-slate-500" />
              </div>
            ))}
          </div>
        </SurfaceCard>
      </div>
    </div>
  );

  const notificationsView = (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="space-y-6 xl:col-span-8">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<Bell size={18} />} title={BI("Notifications & Activity Feed", "အသိပေးချက်များနှင့် activity feed") } subtitle={BI("Delivery updates, COD settlement alerts, pickup reminders, invoice notices, support updates, and announcements grouped for merchants.", "delivery update၊ COD settlement alert၊ pickup reminder၊ invoice notice၊ support update နှင့် announcement များကို merchant အတွက်အုပ်စုဖွဲ့ပြသထားသည်။")} />
          <div className="space-y-4">
            {notifications.map((item) => (
              <motion.div key={item.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className={tw("rounded-[24px] border bg-white p-5 shadow-sm", item.unread ? "border-sky-200" : "border-slate-200") }>
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
      <div className="space-y-6 xl:col-span-4">
        <SurfaceCard>
          <SectionTitle mode={mode} icon={<Settings2 size={18} />} title={BI("Notification Preferences", "အသိပေးချက် preference များ") } subtitle={BI("Merchant controls for shipment, COD, invoice, support, and announcement notifications.", "shipment၊ COD၊ invoice၊ support နှင့် announcement notification များအတွက် merchant control များ။")} />
          <div className="space-y-4">
            <ToggleCard mode={mode} checked title={BI("Shipment Updates", "shipment update များ") } description={BI("Receive delivery progress and status change alerts.", "delivery progress နှင့် status ပြောင်းလဲမှု alert များရယူမည်။")} onChange={() => {}} />
            <ToggleCard mode={mode} checked title={BI("COD Settlement Alerts", "COD settlement alert များ") } description={BI("Receive COD transfer and on-hold notifications.", "COD transfer နှင့် on-hold notification များရယူမည်။")} onChange={() => {}} />
            <ToggleCard mode={mode} checked title={BI("Invoice Due Notices", "invoice due notice များ") } description={BI("Get invoice reminders before due dates.", "due date မတိုင်မီ invoice reminder များရယူမည်။")} onChange={() => {}} />
          </div>
        </SurfaceCard>
      </div>
    </div>
  );

  const views: Record<TabKey, ReactNode> = {
    dashboard: dashboardView,
    profile: profileView,
    booking: bookingView,
    bulk: bulkView,
    shipments: shipmentsView,
    tracking: trackingView,
    pickups: pickupsView,
    cod: codView,
    billing: billingView,
    exceptions: exceptionsView,
    reports: reportsView,
    receivers: receiversView,
    support: supportView,
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
                <span className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Merchant Portal</span>
              </div>
              <BiText mode={mode} text={BI("Britium Express Merchant Workspace", "Britium Express merchant workspace") } className="mt-4 text-3xl font-black tracking-tight text-[#0d2c54] md:text-5xl" secondaryClassName="mt-3 text-base font-semibold text-slate-500 md:text-lg" />
              <BiText mode={mode} text={BI("A premium operations portal for merchants to manage shipments, pickups, COD, statements, support, and business performance in one place.", "shipment၊ pickup၊ COD၊ statement၊ support နှင့် business performance များကိုတစ်နေရာတည်းတွင်စီမံနိုင်သော premium merchant portal ဖြစ်သည်။") } className="mt-4 text-sm font-medium leading-6 text-slate-500 md:text-[15px]" secondaryClassName="mt-1 text-sm font-medium leading-6 text-slate-500 md:text-[15px]" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:w-[560px]">
              <SurfaceCard className="p-4">
                <BiText mode={mode} text={BI("Merchant Account", "merchant account") } className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400" secondaryClassName="mt-1 text-xs font-semibold text-slate-400" />
                <div className="mt-3 text-base font-black text-[#0d2c54]">{profile.businessName}</div>
                <div className="mt-1 text-sm font-semibold text-slate-500">{profile.ownerName} • {profile.merchantId}</div>
              </SurfaceCard>
              <SurfaceCard className="p-4">
                <BiText mode={mode} text={BI("Language Mode", "ဘာသာစကား mode") } className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400" secondaryClassName="mt-1 text-xs font-semibold text-slate-400" />
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    ["en", "EN"],
                    ["my", "မြန်မာ"],
                    ["both", "EN + မြန်မာ"],
                  ].map(([value, label]) => (
                    <ActionButton key={value} tone={mode === value ? "primary" : "secondary"} onClick={() => setMode(value as LanguageMode)}>{label}</ActionButton>
                  ))}
                </div>
              </SurfaceCard>
            </div>
          </div>

          <div className="relative z-10 mt-6 flex flex-wrap gap-3">
            <ActionButton onClick={() => setTab("booking")}><Package2 size={15} /> Create Shipment</ActionButton>
            <ActionButton tone="secondary" onClick={() => setTab("bulk")}><Upload size={15} /> Bulk Upload</ActionButton>
            <ActionButton tone="secondary" onClick={() => setTab("pickups")}><CalendarClock size={15} /> Request Pickup</ActionButton>
            <ActionButton tone="secondary" onClick={() => setTab("cod")}><Wallet size={15} /> COD Statement</ActionButton>
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
                    <motion.button key={item.id} type="button" onClick={() => setTab(item.id)} whileHover={{ x: 2 }} whileTap={{ scale: 0.985 }} className={tw("flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition", active ? "bg-[#0d2c54] text-white shadow-[0_16px_30px_rgba(13,44,84,0.22)]" : "text-slate-600 hover:bg-slate-50") }>
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

function ReadField({ value }: { value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-semibold text-[#0d2c54] shadow-sm">{value}</div>;
}

function ReadTile({ label, value, mode }: { label: Bi; value: string; mode: LanguageMode }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
      <BiText mode={mode} text={label} className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400" secondaryClassName="mt-1 text-xs font-semibold text-slate-400" />
      <div className="mt-3 text-base font-black text-[#0d2c54]">{value}</div>
    </div>
  );
}

function Line({ label, value, mode, dark = false }: { label: Bi; value: number; mode: LanguageMode; dark?: boolean }) {
  return (
    <div className={tw("flex items-center justify-between text-sm font-semibold", dark ? "text-white/75" : "text-slate-600") }>
      <span>{bilingualText(mode, label)}</span>
      <span>{value.toLocaleString()} Ks</span>
    </div>
  );
}
