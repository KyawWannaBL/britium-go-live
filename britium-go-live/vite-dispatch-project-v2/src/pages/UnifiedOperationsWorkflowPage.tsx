
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Truck, Route, PackageCheck, Activity, AlertTriangle, Search } from "lucide-react";

type Wayplan = {
  wayplan_code?: string;
  wayplan_no?: string;
  wayplan_id?: string;
  waybill_no?: string;
  pickup_id?: string;
  merchant_code?: string;
  merchant_name?: string;
  route_name?: string;
  driver_email?: string;
  helper_email?: string;
  rider_email?: string;
  vehicle_id?: string;
  parcel_count?: number;
  total_parcels?: number;
  total_cod_amount?: number;
  status?: string;
  wayplan_status?: string;
  dispatch_status?: string;
  updated_at?: string;
};

type Item = {
  wayplan_code?: string;
  tracking_no?: string;
  waybill_no?: string;
  pickup_id?: string;
  delivery_way_id?: string;
  parcel_sequence?: number;
  recipient_name?: string;
  phone_number?: string;
  recipient_address?: string;
  delivery_township?: string;
  remarks?: string;
  delivery_status?: string;
  wayplan_status?: string;
  dispatch_status?: string;
};

type Snapshot = {
  ok?: boolean;
  stats?: Record<string, number>;
  ready_queue?: any[];
  wayplans?: Wayplan[];
  dispatch_ready?: Wayplan[];
  items?: Item[];
};

const cardClass = "rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4 shadow-sm";
const labelClass = "text-[11px] uppercase tracking-widest text-[#7fa7c5] font-black";
const valueClass = "mt-2 text-2xl font-black text-[#eef8ff]";
const buttonClass = "inline-flex items-center gap-2 rounded-xl bg-[#f6b84b] px-4 py-2 text-[12px] font-black uppercase tracking-wider text-[#061524] hover:bg-[#e5a93a] disabled:opacity-50";
const softButtonClass = "inline-flex items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#081b2e] px-4 py-2 text-[12px] font-bold text-[#c8dff0] hover:border-[#f6b84b]";

function statusBadge(status?: string) {
  const s = status || "-";
  const cls = s.includes("READY") || s.includes("ASSIGNED")
    ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
    : s.includes("OUT") || s.includes("DISPATCH")
      ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
      : s.includes("FAIL")
        ? "bg-rose-500/10 text-rose-300 border-rose-500/30"
        : "bg-slate-500/10 text-slate-300 border-slate-500/30";
  return <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${cls}`}>{s}</span>;
}

export default function UnifiedOperationsWorkflowPage() {
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot>({});
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const { data, error } = await supabase.rpc("be_unified_ops_workflow_snapshot");
      if (error) throw error;
      setSnapshot((data || {}) as Snapshot);
    } catch (e: any) {
      setError(e?.message || "Failed to load operational workflow snapshot.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    const timer = window.setInterval(loadData, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const stats = snapshot.stats || {};
  const wayplans = snapshot.wayplans || [];
  const items = snapshot.items || [];

  const filteredWayplans = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return wayplans;
    return wayplans.filter((w) =>
      [
        w.wayplan_code,
        w.wayplan_no,
        w.waybill_no,
        w.pickup_id,
        w.merchant_code,
        w.merchant_name,
        w.driver_email,
        w.route_name,
        w.dispatch_status,
        w.wayplan_status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [wayplans, search]);

  return (
    <div className="space-y-5 text-[#c8dff0]">
      <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-[#f6b84b]">
              Britium Operational Workflow
            </p>
            <h1 className="mt-2 text-2xl font-black text-[#eef8ff]">Unified Dispatch / Ops Command</h1>
            <p className="mt-2 max-w-4xl text-[13px] leading-6 text-[#8fb4d0]">
              This page is the single backend-synchronized source for Dispatch, Dispatch Center,
              Live Dispatch, Delivery Dispatch, Delivery Workflow, Ops Command, Ops Manager, and Executive Ops.
              It reads from <span className="font-bold text-[#eef8ff]">be_unified_ops_workflow_snapshot()</span>.
            </p>
          </div>
          <button onClick={loadData} disabled={loading} className={buttonClass}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh Sync
          </button>
        </div>
        {error && (
          <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-300">
            {error}
          </div>
        )}
      </section>

      <section className="grid grid-cols-6 gap-4">
        <div className={cardClass}>
          <div className={labelClass}>Ready Wayplan Rows</div>
          <div className={valueClass}>{stats.ready_wayplan_rows || 0}</div>
        </div>
        <div className={cardClass}>
          <div className={labelClass}>Wayplans</div>
          <div className={valueClass}>{stats.wayplan_headers || 0}</div>
        </div>
        <div className={cardClass}>
          <div className={labelClass}>Wayplan Items</div>
          <div className={valueClass}>{stats.wayplan_items || 0}</div>
        </div>
        <div className={cardClass}>
          <div className={labelClass}>Dispatch Ready</div>
          <div className={valueClass}>{stats.dispatch_ready_wayplans || 0}</div>
        </div>
        <div className={cardClass}>
          <div className={labelClass}>Out For Delivery</div>
          <div className={valueClass}>{stats.out_for_delivery_wayplans || 0}</div>
        </div>
        <div className={cardClass}>
          <div className={labelClass}>Completed / Failed</div>
          <div className={valueClass}>{stats.completed_items || 0} / {stats.failed_items || 0}</div>
        </div>
      </section>

      <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236]">
        <div className="flex items-center justify-between border-b border-[#1a3a5c] p-4">
          <div>
            <h2 className="font-black text-[#eef8ff]">Synchronized Wayplans</h2>
            <p className="text-[12px] text-[#7fa7c5]">Shown in every old Dispatch/Ops screen through one shared backend API.</p>
          </div>
          <div className="relative w-96">
            <Search size={14} className="absolute left-3 top-3 text-[#4d7a9b]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search wayplan, waybill, pickup, driver..."
              className="w-full rounded-xl border border-[#1a3a5c] bg-[#081b2e] py-2 pl-9 pr-3 text-[13px] text-white outline-none focus:border-[#f6b84b]"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-[12px]">
            <thead className="bg-[#081b2e] text-[#7fa7c5]">
              <tr>
                <th className="p-3">Wayplan</th>
                <th className="p-3">Waybill</th>
                <th className="p-3">Pickup</th>
                <th className="p-3">Route</th>
                <th className="p-3">Driver</th>
                <th className="p-3 text-right">Parcels</th>
                <th className="p-3 text-right">COD</th>
                <th className="p-3">Wayplan Status</th>
                <th className="p-3">Dispatch Status</th>
                <th className="p-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filteredWayplans.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-[#7fa7c5]">
                    <PackageCheck className="mx-auto mb-3 opacity-40" />
                    No synchronized operational records found. Complete Data Entry → Warehouse Receive → Wayplan Create first.
                  </td>
                </tr>
              ) : (
                filteredWayplans.map((w, idx) => (
                  <tr key={`${w.wayplan_code || idx}-${idx}`} className="border-t border-[#12304d] hover:bg-[#0f243b]">
                    <td className="p-3 font-black text-[#f6b84b]">{w.wayplan_code || w.wayplan_no || "-"}</td>
                    <td className="p-3 text-[#d8ecfa]">{w.waybill_no || "-"}</td>
                    <td className="p-3">{w.pickup_id || "-"}</td>
                    <td className="p-3">{w.route_name || "-"}</td>
                    <td className="p-3">{w.driver_email || "-"}</td>
                    <td className="p-3 text-right font-black">{w.parcel_count || w.total_parcels || 0}</td>
                    <td className="p-3 text-right">{Number(w.total_cod_amount || 0).toLocaleString()} MMK</td>
                    <td className="p-3">{statusBadge(w.wayplan_status)}</td>
                    <td className="p-3">{statusBadge(w.dispatch_status)}</td>
                    <td className="p-3 text-[#7fa7c5]">{w.updated_at ? new Date(w.updated_at).toLocaleString() : "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4">
        <div className={cardClass}>
          <div className="mb-3 flex items-center gap-2 font-black text-[#eef8ff]">
            <Truck size={16} /> Dispatch Child Rows
          </div>
          <p className="text-[13px] text-[#8fb4d0]">
            Total parcel-level rows available to Dispatch / Live Dispatch / Delivery Workflow:
            <span className="ml-2 font-black text-[#f6b84b]">{items.length}</span>
          </p>
        </div>
        <div className={cardClass}>
          <div className="mb-3 flex items-center gap-2 font-black text-[#eef8ff]">
            <Route size={16} /> Workflow Source
          </div>
          <p className="text-[13px] text-[#8fb4d0]">
            Old pages are redirected here so they cannot read stale mock/local tables anymore.
          </p>
        </div>
      </section>
    </div>
  );
}
