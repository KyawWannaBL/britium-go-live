// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  UserCheck,
  XCircle,
} from "lucide-react";
import { financePortalApi } from "@/lib/financePortalApi";
const rules = {
  "version": "1.0",
  "warehouseExceptionMaster": [
    {
      "exception_code": "WAYBILL_MISMATCH",
      "exception_name_en": "Waybill mismatch",
      "exception_name_mm": "Waybill မကိုက်ညီပါ",
      "process_type": "WAREHOUSE",
      "mapped_status": "WAREHOUSE_HOLD",
      "hold_required": "YES",
      "approval_team": "CS / Data Entry",
      "require_photo": "YES",
      "require_remark": "YES",
      "next_action": "DATA_CORRECTION",
      "customer_message_en": "Shipment is on hold because the waybill needs correction.",
      "customer_message_mm": "Waybill ပြင်ဆင်ရန်လိုအပ်သောကြောင့် Shipment ကို ယာယီရပ်ဆိုင်းထားပါသည်။",
      "Notes / Rules": "Physical waybill and system record do not match. Stop movement until corrected."
    },
    {
      "exception_code": "WEIGHT_MISMATCH",
      "exception_name_en": "Weight mismatch",
      "exception_name_mm": "အလေးချိန် မကိုက်ညီပါ",
      "process_type": "WAREHOUSE",
      "mapped_status": "QC_FAILED",
      "hold_required": "YES",
      "approval_team": "Finance",
      "require_photo": "COND",
      "require_remark": "YES",
      "next_action": "RECALCULATE_TARIFF",
      "customer_message_en": "Shipment is on hold because actual weight differs from declared weight.",
      "customer_message_mm": "တကယ့်အလေးချိန်နှင့် ကြေညာထားသောအလေးချိန် မကိုက်ညီသောကြောင့် Shipment ကို ယာယီရပ်ဆိုင်းထားပါသည်။",
      "Notes / Rules": "Actual weight differs from declared weight. Finance may adjust chargeable weight."
    },
    {
      "exception_code": "DAMAGED_PARCEL",
      "exception_name_en": "Damaged parcel",
      "exception_name_mm": "ပစ္စည်း ပျက်စီးနေသည်",
      "process_type": "WAREHOUSE",
      "mapped_status": "DAMAGED",
      "hold_required": "YES",
      "approval_team": "Warehouse / CS",
      "require_photo": "YES",
      "require_remark": "YES",
      "next_action": "DAMAGE_REVIEW",
      "customer_message_en": "Shipment is on hold because the parcel condition needs review.",
      "customer_message_mm": "ပစ္စည်းအခြေအနေ စစ်ဆေးရန်လိုအပ်သောကြောင့် Shipment ကို ယာယီရပ်ဆိုင်းထားပါသည်။",
      "Notes / Rules": "Torn, wet, crushed, leaking, opened, or broken parcel. Photo mandatory."
    },
    {
      "exception_code": "MISSING_INVOICE",
      "exception_name_en": "Missing invoice",
      "exception_name_mm": "Invoice မပါရှိပါ",
      "process_type": "WAREHOUSE",
      "mapped_status": "DOCUMENT_REQUIRED",
      "hold_required": "YES",
      "approval_team": "CS / Merchant",
      "require_photo": "No",
      "require_remark": "YES",
      "next_action": "REQUEST_DOCUMENT",
      "customer_message_en": "Shipment is on hold because required invoice/document is missing.",
      "customer_message_mm": "လိုအပ်သော Invoice/စာရွက်စာတမ်း မပါရှိသောကြောင့် Shipment ကို ယာယီရပ်ဆိုင်းထားပါသည်။",
      "Notes / Rules": "Commercial invoice, COD invoice, tax invoice, item description, or declared value missing."
    },
    {
      "exception_code": "UNIDENTIFIED_PARCEL",
      "exception_name_en": "Unidentified parcel",
      "exception_name_mm": "မသိရှိနိုင်သော ပစ္စည်း",
      "process_type": "WAREHOUSE",
      "mapped_status": "WAREHOUSE_HOLD",
      "hold_required": "YES",
      "approval_team": "Warehouse",
      "require_photo": "YES",
      "require_remark": "YES",
      "next_action": "MANUAL_INVESTIGATION",
      "customer_message_en": "Shipment is on hold because the parcel cannot be identified.",
      "customer_message_mm": "ပစ္စည်းကို မသိရှိနိုင်သောကြောင့် Shipment ကို ယာယီရပ်ဆိုင်းထားပါသည်။",
      "Notes / Rules": "No label, unreadable barcode, detached waybill, or no system entry."
    },
    {
      "exception_code": "WRONG_DESTINATION",
      "exception_name_en": "Wrong destination",
      "exception_name_mm": "ဦးတည်ရာ မှားယွင်းသည်",
      "process_type": "WAREHOUSE",
      "mapped_status": "MISROUTED",
      "hold_required": "YES",
      "approval_team": "Warehouse / Dispatch",
      "require_photo": "COND",
      "require_remark": "YES",
      "next_action": "REROUTE",
      "customer_message_en": "Shipment is being rerouted because it was sent to the wrong destination.",
      "customer_message_mm": "ဦးတည်ရာမှားယွင်းသွားသောကြောင့် Shipment ကို ပြန်လည်လမ်းကြောင်းသတ်မှတ်နေပါသည်။",
      "Notes / Rules": "Parcel sorted or sent to wrong branch, hub, city, township, or zone."
    },
    {
      "exception_code": "DUPLICATE_SCAN",
      "exception_name_en": "Duplicate scan",
      "exception_name_mm": "Scan ထပ်နေသည်",
      "process_type": "WAREHOUSE",
      "mapped_status": "SCAN_WARNING",
      "hold_required": "No",
      "approval_team": "System",
      "require_photo": "No",
      "require_remark": "No",
      "next_action": "IGNORE_OR_REVIEW",
      "customer_message_en": "Duplicate scan detected. No customer action required.",
      "customer_message_mm": "Scan ထပ်နေမှု တွေ့ရှိပါသည်။ Customer ဘက်မှ လုပ်ဆောင်ရန်မလိုပါ။",
      "Notes / Rules": "Same parcel scanned in same location/status within short time. Usually warning only."
    },
    {
      "exception_code": "RESTRICTED_ITEM",
      "exception_name_en": "Restricted item",
      "exception_name_mm": "တားမြစ်ပစ္စည်း",
      "process_type": "WAREHOUSE",
      "mapped_status": "WAREHOUSE_HOLD",
      "hold_required": "YES",
      "approval_team": "Compliance",
      "require_photo": "YES",
      "require_remark": "YES",
      "next_action": "COMPLIANCE_REVIEW",
      "customer_message_en": "Shipment is on hold because the item requires compliance review.",
      "customer_message_mm": "ပစ္စည်းသည် စည်းမျဉ်းအရ စစ်ဆေးရန်လိုအပ်သောကြောင့် Shipment ကို ယာယီရပ်ဆိုင်းထားပါသည်။",
      "Notes / Rules": "Restricted item found after pickup. Stop movement and escalate."
    },
    {
      "exception_code": "HOLD_BY_FINANCE",
      "exception_name_en": "Hold by finance",
      "exception_name_mm": "Finance မှ Hold ပြုလုပ်ထားသည်",
      "process_type": "WAREHOUSE",
      "mapped_status": "FINANCE_HOLD",
      "hold_required": "YES",
      "approval_team": "Finance",
      "require_photo": "No",
      "require_remark": "YES",
      "next_action": "FINANCE_RELEASE_REQUIRED",
      "customer_message_en": "Shipment is on finance hold. It will continue after finance release.",
      "customer_message_mm": "Finance Hold ဖြစ်နေသောကြောင့် Finance မှ Release ပြုလုပ်ပြီးမှ ဆက်လက်လုပ်ဆောင်ပါမည်။",
      "Notes / Rules": "Billing, COD, settlement, credit limit, tariff, or invoice issue."
    },
    {
      "exception_code": "HOLD_BY_CUSTOMER_SERVICE",
      "exception_name_en": "Hold by customer service",
      "exception_name_mm": "Customer Service မှ Hold ပြုလုပ်ထားသည်",
      "process_type": "WAREHOUSE",
      "mapped_status": "CS_HOLD",
      "hold_required": "YES",
      "approval_team": "Customer Service",
      "require_photo": "No",
      "require_remark": "YES",
      "next_action": "CS_RELEASE_REQUIRED",
      "customer_message_en": "Shipment is on customer service hold pending review.",
      "customer_message_mm": "Customer Service မှ စစ်ဆေးနေသောကြောင့် Shipment ကို ယာယီရပ်ဆိုင်းထားပါသည်။",
      "Notes / Rules": "Customer request, address correction, complaint, cancellation, or return approval pending."
    }
  ],
  "auditValidationFields": [
    {
      "Field / Column": "exception_datetime",
      "Required?": "YES",
      "Validation": "DateTime",
      "English Label": "Exception Datetime",
      "Myanmar Label": "ပြဿနာ ဖြစ်ပွားချိန်",
      "Notes / Rules EN": "Auto-generated from system.",
      "Notes / Rules MM": "စနစ်မှ အလိုအလျောက်ထုတ်ပေးသည်။"
    },
    {
      "Field / Column": "reported_by_user_id",
      "Required?": "YES",
      "Validation": "System-linked",
      "English Label": "Reported By User ID",
      "Myanmar Label": "တင်ပြသူ User ID",
      "Notes / Rules EN": "Rider / Warehouse / CS / Finance.",
      "Notes / Rules MM": "Rider / Warehouse / CS / Finance မှ တင်ပြသူ။"
    },
    {
      "Field / Column": "branch_id",
      "Required?": "YES",
      "Validation": "Dropdown: branch",
      "English Label": "Branch ID",
      "Myanmar Label": "ဌာနခွဲ",
      "Notes / Rules EN": "Current branch or handling branch.",
      "Notes / Rules MM": "လက်ရှိ/ကိုင်တွယ်နေသော ဌာနခွဲ။"
    },
    {
      "Field / Column": "shipment_id",
      "Required?": "YES",
      "Validation": "System-linked",
      "English Label": "Shipment ID",
      "Myanmar Label": "Shipment ID",
      "Notes / Rules EN": "Linked to shipment/waybill.",
      "Notes / Rules MM": "Shipment/Waybill နှင့် ချိတ်ဆက်ထားသည်။"
    },
    {
      "Field / Column": "previous_status",
      "Required?": "YES",
      "Validation": "System-generated",
      "English Label": "Previous Status",
      "Myanmar Label": "ယခင် Status",
      "Notes / Rules EN": "Auto-captured before exception update.",
      "Notes / Rules MM": "Exception Update မတိုင်မီ စနစ်မှ အလိုအလျောက် သိမ်းဆည်းသည်။"
    },
    {
      "Field / Column": "new_status",
      "Required?": "YES",
      "Validation": "Dropdown: status",
      "English Label": "New Status",
      "Myanmar Label": "Status အသစ်",
      "Notes / Rules EN": "Based on selected reason.",
      "Notes / Rules MM": "ရွေးချယ်ထားသော အကြောင်းပြချက်အရ သတ်မှတ်သည်။"
    },
    {
      "Field / Column": "exception_code",
      "Required?": "YES",
      "Validation": "Dropdown: exception_code",
      "English Label": "Exception Code",
      "Myanmar Label": "ပြဿနာ ကုဒ်",
      "Notes / Rules EN": "Must come from active exception master.",
      "Notes / Rules MM": "Active ဖြစ်သော Exception Master မှ ရွေးရမည်။"
    },
    {
      "Field / Column": "remarks",
      "Required?": "YES",
      "Validation": "Text, max 500 chars",
      "English Label": "Remarks",
      "Myanmar Label": "မှတ်ချက်",
      "Notes / Rules EN": "Required for all failures/exceptions.",
      "Notes / Rules MM": "Failure/Exception အားလုံးအတွက် မဖြစ်မနေ ဖြည့်ရန်။"
    },
    {
      "Field / Column": "gps_lat",
      "Required?": "COND",
      "Validation": "Decimal",
      "English Label": "GPS Latitude",
      "Myanmar Label": "GPS Latitude",
      "Notes / Rules EN": "Required for rider pickup/delivery failure.",
      "Notes / Rules MM": "Rider Pickup/Delivery Failure တွင် လိုအပ်သည်။"
    },
    {
      "Field / Column": "gps_lng",
      "Required?": "COND",
      "Validation": "Decimal",
      "English Label": "GPS Longitude",
      "Myanmar Label": "GPS Longitude",
      "Notes / Rules EN": "Required for rider pickup/delivery failure.",
      "Notes / Rules MM": "Rider Pickup/Delivery Failure တွင် လိုအပ်သည်။"
    },
    {
      "Field / Column": "photo_url",
      "Required?": "COND",
      "Validation": "File URL",
      "English Label": "Photo URL",
      "Myanmar Label": "ဓာတ်ပုံ",
      "Notes / Rules EN": "Required when reason requires photo.",
      "Notes / Rules MM": "အကြောင်းပြချက်တွင် ဓာတ်ပုံလိုအပ်ပါက ဖြည့်ရန်။"
    },
    {
      "Field / Column": "call_attempt_count",
      "Required?": "COND",
      "Validation": "Integer",
      "English Label": "Call Attempt Count",
      "Myanmar Label": "ဖုန်းခေါ်ဆိုမှု အကြိမ်ရေ",
      "Notes / Rules EN": "Required for customer unavailable / phone unreachable.",
      "Notes / Rules MM": "Customer မရရှိနိုင်/ဖုန်းဆက်မရသည့် အကြောင်းပြချက်တွင် လိုအပ်သည်။"
    },
    {
      "Field / Column": "next_action",
      "Required?": "YES",
      "Validation": "Dropdown: next_action",
      "English Label": "Next Action",
      "Myanmar Label": "နောက်လုပ်ဆောင်ရန်",
      "Notes / Rules EN": "Reschedule, CS review, Finance review, RTO, etc.",
      "Notes / Rules MM": "ပြန်ချိန်းဆိုခြင်း၊ CS Review၊ Finance Review၊ RTO စသည်။"
    },
    {
      "Field / Column": "next_attempt_date",
      "Required?": "COND",
      "Validation": "DD.MM.YYYY",
      "English Label": "Next Attempt Date",
      "Myanmar Label": "နောက်တစ်ကြိမ် ဆောင်ရွက်မည့်ရက်",
      "Notes / Rules EN": "Required if allow_reschedule = Yes.",
      "Notes / Rules MM": "allow_reschedule = Yes ဖြစ်ပါက လိုအပ်သည်။"
    }
  ]
} as const;

type AnyRow = Record<string, any>;

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' };
const FF = { body:"'Poppins',Inter,system-ui,sans-serif", sub:"'Helvetica Neue',Helvetica,Arial,sans-serif" };

const mm = {
  title: "ဘဏ္ဍာရေး စီမံခန့်ခွဲမှု Portal",
  desc: "Cashier, Accountant, Finance Manager နှင့် Auditor အတွက် COD collection, settlement, finance hold နှင့် audit workflow",
  actor: "User Registry ID",
  actorHelp: "App login တွင် အလိုအလျောက်သတ်မှတ်မည်။ SQL/Test အတွက် registry UUID ထည့်နိုင်သည်။",
  refresh: "ပြန်ဖတ်ရန်",
  synced: "နောက်ဆုံး Sync",
  notRegistered: "Finance user မတွေ့ပါ / permission မရှိပါ",
  role: "အသုံးပြုသူ အဆင့်",
  goLive: "Go-Live စစ်ဆေးချက်",
  cashier: "Cashier",
  accountant: "Accountant",
  manager: "Finance Manager",
  auditor: "Auditor",
  dashboard: "အကျဉ်းချုပ်",
  settlement: "Settlement",
  cash: "ငွေလက်ခံ",
  holds: "Finance Hold",
  audit: "Audit",
  rules: "Rules",
  bulk: "Bulk Upload",
  pendingSettlements: "Pending Settlement",
  submittedApproval: "Approval စောင့်",
  approvedToday: "ယနေ့ Approved",
  cashToday: "ယနေ့ လက်ခံငွေ",
  unsettledCod: "Unsettled COD",
  financeHolds: "Finance Hold",
  rider: "Rider",
  amount: "Amount",
  paymentMethod: "Payment Method",
  referenceNo: "Reference No",
  notes: "မှတ်ချက်",
  recordReceipt: "Cash Receipt မှတ်တမ်းတင်ရန်",
  createBatch: "Settlement Batch ဖန်တီးရန်",
  submit: "တင်သွင်းရန်",
  approve: "Approve",
  reject: "Reject",
  release: "Finance Hold Release",
  deliveryWay: "Delivery WayID / Waybill",
  downloadTemplate: "Template Download",
  uploadCsv: "CSV Upload",
  export: "Export CSV",
  search: "ရှာရန်",
  noData: "Data မရှိသေးပါ",
  validation: "Validation",
};

const roleNames: Record<string, string> = {
  superadmin: "Super Admin",
  finance_manager: "Finance Manager",
  accountant: "Accountant",
  cashier: "Cashier",
  auditor: "Auditor",
  unknown: "Unknown",
};

const functionMm: Record<string, string> = {
  dashboard: "Dashboard",
  cash_receipt: "Cash Receipt",
  settlement: "Settlement",
  settlement_approve: "Settlement Approval",
  finance_hold: "Finance Hold",
  finance_hold_release: "Finance Hold Release",
  audit: "Audit",
  bulk_upload: "Bulk Upload",
  export: "Export",
};

function sx(style: React.CSSProperties) { return style; }
function safe(value: any, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}
function money(value: any) {
  const n = Number(value || 0);
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function dt(value: any) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function can(perms: AnyRow[], key: string, action: "view" | "create" | "update" | "approve" | "export") {
  const p = perms?.find((x) => x.function_key === key);
  if (!p) return false;
  const col = `can_${action}`;
  return Boolean(p[col]);
}
function uuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || "");
}

export default function FinancePortalPage() {
  const [actorRegistryId, setActorRegistryId] = useState(localStorage.getItem("britium.finance.actor") || "");
  const [snapshot, setSnapshot] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const actor = actorRegistryId.trim() || null;
      if (actor) localStorage.setItem("britium.finance.actor", actor);
      const data = await financePortalApi.snapshot(actor, null);
      setSnapshot(data);
      if (!data?.ok) setError(data?.message || mm.notRegistered);
    } catch (e: any) {
      setError(e?.message || "Finance snapshot မဖတ်နိုင်ပါ။");
    } finally {
      setLoading(false);
    }
  }, [actorRegistryId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const perms = snapshot?.permissions || [];
  const actor = snapshot?.actor || {};
  const roleCode = actor?.role_code || "unknown";
  const kpis = snapshot?.kpis || {};

  const tabs = [
    { key: "dashboard", label: mm.dashboard, icon: ClipboardCheck, allowed: can(perms, "dashboard", "view") },
    { key: "cash", label: mm.cash, icon: Banknote, allowed: can(perms, "cash_receipt", "view") },
    { key: "settlement", label: mm.settlement, icon: BadgeCheck, allowed: can(perms, "settlement", "view") },
    { key: "holds", label: mm.holds, icon: AlertTriangle, allowed: can(perms, "finance_hold", "view") },
    { key: "audit", label: mm.audit, icon: ShieldCheck, allowed: can(perms, "audit", "view") },
    { key: "bulk", label: mm.bulk, icon: Upload, allowed: can(perms, "bulk_upload", "view") },
    { key: "rules", label: mm.rules, icon: Lock, allowed: true },
  ];

  return (
    <main style={root()}>
      <div style={shell()}>
        <section style={heroPanel()}>
          <div style={heroGrid()}>
            <div>
              <div style={eyebrow()}>BRITIUM FINANCE</div>
              <h1 style={h1()}>{mm.title}</h1>
              <p style={heroCopy()}>{mm.desc}</p>
            </div>
            <div style={heroControls()}>
              <label style={fieldLabel()}>{mm.actor}</label>
              <div style={sx({ display: "grid", gridTemplateColumns: "1fr auto", gap: 12 })} className="max-[640px]:grid-cols-1">
                <input value={actorRegistryId} onChange={(e) => setActorRegistryId(e.target.value)} placeholder="optional actor registry UUID" style={input()} />
                <button onClick={() => void load()} disabled={loading} style={primaryBtn()}>
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  {mm.refresh}
                </button>
              </div>
              <div style={helperText()}>{mm.actorHelp}</div>
            </div>
          </div>
        </section>

        {error ? <Banner tone="error" message={error} onClose={() => setError("")} /> : null}
        {success ? <Banner tone="success" message={success} onClose={() => setSuccess("")} /> : null}

        <section style={workspaceGrid()} className="max-[1180px]:grid-cols-1">
          <aside style={sidebarPanel()}>
            <RoleCard actor={actor} permissions={perms} loading={loading} />
            <div style={sx({ marginTop: 18, display: "grid", gap: 10 })}>
              {tabs.map((t) => {
                const Icon = t.icon;
                const active = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    disabled={!t.allowed}
                    onClick={() => setActiveTab(t.key)}
                    style={tabBtn(active, t.allowed)}
                  >
                    <span style={sx({ display: "flex", alignItems: "center", gap: 10 })}><Icon size={17} />{t.label}</span>
                    {!t.allowed ? <Lock size={15} /> : null}
                  </button>
                );
              })}
            </div>
          </aside>

          <div style={contentStack()}>
            <GoLivePanel snapshot={snapshot} roleCode={roleCode} loading={loading} />
            <KpiGrid kpis={kpis} />

            {activeTab === "dashboard" ? (
              <Dashboard snapshot={snapshot} query={query} setQuery={setQuery} />
            ) : null}

            {activeTab === "cash" ? (
              <CashierPanel
                snapshot={snapshot}
                actorRegistryId={actorRegistryId}
                canCreate={can(perms, "cash_receipt", "create")}
                onSuccess={(m) => { setSuccess(m); void load(); }}
                onError={setError}
              />
            ) : null}

            {activeTab === "settlement" ? (
              <SettlementPanel
                snapshot={snapshot}
                actorRegistryId={actorRegistryId}
                canCreate={can(perms, "settlement", "create")}
                canUpdate={can(perms, "settlement", "update")}
                canApprove={can(perms, "settlement_approve", "approve")}
                onSuccess={(m) => { setSuccess(m); void load(); }}
                onError={setError}
              />
            ) : null}

            {activeTab === "holds" ? (
              <FinanceHoldPanel
                snapshot={snapshot}
                actorRegistryId={actorRegistryId}
                canRelease={can(perms, "finance_hold_release", "approve")}
                onSuccess={(m) => { setSuccess(m); void load(); }}
                onError={setError}
              />
            ) : null}

            {activeTab === "audit" ? <AuditPanel snapshot={snapshot} canExport={can(perms, "audit", "export") || can(perms, "export", "export")} /> : null}

            {activeTab === "bulk" ? (
              <BulkUploadPanel
                actorRegistryId={actorRegistryId}
                canCreate={can(perms, "bulk_upload", "create")}
                onSuccess={(m) => { setSuccess(m); void load(); }}
                onError={setError}
              />
            ) : null}

            {activeTab === "rules" ? <RulesPanel snapshot={snapshot} /> : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function RoleCard({ actor, permissions, loading }: any) {
  const roleCode = actor?.role_code || "unknown";
  const active = actor?.is_active;
  return (
    <div style={subPanel()}>
      <div style={sx({ display: "flex", alignItems: "center", gap: 12 })}>
        <div style={iconChip(active ? C.success : C.error)}>
          <UserCheck size={18} color={active ? C.success : C.error} />
        </div>
        <div>
          <div style={metaLabel()}>{mm.role}</div>
          <div style={sx({ fontFamily: FF.sub, fontWeight: 600, fontSize: 18, color: C.text })}>{loading ? "Loading..." : roleNames[roleCode] || roleCode}</div>
        </div>
      </div>
      <div style={sx({ marginTop: 14, color: C.text2, lineHeight: 1.7, fontSize: 14 })}>
        <div>{safe(actor?.display_name || actor?.email, "No user context")}</div>
        <div>{safe(actor?.actor_registry_id, "-")}</div>
      </div>
      <div style={sx({ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 })}>
        <MiniCheck label="View" ok={permissions?.some((p: any) => p.can_view)} />
        <MiniCheck label="Create" ok={permissions?.some((p: any) => p.can_create)} />
        <MiniCheck label="Approve" ok={permissions?.some((p: any) => p.can_approve)} />
        <MiniCheck label="Export" ok={permissions?.some((p: any) => p.can_export)} />
      </div>
      <div style={sx({ marginTop: 16, display: "grid", gap: 8 })}>
        {(permissions || []).slice(0, 6).map((p: any, idx: number) => (
          <div key={`${p.function_key}-${idx}`} style={inlineStat()}>
            <span style={sx({ color: C.text2 })}>{functionMm[p.function_key] || p.function_key}</span>
            <span style={tagBadge(p.can_view || p.can_create || p.can_approve || p.can_export ? C.info : C.muted)}>
              {p.can_approve ? "APPROVE" : p.can_create ? "CREATE" : p.can_view ? "VIEW" : "LOCKED"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniCheck({ label, ok }: any) {
  return <div style={miniCheck(ok)}>{ok ? "✓" : "–"} {label}</div>;
}

function GoLivePanel({ snapshot, roleCode, loading }: any) {
  const okActor = snapshot?.ok;
  const hasRules = Number(snapshot?.rules?.warehouse_finance_rules?.length || 0) > 0;
  const checks = [
    { label: "Finance role resolved", ok: okActor && roleCode !== "unknown" },
    { label: "Permission matrix loaded", ok: (snapshot?.permissions || []).length > 0 },
    { label: "Finance logistics rules linked", ok: hasRules },
    { label: "Settlement tables reachable", ok: Array.isArray(snapshot?.settlement_batches) },
    { label: "Audit history reachable", ok: Array.isArray(snapshot?.audit_events) },
  ];
  return (
    <section style={panel()}>
      <div style={sectionTop()}>
        <div style={sx({ display: "flex", alignItems: "center", gap: 12 })}>
          <div style={iconChip(C.success)}><ShieldCheck size={18} color={C.success} /></div>
          <div>
            <h2 style={h2()}>{mm.goLive}</h2>
            <div style={helperText()}>{mm.synced}: {dt(snapshot?.synced_at)}</div>
          </div>
        </div>
        <span style={pill(checks.every((c) => c.ok) ? C.success : C.warning)}>
          {checks.every((c) => c.ok) ? "READY" : "CHECK"}
        </span>
      </div>
      <div style={sx({ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 12 })} className="max-[1260px]:grid-cols-2 max-[720px]:grid-cols-1">
        {checks.map((c) => (
          <div key={c.label} style={glassCard(c.ok ? C.success : C.warning)}>
            <div style={sx({ color: c.ok ? C.success : C.warning, display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontFamily: FF.body, fontSize: 13 })}>
              {c.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              {c.ok ? "PASS" : "WARN"}
            </div>
            <div style={sx({ color: C.text2, marginTop: 8, fontSize: 14, lineHeight: 1.6 })}>{c.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function KpiGrid({ kpis }: any) {
  const cards = [
    [mm.pendingSettlements, kpis?.pending_settlements, C.info],
    [mm.submittedApproval, kpis?.submitted_for_approval, C.gold],
    [mm.approvedToday, kpis?.approved_today, C.success],
    [mm.cashToday, money(kpis?.cash_received_today), C.orange],
    [mm.unsettledCod, money(kpis?.unsettled_cod), C.error],
    [mm.financeHolds, kpis?.finance_holds_open, C.warning],
  ];
  return (
    <section style={sx({ display: "grid", gridTemplateColumns: "repeat(6, minmax(0,1fr))", gap: 12 })} className="max-[1450px]:grid-cols-3 max-[820px]:grid-cols-2">
      {cards.map(([label, value, tone]: any) => (
        <div key={label} style={kpiCard(tone)}>
          <div style={kpiLabel()}>{label}</div>
          <div style={kpiValue(tone)}>{safe(value, "0")}</div>
        </div>
      ))}
    </section>
  );
}

function Dashboard({ snapshot, query, setQuery }: any) {
  const batches = filterRows(snapshot?.settlement_batches || [], query, ["batch_no", "rider_code", "status"]);
  const holds = filterRows(snapshot?.finance_holds || [], query, ["delivery_way_id", "event_type", "next_action"]);
  return (
    <section style={sx({ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 18 })} className="max-[1200px]:grid-cols-1">
      <div style={panel()}>
        <SectionHeader title="Recent Settlement Batches" onExport={() => financePortalApi.exportCsv("finance-settlement-batches.csv", batches)} />
        <SearchBox value={query} onChange={setQuery} />
        <SettlementTable rows={batches.slice(0, 10)} />
      </div>
      <div style={panel()}>
        <SectionHeader title="Finance Hold Queue" onExport={() => financePortalApi.exportCsv("finance-holds.csv", holds)} />
        <FinanceHoldList rows={holds.slice(0, 10)} compact />
      </div>
    </section>
  );
}

function CashierPanel({ snapshot, actorRegistryId, canCreate, onSuccess, onError }: any) {
  const [riderId, setRiderId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [ref, setRef] = useState("");
  const [batchId, setBatchId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const batches = snapshot?.settlement_batches || [];
  const collections = snapshot?.unsettled_collections || [];
  const riderOptions = uniqueBy([
    ...collections.map((c: any) => ({ id: c.rider_id, code: c.rider_code })),
    ...batches.map((b: any) => ({ id: b.rider_id, code: b.rider_code })),
  ].filter((x) => x.id), "id");

  const validation = [
    { label: "Cashier create permission", ok: canCreate },
    { label: "Rider selected", ok: uuidLike(riderId) },
    { label: "Amount > 0", ok: Number(amount) > 0 },
    { label: "Reference for non-cash", ok: method === "cash" || ref.trim().length > 0 },
    { label: "Notes <= 500 chars", ok: notes.length <= 500 },
  ];
  const ready = validation.every((v) => v.ok);

  async function submit() {
    if (!ready) return;
    setBusy(true);
    try {
      const res = await financePortalApi.recordCashReceipt({
        riderId,
        amount: Number(amount),
        paymentMethod: method,
        referenceNo: ref || null,
        settlementBatchId: batchId || null,
        actorRegistryId: actorRegistryId || null,
        notes: notes || null,
      });
      setAmount(""); setRef(""); setNotes("");
      onSuccess(`Receipt recorded: ${res.receipt_no}`);
    } catch (e: any) {
      onError(e?.message || "Cash receipt failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={panel()}>
      <SectionHeader title="Cashier: COD Cash Receipt" />
      <div style={twoColForm()} className="max-[1000px]:grid-cols-1">
        <div style={subPanel()}>
          <Field label={mm.rider}>
            <select value={riderId} onChange={(e) => setRiderId(e.target.value)} style={input()}>
              <option value="">Select Rider</option>
              {riderOptions.map((r: any) => <option key={r.id} value={r.id}>{safe(r.code)} · {r.id}</option>)}
            </select>
          </Field>
          <Field label="Settlement Batch Optional">
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)} style={input()}>
              <option value="">No batch / later match</option>
              {batches.filter((b: any) => !["approved","cancelled"].includes(String(b.status).toLowerCase())).map((b: any) => (
                <option key={b.id} value={b.id}>{b.batch_no} · {b.rider_code} · {b.status}</option>
              ))}
            </select>
          </Field>
          <Field label={mm.amount}>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" style={input()} />
          </Field>
          <Field label={mm.paymentMethod}>
            <select value={method} onChange={(e) => setMethod(e.target.value)} style={input()}>
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="cheque">Cheque</option>
            </select>
          </Field>
          <Field label={mm.referenceNo}>
            <input value={ref} onChange={(e) => setRef(e.target.value)} style={input()} placeholder="Required for non-cash" />
          </Field>
          <Field label={mm.notes}>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={textarea()} maxLength={500} />
          </Field>
          <button onClick={submit} disabled={!ready || busy} style={primaryBtn({ width: "100%", opacity: ready ? 1 : .55 })}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Banknote size={16} />}
            {mm.recordReceipt}
          </button>
        </div>
        <ValidationPanel title={mm.validation} checks={validation} />
      </div>
      <div style={sx({ marginTop: 18 })}>
        <SectionHeader title="Recent Receipts" onExport={() => financePortalApi.exportCsv("finance-cash-receipts.csv", snapshot?.cash_receipts || [])} />
        <ReceiptTable rows={snapshot?.cash_receipts || []} />
      </div>
    </section>
  );
}

function SettlementPanel({ snapshot, actorRegistryId, canCreate, canUpdate, canApprove, onSuccess, onError }: any) {
  const [riderId, setRiderId] = useState("");
  const [batchDate, setBatchDate] = useState(new Date().toISOString().slice(0,10));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const collections = snapshot?.unsettled_collections || [];
  const batches = snapshot?.settlement_batches || [];
  const riders = uniqueBy(collections.map((c: any) => ({ id: c.rider_id, code: c.rider_code })).filter((x) => x.id), "id");

  async function createBatch() {
    setBusy("create");
    try {
      const res = await financePortalApi.createSettlementBatch({ riderId, batchDate, actorRegistryId, notes: note });
      setRiderId(""); setNote("");
      onSuccess(`Settlement created: ${res.batch_no}`);
    } catch (e: any) { onError(e?.message || "Create settlement failed"); }
    finally { setBusy(""); }
  }

  async function submitBatch(id: string) {
    setBusy(id + ":submit");
    try { await financePortalApi.submitSettlement(id, actorRegistryId, note); onSuccess("Settlement submitted"); }
    catch (e: any) { onError(e?.message || "Submit failed"); }
    finally { setBusy(""); }
  }

  async function approveBatch(id: string) {
    setBusy(id + ":approve");
    try { await financePortalApi.approveSettlement(id, actorRegistryId, note); onSuccess("Settlement approved"); }
    catch (e: any) { onError(e?.message || "Approval failed"); }
    finally { setBusy(""); }
  }

  async function rejectBatch(id: string) {
    const reason = note.trim() || window.prompt("Rejection reason") || "";
    if (!reason.trim()) return;
    setBusy(id + ":reject");
    try { await financePortalApi.rejectSettlement(id, actorRegistryId, reason); onSuccess("Settlement rejected"); }
    catch (e: any) { onError(e?.message || "Reject failed"); }
    finally { setBusy(""); }
  }

  const readyCreate = canCreate && uuidLike(riderId) && note.length <= 500;

  return (
    <section style={panel()}>
      <SectionHeader title="Accountant / Manager: Rider Settlement" onExport={() => financePortalApi.exportCsv("finance-settlements.csv", batches)} />
      <div style={twoColForm()} className="max-[1000px]:grid-cols-1">
        <div style={subPanel()}>
          <Field label={mm.rider}>
            <select value={riderId} onChange={(e) => setRiderId(e.target.value)} style={input()}>
              <option value="">Select rider with unsettled COD</option>
              {riders.map((r: any) => <option key={r.id} value={r.id}>{r.code} · {r.id}</option>)}
            </select>
          </Field>
          <Field label="Batch Date">
            <input type="date" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} style={input()} />
          </Field>
          <Field label={mm.notes}>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} style={textarea()} maxLength={500} />
          </Field>
          <button onClick={createBatch} disabled={!readyCreate || busy === "create"} style={primaryBtn({ width: "100%", opacity: readyCreate ? 1 : .55 })}>
            {busy === "create" ? <Loader2 size={16} className="animate-spin" /> : <BadgeCheck size={16} />}
            {mm.createBatch}
          </button>
        </div>
        <ValidationPanel title="Settlement Controls" checks={[
          { label: "Create permission", ok: canCreate },
          { label: "Submit permission", ok: canUpdate },
          { label: "Approve permission", ok: canApprove },
          { label: "Rider has unsettled COD", ok: riders.length > 0 },
          { label: "Note <= 500 chars", ok: note.length <= 500 },
        ]} />
      </div>

      <div style={sx({ marginTop: 18 })}>
        <SettlementTable rows={batches} busy={busy} canUpdate={canUpdate} canApprove={canApprove} onSubmit={submitBatch} onApprove={approveBatch} onReject={rejectBatch} />
      </div>
    </section>
  );
}

function FinanceHoldPanel({ snapshot, actorRegistryId, canRelease, onSuccess, onError }: any) {
  const [deliveryWayId, setDeliveryWayId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const holds = snapshot?.finance_holds || [];

  async function release(id?: string) {
    const way = id || deliveryWayId;
    if (!way.trim()) return;
    setBusy(true);
    try {
      const res = await financePortalApi.releaseFinanceHold(way, actorRegistryId, note);
      setDeliveryWayId(""); setNote("");
      onSuccess(`Finance hold released: ${res.delivery_way_id}`);
    } catch (e: any) { onError(e?.message || "Release failed"); }
    finally { setBusy(false); }
  }

  return (
    <section style={panel()}>
      <SectionHeader title="Finance Manager: Hold Release / Finance Review" onExport={() => financePortalApi.exportCsv("finance-holds.csv", holds)} />
      <div style={twoColForm()} className="max-[1000px]:grid-cols-1">
        <div style={subPanel()}>
          <Field label={mm.deliveryWay}>
            <input value={deliveryWayId} onChange={(e) => setDeliveryWayId(e.target.value)} style={input()} placeholder="D0609-AKK-010 / W0609-AKK-010" />
          </Field>
          <Field label="Resolution Note">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} style={textarea()} maxLength={500} />
          </Field>
          <button onClick={() => release()} disabled={!canRelease || !deliveryWayId.trim() || busy} style={primaryBtn({ width: "100%", opacity: canRelease ? 1 : .55 })}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {mm.release}
          </button>
        </div>
        <ValidationPanel title="Finance Hold Controls" checks={[
          { label: "Finance Manager approval permission", ok: canRelease },
          { label: "Delivery WayID / Waybill required", ok: deliveryWayId.trim().length > 0 || holds.length > 0 },
          { label: "Open finance hold queue synchronized", ok: Array.isArray(holds) },
          { label: "Resolution note <= 500 chars", ok: note.length <= 500 },
        ]} />
      </div>
      <div style={sx({ marginTop: 18 })}>
        <FinanceHoldList rows={holds} canRelease={canRelease} onRelease={release} />
      </div>
    </section>
  );
}

function BulkUploadPanel({ actorRegistryId, canCreate, onSuccess, onError }: any) {
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");

  async function handleFile(file?: File) {
    if (!file) return;
    setPreviewError("");
    const text = await file.text();
    try {
      const parsed = financePortalApi.parseCsv(text);
      setRows(parsed);
      if (!parsed.length) setPreviewError("No rows found");
    } catch (e: any) {
      setPreviewError(e?.message || "CSV parse failed");
    }
  }

  const validation = [
    { label: "Bulk upload permission", ok: canCreate },
    { label: "CSV rows loaded", ok: rows.length > 0 },
    { label: "Every row has amount", ok: rows.length > 0 && rows.every((r) => Number(r.amount) > 0) },
    { label: "Every row has rider_code or rider_id", ok: rows.length > 0 && rows.every((r) => r.rider_code || r.rider_id) },
  ];
  const ready = validation.every((v) => v.ok);

  async function upload() {
    setBusy(true);
    try {
      const res = await financePortalApi.bulkUploadReceipts(rows, actorRegistryId);
      onSuccess(`Bulk upload completed: ${res.success_count} success, ${res.error_count} errors`);
      setRows([]);
    } catch (e: any) { onError(e?.message || "Bulk upload failed"); }
    finally { setBusy(false); }
  }

  return (
    <section style={panel()}>
      <SectionHeader title="Finance Cash Receipt Bulk Upload" />
      <div style={twoColForm()} className="max-[1000px]:grid-cols-1">
        <div style={subPanel()}>
          <button onClick={() => financePortalApi.downloadReceiptTemplate()} style={secondaryBtn({ width: "100%", marginBottom: 10 })}>
            <Download size={16} /> {mm.downloadTemplate}
          </button>
          <label style={secondaryBtn({ width: "100%", cursor: "pointer" })}>
            <Upload size={16} /> {mm.uploadCsv}
            <input hidden type="file" accept=".csv,text/csv" onChange={(e) => void handleFile(e.target.files?.[0])} />
          </label>
          {previewError ? <div style={sx({ color: C.error, marginTop: 10, fontSize: 14 })}>{previewError}</div> : null}
          <button onClick={upload} disabled={!ready || busy} style={primaryBtn({ width: "100%", marginTop: 12, opacity: ready ? 1 : .55 })}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
            Upload {rows.length} rows
          </button>
        </div>
        <ValidationPanel title="Bulk Upload Validation" checks={validation} />
      </div>
      <div style={sx({ marginTop: 18 })}>
        <DataTable rows={rows.slice(0, 20)} empty="Upload CSV to preview rows" />
      </div>
    </section>
  );
}

function AuditPanel({ snapshot, canExport }: any) {
  const rows = snapshot?.audit_events || [];
  return (
    <section style={panel()}>
      <SectionHeader title="Auditor: Finance Audit History" onExport={canExport ? () => financePortalApi.exportCsv("finance-audit-events.csv", rows) : undefined} />
      <DataTable rows={rows} />
    </section>
  );
}

function RulesPanel({ snapshot }: any) {
  const financeRules = snapshot?.rules?.warehouse_finance_rules || [];
  const warehouseRules = (rules as any)?.warehouseExceptionMaster || [];
  const auditFields = (rules as any)?.auditValidationFields || [];
  return (
    <section style={sx({ display: "grid", gap: 18 })}>
      <div style={panel()}>
        <SectionHeader title="Finance-linked Logistics Rules from Database" />
        <DataTable rows={financeRules} />
      </div>
      <div style={panel()}>
        <SectionHeader title="Warehouse Exception Rules from JSON Config" />
        <DataTable rows={warehouseRules} />
      </div>
      <div style={panel()}>
        <SectionHeader title="Audit Validation Fields from JSON Config" />
        <DataTable rows={auditFields} />
      </div>
    </section>
  );
}

function SettlementTable({ rows, busy, canUpdate, canApprove, onSubmit, onApprove, onReject }: any) {
  if (!rows?.length) return <Empty />;
  return (
    <div style={tableWrap()}>
      <table style={table()}>
        <thead><tr>
          {["Batch", "Rider", "Status", "Expected", "Collected", "Received", "Discrepancy", "Updated", "Actions"].map((h) => <th key={h} style={th()}>{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((b: any) => {
            const status = String(b.status || "").toLowerCase();
            const discrepancy = Number(b.discrepancy_amount || 0);
            return <tr key={b.id}>
              <td style={td()}><span style={mono()}>{b.batch_no}</span></td>
              <td style={td()}>{safe(b.rider_code)}<br/><span style={subText()}>{short(b.rider_id)}</span></td>
              <td style={td()}><span style={statusBadge(status)}>{status}</span></td>
              <td style={td()}>{money(b.total_expected_cod)}</td>
              <td style={td()}>{money(b.total_collected_cod)}</td>
              <td style={td()}>{money(b.total_received_cash)}</td>
              <td style={td()}><span style={{ color: discrepancy === 0 ? C.success : C.error, fontWeight: 700 }}>{money(discrepancy)}</span></td>
              <td style={td()}>{dt(b.updated_at || b.created_at)}</td>
              <td style={td()}>
                <div style={sx({ display: "flex", gap: 6, flexWrap: "wrap" })}>
                  {canUpdate && ["draft","rejected"].includes(status) ? <button onClick={() => onSubmit?.(b.id)} style={tinyBtn()} disabled={busy}>{mm.submit}</button> : null}
                  {canApprove && ["submitted","reconciled"].includes(status) ? <button onClick={() => onApprove?.(b.id)} style={tinyBtn(C.success)} disabled={busy || discrepancy !== 0}>{mm.approve}</button> : null}
                  {canApprove && !["approved","cancelled"].includes(status) ? <button onClick={() => onReject?.(b.id)} style={tinyBtn(C.error)} disabled={busy}>{mm.reject}</button> : null}
                </div>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReceiptTable({ rows }: any) {
  if (!rows?.length) return <Empty />;
  return (
    <div style={tableWrap()}>
      <table style={table()}>
        <thead><tr>{["Receipt", "Rider", "Amount", "Method", "Reference", "Batch", "Received"].map((h) => <th key={h} style={th()}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r: any) => (
          <tr key={r.id}>
            <td style={td()}><span style={mono()}>{r.receipt_no}</span></td>
            <td style={td()}>{safe(r.rider_code)}<br/><span style={subText()}>{short(r.rider_id)}</span></td>
            <td style={td()}>{money(r.amount)}</td>
            <td style={td()}>{safe(r.payment_method)}</td>
            <td style={td()}>{safe(r.reference_no)}</td>
            <td style={td()}>{short(r.settlement_batch_id)}</td>
            <td style={td()}>{dt(r.received_at)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function FinanceHoldList({ rows, compact = false, canRelease = false, onRelease }: any) {
  if (!rows?.length) return <Empty />;
  return <div style={sx({ display: "grid", gap: 10 })}>
    {rows.map((h: any) => (
      <div key={h.exception_id} style={subPanel({ padding: compact ? 12 : 16, borderColor: `${C.error}66` })}>
        <div style={sx({ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" })}>
          <div>
            <div style={mono(C.orange)}>{safe(h.delivery_way_id || h.waybill_id)}</div>
            <div style={sx({ marginTop: 6, color: C.error, fontWeight: 700, fontSize: 14 })}>{safe(h.event_type)} · {safe(h.next_action)}</div>
            <div style={sx({ marginTop: 6, color: C.text2, lineHeight: 1.6, fontSize: 14 })}>{safe(h.description)}</div>
            <div style={subText()}>{dt(h.created_at)}</div>
          </div>
          {canRelease ? <button onClick={() => onRelease?.(h.delivery_way_id || h.waybill_id)} style={tinyBtn(C.success)}>{mm.release}</button> : null}
        </div>
      </div>
    ))}
  </div>;
}

function DataTable({ rows, empty = mm.noData }: any) {
  if (!rows?.length) return <Empty title={empty} />;
  const keys = Object.keys(rows[0] || {}).slice(0, 12);
  return (
    <div style={tableWrap()}>
      <table style={table()}>
        <thead><tr>{keys.map((k) => <th key={k} style={th()}>{k}</th>)}</tr></thead>
        <tbody>{rows.map((r: any, idx: number) => (
          <tr key={r.id || idx}>{keys.map((k) => <td key={k} style={td()}>{typeof r[k] === "object" ? JSON.stringify(r[k]) : safe(r[k])}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function ValidationPanel({ title, checks }: any) {
  return <div style={subPanel()}>
    <h3 style={h2()}>{title}</h3>
    <div style={sx({ display: "grid", gap: 10, marginTop: 14 })}>
      {checks.map((c: any) => (
        <div key={c.label} style={validationRow(c.ok)}>
          <span style={sx({ color: C.text2, fontWeight: 500, fontSize: 14 })}>{c.label}</span>
          {c.ok ? <CheckCircle2 color={C.success} size={18} /> : <XCircle color={C.error} size={18} />}
        </div>
      ))}
    </div>
  </div>;
}

function SectionHeader({ title, onExport }: any) {
  return <div style={sectionTop({ marginBottom: 14 })}>
    <h2 style={h2()}>{title}</h2>
    {onExport ? <button onClick={onExport} style={secondaryBtn()}><Download size={16}/>{mm.export}</button> : null}
  </div>;
}

function SearchBox({ value, onChange }: any) {
  return <div style={sx({ position: "relative", marginBottom: 14 })}>
    <Search size={17} style={sx({ position: "absolute", left: 14, top: 14, color: C.muted })} />
    <input value={value} onChange={(e) => onChange(e.target.value)} style={input({ paddingLeft: 42 })} placeholder={mm.search} />
  </div>;
}

function Field({ label, children }: any) {
  return <label style={sx({ display: "grid", gap: 6, marginBottom: 12 })}>
    <span style={fieldLabel()}>{label}</span>
    {children}
  </label>;
}

function Banner({ tone, message, onClose }: any) {
  const color = tone === "success" ? C.success : C.error;
  return <div style={sx({ border: `1px solid ${color}55`, background: `${color}14`, color, borderRadius: 18, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, fontFamily: FF.body })}>
    <div style={sx({ fontWeight: 600, fontSize: 14 })}>{message}</div>
    <button onClick={onClose} style={ghostBtn(color)}>Close</button>
  </div>;
}

function Empty({ title = mm.noData }: any) {
  return <div style={sx({ border: `1px dashed ${C.border}`, borderRadius: 18, padding: 30, textAlign: "center", color: C.text2, background: "rgba(8,27,46,.45)", fontSize: 14 })}>{title}</div>;
}

function filterRows(rows: any[], q: string, fields: string[]) {
  if (!q.trim()) return rows;
  const needle = q.toLowerCase();
  return rows.filter((r) => fields.some((f) => String(r?.[f] || "").toLowerCase().includes(needle)));
}
function uniqueBy(rows: any[], key: string) {
  const m = new Map();
  rows.forEach((r) => { if (r?.[key] && !m.has(r[key])) m.set(r[key], r); });
  return Array.from(m.values());
}
function short(v: any) {
  const s = safe(v, "");
  return s.length > 16 ? `${s.slice(0,8)}…${s.slice(-6)}` : s || "-";
}

function root() { return sx({ background: C.bg, padding: 24, minHeight: "100%", fontFamily: FF.body, color: C.text }); }
function shell() { return sx({ maxWidth: 1780, margin: "0 auto", display: "grid", gap: 18 }); }
function workspaceGrid() { return sx({ display: "grid", gridTemplateColumns: "320px minmax(0,1fr)", gap: 18, alignItems: "start" }); }
function contentStack() { return sx({ display: "grid", gap: 18, minWidth: 0 }); }
function heroPanel() { return sx({ border: `1px solid ${C.border}`, background: `linear-gradient(180deg, rgba(11,34,54,.98), rgba(8,27,46,.98))`, borderRadius: 26, padding: 24, boxShadow: "0 22px 60px rgba(0,0,0,.28)" }); }
function heroGrid() { return sx({ display: "grid", gridTemplateColumns: "minmax(420px, 1fr) minmax(520px, .9fr)", gap: 18, alignItems: "center" }); }
function heroControls() { return sx({ display: "grid", gap: 10, padding: 18, borderRadius: 20, background: "rgba(8,27,46,.72)", border: `1px solid ${C.border}` }); }
function sidebarPanel() { return sx({ ...panel(), padding: 16, position: "sticky", top: 16 }); }
function panel(extra: React.CSSProperties = {}) { return sx({ border: `1px solid ${C.border}`, background: `linear-gradient(180deg, ${C.panel}, ${C.panel2})`, borderRadius: 24, boxShadow: "0 18px 50px rgba(0,0,0,.24)", padding: 18, ...extra }); }
function subPanel(extra: React.CSSProperties = {}) { return sx({ border: `1px solid ${C.border}`, background: "rgba(8,27,46,.78)", borderRadius: 18, padding: 18, ...extra }); }
function input(extra: React.CSSProperties = {}) { return sx({ width: "100%", height: 46, border: `1px solid ${C.border}`, borderRadius: 14, background: C.panel2, color: C.text, outline: "none", padding: "0 14px", fontWeight: 500, fontSize: 14, fontFamily: FF.body, ...extra }); }
function textarea(extra: React.CSSProperties = {}) { return sx({ width: "100%", minHeight: 92, border: `1px solid ${C.border}`, borderRadius: 14, background: C.panel2, color: C.text, outline: "none", padding: 14, fontWeight: 500, fontSize: 14, fontFamily: FF.body, resize: "vertical", ...extra }); }
function h1() { return sx({ margin: "8px 0 0", fontSize: 20, lineHeight: 1.3, fontWeight: 700, textTransform: "uppercase", color: C.gold, letterSpacing: ".14em", fontFamily: FF.body }); }
function h2() { return sx({ margin: 0, fontSize: 18, lineHeight: 1.3, fontWeight: 600, fontFamily: FF.sub, color: C.text }); }
function bodyText() { return sx({ fontSize: 14, lineHeight: 1.7, color: C.text2, fontFamily: FF.body }); }
function heroCopy() { return sx({ ...bodyText(), margin: "10px 0 0", maxWidth: 760 }); }
function fieldLabel() { return sx({ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", fontFamily: FF.body }); }
function metaLabel() { return sx({ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".12em", fontFamily: FF.body }); }
function helperText() { return sx({ color: C.text2, fontSize: 14, lineHeight: 1.6, fontFamily: FF.body }); }
function eyebrow() { return sx({ color: C.orange, fontWeight: 700, letterSpacing: ".3em", fontSize: 11, textTransform: "uppercase", fontFamily: FF.body }); }
function iconChip(color: string) { return sx({ width: 38, height: 38, borderRadius: 12, display: "grid", placeItems: "center", background: `${color}14`, border: `1px solid ${color}40` }); }
function inlineStat() { return sx({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: `1px solid ${C.border}`, background: "rgba(6,21,36,.35)", borderRadius: 14, padding: "10px 12px" }); }
function tagBadge(color: string) { return sx({ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 24, padding: "0 10px", borderRadius: 999, background: `${color}1a`, border: `1px solid ${color}40`, color, fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", fontFamily: FF.body }); }
function miniCheck(ok: boolean) { return sx({ border: `1px solid ${ok ? C.success : C.border}`, color: ok ? C.success : C.text2, borderRadius: 12, padding: "9px 10px", fontSize: 12, fontWeight: 700, background: ok ? "rgba(34,197,94,.10)" : "rgba(8,27,46,.6)", fontFamily: FF.body }); }
function sectionTop(extra: React.CSSProperties = {}) { return sx({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", ...extra }); }
function pill(color: string) { return sx({ display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "6px 12px", background: `${color}18`, border: `1px solid ${color}55`, color, fontWeight: 700, fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", fontFamily: FF.body }); }
function glassCard(color: string) { return sx({ border: `1px solid ${color}40`, background: `linear-gradient(180deg, rgba(255,255,255,.03), ${color}10)`, borderRadius: 16, padding: 14 }); }
function kpiCard(tone: string) { return sx({ border: `1px solid ${C.border}`, background: `linear-gradient(180deg, rgba(8,27,46,.92), rgba(11,34,54,.98))`, borderRadius: 20, padding: 16, boxShadow: "0 10px 28px rgba(0,0,0,.18)", position: "relative", overflow: "hidden" }); }
function kpiLabel() { return sx({ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: C.muted, letterSpacing: ".12em", fontFamily: FF.body }); }
function kpiValue(color: string) { return sx({ marginTop: 8, color, fontSize: 24, fontWeight: 700, lineHeight: 1, fontFamily: FF.body }); }
function tabBtn(active: boolean, allowed: boolean) { return sx({ minHeight: 46, border: `1px solid ${active ? C.gold : C.border}`, background: active ? "rgba(246,184,75,.12)" : allowed ? C.panel2 : "rgba(8,27,46,.4)", color: allowed ? C.text : C.muted, borderRadius: 14, padding: "0 12px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: allowed ? "pointer" : "not-allowed", fontWeight: 600, fontFamily: FF.body, transition: "all .2s ease" }); }
function primaryBtn(extra: React.CSSProperties = {}) { return sx({ minHeight: 46, border: "none", borderRadius: 14, background: `linear-gradient(135deg, ${C.gold}, ${C.orange})`, color: C.bg, padding: "0 16px", fontWeight: 700, cursor: "pointer", display: "inline-flex", gap: 8, alignItems: "center", justifyContent: "center", fontFamily: FF.body, fontSize: 14, ...extra }); }
function secondaryBtn(extra: React.CSSProperties = {}) { return sx({ minHeight: 42, border: `1px solid ${C.border}`, borderRadius: 14, background: C.panel2, color: C.text, padding: "0 12px", fontWeight: 600, cursor: "pointer", display: "inline-flex", gap: 8, alignItems: "center", justifyContent: "center", fontFamily: FF.body, fontSize: 14, ...extra }); }
function tinyBtn(color = C.orange) { return sx({ minHeight: 32, border: `1px solid ${color}55`, borderRadius: 10, background: `${color}14`, color, padding: "0 10px", fontWeight: 700, cursor: "pointer", fontSize: 12, fontFamily: FF.body, textTransform: "uppercase", letterSpacing: ".06em" }); }
function ghostBtn(color = C.text) { return sx({ minHeight: 34, border: `1px solid ${color}55`, borderRadius: 10, background: "transparent", color, padding: "0 10px", fontWeight: 600, cursor: "pointer", fontFamily: FF.body }); }
function validationRow(ok: boolean) { return sx({ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: `1px solid ${ok ? C.success : C.error}44`, borderRadius: 14, padding: "10px 12px", background: ok ? "rgba(34,197,94,.10)" : "rgba(255,79,134,.10)" }); }
function twoColForm() { return sx({ display: "grid", gridTemplateColumns: "minmax(360px, 460px) minmax(0,1fr)", gap: 18 }); }
function tableWrap() { return sx({ overflow: "auto", border: `1px solid ${C.border}`, borderRadius: 18, maxHeight: 560, background: "rgba(8,27,46,.5)" }); }
function table() { return sx({ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 980 }); }
function th() { return sx({ position: "sticky", top: 0, background: C.panel2, color: C.muted, fontSize: 11, textAlign: "left", padding: "12px 14px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700, fontFamily: FF.body }); }
function td() { return sx({ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, color: C.text, verticalAlign: "top", fontSize: 14, fontFamily: FF.body }); }
function subText() { return sx({ color: C.muted, fontSize: 12, marginTop: 4, fontFamily: FF.body }); }
function mono(color = C.gold) { return sx({ color, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 700, fontSize: 13, wordBreak: "break-all" }); }
function statusBadge(status: string) { const color = status === "approved" ? C.success : status === "submitted" ? C.gold : status === "rejected" ? C.error : C.info; return pill(color); }
