// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Loader2, RefreshCw, Search } from "lucide-react";

const fmt = (v: any) =>
  v ? new Date(v).toLocaleString("en-GB", { timeZone: "Asia/Yangon" }) : "-";

export default function ExceptionsPage() {
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<any>({ stats: {}, events: [] });
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData?.user?.email || null;

      const { data, error } = await supabase.rpc("be_exception_screen_snapshot", {
        p_actor_email: email,
        p_merchant_code: null,
      });

      if (error) throw error;
      setSnapshot(data || { stats: {}, events: [] });
    } catch (e: any) {
      setMessage(e.message || "Failed to load exceptions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const events = snapshot.events || [];
  const stats = snapshot.stats || {};

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e: any) =>
      [
        e.tracking_no,
        e.delivery_way_id,
        e.waybill_no,
        e.pickup_id,
        e.recipient_name,
        e.recipient_phone,
        e.township,
        e.exception_code,
        e.reason_name_en,
        e.reason_name_mm,
        e.customer_message_en,
        e.customer_message_mm,
        e.merchant_code,
        e.merchant_name,
      ].some((x) => String(x || "").toLowerCase().includes(q))
    );
  }, [events, query]);

  if (loading && !events.length) {
    return (
      <div className="min-h-screen bg-[#07111e] p-8 text-slate-300">
        <Loader2 className="mr-2 inline h-5 w-5 animate-spin" />
        Loading exceptions...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07111e] p-6 text-slate-100">
      <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="text-amber-400" />
          <div>
            <div className="font-bold tracking-[0.12em] text-amber-400">EXCEPTION BOARD</div>
            <div className="text-sm text-slate-400">
              Warehouse return reasons, priority reattempts, RTO, and merchant-filtered notifications.
            </div>
          </div>
        </div>

        <button
          onClick={loadAll}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-500"
        >
          <RefreshCw className="mr-1 inline h-4 w-4" />
          Refresh
        </button>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-rose-700 bg-rose-950/30 p-3 text-sm text-rose-200">
          {message}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Open Exceptions", stats.open],
          ["Priority Next Wayplan", stats.priority],
          ["RTO", stats.rto],
          ["Displayed Rows", filtered.length],
        ].map(([k, v]: any) => (
          <div key={k} className="rounded-xl border border-slate-800 bg-[#0B2133] p-3">
            <div className="text-xl font-bold text-amber-300">{v ?? 0}</div>
            <div className="text-xs uppercase text-slate-400">{k}</div>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-slate-800 bg-[#0B2133]">
        <div className="flex flex-col gap-3 border-b border-slate-800 p-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-semibold">Exception Way List</div>
            <div className="text-xs text-slate-400">
              Admin/staff can see all. Merchant accounts are filtered by merchant email/code in the backend RPC.
            </div>
          </div>
          <div className="relative w-full md:w-[420px]">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tracking / merchant / reason..."
              className="w-full rounded-lg border border-slate-700 bg-[#071827] py-2 pl-9 pr-3 outline-none focus:border-amber-400"
            />
          </div>
        </div>

        <div className="max-h-[72vh] overflow-auto">
          <table className="w-full min-w-[1600px] text-sm">
            <thead className="sticky top-0 z-10 bg-[#0B2133] text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="p-2">Created</th>
                <th className="p-2">Tracking</th>
                <th className="p-2">Waybill</th>
                <th className="p-2">Merchant</th>
                <th className="p-2">Recipient</th>
                <th className="p-2">Township</th>
                <th className="p-2">Attempt</th>
                <th className="p-2">Reason</th>
                <th className="p-2">Customer Notification</th>
                <th className="p-2">Next Action</th>
                <th className="p-2">RTO</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((e: any) => (
                <tr key={e.id || `${e.tracking_no}-${e.created_at}`} className="border-t border-slate-800 align-top hover:bg-slate-900/40">
                  <td className="p-2 min-w-[150px]">{fmt(e.created_at)}</td>
                  <td className="p-2 font-semibold text-sky-300">{e.tracking_no || e.delivery_way_id || "-"}</td>
                  <td className="p-2">{e.waybill_no || "-"}</td>
                  <td className="p-2">{e.merchant_code || e.merchant_name || "-"}</td>
                  <td className="p-2">{e.recipient_name || "-"}</td>
                  <td className="p-2">{e.township || "-"}</td>
                  <td className="p-2">{e.attempt_no || "-"}</td>
                  <td className="p-2 min-w-[240px]">
                    <div className="font-semibold text-amber-300">{e.reason_name_en || e.exception_name_en || e.exception_code}</div>
                    <div className="text-xs text-slate-400">{e.reason_name_mm || e.exception_name_mm || ""}</div>
                    {e.remarks && <div className="mt-1 text-xs text-slate-300">Remark: {e.remarks}</div>}
                  </td>
                  <td className="p-2 min-w-[320px]">
                    <div>{e.customer_message_en || "-"}</div>
                    {e.customer_message_mm && <div className="mt-1 text-xs text-slate-400">{e.customer_message_mm}</div>}
                  </td>
                  <td className="p-2">{e.rule_next_action || e.next_action || "-"}</td>
                  <td className="p-2">
                    {e.is_rto ? (
                      <span className="rounded-full border border-rose-500/30 bg-rose-500/15 px-2 py-1 text-xs font-semibold text-rose-300">
                        RTO
                      </span>
                    ) : (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-1 text-xs font-semibold text-amber-300">
                        Priority
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!filtered.length && (
            <div className="p-10 text-center text-slate-500">
              No open exceptions.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
