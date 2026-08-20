// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { RefreshCw, Plus, Users, ShieldCheck, Search, AlertTriangle } from "lucide-react";

type EmployeeRow = {
  employee_code: string;
  display_name: string;
  department: string;
  role_label: string;
  branch_code: string;
  email: string;
  phone_primary: string;
  status: string;
  is_active: boolean;
  record_key?: string;
  updated_at?: string;
};

export const ADMIN_HR_PRODUCTION_BUILD = "ADMIN_HR_READ_ONLY_NO_FALLBACK_V56_2026_07_31";

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeText(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const text = value.map((item) => safeText(item, "")).filter(Boolean).join(", ");
    return text || fallback;
  }
  if (isObject(value)) {
    for (const key of ["label", "name", "display_name", "displayName", "value", "code"]) {
      const text = safeText(value[key], "");
      if (text) return text;
    }
    try {
      const json = JSON.stringify(value);
      return json === "{}" ? fallback : json;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/**
 * Legacy employee rows in this project can contain several payload wrappers.
 * Merge outer metadata with each nested payload while allowing the deepest
 * employee fields to win.
 */
function flattenPayload(value: any): Record<string, any> {
  let current = isObject(value) ? value : {};
  let merged: Record<string, any> = {};
  const seen = new Set<any>();

  for (let depth = 0; depth < 10 && isObject(current) && !seen.has(current); depth += 1) {
    seen.add(current);
    const { payload, ...rest } = current;
    merged = { ...merged, ...rest };
    if (!isObject(payload)) break;
    current = payload;
  }

  return merged;
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeEmployee(row: any): EmployeeRow | null {
  const flat = flattenPayload(row);
  const displayName = safeText(
    flat.employee_name ??
      flat.display_name ??
      flat.name ??
      flat.workforce_name,
  );

  // Reject rider/driver/helper records that were accidentally wrapped inside
  // employee_master legacy snapshots.
  if (!displayName) return null;

  const rawEmployeeCode = safeText(flat.employee_id ?? flat.employee_code);
  const recordKey = safeText(flat.record_key ?? row?.record_key);
  const email = safeText(flat.email).toLowerCase();

  let employeeCode = rawEmployeeCode;
  if (!employeeCode || looksLikeUuid(employeeCode) || /^EMPLOYEE_MASTER-/i.test(employeeCode)) {
    if (recordKey && !looksLikeUuid(recordKey) && !/^EMPLOYEE_MASTER-/i.test(recordKey)) {
      employeeCode = recordKey;
    } else {
      employeeCode = email || displayName;
    }
  }

  const status = safeText(flat.status ?? flat.record_status, "Active");
  const inactive = ["inactive", "suspended", "deleted", "terminated", "false", "0", "no"].includes(
    status.toLowerCase(),
  );
  const explicitActive = flat.is_active;
  const isActive = explicitActive === false ? false : !inactive;

  return {
    employee_code: employeeCode,
    display_name: displayName,
    department: safeText(flat.department, "Unassigned"),
    role_label: safeText(flat.role_label ?? flat.role_id ?? flat.role, "Unassigned"),
    branch_code: safeText(flat.branch_code ?? flat.branch, "YGN"),
    email,
    phone_primary: safeText(flat.phone_primary ?? flat.phone),
    status,
    is_active: isActive,
    record_key: recordKey,
    updated_at: safeText(flat.updated_at ?? row?.updated_at),
  };
}

function employeeScore(employee: EmployeeRow): number {
  return (
    (employee.employee_code && !looksLikeUuid(employee.employee_code) ? 4 : 0) +
    (employee.email ? 3 : 0) +
    (employee.department && employee.department !== "Unassigned" ? 2 : 0) +
    (employee.role_label && employee.role_label !== "Unassigned" ? 2 : 0) +
    (employee.phone_primary ? 1 : 0)
  );
}

function dedupeEmployees(rows: any[]): EmployeeRow[] {
  const best = new Map<string, EmployeeRow>();

  rows
    .map(normalizeEmployee)
    .filter(Boolean)
    .forEach((employee: EmployeeRow) => {
      const identity = (
        employee.employee_code ||
        employee.email ||
        employee.display_name
      ).toLowerCase();

      const existing = best.get(identity);
      if (!existing || employeeScore(employee) > employeeScore(existing)) {
        best.set(identity, employee);
      } else if (
        existing &&
        employeeScore(employee) === employeeScore(existing) &&
        (employee.updated_at || "") > (existing.updated_at || "")
      ) {
        best.set(identity, employee);
      }
    });

  return [...best.values()].sort((a, b) =>
    a.employee_code.localeCompare(b.employee_code, undefined, { numeric: true }),
  );
}

function rowsFromAdminSnapshot(data: any): any[] {
  if (Array.isArray(data?.employees)) return data.employees;
  if (Array.isArray(data?.rows)) return data.rows;
  return [];
}

function rowsFromMasterSnapshot(data: any): any[] {
  const grouped = isObject(data?.records_by_dataset) ? data.records_by_dataset : {};
  if (Array.isArray(grouped.employee_master)) return grouped.employee_master;

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  return rows.filter((row: any) => safeText(row?.dataset_key) === "employee_master");
}

export default function AdminHRPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [source, setSource] = useState("Waiting for employee master");
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");

  const loadData = async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      // Preferred dedicated RPC. The supplied SQL migration makes this RPC
      // read directly from employee_master.
      const adminResult = await supabase.rpc("be_admin_hr_snapshot");
      if (!adminResult.error) {
        const normalized = dedupeEmployees(rowsFromAdminSnapshot(adminResult.data));
        if (normalized.length) {
          setEmployees(normalized);
          setSource(adminResult.data?.source || "employee_master via be_admin_hr_snapshot");
          return;
        }
      }

      // Safe fallback to the working master-data snapshot.
      const masterResult = await supabase.rpc("be_master_data_page_snapshot");
      if (masterResult.error) throw masterResult.error;

      const normalized = dedupeEmployees(rowsFromMasterSnapshot(masterResult.data));
      setEmployees(normalized);
      setSource("employee_master via be_master_data_page_snapshot");

      if (!normalized.length) {
        setErrorMessage("The employee_master dataset returned no usable employee records.");
      }
    } catch (error: any) {
      if (error?.name === "AbortError" || error?.message?.includes("aborted")) return;
      setEmployees([]);
      setSource("Unavailable: be_admin_hr_snapshot / be_master_data_page_snapshot");
      setErrorMessage(
        error?.message ||
          "Could not synchronize employee master. No local or invented employee records are displayed.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter((employee) =>
      [
        employee.employee_code,
        employee.display_name,
        employee.department,
        employee.role_label,
        employee.branch_code,
        employee.email,
        employee.phone_primary,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [employees, search]);

  const activeEmployees = employees.filter((employee) => employee.is_active).length;
  const accessUsers = employees.filter((employee) => Boolean(employee.email)).length;
  const activeUsers = employees.filter((employee) => employee.is_active && employee.email).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-3 items-start border-b border-[#1a3a5c] pb-4">
        <div>
          <h1 className="text-[#f6b84b] uppercase mb-1 text-[16px]">
            {t("ADMIN & HR PORTAL", "စီမံခန့်ခွဲရေး နှင့် လူ့စွမ်းအားအရင်းအမြစ်")}
          </h1>
          <p className="text-[#4d7a9b] text-[13px]">
            {t(
              "Employee management synchronized with Employee Master.",
              "ဝန်ထမ်း Master Data နှင့် ချိတ်ဆက်ထားသော ဝန်ထမ်းစီမံခန့်ခွဲမှု။",
            )}
          </p>
          <p className="mt-1 text-[11px] text-[#4ea8de]">Backend source: {source}</p>
        </div>

        <button
          onClick={() => void loadData()}
          disabled={loading}
          className="bg-[#0b2236] border border-[#1a3a5c] text-[#eef8ff] px-4 py-2.5 rounded-xl text-[13px] hover:border-[#f6b84b] flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? "animate-spin text-[#f6b84b]" : ""} />
          <span className="hidden md:inline">{t("Refresh", "ပြန်လည်စတင်ရန်")}</span>
        </button>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-cyan-700 bg-cyan-950/20 px-4 py-3 text-[12px] text-cyan-200">
        <ShieldCheck size={15} className="mt-0.5 shrink-0" />
        <span>Employee data is read-only on this screen until the secured HR mutation RPCs are deployed and verified.</span>
      </div>

      {errorMessage ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-700 bg-amber-950/30 px-4 py-3 text-[12px] text-amber-200">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label={t("EMPLOYEES", "ဝန်ထမ်းစုစုပေါင်း")} value={employees.length} icon={<Users size={16} />} />
        <Metric label={t("ACTIVE EMPLOYEES", "လက်ရှိ ဝန်ထမ်း")} value={activeEmployees} icon={<Users size={16} />} accent="emerald" />
        <Metric label={t("ACCESS USERS", "အကောင့်များ")} value={accessUsers} icon={<ShieldCheck size={16} />} />
        <Metric label={t("ACTIVE USERS", "အသုံးပြုနေသော အကောင့်")} value={activeUsers} icon={<ShieldCheck size={16} />} accent="rose" />
      </div>

      <div className="flex gap-2 border-b border-[#1a3a5c] pb-3 flex-wrap">
        <button className="bg-[#f6b84b] text-[#061524] px-5 py-2.5 rounded-xl text-[13px] uppercase tracking-widest cursor-pointer">
          {t("Overview", "အနှစ်ချုပ်")}
        </button>
        <button className="bg-[#061524] text-[#eef8ff] border border-[#1a3a5c] hover:border-[#4ea8de] px-5 py-2.5 rounded-xl text-[13px] uppercase tracking-widest transition-colors cursor-pointer">
          {t("Employees", "ဝန်ထမ်းများ")}
        </button>
        <button className="bg-[#061524] text-[#eef8ff] border border-[#1a3a5c] hover:border-[#4ea8de] px-5 py-2.5 rounded-xl text-[13px] uppercase tracking-widest transition-colors cursor-pointer">
          {t("Admin/Access", "ဝင်ရောက်ခွင့်များ")}
        </button>
        <button className="bg-[#061524] text-[#eef8ff] border border-[#1a3a5c] hover:border-[#4ea8de] px-5 py-2.5 rounded-xl text-[13px] uppercase tracking-widest transition-colors cursor-pointer">
          {t("Reports", "အစီရင်ခံစာများ")}
        </button>
      </div>

      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl flex flex-col min-h-[400px]">
        <div className="p-4 border-b border-[#1a3a5c] flex flex-wrap gap-3 justify-between items-center">
          <div className="text-[#eef8ff] text-[14px] uppercase tracking-widest">
            {t("Employee Directory", "ဝန်ထမ်း စာရင်း")}
          </div>

          <div className="flex flex-1 justify-end gap-2 min-w-[260px]">
            <div className="relative w-full max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4d7a9b]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("Search employees...", "ဝန်ထမ်းရှာရန်...")}
                className="w-full rounded-xl border border-[#1a3a5c] bg-[#061524] py-2.5 pl-9 pr-3 text-[12px] text-[#eef8ff] outline-none focus:border-[#f6b84b]"
              />
            </div>
            <button
              type="button"
              disabled
              title="Secured HR mutation RPCs are not deployed in the supplied production contract."
              className="bg-[#f6b84b] text-[#061524] px-4 py-2.5 rounded-xl text-[13px] uppercase tracking-wider flex items-center gap-2 cursor-not-allowed opacity-50"
            >
              <Plus size={14} /> {t("Add Employee", "ဝန်ထမ်းသစ် ထည့်မည်")}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto custom-scrollbar h-[500px]">
          <table className="w-full text-left text-[13px] whitespace-nowrap">
            <thead className="bg-[#061524] sticky top-0 border-b border-[#1a3a5c] z-10">
              <tr className="text-[#4d7a9b] uppercase text-[11px] tracking-widest">
                <th className="p-4">{t("CODE", "ကုဒ်")}</th>
                <th className="p-4">{t("NAME", "အမည်")}</th>
                <th className="p-4">{t("DEPARTMENT", "ဌာန")}</th>
                <th className="p-4">{t("ROLE", "ရာထူး")}</th>
                <th className="p-4">{t("BRANCH", "ရုံးခွဲ")}</th>
                <th className="p-4">{t("EMAIL", "အီးမေးလ်")}</th>
                <th className="p-4">{t("STATUS", "အခြေအနေ")}</th>
              </tr>
            </thead>
            <tbody>
              {loading && !employees.length ? (
                <tr>
                  <td colSpan={7} className="text-center p-8 text-[#4d7a9b]">
                    {t("Loading...", "ဖတ်နေသည်...")}
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center p-8 text-[#4d7a9b]">
                    {t("No records found.", "မှတ်တမ်း မရှိပါ။")}
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((employee) => (
                  <tr
                    key={`${employee.employee_code}-${employee.email}`}
                    className="border-b border-[#1a3a5c]/50 hover:bg-[#061524] text-[#eef8ff] transition-colors"
                  >
                    <td className="p-4 font-mono">{employee.employee_code}</td>
                    <td className="p-4">{employee.display_name}</td>
                    <td className="p-4 text-[#4ea8de]">{employee.department}</td>
                    <td className="p-4 text-[#f6b84b]">{employee.role_label}</td>
                    <td className="p-4 text-[#4d7a9b]">{employee.branch_code}</td>
                    <td className="p-4 text-[#4d7a9b]">{employee.email || "—"}</td>
                    <td className="p-4">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] uppercase ${
                          employee.is_active
                            ? "border-emerald-700 bg-emerald-900/20 text-emerald-300"
                            : "border-rose-800 bg-rose-900/20 text-rose-300"
                        }`}
                      >
                        {employee.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
  accent = "blue",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: "blue" | "emerald" | "rose";
}) {
  const classes =
    accent === "emerald"
      ? "text-emerald-400"
      : accent === "rose"
        ? "text-rose-400"
        : "text-[#4ea8de]";

  return (
    <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl flex justify-between items-start">
      <div>
        <div className={`${classes} uppercase text-[11px] tracking-widest mb-1`}>{label}</div>
        <div className={`text-[20px] ${accent === "blue" ? "text-[#f6b84b]" : classes}`}>{value}</div>
      </div>
      <span className={classes}>{icon}</span>
    </div>
  );
}
