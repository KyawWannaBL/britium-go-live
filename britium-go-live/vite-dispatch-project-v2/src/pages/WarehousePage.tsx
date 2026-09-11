// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  PackageSearch,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
  Truck,
} from "lucide-react";

const fmt = (v: any) =>
  v ? new Date(v).toLocaleString("en-GB", { timeZone: "Asia/Yangon" }) : "-";

const money = (v: any) => Number(v || 0).toLocaleString("en-US");

const track = (r: any) =>
  r.tracking_no || r.delivery_way_id || r.delivery_way_no || r.id || "";

function statusClass(status?: string) {
  const s = String(status || "").toUpperCase();
  if (s === "RTO") return "bg-rose-500/15 text-rose-300 border-rose-500/30";
  if (s === "DROP_OFF") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  if (s === "RETURN_SCANNED" || s === "RETURNED_FOR_REATTEMPT") return "bg-amber-500/15 text-amber-300 border-amber-500/30";
  if (s === "DISPATCH_SCANNED" || s === "OUT_FOR_DELIVERY") return "bg-sky-500/15 text-sky-300 border-sky-500/30";
  if (s === "RECEIVED") return "bg-teal-500/15 text-teal-300 border-teal-500/30";
  return "bg-slate-700/40 text-slate-300 border-slate-600/40";
}

export default function WarehousePage() {
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<any>({ stats: {}, rows: [], reasons: [] });
  const [scanCode, setScanCode] = useState("");
  const [reason, setReason] = useState("");
  const [remark, setRemark] = useState("");
  const [query, setQuery] = useState("");
  const [closeWayplanCode, setCloseWayplanCode] = useState("");
  const [message, setMessage] = useState("");

  const rows = snapshot.rows || [];
  const stats = snapshot.stats || {};
  const reasons = useMemo(
    () => (snapshot.reasons || []).filter((r: any) => ["DELIVERY", "WAREHOUSE"].includes(r.process_type)),
    [snapshot.reasons]
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("be_warehouse_scan_lifecycle_snapshot");
      if (error) throw error;
      setSnapshot(data || { stats: {}, rows: [], reasons: [] });
      setReason((prev) => prev || data?.reasons?.find((r: any) => r.process_type === "DELIVERY")?.exception_code || "");
    } catch (e: any) {
      setMessage(e.message || "Failed to load warehouse scan data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const actor = async () => {
    const { data } = await supabase.auth.getUser();
    return data?.user?.email || "testwarehouse@britiumexpress.com";
  };

  const doScan = async (kind: "inbound" | "dispatch" | "return", code?: string) => {
    const tracking = String(code || scanCode || "").trim();
    if (!tracking) {
      setMessage("Scan or enter Delivery Way / Tracking No first.");
      return;
    }

    setLoading(true);
    try {
      const email = await actor();
      let res: any;

      if (kind === "inbound") {
        res = await supabase.rpc("be_warehouse_inbound_scan", {
          p_tracking_no: tracking,
          p_actor_email: email,
          p_warehouse_code: "YGN-MAIN",
        });
      }

      if (kind === "dispatch") {
        res = await supabase.rpc("be_warehouse_dispatch_scan", {
          p_tracking_no: tracking,
          p_actor_email: email,
          p_warehouse_code: "YGN-MAIN",
        });
      }

      if (kind === "return") {
        if (!reason) throw new Error("Please select return reason first.");
        res = await supabase.rpc("be_warehouse_return_scan", {
          p_tracking_no: tracking,
          p_reason_code: reason,
          p_actor_email: email,
          p_remark: remark || null,
        });
      }

      if (res?.error) throw res.error;
      const data = res?.data || {};
      if (data.ok === false) throw new Error(data.reason || "Scan rejected.");

      setMessage(
        kind === "return"
          ? `Return scan saved for ${tracking}. Attempt ${data.attempt_no || ""}${data.is_rto ? " → RTO" : " → priority for next wayplan"}.`
          : `${kind.toUpperCase()} scan saved for ${tracking}.`
      );

      setScanCode("");
      await loadAll();
    } catch (e: any) {
      setMessage(e.message || "Scan failed.");
    } finally {
      setLoading(false);
    }
  };

  const closeDispatchDay = async () => {
    setLoading(true);
    try {
      const email = await actor();
      const { data, error } = await supabase.rpc("be_close_dispatch_day", {
        p_wayplan_code: closeWayplanCode?.trim() || null,
        p_actor_email: email,
      });
      if (error) throw error;
      setMessage(`End day closed. Drop-off rows updated: ${data?.closed_dropoff_rows ?? 0}.`);
      await loadAll();
    } catch (e: any) {
      setMessage(e.message || "Failed to close dispatch day.");
    } finally {
      setLoading(false);
    }
  };

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r: any) =>
      [
        r.waybill_no,
        r.pickup_id,
        track(r),
        r.merchant_code,
        r.merchant_name,
        r.recipient_name,
        r.phone_number,
        r.recipient_phone,
        r.delivery_township,
        r.warehouse_scan_status,
        r.return_reason_1_name,
        r.return_reason_2_name,
        r.return_reason_3_name,
        r.last_exception_reason,
      ].some((x) => String(x || "").toLowerCase().includes(q))
    );
  }, [rows, query]);

  const exportCsv = () => {
    const headers = [
      "Waybill",
      "Pickup",
      "Delivery Way",
      "Merchant",
      "Recipient",
      "Phone",
      "Township",
      "COD",
      "WH Status",
      "Inbound Scan",
      "Dispatch Scan",
      "Return Scan 1",
      "Reason 1",
      "Return Scan 2",
      "Reason 2",
      "Return Scan 3",
      "Reason 3",
      "Priority Next Wayplan",
      "RTO",
    ];
    const csv = [
      headers,
      ...filteredRows.map((r: any) => [
        r.waybill_no,
        r.pickup_id,
        track(r),
        r.merchant_code || r.merchant_name,
        r.recipient_name,
        r.phone_number || r.recipient_phone,
        r.delivery_township,
        r.cod_amount,
        r.warehouse_scan_status,
        fmt(r.inbound_scan_at),
        fmt(r.dispatch_scan_at),
        fmt(r.return_scan_1_at),
        r.return_reason_1_name || r.return_reason_1,
        fmt(r.return_scan_2_at),
        r.return_reason_2_name || r.return_reason_2,
        fmt(r.return_scan_3_at),
        r.return_reason_3_name || r.return_reason_3,
        r.next_attempt_priority ? "YES" : "NO",
        r.rto_at ? "YES" : "NO",
      ]),
    ]
      .map((row) => row.map((c: any) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `warehouse_scan_lifecycle_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !rows.length) {
    return (
      <div className="min-h-screen bg-[#07111e] p-8 text-slate-300">
        <Loader2 className="mr-2 inline h-5 w-5 animate-spin" />
        Loading warehouse scan lifecycle...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07111e] p-6 text-slate-100">
      <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <PackageSearch className="text-[#C09B30]" />
          <div>
            <div className="font-bold tracking-[0.12em] text-[#C09B30]">
              WAREHOUSE SCAN LIFECYCLE
            </div>
            <div className="text-sm text-slate-400">
              Inbound scan → Dispatch scan → Drop-off / Return scan 1-3 → RTO / Exceptions
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={loadAll}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-500"
          >
            <RefreshCw className="mr-1 inline h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={exportCsv}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
          >
            <Download className="mr-1 inline h-4 w-4" />
            CSV
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-200">
          {message}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
        {[
          ["ROWS", stats.rows],
          ["RECEIVED", stats.received],
          ["DISPATCH SCAN", stats.dispatch_scanned],
          ["RETURNS", stats.returns],
          ["PRIORITY", stats.priority],
          ["RTO", stats.rto],
        ].map(([k, v]: any) => (
          <div key={k} className="rounded-xl border border-slate-800 bg-[#0B2133] p-3">
            <div className="text-xl font-bold text-[#C09B30]">{v ?? 0}</div>
            <div className="text-xs uppercase text-slate-400">{k}</div>
          </div>
        ))}
      </div>

      <section className="mb-4 rounded-xl border border-slate-800 bg-[#0B2133] p-4">
        <div className="mb-2 text-sm font-semibold text-slate-200">Scan Control</div>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.2fr_1.5fr_1.2fr_1.4fr]">
          <input
            value={scanCode}
            onChange={(e) => setScanCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") doScan("inbound");
            }}
            placeholder="Scan / enter Delivery Way ID"
            className="rounded-lg border border-slate-700 bg-[#071827] p-3 outline-none focus:border-[#C09B30]"
          />

          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded-lg border border-slate-700 bg-[#071827] p-3 outline-none focus:border-[#C09B30]"
          >
            <option value="">Select return reason from exception rules...</option>
            {reasons.map((r: any) => (
              <option key={`${r.process_type}-${r.exception_code}`} value={r.exception_code}>
                {r.exception_name_en || r.exception_code} / {r.exception_name_mm || r.exception_code}
              </option>
            ))}
          </select>

          <input
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="Return remark / phone note"
            className="rounded-lg border border-slate-700 bg-[#071827] p-3 outline-none focus:border-[#C09B30]"
          />

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => doScan("inbound")}
              className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold hover:bg-emerald-600"
            >
              <ScanLine className="mr-1 inline h-4 w-4" />
              Inbound
            </button>
            <button
              onClick={() => doScan("dispatch")}
              className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold hover:bg-blue-600"
            >
              <Truck className="mr-1 inline h-4 w-4" />
              Dispatch
            </button>
            <button
              onClick={() => doScan("return")}
              className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold hover:bg-amber-600"
            >
              <RotateCcw className="mr-1 inline h-4 w-4" />
              Return
            </button>
          </div>
        </div>
      </section>

      <section className="mb-4 rounded-xl border border-slate-800 bg-[#0B2133] p-4">
        <div className="mb-2 text-sm font-semibold text-slate-200">
          End Day Close / Auto Drop-off
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
          <input
            value={closeWayplanCode}
            onChange={(e) => setCloseWayplanCode(e.target.value)}
            placeholder="Optional Wayplan Code. Empty = close all OUT_FOR_DELIVERY parcels with no return."
            className="rounded-lg border border-slate-700 bg-[#071827] p-3 outline-none focus:border-[#C09B30]"
          />
          <button
            onClick={closeDispatchDay}
            className="rounded-lg bg-[#C09B30] px-5 py-2 text-sm font-bold text-[#07111e] hover:bg-[#d7b94e]"
          >
            End Day: Mark Drop-off
          </button>
        </div>
        <div className="mt-2 text-xs text-slate-400">
          Only parcels with Dispatch Scan / OUT_FOR_DELIVERY and no return scan are converted to DROP_OFF.
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-[#0B2133]">
        <div className="flex flex-col gap-3 border-b border-slate-800 p-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-semibold">Warehouse Queue Rows</div>
            <div className="text-xs text-slate-400">
              Required columns: inbound scan, dispatch scan, return scan 1/2/3, reason, priority, RTO.
            </div>
          </div>
          <div className="relative w-full md:w-[420px]">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search waybill / delivery way / merchant / reason..."
              className="w-full rounded-lg border border-slate-700 bg-[#071827] py-2 pl-9 pr-3 outline-none focus:border-[#C09B30]"
            />
          </div>
        </div>

        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[2200px] text-sm">
            <thead className="sticky top-0 z-10 bg-[#0B2133] text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="p-2">#</th>
                <th className="p-2">Waybill</th>
                <th className="p-2">Pickup</th>
                <th className="p-2">Delivery Way</th>
                <th className="p-2">Merchant</th>
                <th className="p-2">Recipient</th>
                <th className="p-2">Phone</th>
                <th className="p-2">Township</th>
                <th className="p-2 text-right">COD</th>
                <th className="p-2">WH Status</th>
                <th className="p-2">Inbound Scan</th>
                <th className="p-2">Dispatch Scan</th>
                <th className="p-2">Return Scan 1</th>
                <th className="p-2">Reason</th>
                <th className="p-2">Return Scan 2</th>
                <th className="p-2">Reason</th>
                <th className="p-2">Return Scan 3</th>
                <th className="p-2">Reason</th>
                <th className="p-2">Priority / RTO</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.map((r: any, idx: number) => {
                const status = r.warehouse_scan_status || r.warehouse_status || r.delivery_status;
                const code = track(r);
                return (
                  <tr key={`${code}-${idx}`} className="border-t border-slate-800 align-top hover:bg-slate-900/40">
                    <td className="p-2 text-slate-500">{idx + 1}</td>
                    <td className="p-2 font-semibold text-sky-300">{r.waybill_no || "-"}</td>
                    <td className="p-2">{r.pickup_id || "-"}</td>
                    <td className="p-2 font-semibold text-sky-300">{code || "-"}</td>
                    <td className="p-2">{r.merchant_code || r.merchant_name || "-"}</td>
                    <td className="p-2 min-w-[180px]">{r.recipient_name || "-"}</td>
                    <td className="p-2">{r.phone_number || r.recipient_phone || "-"}</td>
                    <td className="p-2">{r.delivery_township || "-"}</td>
                    <td className="p-2 text-right">{money(r.cod_amount)}</td>
                    <td className="p-2">
                      <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(status)}`}>
                        {status || "-"}
                      </span>
                    </td>
                    <td className="p-2 min-w-[150px]">{fmt(r.inbound_scan_at)}</td>
                    <td className="p-2 min-w-[150px]">{fmt(r.dispatch_scan_at)}</td>
                    <td className="p-2 min-w-[150px]">{fmt(r.return_scan_1_at)}</td>
                    <td className="p-2 min-w-[220px]">{r.return_reason_1_name || r.return_reason_1 || "-"}</td>
                    <td className="p-2 min-w-[150px]">{fmt(r.return_scan_2_at)}</td>
                    <td className="p-2 min-w-[220px]">{r.return_reason_2_name || r.return_reason_2 || "-"}</td>
                    <td className="p-2 min-w-[150px]">{fmt(r.return_scan_3_at)}</td>
                    <td className="p-2 min-w-[220px]">{r.return_reason_3_name || r.return_reason_3 || "-"}</td>
                    <td className="p-2 min-w-[140px]">
                      {r.rto_at ? (
                        <span className="inline-flex items-center rounded-full border border-rose-500/30 bg-rose-500/15 px-2 py-1 text-xs font-semibold text-rose-300">
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          RTO
                        </span>
                      ) : r.next_attempt_priority ? (
                        <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-1 text-xs font-semibold text-amber-300">
                          Priority next wayplan
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="p-2 min-w-[260px]">
                      <div className="flex flex-wrap gap-1">
                        <button
                          onClick={() => doScan("inbound", code)}
                          className="rounded bg-emerald-700 px-2 py-1 text-xs font-semibold hover:bg-emerald-600"
                        >
                          Inbound Scan
                        </button>
                        <button
                          onClick={() => doScan("dispatch", code)}
                          className="rounded bg-blue-700 px-2 py-1 text-xs font-semibold hover:bg-blue-600"
                        >
                          Dispatch Scan
                        </button>
                        <button
                          onClick={() => doScan("return", code)}
                          className="rounded bg-amber-700 px-2 py-1 text-xs font-semibold hover:bg-amber-600"
                        >
                          Return Scan
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!filteredRows.length && (
            <div className="p-10 text-center text-slate-500">
              No warehouse scan rows.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
