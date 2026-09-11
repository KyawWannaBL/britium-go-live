import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  Building2, Users, Package, Landmark, FileEdit, RefreshCw,
  Lock, Unlock, Plus, X, CheckCircle, XCircle, Clock, ChevronDown,
  ShieldAlert, AlertTriangle, Eye, EyeOff, ArrowLeft,
  Truck, MapPin, FileText, Warehouse, DollarSign,
  ShoppingBag, UserCircle, ClipboardList, Tag, Calculator,
  Printer, Search, Edit2, Check, BarChart2
} from "lucide-react";
import {
  getBranchOffices, getBranchSnapshot, getBranchStaff,
  addBranchStaff, updateBranchStaff, deleteBranchStaff,
  getBranchShipments, createBranchShipment, updateBranchShipment,
  lockBranchShipment, unlockBranchShipment, deleteBranchShipment,
  getBranchAmendments, getAllPendingAmendments,
  submitAmendmentRequest, reviewAmendment,
  fetchTariffs, updateTariff, calculateFee,
  fetchServiceAreas, addServiceArea, deleteServiceArea,
} from "@/lib/branch-api";
import type {
  BranchOffice, BranchShipment, BranchStaff, AmendmentRequest, BranchSnapshot,
  BranchTariff, ServiceArea, FeeBreakdown
} from "@/lib/branch-api";

// ─── Constants ───────────────────────────────────────────────────────────────

const BRANCHES = [
  { code: "YGN", label: "Yangon (HQ)", labelMM: "ရန်ကုန် (ဌာနချုပ်)" },
  { code: "MDY", label: "Mandalay Branch", labelMM: "မန္တလေး ရုံးခွဲ" },
  { code: "NPT", label: "Naypyitaw Branch", labelMM: "နေပြည်တော် ရုံးခွဲ" },
];

const STAFF_ROLES = [
  { value: "branch_manager",  label: "Branch Manager",  hqOnly: true },
  { value: "branch_staff",    label: "Branch Staff",     hqOnly: false },
  { value: "rider",           label: "Rider",            hqOnly: false },
  { value: "driver",          label: "Driver",           hqOnly: false },
  { value: "helper",          label: "Helper",           hqOnly: false },
  { value: "warehouse",       label: "Warehouse",        hqOnly: false },
];

const SHIPMENT_STATUSES = ["pending","in_transit","out_for_delivery","delivered","failed","returned"];
const FINANCE_FIELDS = ["cod_amount","delivery_fee","item_value"] as const;
type FinanceFieldName = typeof FINANCE_FIELDS[number];

const FINANCE_FIELD_LABELS: Record<FinanceFieldName, string> = {
  cod_amount:   "COD Amount",
  delivery_fee: "Delivery Fee",
  item_value:   "Item Value",
};

const TABS = [
  { id: "overview",     label: "Overview",        labelMM: "အနှစ်ချုပ်",              icon: Building2 },
  { id: "dataentry",    label: "Data Entry",      labelMM: "ဒေတာထည့်သွင်းမှု",        icon: ClipboardList },
  { id: "shipments",    label: "Shipments",       labelMM: "ပေးပို့မှုများ",           icon: Package },
  { id: "dispatch",     label: "Dispatch",        labelMM: "စေလွှတ်မှု",              icon: Truck },
  { id: "wayplan",      label: "Wayplan",         labelMM: "လမ်းကြောင်းစီမံမှု",       icon: MapPin },
  { id: "waybill",      label: "Waybill",         labelMM: "လေကြောင်းလိုင်စင်",       icon: FileText },
  { id: "warehouse",    label: "Warehouse",       labelMM: "သိုလှောင်ရုံ",            icon: Warehouse },
  { id: "cod",          label: "COD Settlement",  labelMM: "COD ရှင်းလင်းမှု",        icon: DollarSign },
  { id: "merchant",     label: "Merchant",        labelMM: "ကုန်သည်များ",             icon: ShoppingBag },
  { id: "customer",     label: "Customer",        labelMM: "ဖောက်သည်များ",            icon: UserCircle },
  { id: "supervisor",   label: "Supervisor",      labelMM: "ကြီးကြပ်ရေး",            icon: BarChart2 },
  { id: "tariffs",      label: "Tariffs",         labelMM: "ဝန်ဆောင်ခနှုန်း",         icon: Tag },
  { id: "amendments",   label: "Amendments",      labelMM: "ပြင်ဆင်ရန်တောင်းဆိုမှု",  icon: FileEdit },
  { id: "team",         label: "Team",            labelMM: "ဝန်ထမ်းများ",             icon: Users },
  { id: "finance",      label: "Finance",         labelMM: "ငွေကြေးအချက်",           icon: Landmark },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString(); }

function statusBadge(s: string) {
  const map: Record<string, string> = {
    pending:          "bg-yellow-900/40 text-yellow-300 border-yellow-700",
    in_transit:       "bg-blue-900/40 text-blue-300 border-blue-700",
    out_for_delivery: "bg-purple-900/40 text-purple-300 border-purple-700",
    delivered:        "bg-emerald-900/40 text-emerald-300 border-emerald-700",
    failed:           "bg-rose-900/40 text-rose-300 border-rose-700",
    returned:         "bg-gray-700/40 text-gray-400 border-gray-600",
    approved:         "bg-emerald-900/40 text-emerald-300 border-emerald-700",
    rejected:         "bg-rose-900/40 text-rose-300 border-rose-700",
    active:           "bg-emerald-900/40 text-emerald-300 border-emerald-700",
    inactive:         "bg-gray-700/40 text-gray-400 border-gray-600",
    settled:          "bg-emerald-900/40 text-emerald-300 border-emerald-700",
    unsettled:        "bg-yellow-900/40 text-yellow-300 border-yellow-700",
  };
  return `inline-block border rounded-full px-2 py-0.5 text-[11px] font-medium ${map[s] ?? "bg-gray-700/40 text-gray-400 border-gray-600"}`;
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className={`bg-[#0b2236] border border-[#1a3a5c] rounded-2xl ${wide ? "w-full max-w-2xl" : "w-full max-w-lg"} max-h-[90vh] overflow-y-auto shadow-2xl`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a3a5c]">
          <h3 className="text-[#f6b84b] font-semibold text-[14px] uppercase tracking-wider">{title}</h3>
          <button onClick={onClose} className="text-[#4d7a9b] hover:text-[#eef8ff] transition-colors cursor-pointer"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[#4d7a9b] text-[12px] uppercase tracking-widest">{label}</label>
      {children}
    </div>
  );
}

const inp = "bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] rounded-xl px-3 py-2.5 text-[13px] w-full outline-none focus:border-[#f6b84b] transition-colors";
const btn = (v: string) => ({
  gold:    "bg-[#C09B30] text-[#0A1628] font-semibold px-4 py-2.5 rounded-xl text-[13px] hover:bg-[#f6b84b] transition-colors cursor-pointer",
  ghost:   "bg-[#0b2236] border border-[#1a3a5c] text-[#eef8ff] px-4 py-2.5 rounded-xl text-[13px] hover:border-[#f6b84b] transition-colors cursor-pointer",
  danger:  "bg-rose-900/30 border border-rose-800 text-rose-300 px-4 py-2.5 rounded-xl text-[13px] hover:bg-rose-900/60 transition-colors cursor-pointer",
  emerald: "bg-emerald-900/30 border border-emerald-700 text-emerald-300 px-4 py-2.5 rounded-xl text-[13px] hover:bg-emerald-800/60 transition-colors cursor-pointer",
  sm:      "bg-[#0b2236] border border-[#1a3a5c] text-[#eef8ff] px-3 py-1.5 rounded-lg text-[12px] hover:border-[#f6b84b] transition-colors cursor-pointer",
}[v]);

// ─── Tariff Calculator Component ──────────────────────────────────────────────

function TariffCalculator({ branchCode }: { branchCode: string }) {
  const [calcOrigin, setCalcOrigin] = useState(branchCode);
  const [calcDest, setCalcDest] = useState("INTRA");
  const [calcWeight, setCalcWeight] = useState(3);
  const [feeResult, setFeeResult] = useState<FeeBreakdown | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  async function doCalc() {
    setCalcLoading(true);
    try {
      const isIntra = calcDest === "INTRA";
      const destCode = isIntra ? calcOrigin : calcDest;
      const result = await calculateFee(calcOrigin, destCode, isIntra, calcWeight);
      setFeeResult(result);
    } catch { toast.error("Calculation failed"); }
    finally { setCalcLoading(false); }
  }

  const destOptions = [
    { value: "INTRA", label: `Within ${BRANCHES.find(b => b.code === calcOrigin)?.label ?? calcOrigin}` },
    ...BRANCHES.filter(b => b.code !== calcOrigin).map(b => ({ value: b.code, label: b.label })),
  ];

  return (
    <div className="bg-[#061524] border border-[#1a3a5c] rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Calculator size={14} className="text-[#f6b84b]" />
        <span className="text-[#eef8ff] text-[13px] font-semibold uppercase tracking-widest">Fee Calculator</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Origin Branch">
          <select className={inp} value={calcOrigin} onChange={e => { setCalcOrigin(e.target.value); setFeeResult(null); }}>
            {BRANCHES.map(b => <option key={b.code} value={b.code}>{b.label}</option>)}
          </select>
        </Field>
        <Field label="Destination">
          <select className={inp} value={calcDest} onChange={e => { setCalcDest(e.target.value); setFeeResult(null); }}>
            {destOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Weight (kg)">
          <input type="number" min={0} step={0.1} className={inp} value={calcWeight}
            onChange={e => { setCalcWeight(Number(e.target.value)); setFeeResult(null); }} />
        </Field>
      </div>
      <button onClick={doCalc} disabled={calcLoading} className={btn("gold") + " flex items-center gap-2"}>
        <Calculator size={13} /> {calcLoading ? "Calculating…" : "Calculate Fee"}
      </button>
      {feeResult && (
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-xl p-4 space-y-2 text-[13px]">
          <div className="flex justify-between"><span className="text-[#4d7a9b]">Base Fee</span><span className="text-[#eef8ff] font-mono">{fmt(feeResult.base_fee)} MMK</span></div>
          <div className="flex justify-between"><span className="text-[#4d7a9b]">Default Weight</span><span className="text-[#eef8ff] font-mono">{feeResult.default_weight} kg</span></div>
          {feeResult.weight_fee > 0 && (
            <div className="flex justify-between"><span className="text-[#4d7a9b]">Extra Weight Surcharge</span><span className="text-[#eef8ff] font-mono">+{fmt(feeResult.weight_fee)} MMK</span></div>
          )}
          <div className="border-t border-[#1a3a5c] pt-2 flex justify-between font-semibold">
            <span className="text-[#f6b84b]">Total Delivery Fee</span>
            <span className="text-[#f6b84b] font-mono text-[15px]">{fmt(feeResult.total_fee)} MMK</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ snap, office }: { snap: BranchSnapshot | null; office: BranchOffice | null }) {
  if (!snap || !office) return (
    <div className="flex items-center justify-center h-48 text-[#4d7a9b] text-[13px]">Loading…</div>
  );
  return (
    <div className="space-y-6">
      <div className="bg-[#061524] border border-[#1a3a5c] rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Building2 size={16} className="text-[#f6b84b]" />
          <span className="text-[#f6b84b] text-[13px] font-semibold uppercase tracking-widest">{office.branch_name}</span>
        </div>
        {[
          ["City / Region", `${office.city} — ${office.region}`],
          ["Address", office.address || "—"],
          ["Phone", office.phone || "—"],
          ["Branch Manager", office.manager_name || "—"],
          ["Manager Phone", office.manager_phone || "—"],
        ].map(([k, v]) => (
          <div key={k} className="flex gap-3 text-[13px]">
            <span className="text-[#4d7a9b] w-36 shrink-0">{k}</span>
            <span className="text-[#eef8ff]">{v}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Shipments", value: snap.total_shipments, color: "text-[#4ea8de]" },
          { label: "In Transit",      value: snap.in_transit,      color: "text-blue-400" },
          { label: "Delivered",       value: snap.delivered,        color: "text-emerald-400" },
          { label: "Pending",         value: snap.pending,          color: "text-yellow-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl">
            <div className={`uppercase text-[11px] tracking-widest mb-1 ${color}`}>{label}</div>
            <div className="text-[20px] text-[#eef8ff] font-mono">{fmt(value)}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl">
          <div className="text-[#f6b84b] uppercase text-[11px] tracking-widest mb-1">Total COD</div>
          <div className="text-[18px] text-[#eef8ff] font-mono">{fmt(snap.cod_total)}</div>
          <div className="text-[11px] text-[#4d7a9b] mt-1">MMK</div>
        </div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl">
          <div className="text-emerald-400 uppercase text-[11px] tracking-widest mb-1">Total Staff</div>
          <div className="text-[18px] text-[#eef8ff] font-mono">{fmt(snap.total_staff)}</div>
        </div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl">
          <div className="text-rose-400 uppercase text-[11px] tracking-widest mb-1">Pending Amendments</div>
          <div className="text-[18px] text-[#eef8ff] font-mono">{fmt(snap.pending_amendments)}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Data Entry Tab ───────────────────────────────────────────────────────────

function DataEntryTab({ branchCode, mode }: { branchCode: string; mode: "hq" | "branch" }) {
  const [form, setForm] = useState({
    tracking_no: "", merchant: "", receiver: "", township: "",
    address: "", phone: "", weight_kg: 3, cod_amount: 0,
    delivery_fee: 0, item_value: 0, notes: "", entered_by: "",
    dest_type: "INTRA",
  });
  const [feeBreakdown, setFeeBreakdown] = useState<FeeBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const calcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-generate tracking number
  useEffect(() => {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
    setForm(f => ({ ...f, tracking_no: `BE-${branchCode}-${ts}-${rand}` }));
  }, [branchCode]);

  function triggerFeeCalc(newForm: typeof form) {
    if (calcTimer.current) clearTimeout(calcTimer.current);
    calcTimer.current = setTimeout(async () => {
      try {
        const isIntra = newForm.dest_type === "INTRA";
        const destCode = isIntra ? branchCode : newForm.dest_type;
        const result = await calculateFee(branchCode, destCode, isIntra, newForm.weight_kg);
        setFeeBreakdown(result);
        setForm(f => ({ ...f, delivery_fee: result.total_fee }));
      } catch {}
    }, 300);
  }

  function handleChange(key: string, value: any) {
    const newForm = { ...form, [key]: value };
    setForm(newForm);
    if (key === "weight_kg" || key === "dest_type") {
      triggerFeeCalc(newForm);
    }
  }

  async function handleSubmit() {
    if (!form.tracking_no || !form.receiver) {
      toast.error("Tracking No and Receiver are required");
      return;
    }
    setLoading(true);
    try {
      await createBranchShipment({
        branch_code: branchCode,
        tracking_no: form.tracking_no,
        merchant: form.merchant,
        receiver: form.receiver,
        township: form.township,
        address: form.address,
        phone: form.phone,
        weight_kg: form.weight_kg,
        cod_amount: form.cod_amount,
        delivery_fee: form.delivery_fee,
        item_value: form.item_value,
        notes: form.notes,
        entered_by: form.entered_by,
      });
      toast.success("Shipment created");
      // Reset form with new tracking no
      const ts = Date.now().toString(36).toUpperCase();
      const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
      setForm({
        tracking_no: `BE-${branchCode}-${ts}-${rand}`,
        merchant: "", receiver: "", township: "", address: "", phone: "",
        weight_kg: 3, cod_amount: 0, delivery_fee: 0, item_value: 0,
        notes: "", entered_by: form.entered_by, dest_type: "INTRA",
      });
      setFeeBreakdown(null);
    } catch { toast.error("Failed to create shipment"); }
    finally { setLoading(false); }
  }

  const destOptions = [
    { value: "INTRA", label: `Within ${BRANCHES.find(b => b.code === branchCode)?.label?.replace(" Branch","").replace(" (HQ)","") ?? branchCode}` },
    ...BRANCHES.filter(b => b.code !== branchCode).map(b => ({ value: b.code, label: b.label })),
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-yellow-900/10 border border-yellow-800/50 rounded-xl p-3 flex items-center gap-2 text-[12px] text-yellow-300">
        <AlertTriangle size={13} className="shrink-0" />
        Finance fields (COD, Delivery Fee, Item Value) are locked after saving. Request HQ amendment to change them.
      </div>

      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-6 space-y-5">
        <h3 className="text-[#f6b84b] text-[13px] font-semibold uppercase tracking-widest border-b border-[#1a3a5c] pb-3">New Shipment — {BRANCHES.find(b=>b.code===branchCode)?.label}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Tracking No">
            <input className={inp} value={form.tracking_no} onChange={e => handleChange("tracking_no", e.target.value)} />
          </Field>
          <Field label="Merchant">
            <input className={inp} value={form.merchant} onChange={e => handleChange("merchant", e.target.value)} />
          </Field>
          <Field label="Receiver Name *">
            <input className={inp} value={form.receiver} onChange={e => handleChange("receiver", e.target.value)} />
          </Field>
          <Field label="Phone">
            <input className={inp} value={form.phone} onChange={e => handleChange("phone", e.target.value)} />
          </Field>
          <Field label="Township / Area">
            <input className={inp} value={form.township} onChange={e => handleChange("township", e.target.value)} />
          </Field>
          <Field label="Address">
            <input className={inp} value={form.address} onChange={e => handleChange("address", e.target.value)} />
          </Field>
        </div>

        {/* Tariff section */}
        <div className="bg-[#061524] border border-[#1a3a5c] rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Tag size={13} className="text-[#f6b84b]" />
            <span className="text-[#f6b84b] text-[12px] uppercase tracking-widest font-semibold">Delivery Tariff</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Destination">
              <select className={inp} value={form.dest_type} onChange={e => handleChange("dest_type", e.target.value)}>
                {destOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Weight (kg) — Default 3 kg">
              <input type="number" min={0} step={0.1} className={inp} value={form.weight_kg}
                onChange={e => handleChange("weight_kg", Number(e.target.value))} />
            </Field>
          </div>
          {feeBreakdown && (
            <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-lg px-4 py-3 space-y-1 text-[12px]">
              <div className="flex justify-between text-[#4d7a9b]"><span>Base Fee</span><span className="font-mono text-[#eef8ff]">{fmt(feeBreakdown.base_fee)} MMK</span></div>
              {feeBreakdown.weight_fee > 0 && <div className="flex justify-between text-[#4d7a9b]"><span>Extra Weight Surcharge</span><span className="font-mono text-[#eef8ff]">+{fmt(feeBreakdown.weight_fee)} MMK</span></div>}
              <div className="border-t border-[#1a3a5c] pt-1 flex justify-between font-semibold"><span className="text-[#f6b84b]">Total Fee</span><span className="font-mono text-[#f6b84b]">{fmt(feeBreakdown.total_fee)} MMK</span></div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="COD Amount (MMK)">
            <input type="number" className={inp} value={form.cod_amount} onChange={e => handleChange("cod_amount", Number(e.target.value))} />
          </Field>
          <Field label="Delivery Fee (MMK) — Auto-calculated">
            <input type="number" className={`${inp} ${feeBreakdown ? "border-[#f6b84b]/50" : ""}`} value={form.delivery_fee}
              onChange={e => handleChange("delivery_fee", Number(e.target.value))} />
          </Field>
          <Field label="Item Value (MMK)">
            <input type="number" className={inp} value={form.item_value} onChange={e => handleChange("item_value", Number(e.target.value))} />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Entered By">
            <input className={inp} value={form.entered_by} onChange={e => handleChange("entered_by", e.target.value)} />
          </Field>
          <Field label="Notes">
            <input className={inp} value={form.notes} onChange={e => handleChange("notes", e.target.value)} />
          </Field>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={handleSubmit} disabled={loading} className={btn("gold")}>
            {loading ? "Saving…" : "Create Shipment"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shipments Tab ────────────────────────────────────────────────────────────

function ShipmentsTab({ branchCode, mode }: { branchCode: string; mode: "hq" | "branch" }) {
  const [rows, setRows] = useState<BranchShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [amendTarget, setAmendTarget] = useState<{ shipment: BranchShipment; field: FinanceFieldName } | null>(null);
  const [amendForm, setAmendForm] = useState({ requested_value:"", reason:"" });
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await getBranchShipments(branchCode)); } catch { toast.error("Failed to load shipments"); }
    finally { setLoading(false); }
  }, [branchCode]);

  useEffect(() => { load(); }, [load]);

  async function handleStatusChange(id: number, status: string) {
    const res = await updateBranchShipment(id, { status }, mode);
    if (res.ok) { load(); } else { toast.error(res.message); }
  }

  async function handleLock(id: number) {
    try { await lockBranchShipment(id); load(); toast.success("Finance fields locked"); }
    catch { toast.error("Lock failed"); }
  }

  async function handleUnlock(id: number) {
    if (mode !== "hq") { toast.error("Only HQ can unlock finance fields"); return; }
    try { await unlockBranchShipment(id, mode); load(); toast.success("Finance fields unlocked"); }
    catch { toast.error("Unlock failed"); }
  }

  async function handleAmendSubmit() {
    if (!amendTarget) return;
    try {
      await submitAmendmentRequest({
        branch_code: branchCode,
        shipment_id: amendTarget.shipment.id,
        tracking_no: amendTarget.shipment.tracking_no,
        field_name: amendTarget.field,
        current_value: String(amendTarget.shipment[amendTarget.field]),
        requested_value: amendForm.requested_value,
        reason: amendForm.reason,
      });
      toast.success("Amendment request submitted to HQ Finance");
      setAmendTarget(null);
      setAmendForm({ requested_value:"", reason:"" });
    } catch { toast.error("Failed to submit request"); }
  }

  const filtered = rows.filter(r =>
    !search || r.tracking_no.toLowerCase().includes(search.toLowerCase()) ||
    r.receiver.toLowerCase().includes(search.toLowerCase()) ||
    r.merchant.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4d7a9b]" />
          <input
            className={`${inp} pl-8`}
            placeholder="Search tracking, receiver, merchant…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button onClick={load} className={btn("ghost")}><RefreshCw size={13} className={loading ? "animate-spin" : ""} /></button>
      </div>

      {loading ? (
        <div className="text-center text-[#4d7a9b] py-12 text-[13px]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl flex items-center justify-center h-48 text-[#4d7a9b] text-[13px]">No shipments found</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => (
            <div key={s.id} className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="font-mono text-[#f6b84b] text-[13px]">{s.tracking_no}</span>
                  {s.finance_locked === 1 && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-rose-400 border border-rose-800 bg-rose-900/20 rounded-full px-2 py-0.5">
                      <Lock size={10} /> Finance Locked
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={statusBadge(s.status)}>{s.status}</span>
                  {s.finance_locked === 0 ? (
                    <button onClick={() => handleLock(s.id)} title="Lock finance fields" className="text-[#4d7a9b] hover:text-rose-400 transition-colors cursor-pointer"><Lock size={14} /></button>
                  ) : mode === "hq" ? (
                    <button onClick={() => handleUnlock(s.id)} title="Unlock" className="text-[#4d7a9b] hover:text-emerald-400 transition-colors cursor-pointer"><Unlock size={14} /></button>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
                {[["Merchant", s.merchant], ["Receiver", s.receiver], ["Township", s.township], ["Phone", s.phone]].map(([k, v]) => (
                  <div key={k}><span className="text-[#4d7a9b]">{k}: </span><span className="text-[#eef8ff]">{v || "—"}</span></div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 text-[12px]">
                {FINANCE_FIELDS.map(f => (
                  <div key={f} className="flex items-center gap-1.5 bg-[#061524] border border-[#1a3a5c] rounded-lg px-3 py-1.5">
                    <span className="text-[#4d7a9b]">{FINANCE_FIELD_LABELS[f]}:</span>
                    <span className="text-[#eef8ff] font-mono">{fmt(s[f])}</span>
                    {s.finance_locked === 1 && mode === "branch" && (
                      <button onClick={() => setAmendTarget({ shipment: s, field: f })} className="ml-1 text-[#4d7a9b] hover:text-[#f6b84b] transition-colors cursor-pointer"><FileEdit size={11} /></button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#4d7a9b] text-[12px]">Status:</span>
                <select value={s.status} onChange={e => handleStatusChange(s.id, e.target.value)}
                  className="bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] rounded-lg px-2 py-1 text-[12px] outline-none focus:border-[#f6b84b]">
                  {SHIPMENT_STATUSES.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {amendTarget && (
        <Modal title={`Request Amendment — ${FINANCE_FIELD_LABELS[amendTarget.field]}`} onClose={() => setAmendTarget(null)}>
          <div className="space-y-4">
            <div className="bg-yellow-900/20 border border-yellow-700 rounded-xl p-3 flex gap-2 text-[12px] text-yellow-300">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              Finance field is locked. Your request will be reviewed by HQ Finance Manager.
            </div>
            <Field label="Current Value">
              <input className={`${inp} opacity-60`} readOnly value={String(amendTarget.shipment[amendTarget.field])} />
            </Field>
            <Field label="Requested Value">
              <input type="number" className={inp} value={amendForm.requested_value} onChange={e => setAmendForm(f => ({ ...f, requested_value: e.target.value }))} />
            </Field>
            <Field label="Reason">
              <textarea className={`${inp} resize-none`} rows={3} value={amendForm.reason} onChange={e => setAmendForm(f => ({ ...f, reason: e.target.value }))} />
            </Field>
            <div className="flex gap-3 pt-2">
              <button onClick={handleAmendSubmit} className={btn("gold")}>Submit Request</button>
              <button onClick={() => setAmendTarget(null)} className={btn("ghost")}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Dispatch Tab ─────────────────────────────────────────────────────────────

function DispatchTab({ branchCode, mode }: { branchCode: string; mode: "hq" | "branch" }) {
  const [rows, setRows] = useState<BranchShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await getBranchShipments(branchCode)); }
    catch { toast.error("Failed to load dispatch data"); }
    finally { setLoading(false); }
  }, [branchCode]);

  useEffect(() => { load(); }, [load]);

  const statusGroups = {
    pending:          rows.filter(r => r.status === "pending"),
    in_transit:       rows.filter(r => r.status === "in_transit"),
    out_for_delivery: rows.filter(r => r.status === "out_for_delivery"),
    delivered:        rows.filter(r => r.status === "delivered"),
    failed:           rows.filter(r => r.status === "failed"),
    returned:         rows.filter(r => r.status === "returned"),
  };

  const displayed = filter === "all" ? rows : rows.filter(r => r.status === filter);

  async function advance(id: number, nextStatus: string) {
    const res = await updateBranchShipment(id, { status: nextStatus }, mode);
    if (res.ok) { load(); toast.success(`Status → ${nextStatus}`); }
    else toast.error(res.message);
  }

  const nextStatus: Record<string, string> = {
    pending: "in_transit",
    in_transit: "out_for_delivery",
    out_for_delivery: "delivered",
  };

  return (
    <div className="space-y-5">
      {/* Status summary */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {Object.entries(statusGroups).map(([st, items]) => (
          <button key={st} onClick={() => setFilter(filter === st ? "all" : st)}
            className={`bg-[#0b2236] border rounded-xl p-3 text-center transition-colors cursor-pointer ${filter === st ? "border-[#f6b84b]" : "border-[#1a3a5c] hover:border-[#f6b84b]/50"}`}>
            <div className="text-[18px] font-mono text-[#eef8ff]">{items.length}</div>
            <div className="text-[10px] uppercase tracking-wider text-[#4d7a9b] mt-1">{st.replace("_"," ")}</div>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[#4d7a9b] text-[12px]">{filter === "all" ? `${rows.length} total` : `${displayed.length} ${filter}`}</span>
        <button onClick={load} className={btn("ghost")}><RefreshCw size={13} className={loading ? "animate-spin" : ""} /></button>
      </div>

      {loading ? <div className="text-center text-[#4d7a9b] py-12 text-[13px]">Loading…</div> : (
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[#1a3a5c]">
                  {["Tracking No","Receiver","Township","Weight","COD (MMK)","Fee (MMK)","Status","Action"].map(h => (
                    <th key={h} className="text-left text-[#4d7a9b] text-[10px] uppercase tracking-widest px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 ? (
                  <tr><td colSpan={8} className="text-center text-[#4d7a9b] py-8">No shipments</td></tr>
                ) : displayed.map(s => (
                  <tr key={s.id} className="border-b border-[#1a3a5c]/50 hover:bg-[#061524] transition-colors">
                    <td className="px-4 py-3 font-mono text-[#f6b84b]">{s.tracking_no}</td>
                    <td className="px-4 py-3 text-[#eef8ff]">{s.receiver}</td>
                    <td className="px-4 py-3 text-[#4d7a9b]">{s.township || "—"}</td>
                    <td className="px-4 py-3 text-[#4d7a9b]">{s.weight_kg} kg</td>
                    <td className="px-4 py-3 font-mono text-right text-[#eef8ff]">{fmt(s.cod_amount)}</td>
                    <td className="px-4 py-3 font-mono text-right text-[#eef8ff]">{fmt(s.delivery_fee)}</td>
                    <td className="px-4 py-3"><span className={statusBadge(s.status)}>{s.status}</span></td>
                    <td className="px-4 py-3">
                      {nextStatus[s.status] && (
                        <button onClick={() => advance(s.id, nextStatus[s.status])} className={btn("sm") + " whitespace-nowrap"}>
                          → {nextStatus[s.status].replace("_"," ")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Wayplan Tab ──────────────────────────────────────────────────────────────

function WayplanTab({ branchCode }: { branchCode: string }) {
  const [rows, setRows] = useState<BranchShipment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await getBranchShipments(branchCode)); }
    catch { toast.error("Failed to load wayplan data"); }
    finally { setLoading(false); }
  }, [branchCode]);

  useEffect(() => { load(); }, [load]);

  const pending = rows.filter(r => ["pending","in_transit","out_for_delivery"].includes(r.status));

  // Group by township
  const byTownship: Record<string, BranchShipment[]> = {};
  pending.forEach(s => {
    const key = s.township || "Unassigned";
    if (!byTownship[key]) byTownship[key] = [];
    byTownship[key].push(s);
  });

  function printRoute(township: string, items: BranchShipment[]) {
    const w = window.open("", "_blank");
    if (!w) return;
    const branchLabel = BRANCHES.find(b => b.code === branchCode)?.label ?? branchCode;
    const today = new Date().toLocaleDateString("en-GB");
    w.document.write(`
      <html><head><title>Route — ${township}</title>
      <style>body{font-family:Poppins,sans-serif;padding:20px}h2{color:#1a3a5c}table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f0f4f8}
      .tracking{font-family:monospace;font-size:12px}</style></head>
      <body>
      <h2>Britium Express — Route Manifest</h2>
      <p><strong>Branch:</strong> ${branchLabel} &nbsp;&nbsp; <strong>Area:</strong> ${township} &nbsp;&nbsp; <strong>Date:</strong> ${today}</p>
      <table><tr><th>#</th><th>Tracking No</th><th>Receiver</th><th>Phone</th><th>Address</th><th>COD (MMK)</th></tr>
      ${items.map((s, i) => `<tr><td>${i+1}</td><td class="tracking">${s.tracking_no}</td><td>${s.receiver}</td><td>${s.phone}</td><td>${s.address}</td><td style="text-align:right">${fmt(s.cod_amount)}</td></tr>`).join("")}
      </table>
      <p style="margin-top:20px"><strong>Total Parcels:</strong> ${items.length} &nbsp;&nbsp; <strong>Total COD:</strong> ${fmt(items.reduce((s,r)=>s+r.cod_amount,0))} MMK</p>
      </body></html>
    `);
    w.document.close();
    w.print();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-[#4d7a9b] text-[12px]">{pending.length} parcels in {Object.keys(byTownship).length} zones</span>
        <button onClick={load} className={btn("ghost")}><RefreshCw size={13} className={loading ? "animate-spin" : ""} /></button>
      </div>

      {loading ? <div className="text-center text-[#4d7a9b] py-12 text-[13px]">Loading…</div> :
        Object.keys(byTownship).length === 0 ? (
          <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl flex items-center justify-center h-48 text-[#4d7a9b] text-[13px]">No pending deliveries</div>
        ) : (
          <div className="space-y-4">
            {Object.entries(byTownship).map(([township, items]) => (
              <div key={township} className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-[#1a3a5c] bg-[#061524]">
                  <div className="flex items-center gap-2">
                    <MapPin size={13} className="text-[#f6b84b]" />
                    <span className="text-[#eef8ff] text-[13px] font-semibold">{township}</span>
                    <span className="text-[#4d7a9b] text-[12px]">({items.length} parcel{items.length !== 1 ? "s" : ""})</span>
                  </div>
                  <button onClick={() => printRoute(township, items)} className={btn("ghost") + " py-1.5 flex items-center gap-1.5"}>
                    <Printer size={12} /> Print Route
                  </button>
                </div>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-[#1a3a5c]/50">
                      {["#","Tracking No","Receiver","Phone","COD (MMK)","Status"].map(h => (
                        <th key={h} className="text-left text-[#4d7a9b] text-[10px] px-4 py-2 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((s, i) => (
                      <tr key={s.id} className="border-b border-[#1a3a5c]/30 hover:bg-[#061524]">
                        <td className="px-4 py-2 text-[#4d7a9b]">{i+1}</td>
                        <td className="px-4 py-2 font-mono text-[#f6b84b]">{s.tracking_no}</td>
                        <td className="px-4 py-2 text-[#eef8ff]">{s.receiver}</td>
                        <td className="px-4 py-2 text-[#4d7a9b]">{s.phone || "—"}</td>
                        <td className="px-4 py-2 text-right font-mono text-[#eef8ff]">{fmt(s.cod_amount)}</td>
                        <td className="px-4 py-2"><span className={statusBadge(s.status)}>{s.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

// ─── Waybill Tab ──────────────────────────────────────────────────────────────

function WaybillTab({ branchCode }: { branchCode: string }) {
  const [rows, setRows] = useState<BranchShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await getBranchShipments(branchCode)); }
    catch { toast.error("Failed to load waybills"); }
    finally { setLoading(false); }
  }, [branchCode]);

  useEffect(() => { load(); }, [load]);

  function printWaybill(s: BranchShipment) {
    const branchLabel = BRANCHES.find(b => b.code === branchCode)?.label ?? branchCode;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(s.tracking_no)}`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head><title>Waybill — ${s.tracking_no}</title>
      <style>
        body{font-family:Poppins,sans-serif;padding:0;margin:0}
        .wb{width:140mm;min-height:100mm;border:2px solid #1a3a5c;padding:8mm;margin:4mm}
        .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #1a3a5c;padding-bottom:4mm;margin-bottom:4mm}
        .brand{font-size:14pt;font-weight:bold;color:#1a3a5c;letter-spacing:2px}
        .branch{font-size:9pt;color:#4d7a9b}
        .tracking{font-size:16pt;font-weight:bold;font-family:monospace;color:#C09B30;letter-spacing:2px;margin-bottom:2mm}
        .row{display:flex;gap:4mm;margin-bottom:2mm;font-size:9pt}
        .lbl{color:#4d7a9b;width:30mm;flex-shrink:0}
        .val{color:#0a1628;font-weight:500}
        .fin{background:#f0f4f8;border-radius:4px;padding:3mm;margin-top:3mm;display:flex;gap:8mm;font-size:9pt}
        .fin .item{text-align:center}
        .fin .n{font-size:11pt;font-weight:bold;font-family:monospace}
      </style></head>
      <body>
      <div class="wb">
        <div class="hdr">
          <div>
            <div class="brand">BRITIUM EXPRESS</div>
            <div class="branch">${branchLabel}</div>
            <div class="tracking">${s.tracking_no}</div>
          </div>
          <img src="${qrUrl}" width="80" height="80" />
        </div>
        <div class="row"><span class="lbl">Receiver</span><span class="val">${s.receiver || "—"}</span></div>
        <div class="row"><span class="lbl">Phone</span><span class="val">${s.phone || "—"}</span></div>
        <div class="row"><span class="lbl">Township</span><span class="val">${s.township || "—"}</span></div>
        <div class="row"><span class="lbl">Address</span><span class="val">${s.address || "—"}</span></div>
        <div class="row"><span class="lbl">Merchant</span><span class="val">${s.merchant || "—"}</span></div>
        <div class="fin">
          <div class="item"><div class="n">${fmt(s.cod_amount)}</div><div>COD (MMK)</div></div>
          <div class="item"><div class="n">${fmt(s.delivery_fee)}</div><div>Fee (MMK)</div></div>
          <div class="item"><div class="n">${s.weight_kg}</div><div>Weight (kg)</div></div>
        </div>
      </div>
      </body></html>
    `);
    w.document.close();
    w.print();
  }

  const filtered = rows.filter(r => !search || r.tracking_no.toLowerCase().includes(search.toLowerCase()) || r.receiver.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4d7a9b]" />
          <input className={`${inp} pl-8`} placeholder="Search tracking or receiver…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={load} className={btn("ghost")}><RefreshCw size={13} className={loading ? "animate-spin" : ""} /></button>
      </div>

      {loading ? <div className="text-center text-[#4d7a9b] py-12 text-[13px]">Loading…</div> : (
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[#1a3a5c]">
                {["Tracking No","Receiver","Township","COD (MMK)","Fee (MMK)","Status","Waybill"].map(h => (
                  <th key={h} className="text-left text-[#4d7a9b] text-[10px] uppercase tracking-widest px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-[#4d7a9b] py-8">No shipments</td></tr>
              ) : filtered.map(s => (
                <tr key={s.id} className="border-b border-[#1a3a5c]/50 hover:bg-[#061524] transition-colors">
                  <td className="px-4 py-3 font-mono text-[#f6b84b]">{s.tracking_no}</td>
                  <td className="px-4 py-3 text-[#eef8ff]">{s.receiver}</td>
                  <td className="px-4 py-3 text-[#4d7a9b]">{s.township || "—"}</td>
                  <td className="px-4 py-3 font-mono text-right text-[#eef8ff]">{fmt(s.cod_amount)}</td>
                  <td className="px-4 py-3 font-mono text-right text-[#eef8ff]">{fmt(s.delivery_fee)}</td>
                  <td className="px-4 py-3"><span className={statusBadge(s.status)}>{s.status}</span></td>
                  <td className="px-4 py-3">
                    <button onClick={() => printWaybill(s)} className={btn("sm") + " flex items-center gap-1.5"}>
                      <Printer size={11} /> Print
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Warehouse Tab ────────────────────────────────────────────────────────────

function WarehouseTab({ branchCode, mode }: { branchCode: string; mode: "hq" | "branch" }) {
  const [rows, setRows] = useState<BranchShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanQuery, setScanQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await getBranchShipments(branchCode)); }
    catch { toast.error("Failed to load warehouse data"); }
    finally { setLoading(false); }
  }, [branchCode]);

  useEffect(() => { load(); }, [load]);

  const stockSummary = {
    received:    rows.filter(r => r.status === "pending").length,
    in_transit:  rows.filter(r => r.status === "in_transit" || r.status === "out_for_delivery").length,
    delivered:   rows.filter(r => r.status === "delivered").length,
    failed:      rows.filter(r => r.status === "failed" || r.status === "returned").length,
  };

  const scanned = rows.filter(r =>
    scanQuery && (r.tracking_no.toLowerCase().includes(scanQuery.toLowerCase()) || r.receiver.toLowerCase().includes(scanQuery.toLowerCase()))
  );

  async function markReceived(id: number) {
    const res = await updateBranchShipment(id, { status: "pending" }, mode);
    if (res.ok) { load(); toast.success("Marked as received in warehouse"); }
    else toast.error(res.message);
  }

  async function markLoaded(id: number) {
    const res = await updateBranchShipment(id, { status: "in_transit" }, mode);
    if (res.ok) { load(); toast.success("Loaded to van"); }
    else toast.error(res.message);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "In Warehouse",  value: stockSummary.received,   color: "text-blue-400" },
          { label: "In Transit",    value: stockSummary.in_transit,  color: "text-purple-400" },
          { label: "Delivered",     value: stockSummary.delivered,   color: "text-emerald-400" },
          { label: "Failed / RTO",  value: stockSummary.failed,      color: "text-rose-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[#0b2236] border border-[#1a3a5c] p-4 rounded-2xl">
            <div className={`text-[10px] uppercase tracking-widest ${color} mb-1`}>{label}</div>
            <div className="text-[22px] text-[#eef8ff] font-mono">{value}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4d7a9b]" />
          <input className={`${inp} pl-8`} placeholder="Scan / search tracking no or receiver…" value={scanQuery} onChange={e => setScanQuery(e.target.value)} />
        </div>
        <button onClick={load} className={btn("ghost")}><RefreshCw size={13} className={loading ? "animate-spin" : ""} /></button>
      </div>

      {scanned.length > 0 && (
        <div className="space-y-2">
          <div className="text-[#4d7a9b] text-[12px]">Scan results ({scanned.length}):</div>
          {scanned.map(s => (
            <div key={s.id} className="bg-[#0b2236] border border-[#1a3a5c] rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="font-mono text-[#f6b84b] text-[13px]">{s.tracking_no}</div>
                <div className="text-[12px] text-[#eef8ff]">{s.receiver} · {s.township}</div>
                <span className={statusBadge(s.status)}>{s.status}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => markReceived(s.id)} className={btn("sm")}>Receive</button>
                <button onClick={() => markLoaded(s.id)} className={btn("sm")}>Load to Van</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? <div className="text-center text-[#4d7a9b] py-8 text-[13px]">Loading…</div> : (
        !scanQuery && (
          <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#1a3a5c]">
              <span className="text-[#eef8ff] text-[13px] uppercase tracking-widest">All Warehouse Stock</span>
            </div>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[#1a3a5c]">
                  {["Tracking No","Receiver","Township","Weight","COD","Status","Action"].map(h => (
                    <th key={h} className="text-left text-[#4d7a9b] text-[10px] uppercase tracking-widest px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-[#4d7a9b] py-8">No items</td></tr>
                ) : rows.slice(0, 50).map(s => (
                  <tr key={s.id} className="border-b border-[#1a3a5c]/50 hover:bg-[#061524]">
                    <td className="px-4 py-2 font-mono text-[#f6b84b]">{s.tracking_no}</td>
                    <td className="px-4 py-2 text-[#eef8ff]">{s.receiver}</td>
                    <td className="px-4 py-2 text-[#4d7a9b]">{s.township}</td>
                    <td className="px-4 py-2 text-[#4d7a9b]">{s.weight_kg} kg</td>
                    <td className="px-4 py-2 font-mono text-right text-[#eef8ff]">{fmt(s.cod_amount)}</td>
                    <td className="px-4 py-2"><span className={statusBadge(s.status)}>{s.status}</span></td>
                    <td className="px-4 py-2 flex gap-1">
                      <button onClick={() => markReceived(s.id)} className={btn("sm") + " text-[10px] px-2"}>Recv</button>
                      <button onClick={() => markLoaded(s.id)} className={btn("sm") + " text-[10px] px-2"}>Load</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

// ─── COD Settlement Tab ───────────────────────────────────────────────────────

function CODSettlementTab({ branchCode, mode }: { branchCode: string; mode: "hq" | "branch" }) {
  const [rows, setRows] = useState<BranchShipment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await getBranchShipments(branchCode)); }
    catch { toast.error("Failed to load COD data"); }
    finally { setLoading(false); }
  }, [branchCode]);

  useEffect(() => { load(); }, [load]);

  const delivered = rows.filter(r => r.status === "delivered");
  const unsettled = delivered.filter(r => r.finance_locked === 0);
  const settled   = delivered.filter(r => r.finance_locked === 1);
  const totalCOD     = delivered.reduce((s, r) => s + r.cod_amount, 0);
  const totalUnsettled = unsettled.reduce((s, r) => s + r.cod_amount, 0);

  async function settle(id: number) {
    try {
      await lockBranchShipment(id);
      load();
      toast.success("COD marked as settled (finance locked)");
    } catch { toast.error("Failed to settle"); }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Delivered",   value: `${delivered.length}`,          color: "text-emerald-400" },
          { label: "Total COD",          value: `${fmt(totalCOD)} MMK`,          color: "text-[#f6b84b]" },
          { label: "Unsettled COD",      value: `${fmt(totalUnsettled)} MMK`,    color: "text-rose-400" },
          { label: "Settled Records",    value: `${settled.length}`,             color: "text-blue-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[#0b2236] border border-[#1a3a5c] p-4 rounded-2xl">
            <div className={`text-[10px] uppercase tracking-widest ${color} mb-1`}>{label}</div>
            <div className="text-[16px] text-[#eef8ff] font-mono">{value}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[#4d7a9b] text-[12px]">Delivered shipments — COD settlement</span>
        <button onClick={load} className={btn("ghost")}><RefreshCw size={13} className={loading ? "animate-spin" : ""} /></button>
      </div>

      {loading ? <div className="text-center text-[#4d7a9b] py-8 text-[13px]">Loading…</div> : (
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[#1a3a5c]">
                {["Tracking No","Receiver","Township","COD (MMK)","Fee (MMK)","Settlement","Action"].map(h => (
                  <th key={h} className="text-left text-[#4d7a9b] text-[10px] uppercase tracking-widest px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {delivered.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-[#4d7a9b] py-8">No delivered shipments</td></tr>
              ) : delivered.map(s => (
                <tr key={s.id} className="border-b border-[#1a3a5c]/50 hover:bg-[#061524]">
                  <td className="px-4 py-3 font-mono text-[#f6b84b]">{s.tracking_no}</td>
                  <td className="px-4 py-3 text-[#eef8ff]">{s.receiver}</td>
                  <td className="px-4 py-3 text-[#4d7a9b]">{s.township}</td>
                  <td className="px-4 py-3 font-mono text-right text-[#eef8ff]">{fmt(s.cod_amount)}</td>
                  <td className="px-4 py-3 font-mono text-right text-[#eef8ff]">{fmt(s.delivery_fee)}</td>
                  <td className="px-4 py-3">
                    {s.finance_locked === 1
                      ? <span className="flex items-center gap-1 text-emerald-400 text-[11px]"><CheckCircle size={11} /> Settled</span>
                      : <span className="text-yellow-400 text-[11px]">Pending</span>}
                  </td>
                  <td className="px-4 py-3">
                    {s.finance_locked === 0 && (
                      <button onClick={() => settle(s.id)} className={btn("emerald") + " py-1 px-3 text-[11px]"}>
                        Settle
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Merchant Tab ─────────────────────────────────────────────────────────────

function MerchantTab({ branchCode }: { branchCode: string }) {
  const [rows, setRows] = useState<BranchShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await getBranchShipments(branchCode)); }
    catch { toast.error("Failed to load merchant data"); }
    finally { setLoading(false); }
  }, [branchCode]);

  useEffect(() => { load(); }, [load]);

  // Group by merchant
  const merchants: Record<string, { count: number; cod: number; delivered: number; fee: number }> = {};
  rows.forEach(s => {
    const m = s.merchant || "(No Merchant)";
    if (!merchants[m]) merchants[m] = { count: 0, cod: 0, delivered: 0, fee: 0 };
    merchants[m].count++;
    merchants[m].cod += s.cod_amount;
    merchants[m].fee += s.delivery_fee;
    if (s.status === "delivered") merchants[m].delivered++;
  });

  const filtered = Object.entries(merchants).filter(([m]) =>
    !search || m.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4d7a9b]" />
          <input className={`${inp} pl-8`} placeholder="Search merchant…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={load} className={btn("ghost")}><RefreshCw size={13} className={loading ? "animate-spin" : ""} /></button>
      </div>

      {loading ? <div className="text-center text-[#4d7a9b] py-8 text-[13px]">Loading…</div> : (
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[#1a3a5c]">
                {["Merchant","Total Parcels","Delivered","Total COD (MMK)","Total Fee (MMK)","Success Rate"].map(h => (
                  <th key={h} className={`${h.includes("MMK") || h === "Delivered" || h === "Total Parcels" ? "text-right" : "text-left"} text-[#4d7a9b] text-[10px] uppercase tracking-widest px-4 py-3`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-[#4d7a9b] py-8">No merchant data</td></tr>
              ) : filtered.sort((a, b) => b[1].count - a[1].count).map(([m, d]) => (
                <tr key={m} className="border-b border-[#1a3a5c]/50 hover:bg-[#061524]">
                  <td className="px-4 py-3 text-[#eef8ff] font-medium">{m}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#eef8ff]">{d.count}</td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-400">{d.delivered}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#f6b84b]">{fmt(d.cod)}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#4ea8de]">{fmt(d.fee)}</td>
                  <td className="px-4 py-3 text-right font-mono text-[#eef8ff]">
                    {d.count > 0 ? `${Math.round((d.delivered / d.count) * 100)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Customer Tab ─────────────────────────────────────────────────────────────

function CustomerTab({ branchCode }: { branchCode: string }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<BranchShipment | null | "not_found">(null);
  const [rows, setRows] = useState<BranchShipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBranchShipments(branchCode).then(setRows).catch(() => {}).finally(() => setLoading(false));
  }, [branchCode]);

  function handleSearch() {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const found = rows.find(r =>
      r.tracking_no.toLowerCase() === q ||
      r.tracking_no.toLowerCase().includes(q) ||
      r.phone.toLowerCase().includes(q)
    );
    setResult(found ?? "not_found");
  }

  const statusSteps = ["pending","in_transit","out_for_delivery","delivered"];

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-[#f6b84b]" />
          <span className="text-[#f6b84b] text-[13px] font-semibold uppercase tracking-widest">Track Shipment</span>
        </div>
        <div className="flex gap-3">
          <input
            className={`${inp} flex-1`}
            placeholder="Enter Tracking No or Phone Number…"
            value={query}
            onChange={e => { setQuery(e.target.value); setResult(null); }}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
          />
          <button onClick={handleSearch} className={btn("gold")}>Track</button>
        </div>

        {result === "not_found" && (
          <div className="bg-rose-900/20 border border-rose-800 rounded-xl p-3 text-[12px] text-rose-300 flex items-center gap-2">
            <XCircle size={13} /> No shipment found. Please check the tracking number or phone.
          </div>
        )}

        {result && result !== "not_found" && (
          <div className="bg-[#061524] border border-[#1a3a5c] rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[#f6b84b] text-[14px]">{result.tracking_no}</span>
              <span className={statusBadge(result.status)}>{result.status}</span>
            </div>

            {/* Progress bar */}
            <div className="flex items-center gap-1">
              {statusSteps.map((step, i) => {
                const idx = statusSteps.indexOf(result.status);
                const done = i <= idx;
                return (
                  <div key={step} className="flex-1 flex flex-col items-center gap-1">
                    <div className={`h-2 rounded-full w-full transition-colors ${done ? "bg-[#f6b84b]" : "bg-[#1a3a5c]"}`} />
                    <span className={`text-[9px] uppercase tracking-wider ${done ? "text-[#f6b84b]" : "text-[#4d7a9b]"}`}>{step.replace(/_/g," ")}</span>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2 text-[12px]">
              {[["Receiver", result.receiver], ["Phone", result.phone], ["Township", result.township], ["Address", result.address]].map(([k, v]) => (
                <div key={k}><span className="text-[#4d7a9b]">{k}: </span><span className="text-[#eef8ff]">{v || "—"}</span></div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="text-[#4d7a9b] text-[12px]">{loading ? "Loading…" : `${rows.length} total shipments in ${branchCode} branch`}</div>
    </div>
  );
}

// ─── Supervisor Tab ───────────────────────────────────────────────────────────

function SupervisorTab({ branchCode, mode }: { branchCode: string; mode: "hq" | "branch" }) {
  const [rows, setRows] = useState<BranchShipment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await getBranchShipments(branchCode)); }
    catch { toast.error("Failed to load supervisor data"); }
    finally { setLoading(false); }
  }, [branchCode]);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toDateString();
  const todayRows = rows.filter(r => new Date(r.createdAt).toDateString() === today);

  const kpis = {
    total:     rows.length,
    delivered: rows.filter(r => r.status === "delivered").length,
    failed:    rows.filter(r => r.status === "failed").length,
    returned:  rows.filter(r => r.status === "returned").length,
    today:     todayRows.length,
    delivery_rate: rows.length > 0 ? ((rows.filter(r=>r.status==="delivered").length / rows.length) * 100).toFixed(1) : "0.0",
  };

  const exceptions = rows.filter(r => r.status === "failed" || r.status === "returned");

  async function markForRetry(id: number) {
    const res = await updateBranchShipment(id, { status: "pending" }, mode);
    if (res.ok) { load(); toast.success("Marked for retry"); }
    else toast.error(res.message);
  }

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: "Total",         value: kpis.total,         color: "text-[#4ea8de]" },
          { label: "Delivered",     value: kpis.delivered,     color: "text-emerald-400" },
          { label: "Failed",        value: kpis.failed,        color: "text-rose-400" },
          { label: "Returned",      value: kpis.returned,      color: "text-gray-400" },
          { label: "Today",         value: kpis.today,         color: "text-yellow-400" },
          { label: "Success Rate",  value: `${kpis.delivery_rate}%`, color: "text-purple-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[#0b2236] border border-[#1a3a5c] p-4 rounded-2xl text-center">
            <div className={`text-[10px] uppercase tracking-widest ${color} mb-1`}>{label}</div>
            <div className="text-[18px] text-[#eef8ff] font-mono">{value}</div>
          </div>
        ))}
      </div>

      {/* Today's activity */}
      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1a3a5c]">
          <span className="text-[#eef8ff] text-[13px] uppercase tracking-widest">Today's Entries</span>
          <span className="text-[#4d7a9b] text-[12px]">{todayRows.length} shipments</span>
        </div>
        {loading ? <div className="py-8 text-center text-[#4d7a9b] text-[13px]">Loading…</div> : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[#1a3a5c]">
                {["Tracking No","Receiver","Township","COD","Status"].map(h => (
                  <th key={h} className="text-left text-[#4d7a9b] text-[10px] uppercase tracking-widest px-4 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {todayRows.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-[#4d7a9b] py-6">No entries today</td></tr>
              ) : todayRows.map(s => (
                <tr key={s.id} className="border-b border-[#1a3a5c]/40 hover:bg-[#061524]">
                  <td className="px-4 py-2 font-mono text-[#f6b84b]">{s.tracking_no}</td>
                  <td className="px-4 py-2 text-[#eef8ff]">{s.receiver}</td>
                  <td className="px-4 py-2 text-[#4d7a9b]">{s.township}</td>
                  <td className="px-4 py-2 font-mono text-right text-[#eef8ff]">{fmt(s.cod_amount)}</td>
                  <td className="px-4 py-2"><span className={statusBadge(s.status)}>{s.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Exceptions */}
      {exceptions.length > 0 && (
        <div className="bg-[#0b2236] border border-rose-900/40 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-rose-900/40 bg-rose-900/10">
            <AlertTriangle size={13} className="text-rose-400" />
            <span className="text-rose-300 text-[13px] uppercase tracking-widest">Exceptions ({exceptions.length})</span>
          </div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[#1a3a5c]">
                {["Tracking No","Receiver","Status","Action"].map(h => (
                  <th key={h} className="text-left text-[#4d7a9b] text-[10px] uppercase tracking-widest px-4 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exceptions.map(s => (
                <tr key={s.id} className="border-b border-[#1a3a5c]/40 hover:bg-[#061524]">
                  <td className="px-4 py-2 font-mono text-[#f6b84b]">{s.tracking_no}</td>
                  <td className="px-4 py-2 text-[#eef8ff]">{s.receiver}</td>
                  <td className="px-4 py-2"><span className={statusBadge(s.status)}>{s.status}</span></td>
                  <td className="px-4 py-2">
                    <button onClick={() => markForRetry(s.id)} className={btn("sm") + " text-[10px]"}>Retry</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tariffs Tab ──────────────────────────────────────────────────────────────

function TariffsTab({ branchCode, mode }: { branchCode: string; mode: "hq" | "branch" }) {
  const [tariffs, setTariffs] = useState<BranchTariff[]>([]);
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<BranchTariff | null>(null);
  const [editForm, setEditForm] = useState({ base_fee: 0, default_weight: 3, extra_per_kg: 500 });
  const [newArea, setNewArea] = useState({ area_name: "", area_type: "township" });
  const [showAreaForm, setShowAreaForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, a] = await Promise.all([
        fetchTariffs(),
        fetchServiceAreas(branchCode !== "YGN" ? branchCode : undefined),
      ]);
      setTariffs(t);
      setAreas(a);
    } catch { toast.error("Failed to load tariff data"); }
    finally { setLoading(false); }
  }, [branchCode]);

  useEffect(() => { load(); }, [load]);

  const destLabel = (destCode: string, originCode: string) => {
    if (destCode === "INTRA") return `Within ${BRANCHES.find(b=>b.code===originCode)?.label?.replace(" Branch","").replace(" (HQ)","") ?? originCode}`;
    return BRANCHES.find(b => b.code === destCode)?.label ?? destCode;
  };

  async function handleEditSave() {
    if (!editTarget) return;
    try {
      await updateTariff(editTarget.id, editForm);
      toast.success("Tariff updated");
      setEditTarget(null);
      load();
    } catch { toast.error("Failed to update tariff"); }
  }

  async function handleAddArea() {
    if (!newArea.area_name.trim()) return;
    try {
      await addServiceArea({ branch_code: branchCode, ...newArea });
      toast.success("Service area added");
      setNewArea({ area_name: "", area_type: "township" });
      setShowAreaForm(false);
      load();
    } catch { toast.error("Failed to add area"); }
  }

  async function handleDeleteArea(id: number) {
    try {
      await deleteServiceArea(id);
      load();
      toast.success("Area removed");
    } catch { toast.error("Failed to remove area"); }
  }

  const branchTariffsFiltered = tariffs.filter(t =>
    branchCode === "YGN" ? true : t.origin_code === branchCode
  );

  return (
    <div className="space-y-6">
      {mode !== "hq" && (
        <div className="bg-[#061524] border border-[#1a3a5c] rounded-xl p-3 flex items-center gap-2 text-[12px] text-[#4d7a9b]">
          <Lock size={13} className="text-[#f6b84b]" />
          Tariff configuration is managed by HQ Administration only. This is a read-only view.
        </div>
      )}

      {/* Tariff table */}
      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1a3a5c]">
          <span className="text-[#f6b84b] text-[13px] font-semibold uppercase tracking-widest flex items-center gap-2">
            <Tag size={13} /> Tariff Configuration
          </span>
          <button onClick={load} className={btn("ghost") + " py-1.5"}><RefreshCw size={13} className={loading ? "animate-spin" : ""} /></button>
        </div>
        {loading ? <div className="py-8 text-center text-[#4d7a9b] text-[13px]">Loading…</div> : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[#1a3a5c]">
                {["Origin","Route / Destination","Base Fee","Default Weight","Extra/kg", mode === "hq" ? "Edit" : ""].filter(Boolean).map(h => (
                  <th key={h} className="text-left text-[#4d7a9b] text-[10px] uppercase tracking-widest px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {branchTariffsFiltered.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-[#4d7a9b] py-8">No tariffs configured</td></tr>
              ) : branchTariffsFiltered.map(t => (
                <tr key={t.id} className="border-b border-[#1a3a5c]/50 hover:bg-[#061524]">
                  <td className="px-4 py-3 text-[#4d7a9b]">{BRANCHES.find(b=>b.code===t.origin_code)?.label ?? t.origin_code}</td>
                  <td className="px-4 py-3 text-[#eef8ff] font-medium">{destLabel(t.dest_code, t.origin_code)}</td>
                  <td className="px-4 py-3 font-mono text-[#f6b84b]">{fmt(t.base_fee)} MMK</td>
                  <td className="px-4 py-3 font-mono text-[#eef8ff]">{t.default_weight} kg</td>
                  <td className="px-4 py-3 font-mono text-[#eef8ff]">{fmt(t.extra_per_kg)} MMK/kg</td>
                  {mode === "hq" && (
                    <td className="px-4 py-3">
                      <button onClick={() => { setEditTarget(t); setEditForm({ base_fee: t.base_fee, default_weight: t.default_weight, extra_per_kg: t.extra_per_kg }); }}
                        className={btn("sm") + " flex items-center gap-1.5"}><Edit2 size={11} /> Edit</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Fee Calculator */}
      <TariffCalculator branchCode={branchCode} />

      {/* Service Areas */}
      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1a3a5c]">
          <span className="text-[#eef8ff] text-[13px] uppercase tracking-widest flex items-center gap-2">
            <MapPin size={13} className="text-[#4d7a9b]" /> Service Areas — {branchCode}
          </span>
          {mode === "hq" && (
            <button onClick={() => setShowAreaForm(true)} className={btn("gold") + " py-1.5 flex items-center gap-1.5 text-[12px]"}>
              <Plus size={12} /> Add Area
            </button>
          )}
        </div>
        {showAreaForm && mode === "hq" && (
          <div className="p-4 border-b border-[#1a3a5c] bg-[#061524] flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[150px]">
              <label className="text-[#4d7a9b] text-[10px] uppercase tracking-widest block mb-1">Area Name</label>
              <input className={inp} value={newArea.area_name} onChange={e => setNewArea(f => ({ ...f, area_name: e.target.value }))} />
            </div>
            <div className="w-36">
              <label className="text-[#4d7a9b] text-[10px] uppercase tracking-widest block mb-1">Type</label>
              <select className={inp} value={newArea.area_type} onChange={e => setNewArea(f => ({ ...f, area_type: e.target.value }))}>
                <option value="township">Township</option>
                <option value="city">City</option>
                <option value="district">District</option>
              </select>
            </div>
            <button onClick={handleAddArea} className={btn("gold")}>Add</button>
            <button onClick={() => setShowAreaForm(false)} className={btn("ghost")}>Cancel</button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[#1a3a5c]">
                {["Branch","Area Name","Type", mode === "hq" ? "" : null].filter(Boolean).map(h => (
                  <th key={h!} className="text-left text-[#4d7a9b] text-[10px] uppercase tracking-widest px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {areas.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-[#4d7a9b] py-8">No service areas configured</td></tr>
              ) : areas.map(a => (
                <tr key={a.id} className="border-b border-[#1a3a5c]/50 hover:bg-[#061524]">
                  <td className="px-4 py-2 text-[#4d7a9b]">{a.branch_code}</td>
                  <td className="px-4 py-2 text-[#eef8ff]">{a.area_name}</td>
                  <td className="px-4 py-2">
                    <span className="bg-[#061524] border border-[#1a3a5c] rounded-full px-2 py-0.5 text-[10px] text-[#4d7a9b]">{a.area_type}</span>
                  </td>
                  {mode === "hq" && (
                    <td className="px-4 py-2">
                      <button onClick={() => handleDeleteArea(a.id)} className="text-[#4d7a9b] hover:text-rose-400 transition-colors cursor-pointer"><X size={13} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit tariff modal */}
      {editTarget && (
        <Modal title={`Edit Tariff — ${destLabel(editTarget.dest_code, editTarget.origin_code)}`} onClose={() => setEditTarget(null)}>
          <div className="space-y-4">
            <Field label="Base Fee (MMK)">
              <input type="number" className={inp} value={editForm.base_fee} onChange={e => setEditForm(f => ({ ...f, base_fee: Number(e.target.value) }))} />
            </Field>
            <Field label="Default Weight (kg)">
              <input type="number" step={0.5} className={inp} value={editForm.default_weight} onChange={e => setEditForm(f => ({ ...f, default_weight: Number(e.target.value) }))} />
            </Field>
            <Field label="Extra per kg (MMK)">
              <input type="number" className={inp} value={editForm.extra_per_kg} onChange={e => setEditForm(f => ({ ...f, extra_per_kg: Number(e.target.value) }))} />
            </Field>
            <div className="flex gap-3 pt-2">
              <button onClick={handleEditSave} className={btn("gold")}>Save Changes</button>
              <button onClick={() => setEditTarget(null)} className={btn("ghost")}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Team Tab ─────────────────────────────────────────────────────────────────

function TeamTab({ branchCode, mode }: { branchCode: string; mode: "hq" | "branch" }) {
  const [rows, setRows] = useState<BranchStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ staff_name:"", role:"branch_staff", phone:"", email:"", notes:"" });

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await getBranchStaff(branchCode)); } catch { toast.error("Failed to load staff"); }
    finally { setLoading(false); }
  }, [branchCode]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    try {
      await addBranchStaff({ ...form, branch_code: branchCode, appointed_by: mode === "hq" ? "HQ" : "Branch" }, mode);
      toast.success("Staff member added");
      setShowAdd(false);
      setForm({ staff_name:"", role:"branch_staff", phone:"", email:"", notes:"" });
      load();
    } catch (e: any) { toast.error(e.message ?? "Failed to add staff"); }
  }

  async function handleStatusToggle(s: BranchStaff) {
    try {
      await updateBranchStaff(s.id, { status: s.status === "active" ? "inactive" : "active" }, mode);
      load();
    } catch (e: any) { toast.error(e.message ?? "Update failed"); }
  }

  async function handleDelete(id: number) {
    try { await deleteBranchStaff(id); load(); toast.success("Staff removed"); }
    catch { toast.error("Delete failed"); }
  }

  const availableRoles = STAFF_ROLES.filter(r => mode === "hq" || !r.hqOnly);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-[#4d7a9b] text-[13px]">{rows.length} staff member{rows.length !== 1 ? "s" : ""}</span>
        <button onClick={() => setShowAdd(true)} className={btn("gold")}><span className="flex items-center gap-1.5"><Plus size={14} /> Add Staff</span></button>
      </div>
      {mode !== "hq" && (
        <div className="bg-[#061524] border border-[#1a3a5c] rounded-xl p-3 flex items-center gap-2 text-[12px] text-[#4d7a9b]">
          <ShieldAlert size={14} className="text-[#f6b84b]" />
          Branch Manager appointments are managed by HQ Administration only.
        </div>
      )}
      {loading ? <div className="text-center text-[#4d7a9b] py-12 text-[13px]">Loading…</div> : (
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#1a3a5c]">
                {["Name","Role","Phone","Appointed By","Status",""].map(h => (
                  <th key={h} className="text-left text-[#4d7a9b] text-[11px] uppercase tracking-widest px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-[#4d7a9b] py-8">No staff members</td></tr>
              ) : rows.map(s => (
                <tr key={s.id} className="border-b border-[#1a3a5c]/50 hover:bg-[#061524]">
                  <td className="px-4 py-3 text-[#eef8ff]">{s.staff_name}</td>
                  <td className="px-4 py-3"><span className={statusBadge(s.role === "branch_manager" ? "active" : "pending")}>{s.role.replace("_"," ")}</span></td>
                  <td className="px-4 py-3 text-[#4d7a9b]">{s.phone || "—"}</td>
                  <td className="px-4 py-3 text-[#4d7a9b]">{s.appointed_by}</td>
                  <td className="px-4 py-3"><button onClick={() => handleStatusToggle(s)} className={statusBadge(s.status) + " cursor-pointer"}>{s.status}</button></td>
                  <td className="px-4 py-3"><button onClick={() => handleDelete(s.id)} className="text-[#4d7a9b] hover:text-rose-400 transition-colors cursor-pointer"><X size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showAdd && (
        <Modal title="Add Staff Member" onClose={() => setShowAdd(false)}>
          <div className="space-y-4">
            <Field label="Full Name"><input className={inp} value={form.staff_name} onChange={e => setForm(f => ({ ...f, staff_name: e.target.value }))} /></Field>
            <Field label="Role">
              <select className={inp} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                {availableRoles.map(r => <option key={r.value} value={r.value}>{r.label}{r.hqOnly ? " (HQ Only)" : ""}</option>)}
              </select>
            </Field>
            <Field label="Phone"><input className={inp} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></Field>
            <Field label="Email"><input type="email" className={inp} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></Field>
            <Field label="Notes"><textarea className={`${inp} resize-none`} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></Field>
            <div className="flex gap-3 pt-2">
              <button onClick={handleAdd} className={btn("gold")}>Add Member</button>
              <button onClick={() => setShowAdd(false)} className={btn("ghost")}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Finance Tab ──────────────────────────────────────────────────────────────

function FinanceTab({ branchCode, mode }: { branchCode: string; mode: "hq" | "branch" }) {
  const [rows, setRows] = useState<BranchShipment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await getBranchShipments(branchCode)); } catch { toast.error("Failed to load finance data"); }
    finally { setLoading(false); }
  }, [branchCode]);

  useEffect(() => { load(); }, [load]);

  const total_cod = rows.reduce((s, r) => s + r.cod_amount, 0);
  const total_fee = rows.reduce((s, r) => s + r.delivery_fee, 0);
  const total_val = rows.reduce((s, r) => s + r.item_value, 0);
  const locked_count = rows.filter(r => r.finance_locked === 1).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total COD",          value: `${fmt(total_cod)} MMK`, color: "text-[#f6b84b]" },
          { label: "Total Delivery Fees", value: `${fmt(total_fee)} MMK`, color: "text-[#4ea8de]" },
          { label: "Total Item Value",   value: `${fmt(total_val)} MMK`, color: "text-emerald-400" },
          { label: "Finance Locked",     value: `${locked_count} / ${rows.length}`, color: "text-rose-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl">
            <div className={`uppercase text-[11px] tracking-widest mb-1 ${color}`}>{label}</div>
            <div className="text-[18px] text-[#eef8ff] font-mono">{value}</div>
          </div>
        ))}
      </div>
      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#1a3a5c] flex items-center justify-between">
          <span className="text-[#eef8ff] text-[13px] uppercase tracking-widest">Finance Summary by Shipment</span>
          <button onClick={load} className={btn("ghost") + " py-1.5"}><RefreshCw size={13} /></button>
        </div>
        {loading ? <div className="text-center text-[#4d7a9b] py-12 text-[13px]">Loading…</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#1a3a5c]">
                  {["Tracking No","Receiver","COD (MMK)","Fee (MMK)","Value (MMK)","Lock"].map(h => (
                    <th key={h} className={`${["COD (MMK)","Fee (MMK)","Value (MMK)"].includes(h) ? "text-right" : "text-left"} text-[#4d7a9b] text-[11px] uppercase tracking-widest px-4 py-3`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-[#4d7a9b] py-8">No finance records</td></tr>
                ) : rows.map(r => (
                  <tr key={r.id} className="border-b border-[#1a3a5c]/50 hover:bg-[#061524]">
                    <td className="px-4 py-3 font-mono text-[#f6b84b] text-[12px]">{r.tracking_no}</td>
                    <td className="px-4 py-3 text-[#eef8ff]">{r.receiver || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-[#eef8ff]">{fmt(r.cod_amount)}</td>
                    <td className="px-4 py-3 text-right font-mono text-[#eef8ff]">{fmt(r.delivery_fee)}</td>
                    <td className="px-4 py-3 text-right font-mono text-[#eef8ff]">{fmt(r.item_value)}</td>
                    <td className="px-4 py-3">
                      {r.finance_locked === 1
                        ? <span className="flex items-center gap-1 text-rose-400 text-[11px]"><Lock size={11} /> Locked</span>
                        : <span className="text-[#4d7a9b] text-[11px]">Open</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Amendments Tab ──────────────────────────────────────────────────────────

function AmendmentsTab({ branchCode, mode }: { branchCode: string; mode: "hq" | "branch" }) {
  const [rows, setRows] = useState<AmendmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewTarget, setReviewTarget] = useState<AmendmentRequest | null>(null);
  const [reviewForm, setReviewForm] = useState({ action: "approved" as "approved" | "rejected", reviewed_by: "HQ Finance", review_note: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = mode === "hq" ? await getAllPendingAmendments() : await getBranchAmendments(branchCode);
      setRows(data);
    } catch { toast.error("Failed to load amendments"); }
    finally { setLoading(false); }
  }, [branchCode, mode]);

  useEffect(() => { load(); }, [load]);

  async function handleReview() {
    if (!reviewTarget) return;
    try {
      await reviewAmendment(reviewTarget.id, reviewForm.action, reviewForm.reviewed_by, reviewForm.review_note, mode);
      toast.success(`Amendment ${reviewForm.action}`);
      setReviewTarget(null);
      load();
    } catch (e: any) { toast.error(e.message ?? "Review failed"); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-[#4d7a9b] text-[13px]">{mode === "hq" ? "All pending amendment requests" : "Your branch amendment requests"}</span>
        <button onClick={load} className={btn("ghost")}><RefreshCw size={13} /></button>
      </div>
      {mode !== "hq" && (
        <div className="bg-[#061524] border border-[#1a3a5c] rounded-xl p-3 flex items-center gap-2 text-[12px] text-[#4d7a9b]">
          <FileEdit size={14} className="text-[#f6b84b]" />
          To amend a locked finance field, go to Shipments tab → click edit icon on the finance field. Requests reviewed by HQ Finance Manager.
        </div>
      )}
      {loading ? <div className="text-center text-[#4d7a9b] py-12 text-[13px]">Loading…</div>
        : rows.length === 0 ? (
          <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl flex items-center justify-center h-48 text-[#4d7a9b] text-[13px]">No amendment requests</div>
        ) : (
          <div className="space-y-3">
            {rows.map(r => (
              <div key={r.id} className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[#f6b84b] text-[12px]">{r.request_no}</span>
                  <span className={statusBadge(r.status)}>{r.status}</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[12px]">
                  {[["Branch",r.branch_code],["Tracking No",r.tracking_no],["Field",FINANCE_FIELD_LABELS[r.field_name as FinanceFieldName]??r.field_name],["Current",r.current_value],["Requested",r.requested_value]].map(([k,v]) => (
                    <div key={k}><span className="text-[#4d7a9b]">{k}: </span><span className="text-[#eef8ff]">{v}</span></div>
                  ))}
                </div>
                <div className="text-[12px]"><span className="text-[#4d7a9b]">Reason: </span><span className="text-[#eef8ff]">{r.reason}</span></div>
                {r.status === "pending" && mode === "hq" && (
                  <button onClick={() => setReviewTarget(r)} className={btn("gold") + " flex items-center gap-1.5 text-[12px]"}>
                    <Eye size={13} /> Review
                  </button>
                )}
                {r.status !== "pending" && r.review_note && (
                  <div className="text-[12px] text-[#4d7a9b] bg-[#061524] border border-[#1a3a5c] rounded-lg px-3 py-2">
                    Review note: {r.review_note}{r.reviewed_by && <span className="ml-2 text-[#4ea8de]">— {r.reviewed_by}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      {reviewTarget && (
        <Modal title={`Review — ${reviewTarget.request_no}`} onClose={() => setReviewTarget(null)}>
          <div className="space-y-4">
            <div className="bg-[#061524] border border-[#1a3a5c] rounded-xl p-4 space-y-2 text-[13px]">
              {[["Branch",reviewTarget.branch_code],["Tracking",reviewTarget.tracking_no],["Field",FINANCE_FIELD_LABELS[reviewTarget.field_name as FinanceFieldName]??reviewTarget.field_name],["Current Value",reviewTarget.current_value],["Requested Value",reviewTarget.requested_value],["Reason",reviewTarget.reason]].map(([k,v]) => (
                <div key={k} className="flex gap-2"><span className="text-[#4d7a9b] w-36 shrink-0">{k}</span><span className="text-[#eef8ff]">{v}</span></div>
              ))}
            </div>
            <Field label="Decision">
              <select className={inp} value={reviewForm.action} onChange={e => setReviewForm(f => ({ ...f, action: e.target.value as "approved" | "rejected" }))}>
                <option value="approved">Approve</option>
                <option value="rejected">Reject</option>
              </select>
            </Field>
            <Field label="Reviewed By"><input className={inp} value={reviewForm.reviewed_by} onChange={e => setReviewForm(f => ({ ...f, reviewed_by: e.target.value }))} /></Field>
            <Field label="Review Note"><textarea className={`${inp} resize-none`} rows={3} value={reviewForm.review_note} onChange={e => setReviewForm(f => ({ ...f, review_note: e.target.value }))} /></Field>
            <div className="flex gap-3 pt-2">
              <button onClick={handleReview} className={reviewForm.action === "approved" ? btn("emerald") : btn("danger")}>
                {reviewForm.action === "approved" ? "Approve" : "Reject"}
              </button>
              <button onClick={() => setReviewTarget(null)} className={btn("ghost")}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Root Component ───────────────────────────────────────────────────────────

export default function BranchPortalPage() {
  const [branchCode, setBranchCode] = useState<string>(() => sessionStorage.getItem("branch_code") ?? "YGN");
  const [mode, setMode]             = useState<"hq" | "branch">(() => (sessionStorage.getItem("branch_mode") as "hq" | "branch") ?? "branch");
  const [activeTab, setActiveTab]   = useState("overview");
  const [snap, setSnap]             = useState<BranchSnapshot | null>(null);
  const [offices, setOffices]       = useState<BranchOffice[]>([]);
  const [loadingSnap, setLoadingSnap] = useState(true);

  useEffect(() => { sessionStorage.setItem("branch_code", branchCode); }, [branchCode]);
  useEffect(() => { sessionStorage.setItem("branch_mode", mode); }, [mode]);

  useEffect(() => {
    getBranchOffices().then(setOffices).catch(() => {});
  }, []);

  const loadSnap = useCallback(async () => {
    setLoadingSnap(true);
    try { setSnap(await getBranchSnapshot(branchCode)); } catch {}
    finally { setLoadingSnap(false); }
  }, [branchCode]);

  useEffect(() => { loadSnap(); setActiveTab("overview"); }, [branchCode, loadSnap]);

  const currentOffice = offices.find(o => o.branch_code === branchCode) ?? null;

  return (
    <div className="min-h-screen bg-[#0A1628] font-[Poppins,sans-serif]">
      {/* ── Header ── */}
      <header className="border-b border-[#1a3a5c] bg-[#0b2236]/80 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">
          <a href="#/" className="flex items-center gap-1.5 text-[#4d7a9b] hover:text-[#f6b84b] text-[12px] transition-colors mr-2">
            <ArrowLeft size={14} /> Dispatch
          </a>
          <div className="flex items-center gap-2 mr-auto">
            <Building2 size={16} className="text-[#f6b84b]" />
            <div>
              <div className="text-[#f6b84b] text-[11px] font-bold uppercase tracking-[0.2em]">BRITIUM EXPRESS</div>
              <div className="text-[#eef8ff] text-[12px] uppercase tracking-widest">Branch Portal</div>
            </div>
          </div>
          <select
            value={branchCode}
            onChange={e => setBranchCode(e.target.value)}
            className="bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] px-3 py-2 rounded-xl text-[12px] outline-none focus:border-[#f6b84b]"
          >
            {BRANCHES.map(b => <option key={b.code} value={b.code}>{b.label}</option>)}
          </select>
          <div className="flex items-center gap-1 bg-[#061524] border border-[#1a3a5c] rounded-xl p-1">
            <button onClick={() => setMode("branch")} className={`px-3 py-1.5 rounded-lg text-[12px] transition-colors cursor-pointer ${mode === "branch" ? "bg-[#C09B30] text-[#0A1628] font-semibold" : "text-[#4d7a9b] hover:text-[#eef8ff]"}`}>Branch</button>
            <button onClick={() => setMode("hq")} className={`px-3 py-1.5 rounded-lg text-[12px] transition-colors cursor-pointer ${mode === "hq" ? "bg-[#C09B30] text-[#0A1628] font-semibold" : "text-[#4d7a9b] hover:text-[#eef8ff]"}`}>HQ Admin</button>
          </div>
          {mode === "hq" && (
            <span className="flex items-center gap-1 text-[11px] bg-[#C09B30]/20 border border-[#C09B30]/50 text-[#f6b84b] rounded-full px-2.5 py-1">
              <ShieldAlert size={11} /> HQ Administration Mode
            </span>
          )}
          <button onClick={loadSnap} className={btn("ghost") + " py-2"}>
            <RefreshCw size={13} className={loadingSnap ? "animate-spin" : ""} />
          </button>
        </div>
        {mode === "branch" && (
          <div className="bg-[#1a3a5c]/40 border-t border-[#1a3a5c] px-4 sm:px-6 py-2 flex items-center gap-2 text-[11px] text-[#4d7a9b]">
            <Lock size={11} className="text-rose-400 shrink-0" />
            Finance fields are locked after entry. To amend, submit a request from the Shipments tab — subject to HQ Finance approval.
            <span className="ml-auto text-[#4d7a9b] opacity-50">Branch operational authority applies within branch scope.</span>
          </div>
        )}
      </header>

      {/* ── Tab Bar ── */}
      <div className="border-b border-[#1a3a5c] bg-[#0b2236]/60 sticky top-[57px] z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex overflow-x-auto scrollbar-hide">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-3.5 text-[11px] whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
                  active ? "border-[#f6b84b] text-[#f6b84b]" : "border-transparent text-[#4d7a9b] hover:text-[#eef8ff]"
                }`}
              >
                <Icon size={12} />
                {tab.label}
                {tab.id === "amendments" && snap && snap.pending_amendments > 0 && (
                  <span className="bg-rose-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                    {snap.pending_amendments}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {activeTab === "overview"   && <OverviewTab snap={snap} office={currentOffice} />}
        {activeTab === "dataentry"  && <DataEntryTab branchCode={branchCode} mode={mode} />}
        {activeTab === "shipments"  && <ShipmentsTab branchCode={branchCode} mode={mode} />}
        {activeTab === "dispatch"   && <DispatchTab branchCode={branchCode} mode={mode} />}
        {activeTab === "wayplan"    && <WayplanTab branchCode={branchCode} />}
        {activeTab === "waybill"    && <WaybillTab branchCode={branchCode} />}
        {activeTab === "warehouse"  && <WarehouseTab branchCode={branchCode} mode={mode} />}
        {activeTab === "cod"        && <CODSettlementTab branchCode={branchCode} mode={mode} />}
        {activeTab === "merchant"   && <MerchantTab branchCode={branchCode} />}
        {activeTab === "customer"   && <CustomerTab branchCode={branchCode} />}
        {activeTab === "supervisor" && <SupervisorTab branchCode={branchCode} mode={mode} />}
        {activeTab === "tariffs"    && <TariffsTab branchCode={branchCode} mode={mode} />}
        {activeTab === "amendments" && <AmendmentsTab branchCode={branchCode} mode={mode} />}
        {activeTab === "team"       && <TeamTab branchCode={branchCode} mode={mode} />}
        {activeTab === "finance"    && <FinanceTab branchCode={branchCode} mode={mode} />}
      </main>
    </div>
  );
}
