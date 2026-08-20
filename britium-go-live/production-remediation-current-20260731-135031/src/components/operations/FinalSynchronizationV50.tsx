import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  Download,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const FINAL_SYNCHRONIZATION_V50_BUILD =
  "FINAL_SYNCHRONIZATION_V50_CANONICAL_RECONCILIATION_2026-07-30";

type Variance = {
  id: number;
  issue_code: string;
  issue_summary: string;
  variance_status: string;
  owner?: string | null;
  owner_note?: string | null;
  detected_at?: string | null;
};

type SyncRow = {
  delivery_way_id: string;
  wayplan_id: string;
  pickup_id?: string | null;
  recorded_pickup_id?: string | null;
  pickup_lineage_status?: string | null;
  route_zone?: string | null;
  membership_status?: string | null;
  warehouse_status?: string | null;
  dispatch_scan_status?: string | null;
  review_status?: string | null;
  route_status?: string | null;
  rider_run_status?: string | null;
  delivery_status?: string | null;
  finance_status?: string | null;
  cs_status?: string | null;
  expected_cod?: number | string | null;
  check_status: string;
  issue_codes?: string[];
  open_variance_count?: number;
  certification_stale?: boolean;
  certified_by?: string | null;
  certified_at?: string | null;
  last_refreshed_at?: string | null;
  open_variances?: Variance[];
};

type Snapshot = {
  ok?: boolean;
  build?: string;
  filter?: string;
  workflow?: string;
  summary?: Record<string, number>;
  rows?: SyncRow[];
  issue_catalog?: Array<{ code: string; label: string }>;
  generated_at?: string;
};

const actor = () =>
  localStorage.getItem("be_user_email") ||
  localStorage.getItem("be_actor_email") ||
  localStorage.getItem("user_email") ||
  undefined;

const shell = "rounded-3xl border border-[#1a3a5c] bg-[#0b2236]";
const input =
  "w-full rounded-xl border border-[#1a3a5c] bg-[#081b2e] px-3 py-2 text-[12px] text-[#eef8ff] outline-none focus:border-[#f6b84b]";
const primary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-[#f6b84b] px-4 py-2 text-[12px] font-black text-[#061524] hover:bg-[#e3a936] disabled:cursor-not-allowed disabled:opacity-40";
const secondary =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#081b2e] px-4 py-2 text-[12px] font-black text-[#c8dff0] hover:border-[#f6b84b] disabled:cursor-not-allowed disabled:opacity-40";

function fmt(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function money(value: unknown) {
  const number = Number(value || 0);
  return `${number.toLocaleString()} MMK`;
}

function merchantCodeFromOperationalId(value?: string | null) {
  const parts = String(value || "")
    .trim()
    .toUpperCase()
    .split("-")
    .filter(Boolean);

  return parts.length >= 3
    ? parts.slice(1, -1).join("-")
    : "";
}

function pickupDisplay(row?: SyncRow) {
  return row?.pickup_lineage_status === "LEGACY_PARENT_UNAVAILABLE"
    ? "LEGACY PARENT UNAVAILABLE"
    : row?.pickup_id || "—";
}

function statusTone(value?: string | null) {
  const v = String(value || "MISSING").toUpperCase();
  if (["CERTIFIED", "CLOSED", "SETTLED", "DELIVERED", "COMPLETED", "SCANNED", "READY", "WAREHOUSE_READY", "DISPATCHED"].includes(v)) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  if (["READY_TO_CERTIFY", "NOT_REQUIRED", "COMPLETED_WITH_EXCEPTIONS"].includes(v)) {
    return "border-cyan-500/30 bg-cyan-500/10 text-cyan-300";
  }
  if (["VARIANCE", "FAILED", "RTO", "ON_HOLD", "ESCALATED", "WAREHOUSE_EXCEPTION"].includes(v)) {
    return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  }
  return "border-amber-500/30 bg-amber-500/10 text-amber-300";
}

function StatusBadge({ value }: { value?: string | null }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black ${statusTone(value)}`}>
      {value || "MISSING"}
    </span>
  );
}

function Metric({ label, value, tone = "text-[#eef8ff]" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-2xl border border-[#1a3a5c] bg-[#081b2e] p-4">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7fa7c5]">{label}</div>
      <div className={`mt-2 text-2xl font-black ${tone}`}>{Number(value || 0).toLocaleString()}</div>
    </div>
  );
}

export default function FinalSynchronizationV50() {
  const [snapshot, setSnapshot] = useState<Snapshot>({});
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [selectedVarianceId, setSelectedVarianceId] = useState<number | null>(null);
  const [owner, setOwner] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load(nextFilter = filter) {
    setBusy(true);
    setError("");
    try {
      const { data, error } = await (supabase as any).rpc("be_final_sync_snapshot_v54", {
        p_filter: nextFilter,
        p_limit: 1000,
      });
      if (error) throw error;
      const next = (data || {}) as Snapshot;
      setSnapshot(next);
      const rows = next.rows || [];
      if (!rows.some((row) => row.delivery_way_id === selectedId)) {
        setSelectedId(rows[0]?.delivery_way_id || "");
        setSelectedVarianceId(rows[0]?.open_variances?.[0]?.id ?? null);
      }
    } catch (e: any) {
      setError(e?.message || "Unable to load the V50 final synchronization snapshot.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshCanonical(scope?: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { data, error } = await (supabase as any).rpc("be_final_sync_refresh_v50", {
        p_scope: scope || null,
      });
      if (error) throw error;
      setMessage(
        `Canonical refresh completed: ${Number(data?.rows_refreshed || 0)} row(s), ${Number(
          data?.variances_opened || 0,
        )} variance(s) opened, ${Number(data?.variances_resolved || 0)} cleared.`,
      );
      await load(filter);
    } catch (e: any) {
      setError(e?.message || "Canonical refresh failed.");
      setBusy(false);
    }
  }

  useEffect(() => {
    void load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const rows = snapshot.rows || [];
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [
        row.delivery_way_id,
        row.wayplan_id,
        row.pickup_id,
        row.route_zone,
        row.check_status,
        ...(row.issue_codes || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  const selected = rows.find((row) => row.delivery_way_id === selectedId) || visibleRows[0];
  const selectedVariance = selected?.open_variances?.find((item) => item.id === selectedVarianceId) || selected?.open_variances?.[0];
  const selectedWayMerchantCode =
    merchantCodeFromOperationalId(selected?.delivery_way_id);

  const selectedPickupMerchantCode =
    merchantCodeFromOperationalId(selected?.pickup_id);

  const selectedMerchantCodeInvalid =
    Boolean(selected) &&
    (
      selected?.pickup_lineage_status === "LEGACY_PARENT_UNAVAILABLE" ||
      !selectedWayMerchantCode ||
      !selectedPickupMerchantCode ||
      selectedWayMerchantCode !== selectedPickupMerchantCode
    );

  const summary = snapshot.summary || {};

  const dispatchScannedCount = rows.filter((row) => {
    const status = String(row.dispatch_scan_status || "")
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "_");

    return [
      "SCANNED",
      "DISPATCH_SCANNED",
      "DISPATCHED",
      "PUBLISHED",
      "OUT_FOR_DELIVERY",
    ].includes(status);
  }).length;

  async function assignVariance() {
    if (!selectedVariance) return setError("Select an open variance first.");
    if (!owner.trim()) return setError("Enter the responsible owner or department.");
    setBusy(true);
    setError("");
    try {
      const { error } = await (supabase as any).rpc("be_final_sync_assign_variance_v50", {
        p_variance_id: selectedVariance.id,
        p_owner: owner.trim(),
        p_note: note.trim() || null,
        p_actor: actor(),
      });
      if (error) throw error;
      setMessage(`Variance ${selectedVariance.issue_code} assigned to ${owner.trim()}.`);
      await load(filter);
    } catch (e: any) {
      setError(e?.message || "Unable to assign the variance.");
      setBusy(false);
    }
  }

  async function resolveVariance() {
    if (!selectedVariance) return setError("Select an open variance first.");
    if (!note.trim()) return setError("Enter the correction or resolution note.");
    setBusy(true);
    setError("");
    try {
      const { error } = await (supabase as any).rpc("be_final_sync_resolve_variance_v50", {
        p_variance_id: selectedVariance.id,
        p_resolution: note.trim(),
        p_actor: actor(),
      });
      if (error) throw error;
      setMessage(`Variance ${selectedVariance.issue_code} was rechecked against canonical data.`);
      setNote("");
      await load(filter);
    } catch (e: any) {
      setError(e?.message || "Unable to resolve the variance.");
      setBusy(false);
    }
  }

  async function certifySelected() {
    if (!selected) return;

    if (selectedMerchantCodeInvalid) {
      return setError(
        "Merchant lineage mismatch: Way ID merchant " +
          (selectedWayMerchantCode || "MISSING") +
          " does not match Pickup ID merchant " +
          (selectedPickupMerchantCode || "MISSING") +
          ".",
      );
    }
    setBusy(true);
    setError("");
    try {
      const { error } = await (supabase as any).rpc("be_final_sync_certify_v50", {
        p_delivery_way_id: selected.delivery_way_id,
        p_note: note.trim() || "All departmental modules agree with the canonical record.",
        p_actor: actor(),
      });
      if (error) throw error;
      setMessage(`${selected.delivery_way_id} is certified for controlled reporting.`);
      setNote("");
      await load(filter);
    } catch (e: any) {
      setError(e?.message || "Unable to certify the selected Way ID.");
      setBusy(false);
    }
  }

  function exportCsv() {
    const headers = [
      "Way ID",
      "Wayplan",
      "Pickup",
      "Route",
      "Warehouse",
      "Dispatch Scan",
      "Review",
      "Route Status",
      "Rider Run",
      "Delivery",
      "Finance",
      "Customer Closure",
      "Final Sync",
      "Issues",
      "Expected COD",
      "Certified By",
      "Certified At",
    ];
    const csvRows = visibleRows.map((row) => [
      row.delivery_way_id,
      row.wayplan_id,
      row.pickup_lineage_status === "LEGACY_PARENT_UNAVAILABLE" ? "" : row.pickup_id || "",
      row.route_zone || "",
      row.warehouse_status || "",
      row.dispatch_scan_status || "",
      row.review_status || "",
      row.route_status || "",
      row.rider_run_status || "",
      row.delivery_status || "",
      row.finance_status || "",
      row.cs_status || "",
      row.check_status,
      (row.issue_codes || []).join(" | "),
      Number(row.expected_cod || 0),
      row.certified_by || "",
      row.certified_at || "",
    ]);
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const blob = new Blob([[headers, ...csvRows].map((line) => line.map(escape).join(",")).join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `britium-final-sync-v50-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(href);
  }

  return (
    <section className={`${shell} overflow-hidden`} data-build={FINAL_SYNCHRONIZATION_V50_BUILD}>
      <div className="border-b border-[#1a3a5c] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-black uppercase tracking-[0.22em] text-[#f6b84b]">
                Step 13 · Final Synchronization V50
              </span>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[9px] font-black text-emerald-300">
                CANONICAL RECONCILIATION ACTIVE
              </span>
            </div>
            <h2 className="mt-2 text-2xl font-black text-[#eef8ff]">Department-to-Department Final Sync</h2>
            <p className="mt-2 max-w-5xl text-[12px] leading-6 text-[#8fb4d0]">
              Refresh the canonical record, compare Warehouse, Wayplan, Dispatch, Rider delivery, Finance COD, and Customer Service closure, then certify only rows with no unresolved variance. Certified rows are the controlled source for V51 reporting.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={secondary} disabled={busy} onClick={() => void load(filter)}>
              <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Reload
            </button>
            <button className={primary} disabled={busy} onClick={() => void refreshCanonical()}>
              <ShieldCheck size={14} /> Refresh Canonical Data
            </button>
            <button className={secondary} disabled={!visibleRows.length} onClick={exportCsv}>
              <Download size={14} /> Export Sync CSV
            </button>
          </div>
        </div>

        {message && <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-[12px] font-bold text-emerald-300">{message}</div>}
        {error && <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-[12px] font-bold text-rose-300">{error}</div>}
      </div>

      <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4 xl:grid-cols-8">
        <Metric label="Rows" value={summary.rows || 0} />
        <Metric label="Variance" value={summary.variance || 0} tone="text-rose-300" />
        <Metric label="Open Issues" value={summary.open_variances || 0} tone="text-amber-300" />
        <Metric label="Dispatch Scanned" value={dispatchScannedCount} tone="text-emerald-300" />
        <Metric label="Ready to Certify" value={summary.ready_to_certify || 0} tone="text-cyan-300" />
        <Metric label="Certified" value={summary.certified || 0} tone="text-emerald-300" />
        <Metric label="Stale Certs" value={summary.stale_certifications || 0} tone="text-rose-300" />
        <div className="rounded-2xl border border-[#1a3a5c] bg-[#081b2e] p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7fa7c5]">Expected COD</div>
          <div className="mt-2 text-lg font-black text-[#f6b84b]">{money(summary.expected_cod || 0)}</div>
        </div>
      </div>

      <div className="grid gap-4 border-t border-[#1a3a5c] p-5 xl:grid-cols-[1.55fr_0.85fr]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {["ALL", "VARIANCE", "READY_TO_CERTIFY", "CERTIFIED"].map((item) => (
                <button
                  key={item}
                  onClick={() => setFilter(item)}
                  className={`rounded-xl border px-3 py-2 text-[10px] font-black ${
                    filter === item
                      ? "border-[#f6b84b] bg-[#f6b84b] text-[#061524]"
                      : "border-[#1a3a5c] bg-[#081b2e] text-[#8fb4d0]"
                  }`}
                >
                  {item.replaceAll("_", " ")}
                </button>
              ))}
            </div>
            <div className="relative w-full md:w-80">
              <Search size={14} className="absolute left-3 top-3 text-[#4d7a9b]" />
              <input
                className={`${input} pl-9`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search Way ID, Wayplan, Pickup, issue..."
              />
            </div>
          </div>

          <div className="max-h-[620px] overflow-auto rounded-2xl border border-[#1a3a5c]">
            <table className="w-full min-w-[1250px] text-left text-[11px]">
              <thead className="sticky top-0 z-10 bg-[#081b2e] text-[#7fa7c5]">
                <tr>
                  <th className="p-3">Way ID</th>
                  <th className="p-3">Wayplan / Pickup</th>
                  <th className="p-3">Warehouse</th>
                  <th className="p-3">Dispatch</th>
                  <th className="p-3">Delivery</th>
                  <th className="p-3">Finance</th>
                  <th className="p-3">CS Closure</th>
                  <th className="p-3">Final Sync</th>
                  <th className="p-3 text-right">Issues</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr
                    key={`${row.wayplan_id}-${row.delivery_way_id}`}
                    onClick={() => {
                      setSelectedId(row.delivery_way_id);
                      setSelectedVarianceId(row.open_variances?.[0]?.id ?? null);
                    }}
                    className={`cursor-pointer border-t border-[#12304d] hover:bg-[#102a43] ${selected?.delivery_way_id === row.delivery_way_id ? "bg-[#102a43]" : ""}`}
                  >
                    <td className="p-3 font-black text-[#f6b84b]">{row.delivery_way_id}</td>
                    <td className="p-3">
                      <div className="font-bold text-[#eef8ff]">{row.wayplan_id}</div>
                      <div className="mt-1 text-[#6f98b8]">{pickupDisplay(row)} · {row.route_zone || "—"}</div>
                    </td>
                    <td className="p-3"><StatusBadge value={row.warehouse_status} /></td>
                    <td className="p-3"><StatusBadge value={row.dispatch_scan_status} /></td>
                    <td className="p-3"><StatusBadge value={row.delivery_status} /></td>
                    <td className="p-3"><StatusBadge value={row.finance_status} /></td>
                    <td className="p-3"><StatusBadge value={row.cs_status} /></td>
                    <td className="p-3"><StatusBadge value={row.check_status} /></td>
                    <td className="p-3 text-right font-black text-amber-300">{row.open_variance_count || 0}</td>
                  </tr>
                ))}
                {!visibleRows.length && (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-[#7fa7c5]">
                      <ClipboardCheck className="mx-auto mb-3 opacity-40" />
                      No final synchronization rows yet. Complete Rider outcomes, Finance clearance, and Customer Service closure, then refresh canonical data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-2xl border border-[#1a3a5c] bg-[#081b2e] p-4">
          {!selected ? (
            <div className="py-20 text-center text-[#6f98b8]">
              <UserRoundCheck className="mx-auto mb-3 opacity-40" />
              Select a row to inspect and reconcile it.
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#7fa7c5]">Selected canonical record</div>
                <div className="mt-2 text-xl font-black text-[#f6b84b]">{selected.delivery_way_id}</div>
                <div className="mt-1 text-[11px] text-[#8fb4d0]">{selected.wayplan_id} · {pickupDisplay(selected)}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px]">
                {[
                  ["Membership", selected.membership_status],
                  ["Review", selected.review_status],
                  ["Mapbox Route", selected.route_status],
                  ["Rider Run", selected.rider_run_status],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-[#1a3a5c] p-3">
                    <div className="mb-2 text-[#6f98b8]">{label}</div>
                    <StatusBadge value={value} />
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-[#1a3a5c] p-3 text-[11px] text-[#8fb4d0]">
                <div className="flex justify-between"><span>Expected COD</span><strong className="text-[#f6b84b]">{money(selected.expected_cod)}</strong></div>
                <div className="mt-2 flex justify-between"><span>Last refreshed</span><strong className="text-[#d8ecfa]">{fmt(selected.last_refreshed_at)}</strong></div>
                <div className="mt-2 flex justify-between"><span>Certified at</span><strong className="text-[#d8ecfa]">{fmt(selected.certified_at)}</strong></div>
                {selected.certification_stale && <div className="mt-3 rounded-lg bg-rose-500/10 p-2 font-bold text-rose-300">Certification is stale because canonical data changed.</div>}
              </div>

              <div>
                <div className="mb-2 flex items-center gap-2 text-[11px] font-black text-[#eef8ff]">
                  <AlertTriangle size={14} /> Open Variances
                </div>
                <div className="max-h-48 space-y-2 overflow-auto">
                  {(selected.open_variances || []).map((variance) => (
                    <button
                      key={variance.id}
                      onClick={() => setSelectedVarianceId(variance.id)}
                      className={`w-full rounded-xl border p-3 text-left ${selectedVariance?.id === variance.id ? "border-[#f6b84b] bg-[#102a43]" : "border-[#1a3a5c] bg-[#0b2236]"}`}
                    >
                      <div className="text-[10px] font-black text-rose-300">{variance.issue_code}</div>
                      <div className="mt-1 text-[11px] text-[#d8ecfa]">{variance.issue_summary}</div>
                      <div className="mt-2 text-[10px] text-[#6f98b8]">{variance.variance_status} · Owner: {variance.owner || "Unassigned"}</div>
                    </button>
                  ))}
                  {!selected.open_variances?.length && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-[11px] font-bold text-emerald-300">
                      <CheckCircle2 size={14} className="mr-2 inline" /> No open variance.
                    </div>
                  )}
                </div>
              </div>

              <input className={input} value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="Variance owner / department" />
              <textarea className={`${input} min-h-24 resize-y`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Correction, resolution, or certification note" />

              <div className="grid grid-cols-2 gap-2">
                <button className={secondary} disabled={busy || !selectedVariance} onClick={() => void assignVariance()}>
                  <UserRoundCheck size={14} /> Assign
                </button>
                <button className={secondary} disabled={busy || !selectedVariance} onClick={() => void resolveVariance()}>
                  <CheckCircle2 size={14} /> Recheck & Resolve
                </button>
                <button className={secondary} disabled={busy} onClick={() => void refreshCanonical(selected.delivery_way_id)}>
                  <RefreshCw size={14} /> Refresh Selected
                </button>
                <button
                  className={primary}
                  disabled={busy || selected.check_status !== "READY_TO_CERTIFY" || Boolean(selected.open_variance_count) || selectedMerchantCodeInvalid}
                  onClick={() => void certifySelected()}
                >
                  <BadgeCheck size={14} /> Certify
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
