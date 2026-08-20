// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Save,
  Trash2,
  Pencil,
  Search,
  Database,
  Building2,
  Users,
  Truck,
  UserCog,
  PackageCheck,
  Plus,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";

const ENTITY_TYPES = [
  "MERCHANT",
  "RIDER",
  "DRIVER",
  "HELPER",
  "FLEET",
  "EMPLOYEE",
  "BRANCH",
  "OPTION",
  "TOWNSHIP",
  "ZONE",
  "TARIFF",
];

const ENTITY_FIELDS: Record<string, string[]> = {
  MERCHANT: [
    "merchant_code",
    "merchant_name",
    "business_type",
    "contact_person",
    "phone_primary",
    "email",
    "address_line_1",
    "township",
    "city",
    "region_state",
    "payment_terms",
    "contract_status",
    "status",
  ],
  RIDER: [
    "rider_id",
    "rider_name",
    "phone_primary",
    "assigned_zone",
    "employment_type",
    "branch_code",
    "status",
  ],
  DRIVER: [
    "driver_id",
    "driver_name",
    "phone_primary",
    "license_no",
    "license_expiry_date",
    "assigned_fleet_id",
    "branch_code",
    "status",
  ],
  HELPER: [
    "helper_id",
    "helper_name",
    "phone_primary",
    "assigned_zone",
    "employment_type",
    "branch_code",
    "status",
  ],
  FLEET: [
    "fleet_id",
    "vehicle_no",
    "vehicle_type",
    "capacity_kg",
    "capacity_cbm",
    "ownership_type",
    "insurance_expiry_date",
    "branch_code",
    "status",
  ],
  EMPLOYEE: [
    "employee_id",
    "full_name",
    "email",
    "phone_e164",
    "department",
    "designation",
    "app_role",
    "role_id",
    "branch_code",
    "status",
  ],
  BRANCH: [
    "branch_code",
    "branch_name",
    "branch_type",
    "city",
    "region_state",
    "township",
    "address",
    "phone",
    "manager_name",
    "manager_email",
    "status",
  ],
  OPTION: [
    "dropdown_name",
    "value",
    "myanmar_label",
    "sort_order",
    "status",
  ],
  TOWNSHIP: [
    "township_code",
    "township",
    "city",
    "region_state",
    "zone",
    "branch_code",
    "status",
  ],
  ZONE: [
    "zone_code",
    "zone_name",
    "city",
    "branch_code",
    "status",
  ],
  TARIFF: [
    "tariff_code",
    "service_type",
    "from_city",
    "to_city",
    "base_fee",
    "extra_kg_fee",
    "status",
  ],
};

function pick(row: any, keys: string[], fallback = "—") {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value);
  }
  return fallback;
}

function recordData(row: any) {
  return row?.data && typeof row.data === "object" ? row.data : {};
}

function displayCode(row: any) {
  const d = recordData(row);
  return pick(row, ["entity_code"], pick(d, [
    "merchant_code",
    "rider_id",
    "driver_id",
    "helper_id",
    "fleet_id",
    "vehicle_no",
    "employee_id",
    "branch_code",
    "township_code",
    "zone_code",
    "tariff_code",
    "code",
  ], "—"));
}

function displayName(row: any) {
  const d = recordData(row);
  return pick(row, ["entity_name"], pick(d, [
    "merchant_name",
    "rider_name",
    "driver_name",
    "helper_name",
    "vehicle_no",
    "full_name",
    "display_name",
    "branch_name",
    "township",
    "zone_name",
    "service_type",
    "value",
    "name",
  ], "Unnamed"));
}

function blankFor(entityType: string) {
  const obj: any = { status: "Active", record_status: "Active" };
  (ENTITY_FIELDS[entityType] || []).forEach((field) => {
    if (field === "status") obj[field] = "Active";
    else if (field === "branch_code") obj[field] = "YGN";
    else obj[field] = "";
  });
  return obj;
}

function normalizeStatus(value: any) {
  const s = String(value || "Active");
  return s.toLowerCase() === "inactive" || s.toLowerCase() === "deleted" ? "Inactive" : s;
}

function statusClass(value: any) {
  const s = String(value || "").toLowerCase();
  if (s.includes("active") || s.includes("approved")) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (s.includes("inactive") || s.includes("delete") || s.includes("suspended")) return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export default function MasterDataPortal() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<any>({});
  const [rows, setRows] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [entityType, setEntityType] = useState("MERCHANT");
  const [form, setForm] = useState<any>(blankFor("MERCHANT"));
  const [editingCode, setEditingCode] = useState("");

  async function actorEmail() {
    try {
      const { data } = await supabase.auth.getUser();
      return data?.user?.email || "masterdata@britiumexpress.com";
    } catch {
      return "masterdata@britiumexpress.com";
    }
  }

  async function loadData() {
    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase.rpc("be_master_data_page_snapshot");
      if (error) throw error;

      setSummary(data?.summary || {});
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e: any) {
      setMessage(e?.message || "Unable to load master data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const fields = ENTITY_FIELDS[entityType] || [];

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return rows.filter((row) => {
      const d = recordData(row);
      const sameType = String(row.entity_type || "").toUpperCase() === entityType;
      if (!sameType) return false;
      if (!q) return true;

      return JSON.stringify({ ...row, data: d }).toLowerCase().includes(q);
    });
  }, [rows, entityType, query]);

  function changeType(next: string) {
    setEntityType(next);
    setForm(blankFor(next));
    setEditingCode("");
    setMessage("");
  }

  function edit(row: any) {
    const d = recordData(row);
    const nextType = String(row.entity_type || entityType).toUpperCase();
    setEntityType(nextType);
    setForm({
      ...blankFor(nextType),
      ...d,
      status: normalizeStatus(row.record_status || d.status),
      record_status: normalizeStatus(row.record_status || d.record_status),
    });
    setEditingCode(displayCode(row));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    setSaving(true);
    setMessage("");

    try {
      const email = await actorEmail();
      const payload = {
        ...form,
        status: normalizeStatus(form.status || form.record_status),
        record_status: normalizeStatus(form.record_status || form.status),
      };

      const { data, error } = await supabase.rpc("be_master_entity_save_audited", {
        p_entity_type: entityType,
        p_record: payload,
        p_actor_email: email,
      });

      if (error) throw error;

      setMessage(`${entityType} saved: ${data?.entity_code || "OK"}`);
      setForm(blankFor(entityType));
      setEditingCode("");
      await loadData();
    } catch (e: any) {
      setMessage(e?.message || "Unable to save master data.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: any) {
    const code = displayCode(row);
    const confirmed = window.confirm(`Delete ${row.entity_type} ${code}?`);
    if (!confirmed) return;

    setSaving(true);
    setMessage("");

    try {
      const email = await actorEmail();
      const { data, error } = await supabase.rpc("be_master_entity_delete", {
        p_entity_type: row.entity_type,
        p_entity_code: code,
        p_actor_email: email,
      });

      if (error) throw error;

      setMessage(`${row.entity_type} deleted/deactivated. Rows: ${data?.deleted_rows ?? 0}`);
      await loadData();
    } catch (e: any) {
      setMessage(e?.message || "Unable to delete master record.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center rounded-[32px] border border-slate-200 bg-white p-10 shadow-sm">
        <div className="inline-flex items-center gap-3 text-sm font-semibold text-slate-600">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading Master Data...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 shadow-sm">
              <Database className="h-4 w-4 text-[#0d2c54]" />
              <span className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">
                Master Data
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-[#0d2c54] md:text-5xl">
              Master Data Control Center
            </h1>
            <p className="mt-4 max-w-4xl text-sm font-medium leading-6 text-slate-500 md:text-[15px]">
              Add, edit, update, and delete Merchant, Rider, Driver, Helper, Fleet, Employee, Branch, Township, Zone, Tariff, and Dropdown records.
            </p>
          </div>

          <button
            onClick={() => void loadData()}
            disabled={loading || saving}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#0d2c54] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-white disabled:opacity-70"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </section>

      {message ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {message}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Metric title="Total" value={summary.total_records ?? rows.length} icon={<Database className="h-5 w-5" />} />
        <Metric title="Merchants" value={summary.merchants ?? 0} icon={<PackageCheck className="h-5 w-5" />} />
        <Metric title="Riders" value={summary.riders ?? 0} icon={<Users className="h-5 w-5" />} />
        <Metric title="Fleet" value={summary.fleet ?? 0} icon={<Truck className="h-5 w-5" />} />
        <Metric title="Employees" value={summary.employees ?? 0} icon={<UserCog className="h-5 w-5" />} />
        <Metric title="Branches" value={summary.branches ?? 0} icon={<Building2 className="h-5 w-5" />} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="mb-5 border-b border-slate-200/80 pb-5">
            <div className="text-lg font-black tracking-tight text-[#0d2c54]">
              {editingCode ? `Edit ${entityType}` : `Add ${entityType}`}
            </div>
            <div className="mt-2 text-sm text-slate-500">
              Saves through <b>be_master_entity_save_audited</b>.
            </div>
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">
              Entity Type
            </label>
            <select
              value={entityType}
              onChange={(e) => changeType(e.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none transition focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
            >
              {ENTITY_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="max-h-[62vh] space-y-3 overflow-auto pr-1">
            {fields.map((field) => (
              <Input
                key={field}
                label={field}
                value={form[field] || ""}
                onChange={(v: string) => setForm({ ...form, [field]: v })}
              />
            ))}
          </div>

          <button
            onClick={() => void save()}
            disabled={saving}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0d2c54] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-white disabled:opacity-70"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : editingCode ? "Update Record" : "Save Record"}
          </button>

          {editingCode ? (
            <button
              onClick={() => {
                setEditingCode("");
                setForm(blankFor(entityType));
              }}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-600"
            >
              <Plus className="h-4 w-4" />
              New Record
            </button>
          ) : null}
        </div>

        <div className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="mb-5 flex flex-col gap-3 border-b border-slate-200/80 pb-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-lg font-black tracking-tight text-[#0d2c54]">
                {entityType} Records
              </div>
              <div className="mt-2 text-sm text-slate-500">
                Loaded from <b>be_master_data_page_snapshot</b>.
              </div>
            </div>

            <div className="flex h-12 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search records..."
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </div>

          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[920px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                  <th className="px-3 py-3">Code</th>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Main Detail</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Updated</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, idx) => {
                  const d = recordData(row);
                  const status = row.record_status || d.status || "Active";
                  return (
                    <tr key={row.id || `${row.entity_type}-${displayCode(row)}-${idx}`} className="border-b border-slate-100">
                      <td className="px-3 py-3 font-black text-slate-900">{displayCode(row)}</td>
                      <td className="px-3 py-3">{displayName(row)}</td>
                      <td className="px-3 py-3 text-slate-500">
                        {pick(d, ["phone_primary", "phone_e164", "email", "city", "vehicle_type", "department", "branch_code", "dropdown_name"], "—")}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase ${statusClass(status)}`}>
                          {status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-500">{pick(row, ["updated_at", "created_at"], "—")}</td>
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={() => edit(row)}
                          className="mr-2 rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-700"
                        >
                          <Pencil className="inline h-4 w-4" /> Edit
                        </button>
                        <button
                          onClick={() => void remove(row)}
                          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 font-semibold text-rose-700"
                        >
                          <Trash2 className="inline h-4 w-4" /> Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!filtered.length ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500">
                No {entityType} records yet. Add one from the form.
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ title, value, icon }: any) {
  return (
    <div className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-[#0d2c54] shadow-inner">
        {icon}
      </div>
      <div className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{title}</div>
      <div className="mt-3 text-3xl font-black tracking-tight text-[#0d2c54]">{value}</div>
    </div>
  );
}

function Input({ label, value, onChange }: any) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
      />
    </label>
  );
}
