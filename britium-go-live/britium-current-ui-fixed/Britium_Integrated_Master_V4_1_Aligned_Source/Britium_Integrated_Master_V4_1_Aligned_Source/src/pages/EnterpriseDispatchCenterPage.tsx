// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Truck,
  Route,
  PackageCheck,
  Users,
  Bell,
  Search,
  CheckCircle2,
  Send,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";

function pick(row: any, keys: string[], fallback = "—") {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value);
  }
  return fallback;
}

function statusClass(value: any) {
  const s = String(value || "").toLowerCase();
  if (s.includes("deliver") || s.includes("loaded") || s.includes("ready")) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (s.includes("waiting") || s.includes("pending") || s.includes("hold")) return "border-amber-200 bg-amber-50 text-amber-700";
  if (s.includes("cancel") || s.includes("fail") || s.includes("return")) return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

export default function EnterpriseDispatchCenterPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<any>({});
  const [pickups, setPickups] = useState<any[]>([]);
  const [wayplans, setWayplans] = useState<any[]>([]);
  const [stops, setStops] = useState<any[]>([]);
  const [workforce, setWorkforce] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [allocationSummary, setAllocationSummary] = useState<any>({});

  async function actorEmail() {
    try {
      const { data } = await supabase.auth.getUser();
      return data?.user?.email || "dispatch@britiumexpress.com";
    } catch {
      return "dispatch@britiumexpress.com";
    }
  }

  async function loadData() {
    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase.rpc("be_enterprise_dispatch_center", {
        p_limit: 300,
      });

      if (error) throw error;

      setSummary(data?.summary || {});
      setPickups(Array.isArray(data?.pickups) ? data.pickups : []);
      setWayplans(Array.isArray(data?.wayplans) ? data.wayplans : []);
      setStops(Array.isArray(data?.stops) ? data.stops : []);
      setWorkforce(Array.isArray(data?.workforce) ? data.workforce : []);
    } catch (e: any) {
      setMessage(e?.message || "Unable to load Enterprise Dispatch Center.");
    } finally {
      setLoading(false);
    }
  }


  async function loadAllocationRecommendations() {
    try {
      const { data, error } = await supabase.rpc("be_enterprise_dispatch_capacity_recommend", {
        p_limit: 300,
      });

      if (error) throw error;

      setRecommendations(Array.isArray(data?.recommendations) ? data.recommendations : []);
      setAllocationSummary(data?.summary || {});
    } catch (e: any) {
      setMessage(e?.message || "Unable to load allocation recommendations.");
    }
  }

  async function applyAllocation(row: any) {
    setSaving(true);
    setMessage("");

    try {
      const email = await actorEmail();

      const { data, error } = await supabase.rpc("be_enterprise_dispatch_allocation_apply", {
        p_payload: {
          ...row,
          actor_email: email,
        },
      });

      if (error) throw error;

      setMessage(`Allocation applied to ${data?.target_id}. Updated rows: ${data?.updated_rows ?? 0}`);
      await loadData();
      await loadAllocationRecommendations();
    } catch (e: any) {
      setMessage(e?.message || "Unable to apply allocation.");
    } finally {
      setSaving(false);
    }
  }


  useEffect(() => {
    void loadData();
    void loadAllocationRecommendations();
  }, []);

  const filteredStops = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return stops;
    return stops.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  }, [stops, query]);

  async function dispatchAction(row: any, action: string) {
    setSaving(true);
    setMessage("");

    try {
      const email = await actorEmail();
      const { data, error } = await supabase.rpc("be_enterprise_dispatch_action", {
        p_payload: {
          action,
          delivery_way_id: pick(row, ["delivery_way_id"], ""),
          waybill_no: pick(row, ["waybill_no"], ""),
          tracking_no: pick(row, ["tracking_no"], ""),
          actor_email: email,
        },
      });

      if (error) throw error;

      setMessage(`${action} completed. Updated rows: ${data?.updated_rows ?? 0}`);
      await loadData();
    } catch (e: any) {
      setMessage(e?.message || "Dispatch action failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center rounded-[32px] border border-slate-200 bg-white p-10 shadow-sm">
        <div className="inline-flex items-center gap-3 text-sm font-semibold text-slate-600">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading Enterprise Dispatch Center...
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
              <Truck className="h-4 w-4 text-[#0d2c54]" />
              <span className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">
                Dispatch Command
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-[#0d2c54] md:text-5xl">
              Enterprise Dispatch Center
            </h1>
            <p className="mt-4 max-w-4xl text-sm font-medium leading-6 text-slate-500 md:text-[15px]">
              Pickup readiness, wayplans, dispatch stops, workforce availability, and dispatch execution actions in one enterprise screen.
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
        <Metric title="Pickups" value={summary.pickups ?? pickups.length} icon={<PackageCheck className="h-5 w-5" />} />
        <Metric title="Waiting" value={summary.waiting_assignment ?? 0} icon={<Bell className="h-5 w-5" />} />
        <Metric title="Wayplans" value={summary.wayplans ?? wayplans.length} icon={<Route className="h-5 w-5" />} />
        <Metric title="Stops" value={summary.dispatch_stops ?? stops.length} icon={<Truck className="h-5 w-5" />} />
        <Metric title="Loaded" value={summary.loaded_to_vehicle ?? 0} icon={<CheckCircle2 className="h-5 w-5" />} />
        <Metric title="Workforce" value={summary.workforce_accounts ?? workforce.length} icon={<Users className="h-5 w-5" />} />
      </section>


      <section className="grid gap-4 md:grid-cols-3">
        <Metric title="Capacity Capacity Allocation Recommendations" value={allocationSummary.recommendations ?? recommendations.length} icon={<Users className="h-5 w-5" />} />
        <Metric title="Available Workforce" value={allocationSummary.available_workforce ?? 0} icon={<Users className="h-5 w-5" />} />
        <Metric title="Unassigned" value={allocationSummary.unassigned_recommendations ?? 0} icon={<Bell className="h-5 w-5" />} />
      </section>

      <section className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <div className="mb-5 border-b border-slate-200/80 pb-5">
          <div className="text-lg font-black tracking-tight text-[#0d2c54]">Capacity Capacity Allocation Recommendations</div>
          <div className="mt-2 text-sm text-slate-500">
            Capacity-aware matching by branch, workload, COD, weight, township, and workforce capacity.
          </div>
        </div>

        <div className="max-h-[52vh] overflow-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                <th className="px-3 py-3">Delivery</th>
                <th className="px-3 py-3">Branch / Township</th>
                <th className="px-3 py-3">Recommended Assignee</th>
                <th className="px-3 py-3">Confidence</th>
                <th className="px-3 py-3">Reason</th>
                <th className="px-3 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {recommendations.map((row, idx) => (
                <tr key={`${row.target_id}-${idx}`} className="border-b border-slate-100">
                  <td className="px-3 py-3">
                    <div className="font-black text-slate-900">{pick(row, ["delivery_way_id", "target_id"], "—")}</div>
                    <div className="text-xs text-slate-500">{pick(row, ["waybill_no", "tracking_no"], "—")}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div>{pick(row, ["branch_code"], "YGN")}</div>
                    <div className="text-xs text-slate-500">{pick(row, ["township"], "UNKNOWN")}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-semibold">{pick(row, ["recommended_assignee_name"], "No assignee")}</div>
                    <div className="text-xs text-slate-500">{pick(row, ["recommended_assignee_email"], "—")}</div>
                  </td>
                  <td className="px-3 py-3 font-black text-[#0d2c54]">{pick(row, ["confidence_score"], "0")}%</td>
                  <td className="px-3 py-3 text-slate-500">{pick(row, ["recommendation_reason"], "—")}</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      disabled={saving || !row.recommended_assignee_email}
                      onClick={() => void applyAllocation(row)}
                      className="rounded-xl bg-[#0d2c54] px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                    >
                      Apply
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!recommendations.length ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500">
              No allocation recommendations available.
            </div>
          ) : null}
        </div>
      </section>


      <section className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <div className="mb-5 flex flex-col gap-3 border-b border-slate-200/80 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-lg font-black tracking-tight text-[#0d2c54]">Dispatch Stops</div>
            <div className="mt-2 text-sm text-slate-500">
              Execute warehouse-to-dispatch actions and track readiness.
            </div>
          </div>

          <div className="flex h-12 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search delivery, waybill, tracking..."
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                <th className="px-3 py-3">Delivery</th>
                <th className="px-3 py-3">Waybill / Tracking</th>
                <th className="px-3 py-3">Pickup</th>
                <th className="px-3 py-3">Rider</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStops.map((row, idx) => {
                const status = pick(row, ["stop_status", "warehouse_status", "dispatch_status"], "PENDING");
                return (
                  <tr key={row.id || `${row.delivery_way_id}-${idx}`} className="border-b border-slate-100">
                    <td className="px-3 py-3 font-black text-slate-900">{pick(row, ["delivery_way_id"], "—")}</td>
                    <td className="px-3 py-3">
                      <div>{pick(row, ["waybill_no"], "—")}</div>
                      <div className="text-xs text-slate-500">{pick(row, ["tracking_no"], "—")}</div>
                    </td>
                    <td className="px-3 py-3">{pick(row, ["pickup_id", "pickup_way_id"], "—")}</td>
                    <td className="px-3 py-3">{pick(row, ["rider_name", "rider_code", "assigned_to"], "—")}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase ${statusClass(status)}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button disabled={saving} onClick={() => void dispatchAction(row, "MARK_READY")} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">Ready</button>
                        <button disabled={saving} onClick={() => void dispatchAction(row, "LOAD_TO_VEHICLE")} className="rounded-xl bg-[#0d2c54] px-3 py-2 text-xs font-black text-white">Load</button>
                        <button disabled={saving} onClick={() => void dispatchAction(row, "HANDOVER_TO_RIDER")} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
                          <Send className="inline h-3 w-3" /> Handover
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!filteredStops.length ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500">
              No dispatch stops found.
            </div>
          ) : null}
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
