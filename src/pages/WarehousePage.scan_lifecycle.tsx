// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, CheckCircle2, Download, Loader2, PackageSearch, RefreshCw, RotateCcw, ScanLine, Truck } from "lucide-react";

const fmt = (v: any) => v ? new Date(v).toLocaleString("en-GB", { timeZone: "Asia/Yangon" }) : "-";
const money = (v: any) => Number(v || 0).toLocaleString("en-US");
const track = (r: any) => r.tracking_no || r.delivery_way_id || r.id;

export default function WarehousePage() {
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<any>({ stats: {}, rows: [], reasons: [] });
  const [scanCode, setScanCode] = useState("");
  const [reason, setReason] = useState("");
  const [remark, setRemark] = useState("");
  const [message, setMessage] = useState("");

  const rows = snapshot.rows || [];
  const reasons = (snapshot.reasons || []).filter((r: any) => ["DELIVERY", "WAREHOUSE"].includes(r.process_type));
  const stats = snapshot.stats || {};

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("be_warehouse_scan_lifecycle_snapshot");
      if (error) throw error;
      setSnapshot(data || {});
      setReason((prev) => prev || data?.reasons?.find((r: any) => r.process_type === "DELIVERY")?.exception_code || "");
    } catch (e: any) {
      setMessage(e.message || "Failed to load warehouse scan data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const actor = async () => {
    const { data } = await supabase.auth.getUser();
    return data?.user?.email || "warehouse@britiumexpress.com";
  };

  const doScan = async (kind: "inbound" | "dispatch" | "return", code?: string) => {
    const tracking = (code || scanCode || "").trim();
    if (!tracking) return setMessage("Scan or enter Delivery Way / Tracking No first.");
    setLoading(true);
    try {
      const email = await actor();
      let res;
      if (kind === "inbound") {
        res = await supabase.rpc("be_warehouse_inbound_scan", {
          p_tracking_no: tracking,
          p_actor_email: email,
          p_warehouse_code: "YGN-MAIN",
        });
      } else if (kind === "dispatch") {
        res = await supabase.rpc("be_warehouse_dispatch_scan", {
          p_tracking_no: tracking,
          p_actor_email: email,
          p_warehouse_code: "YGN-MAIN",
        });
      } else {
        if (!reason) throw new Error("Select return reason first.");
        res = await supabase.rpc("be_warehouse_return_scan", {
          p_tracking_no: tracking,
          p_reason_code: reason,
          p_actor_email: email,
          p_remark: remark || null,
        });
      }
      if (res.error) throw res.error;
      setMessage(`${kind.toUpperCase()} scan saved for ${tracking}.`);
      setScanCode("");
      await loadAll();
    } catch (e: any) {
      setMessage(e.message || "Scan failed.");
    } finally {
      setLoading(false);
    }
  };

  const filteredRows = rows;

  const exportCsv = () => {
    const headers = [
      "Waybill", "Pickup", "Delivery Way", "Recipient", "Phone", "Township", "Weight", "COD", "Delivery Fee",
      "WH Status", "Inbound Scan", "Dispatch Scan", "Return Scan 1", "Reason 1",
      "Return Scan 2", "Reason 2", "Return Scan 3", "Reason 3", "Attempts", "RTO"
    ];
    const csv = [headers, ...filteredRows.map((r: any) => [
      r.waybill_no, r.pickup_id, track(r), r.recipient_name, r.phone_number || r.recipient_phone,
      r.delivery_township, r.weight_kg, r.cod_amount, r.delivery_charges, r.warehouse_scan_status,
      fmt(r.inbound_scan_at), fmt(r.dispatch_scan_at), fmt(r.return_scan_1_at), r.return_reason_1_name || r.return_reason_1,
      fmt(r.return_scan_2_at), r.return_reason_2_name || r.return_reason_2,
      fmt(r.return_scan_3_at), r.return_reason_3_name || r.return_reason_3,
      r.return_attempt_count, fmt(r.rto_at)
    ])].map(row => row.map((c: any) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `warehouse_scan_lifecycle_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !rows.length) {
    return <div className="min-h-screen bg-[#07111e] p-8 text-slate-300"><Loader2 className="animate-spin" /> Loading warehouse scan lifecycle...</div>;
  }

  return (
    <div className="min-h-screen bg-[#07111e] p-6 text-slate-100">
      <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <PackageSearch className="text-[#C09B30]" />
          <div>
            <div className="font-bold tracking-[0.12em] text-[#C09B30]">WAREHOUSE SCAN CENTER</div>
            <div className="text-sm text-slate-400">Inbound scan, dispatch scan, return scan attempts, RTO, exceptions</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={loadAll} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold"><RefreshCw className="mr-1 inline h-4 w-4" />Refresh</button>
          <button onClick={exportCsv} className="rounded-lg border border-slate-700 px-3 py-2 text-sm"><Download className="mr-1 inline h-4 w-4" />CSV</button>
        </div>
      </div>

      {message && <div className="mb-4 rounded-lg border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-200">{message}</div>}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
        {[
          ["ROWS", stats.rows],
          ["RECEIVED", stats.received],
          ["DISPATCH SCAN", stats.dispatch_scanned],
          ["RETURNS", stats.returns],
          ["PRIORITY", stats.priority],
          ["RTO", stats.rto],
        ].map(([k, v]: any) => (
          <div key={k} className="rounded-xl border border-slate-800 bg-[#0B2133] p-3 text-center">
            <div className="text-xl font-bold text-[#C09B30]">{v ?? 0}</div>
            <div className="text-xs text-slate-400">{k}</div>
          </div>
        ))}
      </div>

      <section className="mb-4 rounded-xl border border-slate-800 bg-[#0B2133] p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_1fr_2fr]">
          <input
            value={scanCode}
            onChange={(e) => setScanCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") doScan("inbound"); }}
            placeholder="Scan / enter Delivery Way ID"
            className="rounded-lg border border-slate-700 bg-[#071827] p-3 outline-none"
          />
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-lg border border-slate-700 bg-[#071827] p-3">
            {reasons.map((r: any) => <option key={`${r.process_type}-${r.exception_code}`} value={r.exception_code}>{r.exception_name_en} / {r.exception_name_mm}</option>)}
          </select>
          <input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Return remark / phone note" className="rounded-lg border border-slate-700 bg-[#071827] p-3 outline-none" />
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => doScan("inbound")} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold"><ScanLine className="mr-1 inline h-4 w-4" />Inbound Scan</button>
            <button onClick={() => doScan("dispatch")} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold"><Truck className="mr-1 inline h-4 w-4" />Dispatch Scan</button>
            <button onClick={() => doScan("return")} className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold"><RotateCcw className="mr-1 inline h-4 w-4" />Return Scan</button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-[#0B2133]">
        <div className="border-b border-slate-800 p-3 font-semibold">Warehouse Lifecycle Rows</div>
        <div className="max-h-[68vh] overflow-auto">
          <table className="w-full min-w-[1900px] text-sm">
            <thead className="sticky top-0 bg-[#0B2133] text-left text-xs text-slate-400">
              <tr>
                <th className="p-2">WAYBILL</th>
                <th className="p-2">PICKUP</th>
                <th className="p-2">DELIVERY WAY</th>
                <th className="p-2">RECIPIENT</th>
                <th className="p-2">PHONE</th>
                <th className="p-2">TOWNSHIP</th>
                <th className="p-2">COD</th>
                <th className="p-2">WH STATUS</th>
                <th className="p-2">INBOUND SCAN</th>
                <th className="p-2">DISPATCH SCAN</th>
                <th className="p-2">RETURN SCAN 1</th>
                <th className="p-2">REASON</th>
                <th className="p-2">RETURN SCAN 2</th>
                <th className="p-2">REASON</th>
                <th className="p-2">RETURN SCAN 3</th>
                <th className="p-2">REASON</th>
                <th className="p-2">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r: any) => (
                <tr key={track(r)} className="border-t border-slate-800">
                  <td className="p-2 text-sky-300">{r.waybill_no}</td>
                  <td className="p-2">{r.pickup_id}</td>
                  <td className="p-2 text-sky-300">{track(r)}</td>
                  <td className="p-2">{r.recipient_name}</td>
                  <td className="p-2">{r.phone_number || r.recipient_phone}</td>
                  <td className="p-2">{r.delivery_township}</td>
                  <td className="p-2 text-right">{money(r.cod_amount)}</td>
                  <td className="p-2">
                    <span className={`rounded-full px-2 py-1 text-xs ${r.warehouse_scan_status === "RTO" ? "bg-rose-900 text-rose-200" : r.warehouse_scan_status === "DROP_OFF" ? "bg-emerald-900 text-emerald-200" : "bg-slate-800 text-slate-200"}`}>
                      {r.warehouse_scan_status || r.warehouse_status}
                    </span>
                  </td>
                  <td className="p-2">{fmt(r.inbound_scan_at)}</td>
                  <td className="p-2">{fmt(r.dispatch_scan_at)}</td>
                  <td className="p-2">{fmt(r.return_scan_1_at)}</td>
                  <td className="p-2">{r.return_reason_1_name || r.return_reason_1 || "-"}</td>
                  <td className="p-2">{fmt(r.return_scan_2_at)}</td>
                  <td className="p-2">{r.return_reason_2_name || r.return_reason_2 || "-"}</td>
                  <td className="p-2">{fmt(r.return_scan_3_at)}</td>
                  <td className="p-2">{r.return_reason_3_name || r.return_reason_3 || "-"}</td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <button onClick={() => doScan("inbound", track(r))} className="rounded bg-emerald-700 px-2 py-1 text-xs">Inbound</button>
                      <button onClick={() => doScan("dispatch", track(r))} className="rounded bg-blue-700 px-2 py-1 text-xs">Dispatch</button>
                      <button onClick={() => { setScanCode(track(r)); doScan("return", track(r)); }} className="rounded bg-amber-700 px-2 py-1 text-xs">Return</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredRows.length && <div className="p-10 text-center text-slate-500">No warehouse scan rows.</div>}
        </div>
      </section>
    </div>
  );
}
