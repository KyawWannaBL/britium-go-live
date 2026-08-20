// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { guardedBrowserPrint } from "@/lib/documentPrintGuard";
import { subscribeToDispatchUpdates } from "@/lib/dispatchRealtime";
import {
  CheckCircle2, Clock, Download, Loader2, Package, RefreshCw, Search,
  Send, Truck, Undo2, XCircle, AlertTriangle, Printer
} from "lucide-react";


const fmtMoney = (v: any) =>
  `${Number(v || 0).toLocaleString("en-US")} MMK`;

const fmtDateTime = (v: any) => {
  if (!v) return "-";
  try { return new Date(v).toLocaleString("en-GB", { timeZone: "Asia/Yangon" }); }
  catch { return String(v); }
};

const todayYgn = () => new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Yangon" });

const safe = (v: any) => String(v ?? "").replace(/[&<>"']/g, (s) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
} as any)[s]);

const getTracking = (j: any) => j.tracking_no || j.delivery_way_id || j.id;
const getPhone = (j: any) => j.phone_number || j.recipient_phone || j.contact_no || j.phone || "";
const getRemarks = (j: any) => j.remarks || j.remark || j.special_instruction || j.special_instructions || "";
const getTotal = (j: any) => Number(j.total_collected_amount ?? 0) || (Number(j.cod_amount ?? 0) + Number(j.delivery_charges ?? 0));
const getAssetName = (asset: any, fallback: string) => asset?.asset_name || asset?.asset_code || fallback;

function groupByAsset(jobs: any[], assets: any[] = []) {
  const assetMap = new Map((assets || []).map((a: any) => [a.asset_code, a]));
  const groups: Record<string, { asset: any; jobs: any[] }> = {};
  for (const job of jobs || []) {
    const code = job.asset_code || job.vehicle_code || job.vehicle_id || "UNASSIGNED";
    if (!groups[code]) groups[code] = { asset: assetMap.get(code) || { asset_code: code, asset_name: code }, jobs: [] };
    groups[code].jobs.push(job);
  }
  Object.values(groups).forEach((g) => g.jobs.sort((a, b) => Number(a.parcel_sequence || 0) - Number(b.parcel_sequence || 0)));
  return groups;
}

function buildManifestPrintHtml(jobs: any[], assets: any[], titlePrefix = "Manifest") {
  const groups = groupByAsset(jobs, assets);
  const pages = Object.entries(groups)
    .filter(([_, g]) => g.jobs.length > 0)
    .map(([assetCode, g]) => {
      const normalCount = g.jobs.filter((j) => !String(j.delivery_township || "").toLowerCase().includes("highway")).length;
      const highwayCount = g.jobs.length - normalCount;
      const itemTotal = g.jobs.reduce((s, j) => s + Number(j.cod_amount || 0), 0);
      const deliveryTotal = g.jobs.reduce((s, j) => s + Number(j.delivery_charges || 0), 0);
      const weightTotal = 0;
      const grandTotal = g.jobs.reduce((s, j) => s + getTotal(j), 0);
      const rows = g.jobs.map((j, idx) => `
        <tr>
          <td style="text-align:center">${safe(getTracking(j))}</td>
          <td style="text-align:center">${idx + 1}</td>
          <td>${safe(j.recipient_name)}</td>
          <td style="text-align:center">${safe(j.delivery_township || j.destination_city)}</td>
          <td>${safe(j.recipient_address)}</td>
          <td style="text-align:center">${safe(j.weight_kg || 0)}</td>
          <td style="text-align:right">${Number(j.cod_amount || 0).toLocaleString("en-US")}</td>
          <td style="text-align:right">${Number(j.delivery_charges || 0).toLocaleString("en-US")}</td>
          <td style="text-align:right">0</td>
          <td style="text-align:right;font-weight:bold">${getTotal(j).toLocaleString("en-US")}</td>
          <td style="text-align:center">${safe(getPhone(j))}</td>
          <td>${safe(getRemarks(j))}</td>
        </tr>`).join("");
      return `
      <div class="page">
        <div class="title">${safe(titlePrefix)}: ${safe(getAssetName(g.asset, assetCode))}</div>
        <table class="meta-table">
          <tr>
            <td style="width:38%">Date: ${safe(todayYgn())}</td>
            <td style="width:38%">ယာဉ်မောင်း/ပို့ဆောင်သူ: ___________________</td>
            <td style="width:24%">ပုံမှန်ပို့ဆောင်ရမည့်အရေအတွက်: ${normalCount}</td>
          </tr>
          <tr>
            <td>ကုန်လှောင်ရုံတာဝန်ခံ: ___________________</td>
            <td>ယာဉ်နောက်လိုက်: ___________________</td>
            <td>အဝေးပြေးဂိတ်ပို့ရန်အရေအတွက်: ${highwayCount}</td>
          </tr>
          <tr>
            <td>ကုန်လှောင်ရုံလက်ထောက်: ___________________</td>
            <td>ယာဉ်အမှတ် (Plate No): ${safe(g.asset?.vehicle_plate || "___________________")}</td>
            <td>စုစုပေါင်းပါဆယ်အရေအတွက်: ${g.jobs.length}</td>
          </tr>
          <tr><td colspan="3">ငွေအကြွေထုတ်ယူမှုပမာဏ: ___________________</td></tr>
        </table>
        <table class="m-table">
          <thead>
            <tr>
              <th style="width:10%">Way ID</th><th style="width:3%">စဉ်</th><th style="width:11%">အမည်</th>
              <th style="width:8%">မြို့နယ်</th><th style="width:18%">လိပ်စာ</th><th style="width:5%">အလေးချိန်<br>(kg)</th>
              <th style="width:7%">ပစ္စည်းတန်ဖိုး</th><th style="width:6%">ပို့ဆောင်ခ</th><th style="width:6%">အလေးချိန်<br>ကျသင့်ငွေ</th>
              <th style="width:8%">စုစုပေါင်း<br>(Total)</th><th style="width:10%">ဖုန်း</th><th style="width:8%">မှတ်ချက်</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr class="sum-row">
              <td colspan="6" style="text-align:right;">Trip Totals (စုစုပေါင်း):</td>
              <td style="text-align:right;">${itemTotal.toLocaleString("en-US")}</td>
              <td style="text-align:right;">${deliveryTotal.toLocaleString("en-US")}</td>
              <td style="text-align:right;">${weightTotal.toLocaleString("en-US")}</td>
              <td style="text-align:right;color:red;">${grandTotal.toLocaleString("en-US")}</td>
              <td colspan="2"></td>
            </tr>
          </tbody>
        </table>
        <div class="footer">
          <div class="flex"><div>ကောက်ခံရရှိငွေ (Cash Collected): ______________________</div><div>Mobile Banking: _________________</div></div>
          <div>စုစုပေါင်း (Total Collected): ______________________</div>
          <div class="flex" style="margin-top:20px;">
            <div class="sign-box">______________________<br>ယာဉ်မောင်း/ပို့ဆောင်သူ လက်မှတ်</div>
            <div class="sign-box">______________________<br>ယာဉ်နောက်လိုက် လက်မှတ်</div>
            <div class="sign-box">______________________<br>ကုန်လှောင်ရုံတာဝန်ခံ လက်မှတ်</div>
            <div class="sign-box">______________________<br>ကုန်လှောင်ရုံလက်ထောက်</div>
          </div>
          <div class="flex" style="margin-top:20px; padding:0 50px;">
            <div class="sign-box">______________________<br>Operation (Ack)</div>
            <div class="sign-box">______________________<br>Finance (Received)</div>
            <div class="sign-box">______________________<br>Finance (Ack)</div>
          </div>
        </div>
      </div>`;
    }).join("");

  return `<!doctype html>
  <html><head><meta charset="utf-8" />
  <title>${safe(titlePrefix)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Pyidaungsu&display=swap');
    body { font-family: 'Pyidaungsu', 'Myanmar Text', Arial, sans-serif; font-size: 11px; margin: 0; background: #eee; }
    .page { width: 210mm; min-height: 297mm; padding: 10mm; margin: 5mm auto; background: white; box-sizing: border-box; page-break-after: always; position: relative; }
    .title { text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 15px; text-decoration: underline; }
    .meta-table { width: 100%; font-weight: bold; font-size: 12px; margin-bottom: 10px; border-collapse: collapse; }
    .meta-table td { padding: 4px; border: 1px solid #ddd; }
    .m-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 15px; }
    .m-table th { background: #D7E4BC; border: 1px solid black; padding: 6px; font-size: 11px; text-align: center; }
    .m-table td { border: 1px solid black; padding: 5px; font-size: 11px; vertical-align: middle; word-wrap: break-word; overflow-wrap: break-word; }
    .footer { font-size: 12px; font-weight: bold; line-height: 1.8; margin-top: 15px; }
    .flex { display: flex; justify-content: space-between; }
    .sign-box { text-align: center; width: 22%; font-size: 11px; }
    .sum-row td { background: #f9f9f9; font-weight: bold; }
    @media print { body { background: white; } .page { margin:0; padding:10mm; border:none; box-shadow:none; } }
  </style></head><body>${pages || '<div class="page"><div class="title">No manifest rows</div></div>'}
  <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
  </body></html>`;
}

function printManifest(jobs: any[], assets: any[], title = "Manifest") {
  const win = window.open("", "_blank", "width=1200,height=800");
  if (!win) return alert("Popup blocked. Please allow popups to print manifest.");
  win.document.open();
  win.document.write(buildManifestPrintHtml(jobs, assets, title));
  win.document.close();
}


export default function DispatchCommandCenterPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [snapshot, setSnapshot] = useState<any>({ stats: {}, jobs: [], wayplans: [], assets: [], zones: [] });
  const [query, setQuery] = useState("");
  const [selectedWayplan, setSelectedWayplan] = useState("");
  const [clock, setClock] = useState("");
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const realtimeRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const jobs = snapshot.jobs || [];
  const assets = snapshot.assets || [];
  const wayplans = snapshot.wayplans || [];
  const stats = snapshot.stats || {};

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Yangon" })), 1000);
    return () => clearInterval(t);
  }, []);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data, error } = await supabase.rpc("be_enterprise_dispatch_snapshot");
      if (error) throw error;
      setSnapshot(data || {});
      const first = data?.wayplans?.[0]?.wayplan_code || data?.wayplans?.[0]?.wayplan_no || "";
      setSelectedWayplan((prev) => prev || first);
    } catch (e: any) {
      setMessage(e.message || "Failed to load dispatch data.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    const scheduleReconciliation = () => {
      if (realtimeRefreshTimer.current) clearTimeout(realtimeRefreshTimer.current);
      realtimeRefreshTimer.current = setTimeout(() => {
        void loadAll(true);
      }, 350);
    };

    const unsubscribe = subscribeToDispatchUpdates({
      onConnectionChanged: (connected) => {
        setRealtimeConnected(connected);
        if (connected) scheduleReconciliation();
      },
      onManifestChanged: scheduleReconciliation,
      onDeliveryChanged: (delivery) => {
        const keys = new Set(
          [delivery.id, delivery.tracking_no, delivery.delivery_id, delivery.way_id]
            .filter(Boolean)
            .map(String),
        );

        setSnapshot((current: any) => ({
          ...current,
          jobs: (current.jobs || []).map((job: any) => {
            const matches = [
              job.id,
              job.tracking_no,
              job.delivery_id,
              job.delivery_way_id,
              job.way_id,
            ]
              .filter(Boolean)
              .map(String)
              .some((key) => keys.has(key));

            if (!matches) return job;

            const nextStatus =
              String(delivery.status || "").toLowerCase() === "delivered"
                ? "DELIVERED"
                : String(delivery.status || job.delivery_status).toUpperCase();

            return {
              ...job,
              delivery_status: nextStatus,
              delivered_at: delivery.delivered_at ?? job.delivered_at,
              updated_at: delivery.updated_at ?? job.updated_at,
              version: delivery.version,
            };
          }),
        }));

        scheduleReconciliation();
      },
    });

    return () => {
      unsubscribe();
      if (realtimeRefreshTimer.current) clearTimeout(realtimeRefreshTimer.current);
    };
  }, [loadAll]);

  const actor = async () => {
    const { data } = await supabase.auth.getUser();
    return data?.user?.email || "dispatch@britiumexpress.com";
  };

  const publish = async (wayplanCode?: string) => {
    const code = wayplanCode || selectedWayplan;
    if (!code) return setMessage("Select a wayplan first.");
    setLoading(true);
    try {
      const email = await actor();
      const { error } = await supabase.rpc("be_publish_wayplan_to_dispatch", {
        p_wayplan_code: code,
        p_actor_email: email,
      });
      if (error) throw error;
      setMessage(`Published ${code} to rider/driver app.`);
      await loadAll();
    } catch (e: any) {
      setMessage(e.message || "Publish failed.");
    } finally {
      setLoading(false);
    }
  };

  const publishAll = async () => {
    setLoading(true);
    try {
      const email = await actor();
      const { error } = await supabase.rpc("be_publish_all_wayplans_to_dispatch", { p_actor_email: email });
      if (error) throw error;
      setMessage("Published all dispatch-ready wayplans.");
      await loadAll();
    } catch (e: any) {
      setMessage(e.message || "Publish all failed.");
    } finally {
      setLoading(false);
    }
  };

  const setJobStatus = async (trackingNo: string, status: string) => {
    let note = "";
    if (status === "ATTEMPTED_FAILED") note = prompt("Failure / return reason note") || "";
    setLoading(true);
    try {
      const email = await actor();
      const { error } = await supabase.rpc("be_driver_update_delivery_status", {
        p_tracking_no: trackingNo,
        p_status: status,
        p_actor_email: email,
        p_note: note,
      });
      if (error) throw error;
      await loadAll();
    } catch (e: any) {
      setMessage(e.message || "Status update failed.");
    } finally {
      setLoading(false);
    }
  };

  const closeDayDropoff = async () => {
    if (!confirm("Mark all OUT FOR DELIVERY parcels without return scan as DROP OFF?")) return;
    setLoading(true);
    try {
      const email = await actor();
      const { error } = await supabase.rpc("be_close_dispatch_day", {
        p_wayplan_code: selectedWayplan || null,
        p_actor_email: email,
      });
      if (error) throw error;
      setMessage("Day closed. Non-returned OUT parcels marked as DROP OFF.");
      await loadAll();
    } catch (e: any) {
      setMessage(e.message || "Close day failed.");
    } finally {
      setLoading(false);
    }
  };

  const filteredJobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j: any) =>
      [j.tracking_no, j.delivery_way_id, j.recipient_name, j.delivery_township, getPhone(j), j.asset_name, j.asset_code]
        .some((x) => String(x || "").toLowerCase().includes(q))
    );
  }, [jobs, query]);

  const grouped = useMemo(() => groupByAsset(filteredJobs, assets), [filteredJobs, assets]);
  const pool = filteredJobs.filter((j: any) => !j.asset_code || j.asset_code === "UNASSIGNED");
  const selectedJobs = selectedWayplan ? jobs.filter((j: any) => j.wayplan_code === selectedWayplan) : jobs;

  const fleetGroups = useMemo(
    () => Object.entries(grouped),
    [grouped],
  );

  const totalVisibleCod = filteredJobs.reduce(
    (sum: number, job: any) => sum + getTotal(job),
    0,
  );

  const jobCard = (j: any) => (
    <div key={getTracking(j)} className="rounded-xl border border-slate-700 bg-[#071827] p-3 shadow-sm border-l-4 border-l-[#C09B30]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-slate-100">{getTracking(j)}</div>
          <div className="text-sm text-slate-200">{j.recipient_name || "-"}</div>
          <div className="text-xs text-slate-400">{j.delivery_township || "-"}</div>
        </div>
        <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] text-slate-200">{j.delivery_status || "PENDING"}</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-slate-400">{getPhone(j)}</span>
        <span className="font-semibold text-emerald-300">{fmtMoney(getTotal(j))}</span>
      </div>
      {getRemarks(j) && <div className="mt-2 rounded bg-amber-950/30 px-2 py-1 text-xs text-amber-200">{getRemarks(j)}</div>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button onClick={() => setJobStatus(getTracking(j), "OUT_FOR_DELIVERY")} className="rounded bg-blue-700 px-2 py-1 text-xs text-white">Out</button>
        <button onClick={() => setJobStatus(getTracking(j), "DELIVERED")} className="rounded bg-emerald-700 px-2 py-1 text-xs text-white">Done</button>
        <button onClick={() => setJobStatus(getTracking(j), "ATTEMPTED_FAILED")} className="rounded bg-amber-700 px-2 py-1 text-xs text-white">Fail</button>
        <button onClick={() => setJobStatus(getTracking(j), "RTO")} className="rounded bg-rose-800 px-2 py-1 text-xs text-white">RTO</button>
      </div>
    </div>
  );

  if (loading && !jobs.length) {
    return <div className="min-h-screen bg-[#07111e] p-8 text-slate-300"><Loader2 className="animate-spin" /> Loading dispatch command...</div>;
  }

  return (
    <div className="min-h-screen bg-[#07111e] p-6 text-slate-100">
      <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <Truck className="text-[#C09B30]" />
          <div>
            <div className="font-bold tracking-[0.18em] text-[#C09B30]">BRITIUM EXPRESS</div>
            <div className="text-sm text-slate-400">Dispatch Command Center · Live Supabase Workflow</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-slate-400">{clock}</span>
          <span
            className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
              realtimeConnected
                ? "border-emerald-700 text-emerald-300"
                : "border-amber-700 text-amber-300"
            }`}
          >
            {realtimeConnected ? "LIVE" : "RECONNECTING"}
          </span>
          <button onClick={loadAll} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold"><RefreshCw className="mr-1 inline h-4 w-4" />Sync Fresh</button>
          <select value={selectedWayplan} onChange={(e) => setSelectedWayplan(e.target.value)} className="rounded-lg border border-slate-700 bg-[#071827] px-3 py-2 text-sm">
            {wayplans.map((w: any) => <option key={w.wayplan_code} value={w.wayplan_code}>{w.wayplan_code} · {w.parcel_count} parcels</option>)}
          </select>
          <button onClick={() => publish()} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold"><Send className="mr-1 inline h-4 w-4" />Publish</button>
          <button onClick={publishAll} className="rounded-lg bg-[#C09B30] px-3 py-2 text-sm font-semibold text-black">Publish All</button>
          <button onClick={() => printManifest(selectedJobs, assets, "Manifest")} className="rounded-lg border border-slate-700 px-3 py-2 text-sm"><Printer className="mr-1 inline h-4 w-4" />Manifest</button>
          <button onClick={closeDayDropoff} className="rounded-lg border border-emerald-700 px-3 py-2 text-sm text-emerald-300">Close Day Drop Off</button>
        </div>
      </div>

      {message && <div className="mb-4 rounded-lg border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-200">{message}</div>}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        {[
          ["WAYPLANS", stats.wayplans],
          ["JOBS", stats.jobs],
          ["PENDING", stats.pending],
          ["OUT", stats.out_for_delivery],
          ["DELIVERED", stats.delivered],
          ["FAILED", stats.failed],
          ["RTO", stats.rto],
          ["COD", fmtMoney(stats.cod)],
        ].map(([k, v]: any) => (
          <div key={k} className="rounded-xl border border-slate-800 bg-[#0B2133] p-3 text-center">
            <div className="text-lg font-bold text-[#C09B30]">{v ?? 0}</div>
            <div className="text-xs text-slate-400">{k}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,2fr)_minmax(300px,0.8fr)]">
        <section className="rounded-xl border border-slate-800 bg-[#0B2133] p-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold"><Package className="mr-1 inline h-4 w-4" /> Parcel Pool</h3>
            <span className="rounded-full bg-slate-800 px-2 py-1 text-xs">{pool.length || filteredJobs.length}</span>
          </div>
          <div className="mb-3 flex items-center rounded-lg border border-slate-700 bg-[#071827] px-2">
            <Search className="h-4 w-4 text-slate-500" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tracking, township, phone..." className="w-full bg-transparent p-2 text-sm outline-none" />
          </div>
          <div className="max-h-[68vh] space-y-3 overflow-auto pr-1">
            {(pool.length ? pool : filteredJobs.slice(0, 50)).map(jobCard)}
          </div>
        </section>

        <section className="min-w-0 rounded-xl border border-slate-800 bg-[#0B2133] p-4">
          <div className="mb-4 flex flex-col gap-3 border-b border-slate-800 pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <Truck className="h-5 w-5 text-[#C09B30]" />
                Fleet Assignment Board
              </h3>

              <p className="mt-1 text-xs text-slate-400">
                Generated from live wayplan and fleet zoning
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-slate-700 bg-[#071827] px-3 py-2 text-center">
                <div className="text-lg font-bold text-[#C09B30]">
                  {fleetGroups.length}
                </div>
                <div className="text-[10px] uppercase text-slate-400">
                  Fleet Groups
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-[#071827] px-3 py-2 text-center">
                <div className="text-lg font-bold text-sky-300">
                  {filteredJobs.length}
                </div>
                <div className="text-[10px] uppercase text-slate-400">
                  Visible Jobs
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-[#071827] px-3 py-2 text-center">
                <div className="whitespace-nowrap text-sm font-bold text-emerald-300">
                  {fmtMoney(totalVisibleCod)}
                </div>
                <div className="text-[10px] uppercase text-slate-400">
                  Total COD
                </div>
              </div>
            </div>
          </div>

          {fleetGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 bg-[#071827] p-12 text-center text-sm text-slate-500">
              No fleet assignment groups are available.
            </div>
          ) : (
            <div
              className={
                fleetGroups.length === 1
                  ? "grid grid-cols-1 gap-4"
                  : fleetGroups.length === 2
                    ? "grid grid-cols-1 gap-4 2xl:grid-cols-2"
                    : "grid grid-cols-1 gap-4 2xl:grid-cols-2 min-[1900px]:grid-cols-3"
              }
            >
              {fleetGroups.map(([code, group]: any) => {
                const groupCod = group.jobs.reduce(
                  (sum: number, job: any) =>
                    sum + getTotal(job),
                  0,
                );

                const unassigned =
                  code === "UNASSIGNED";

                return (
                  <article
                    key={code}
                    className={`min-w-0 overflow-hidden rounded-xl border ${
                      unassigned
                        ? "border-amber-500/60 bg-amber-950/10"
                        : "border-slate-700 bg-[#071827]"
                    }`}
                  >
                    <header className="flex flex-col gap-3 border-b border-slate-800 p-4 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-lg font-bold text-white">
                            {getAssetName(
                              group.asset,
                              code,
                            )}
                          </div>

                          {unassigned && (
                            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase text-amber-300">
                              Needs Assignment
                            </span>
                          )}
                        </div>

                        <div className="mt-1 text-xs text-sky-300">
                          {code} ·{" "}
                          {group.asset?.operation_type ||
                            group.asset?.asset_type ||
                            "fleet"}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <div className="rounded-lg bg-slate-900/70 px-3 py-2 text-center">
                          <div className="font-bold text-white">
                            {group.jobs.length}
                          </div>
                          <div className="text-[9px] uppercase text-slate-500">
                            Jobs
                          </div>
                        </div>

                        <div className="rounded-lg bg-slate-900/70 px-3 py-2 text-center">
                          <div className="whitespace-nowrap text-sm font-bold text-emerald-300">
                            {fmtMoney(groupCod)}
                          </div>
                          <div className="text-[9px] uppercase text-slate-500">
                            COD
                          </div>
                        </div>
                      </div>
                    </header>

                    <div className="grid max-h-[68vh] grid-cols-1 gap-3 overflow-y-auto p-3 2xl:grid-cols-2">
                      {group.jobs.map(jobCard)}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-800 bg-[#0B2133] p-3">
          <h3 className="mb-3 font-semibold"><Clock className="mr-1 inline h-4 w-4" /> Status Board</h3>
          {[
            ["Out for Delivery", "OUT_FOR_DELIVERY"],
            ["Delivered / Drop Off", "DELIVERED"],
            ["Failed Attempt", "ATTEMPTED_FAILED"],
            ["RTO", "RTO"],
          ].map(([label, status]) => {
            const list = jobs.filter((j: any) => status === "DELIVERED"
              ? ["DELIVERED", "COMPLETED", "DROP_OFF"].includes(j.delivery_status)
              : j.delivery_status === status || j.dispatch_status === status);
            return (
              <div key={status} className="mb-3 rounded-lg border border-slate-700 bg-[#071827]">
                <div className="flex items-center justify-between border-b border-slate-800 p-2 text-sm font-semibold">
                  <span>{label}</span><span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs">{list.length}</span>
                </div>
                <div className="max-h-[150px] space-y-1 overflow-auto p-2">
                  {list.length ? list.map((j: any) => <div key={getTracking(j)} className="rounded bg-[#0B2133] px-2 py-1 text-xs">{getTracking(j)} · {j.delivery_township}</div>) : <div className="p-3 text-center text-xs text-slate-500">Drop here / no rows</div>}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
