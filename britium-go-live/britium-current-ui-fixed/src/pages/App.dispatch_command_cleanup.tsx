// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Building2,
  Users,
  PackageCheck,
  FileText,
  AlertTriangle,
  Search,
  MapPin,
  Truck,
  Wallet,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";

function pick(row: any, keys: string[], fallback = "—") {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return fallback;
}

function money(v: any) {
  return Number(v || 0).toLocaleString("en-US");
}

function statusClass(value: any) {
  const s = String(value || "").toLowerCase();
  if (s.includes("active") || s.includes("delivered") || s.includes("ready")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (s.includes("hold") || s.includes("pending") || s.includes("review")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (s.includes("fail") || s.includes("cancel") || s.includes("return")) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-slate-200 bg-slate-100 text-slate-700";
}

export default function BranchOfficePage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<any>({});
  const [branches, setBranches] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [amendments, setAmendments] = useState<any[]>([]);
  const [branchCode, setBranchCode] = useState("");
  const [query, setQuery] = useState("");
  const [amendmentTarget, setAmendmentTarget] = useState<any | null>(null);
  const [amendmentForm, setAmendmentForm] = useState({
    recipient_name: "",
    recipient_phone: "",
    township: "",
    address: "",
    shipment_status: "",
    remarks: "",
  });


  async function actorEmail() {
    try {
      const { data } = await supabase.auth.getUser();
      return data?.user?.email || "branch@britiumexpress.com";
    } catch {
      return "branch@britiumexpress.com";
    }
  }

  function openAmendment(row: any) {
    setAmendmentTarget(row);
    setAmendmentForm({
      recipient_name: pick(row, ["recipient_name"], ""),
      recipient_phone: pick(row, ["recipient_phone"], ""),
      township: pick(row, ["township"], ""),
      address: pick(row, ["address"], ""),
      shipment_status: pick(row, ["shipment_status", "warehouse_status"], ""),
      remarks: "",
    });
  }

  async function submitAmendmentRequest() {
    if (!amendmentTarget) {
      setMessage("Please select a shipment first.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const email = await actorEmail();
      const targetId =
        amendmentTarget.id ||
        amendmentTarget.delivery_way_id ||
        amendmentTarget.waybill_no ||
        amendmentTarget.tracking_no;

      const { data, error } = await supabase.rpc("be_branch_amendment_request", {
        p_payload: {
          branch_code: pick(amendmentTarget, ["branch_code"], branchCode || "YGN"),
          request_type: "SHIPMENT_AMENDMENT",
          target_table: "be_branch_shipments",
          target_id: String(targetId || ""),
          old_data: amendmentTarget,
          requested_data: {
            recipient_name: amendmentForm.recipient_name,
            recipient_phone: amendmentForm.recipient_phone,
            township: amendmentForm.township,
            address: amendmentForm.address,
            shipment_status: amendmentForm.shipment_status,
          },
          actor_email: email,
          remarks: amendmentForm.remarks || "Branch shipment amendment request",
        },
      });

      if (error) throw error;

      setMessage(`Amendment request submitted. Status: ${data?.approval_status || "PENDING"}`);
      setAmendmentTarget(null);
      await loadData(branchCode);
    } catch (e: any) {
      setMessage(e?.message || "Unable to submit amendment request.");
    } finally {
      setLoading(false);
    }
  }


  async function loadData(nextBranch = branchCode) {
    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase.rpc("be_branch_office_snapshot", {
        p_branch_code: nextBranch || null,
        p_limit: 300,
      });

      if (error) throw error;

      setSummary(data?.summary || {});
      setBranches(Array.isArray(data?.branches) ? data.branches : []);
      setStaff(Array.isArray(data?.staff) ? data.staff : []);
      setShipments(Array.isArray(data?.shipments) ? data.shipments : []);
      setAmendments(Array.isArray(data?.amendments) ? data.amendments : []);
    } catch (e: any) {
      setMessage(e?.message || "Unable to load Branch Office data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData("");
  }, []);

  const filteredShipments = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return shipments;

    return shipments.filter((r) =>
      JSON.stringify(r).toLowerCase().includes(q)
    );
  }, [shipments, query]);

  function changeBranch(code: string) {
    setBranchCode(code);
    void loadData(code);
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center rounded-[32px] border border-slate-200 bg-white p-10 shadow-sm">
        <div className="inline-flex items-center gap-3 text-sm font-semibold text-slate-600">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading Branch Office...
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
              <Building2 className="h-4 w-4 text-[#0d2c54]" />
              <span className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">
                Branch Office
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-[#0d2c54] md:text-5xl">
              Branch Office Control Center
            </h1>
            <p className="mt-4 max-w-4xl text-sm font-medium leading-6 text-slate-500 md:text-[15px]">
              Branches, staff, shipments, warehouse status, COD summary, and amendment requests in one live screen.
            </p>
          </div>

          <button
            onClick={() => void loadData(branchCode)}
            disabled={loading}
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
        <Metric title="Branches" value={summary.branches ?? branches.length} icon={<Building2 className="h-5 w-5" />} />
        <Metric title="Active" value={summary.active_branches ?? 0} icon={<MapPin className="h-5 w-5" />} />
        <Metric title="Staff" value={summary.staff ?? staff.length} icon={<Users className="h-5 w-5" />} />
        <Metric title="Shipments" value={summary.shipments ?? shipments.length} icon={<PackageCheck className="h-5 w-5" />} />
        <Metric title="Pending" value={summary.pending_shipments ?? 0} icon={<Truck className="h-5 w-5" />} />
        <Metric title="COD" value={money(summary.cod_total)} icon={<Wallet className="h-5 w-5" />} />
        <Metric title="Amendments" value={summary.pending_amendments ?? amendments.length} icon={<AlertTriangle className="h-5 w-5" />} />
      </section>

      <section className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-lg font-black tracking-tight text-[#0d2c54]">Branch Selector</div>
            <div className="mt-2 text-sm text-slate-500">Filter branch-level staff and shipments.</div>
          </div>
          <select
            value={branchCode}
            onChange={(e) => changeBranch(e.target.value)}
            className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none"
          >
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b.branch_code} value={b.branch_code}>
                {b.branch_code} — {b.branch_name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_430px]">
        <div className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="mb-5 flex flex-col gap-3 border-b border-slate-200/80 pb-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-lg font-black tracking-tight text-[#0d2c54]">Branch Shipments</div>
              <div className="mt-2 text-sm text-slate-500">
                Loaded from branch shipment table and live wayplan dispatch stops.
              </div>
            </div>

            <div className="flex h-12 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search waybill, tracking, pickup..."
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </div>

          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                  <th className="px-3 py-3">Branch</th>
                  <th className="px-3 py-3">Shipment</th>
                  <th className="px-3 py-3">Waybill / Tracking</th>
                  <th className="px-3 py-3">Rider</th>
                  <th className="px-3 py-3">COD / Fee</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredShipments.map((row, idx) => (
                  <tr key={row.id || `${row.delivery_way_id}-${idx}`} className="border-b border-slate-100">
                    <td className="px-3 py-3 font-black text-slate-900">{pick(row, ["branch_code"], "YGN")}</td>
                    <td className="px-3 py-3">
                      <div className="font-semibold">{pick(row, ["delivery_way_id"], "—")}</div>
                      <div className="text-xs text-slate-500">{pick(row, ["pickup_id"], "—")}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div>{pick(row, ["waybill_no"], "—")}</div>
                      <div className="text-xs text-slate-500">{pick(row, ["tracking_no"], "—")}</div>
                    </td>
                    <td className="px-3 py-3">{pick(row, ["rider_name", "rider_code"], "—")}</td>
                    <td className="px-3 py-3">
                      {money(row.cod_amount)} / {money(row.delivery_fee)}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase ${statusClass(row.shipment_status || row.warehouse_status)}`}>
                        {pick(row, ["shipment_status", "warehouse_status"], "PENDING")}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={() => openAmendment(row)}
                        className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800"
                      >
                        Request Change
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!filteredShipments.length ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500">
                No branch shipments found.
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-6">

          <Panel title="Request Shipment Amendment">
            {amendmentTarget ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                  Selected: {pick(amendmentTarget, ["delivery_way_id", "waybill_no", "tracking_no"], "Shipment")}
                </div>

                <Input label="Recipient Name" value={amendmentForm.recipient_name} onChange={(v: string) => setAmendmentForm({ ...amendmentForm, recipient_name: v })} />
                <Input label="Recipient Phone" value={amendmentForm.recipient_phone} onChange={(v: string) => setAmendmentForm({ ...amendmentForm, recipient_phone: v })} />
                <Input label="Township" value={amendmentForm.township} onChange={(v: string) => setAmendmentForm({ ...amendmentForm, township: v })} />
                <Input label="Address" value={amendmentForm.address} onChange={(v: string) => setAmendmentForm({ ...amendmentForm, address: v })} />
                <Input label="Shipment Status" value={amendmentForm.shipment_status} onChange={(v: string) => setAmendmentForm({ ...amendmentForm, shipment_status: v })} />

                <textarea
                  value={amendmentForm.remarks}
                  onChange={(e) => setAmendmentForm({ ...amendmentForm, remarks: e.target.value })}
                  placeholder="Reason for amendment"
                  className="min-h-[90px] w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-[#0d2c54]/30 focus:bg-white focus:ring-4 focus:ring-[#0d2c54]/10"
                />

                <button
                  onClick={() => void submitAmendmentRequest()}
                  className="w-full rounded-2xl bg-[#0d2c54] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-white"
                >
                  Submit for Approval
                </button>

                <button
                  onClick={() => setAmendmentTarget(null)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-600"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm font-semibold text-slate-500">
                Select a shipment and click Request Change.
              </div>
            )}
          </Panel>

          <Panel title="Branch Offices">
            <div className="space-y-3">
              {branches.map((b) => (
                <div key={b.branch_code} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-black text-slate-900">{b.branch_name}</div>
                      <div className="text-sm text-slate-500">{b.branch_code} · {b.city}</div>
                      <div className="text-xs text-slate-400">{b.address || b.region_state}</div>
                    </div>
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase ${statusClass(b.status)}`}>
                      {b.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Branch Staff">
            <div className="space-y-3">
              {staff.slice(0, 10).map((s, idx) => (
                <div key={s.id || `${s.employee_id}-${idx}`} className="rounded-xl border border-slate-200 p-4">
                  <div className="font-black text-slate-900">{pick(s, ["employee_name"], "Unnamed")}</div>
                  <div className="text-sm text-slate-500">{pick(s, ["employee_id"], "—")} · {pick(s, ["role_id", "department"], "—")}</div>
                  <div className="text-xs text-slate-400">{pick(s, ["branch_code"], "YGN")} · {pick(s, ["email", "phone"], "—")}</div>
                </div>
              ))}
              {!staff.length ? <div className="text-sm font-semibold text-slate-500">No staff found.</div> : null}
            </div>
          </Panel>

          <Panel title="Amendment Requests">
            <div className="space-y-3">
              {amendments.slice(0, 10).map((a) => (
                <div key={a.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="font-black text-slate-900">{a.request_type}</div>
                  <div className="text-sm text-slate-500">{a.branch_code} · {a.target_table}</div>
                  <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase ${statusClass(a.approval_status)}`}>
                    {a.approval_status}
                  </span>
                </div>
              ))}
              {!amendments.length ? <div className="text-sm font-semibold text-slate-500">No amendment requests.</div> : null}
            </div>
          </Panel>
        </div>
      </section>
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

function Panel({ title, children }: any) {
  return (
    <div className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="mb-5 border-b border-slate-200/80 pb-5">
        <div className="text-lg font-black tracking-tight text-[#0d2c54]">{title}</div>
      </div>
      {children}
    </div>
  );
}
