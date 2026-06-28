// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database, Download, Layers, Loader2, MapPin, Plus, RefreshCw, Route, Send, Settings2, Trash2, Truck, Printer } from "lucide-react";


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


export default function WayplanCommandCenterPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("command");
  const [snapshot, setSnapshot] = useState<any>({ stats: {}, ready_queue: [], wayplans: [], zones: [], assets: [], locations: [] });
  const [selectedWaybill, setSelectedWaybill] = useState("");
  const [selectedAsset, setSelectedAsset] = useState("");
  const [routeName, setRouteName] = useState("YGN Route 1");
  const [dispatchJobs, setDispatchJobs] = useState<any[]>([]);

  const ready = snapshot.ready_queue || [];
  const wayplans = snapshot.wayplans || [];
  const assets = snapshot.assets || [];
  const zones = snapshot.zones || [];
  const locations = snapshot.locations || [];
  const stats = snapshot.stats || {};

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("be_way_management_snapshot");
      if (error) throw error;
      setSnapshot(data || {});
      const firstReady = data?.ready_queue?.[0];
      setSelectedWaybill((prev) => prev || firstReady?.waybill_no || data?.wayplans?.[0]?.waybill_no || "");
      setSelectedAsset((prev) => prev || data?.assets?.[0]?.asset_code || "VAN-A");

      const dispatch = await supabase.rpc("be_enterprise_dispatch_snapshot");
      if (!dispatch.error) setDispatchJobs(dispatch.data?.jobs || []);
    } catch (e: any) {
      setMessage(e.message || "Failed to load wayplan data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const actor = async () => {
    const { data } = await supabase.auth.getUser();
    return data?.user?.email || "wayplan@britiumexpress.com";
  };

  const createWayplan = async () => {
    if (!selectedWaybill) return setMessage("Select a waybill first.");
    setLoading(true);
    try {
      const email = await actor();
      const asset = assets.find((a: any) => a.asset_code === selectedAsset) || {};
      const { error } = await supabase.rpc("be_wayplan_create_for_waybill", {
        p_waybill_no: selectedWaybill,
        p_branch_code: "YGN",
        p_route_code: asset.zone_code || "YGN-R1",
        p_route_name: routeName || asset.asset_name || "YGN Route 1",
        p_dispatch_date: new Date().toISOString().slice(0, 10),
        p_vehicle_id: selectedAsset || "VAN-A",
        p_rider_email: asset.rider_email || null,
        p_driver_email: asset.driver_email || "testdriver@britiumexpress.com",
        p_helper_email: asset.helper_email || null,
        p_actor_email: email,
      });
      if (error) throw error;
      setMessage("Wayplan created/updated.");
      await loadAll();
    } catch (e: any) {
      setMessage(e.message || "Create wayplan failed.");
    } finally {
      setLoading(false);
    }
  };

  const generateByFleet = async () => {
    setLoading(true);
    try {
      const email = await actor();
      const { data, error } = await supabase.rpc("be_generate_wayplans_by_fleet", { p_actor_email: email });
      if (error) throw error;
      setMessage(`Generated wayplan/fleet assignment: ${data?.generated_assignments ?? 0} rows.`);
      await loadAll();
    } catch (e: any) {
      setMessage(e.message || "Generate failed.");
    } finally {
      setLoading(false);
    }
  };

  const publish = async (wayplanCode: string) => {
    setLoading(true);
    try {
      const email = await actor();
      const { error } = await supabase.rpc("be_publish_wayplan_to_dispatch", {
        p_wayplan_code: wayplanCode,
        p_actor_email: email,
      });
      if (error) throw error;
      setMessage(`${wayplanCode} published to Dispatch / Rider App.`);
      await loadAll();
    } catch (e: any) {
      setMessage(e.message || "Publish failed.");
    } finally {
      setLoading(false);
    }
  };

  const downloadGeoJson = () => {
    const features = [
      ...locations.map((l: any) => ({
        type: "Feature",
        id: l.location_code,
        properties: { name: l.location_name, layer_type: l.location_type, address: l.address, marker_color: l.color_hex },
        geometry: { type: "Point", coordinates: [Number(l.lng || 0), Number(l.lat || 0)] },
      })),
      ...zones.map((z: any) => ({
        type: "Feature",
        id: z.zone_code,
        properties: {
          zone_name: z.zone_name, layer_type: "zone_boundary", operation_type: z.operation_type,
          vehicle_assignment: z.vehicle_assignment, color_hex: z.color_hex, townships_included: z.townships_included
        },
        geometry: z.geometry || { type: "MultiPolygon", coordinates: [] },
      })),
    ];
    const blob = new Blob([JSON.stringify({ type: "FeatureCollection", features }, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "britium_fleet_zoning.geojson"; a.click();
    URL.revokeObjectURL(url);
  };

  const readyWaybills = useMemo(() => {
    const map = new Map();
    ready.forEach((r: any) => {
      const key = r.waybill_no;
      if (!map.has(key)) map.set(key, { ...r, count: 0 });
      map.get(key).count += 1;
    });
    return Array.from(map.values());
  }, [ready]);

  if (loading && !ready.length && !wayplans.length) {
    return <div className="min-h-screen bg-[#07111e] p-8 text-slate-300"><Loader2 className="animate-spin" /> Loading wayplan command...</div>;
  }

  return (
    <div className="min-h-screen bg-[#07111e] p-6 text-slate-100">
      <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <Route className="text-[#C09B30]" />
          <div>
            <div className="font-bold tracking-[0.12em] text-[#C09B30]">WAYPLAN COMMAND CENTER</div>
            <div className="text-sm text-slate-400">Live way management, fleet zoning, dispatch handoff</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={loadAll} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold"><RefreshCw className="mr-1 inline h-4 w-4" />Sync Fresh</button>
          <button onClick={generateByFleet} className="rounded-lg bg-[#C09B30] px-3 py-2 text-sm font-semibold text-black"><Settings2 className="mr-1 inline h-4 w-4" />Generate</button>
          <button onClick={() => printManifest(dispatchJobs, assets, "Manifest")} className="rounded-lg border border-slate-700 px-3 py-2 text-sm"><Printer className="mr-1 inline h-4 w-4" />Manifest</button>
          <button onClick={downloadGeoJson} className="rounded-lg border border-slate-700 px-3 py-2 text-sm"><Download className="mr-1 inline h-4 w-4" />GeoJSON</button>
        </div>
      </div>

      {message && <div className="mb-4 rounded-lg border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-200">{message}</div>}

      <div className="mb-4 flex gap-2">
        {["command", "fleet", "mapbox"].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === t ? "bg-[#C09B30] text-black" : "border border-slate-700 text-slate-300"}`}>
            {t === "command" ? "Command" : t === "fleet" ? "Fleet Zoning" : "Mapbox Payload"}
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["READY ROWS", stats.ready_rows],
          ["WAYPLANS", stats.wayplans],
          ["ZONES", stats.zones],
          ["ASSETS", stats.assets],
        ].map(([k, v]: any) => (
          <div key={k} className="rounded-xl border border-slate-800 bg-[#0B2133] p-3 text-center">
            <div className="text-xl font-bold text-[#C09B30]">{v ?? 0}</div>
            <div className="text-xs text-slate-400">{k}</div>
          </div>
        ))}
      </div>

      {tab === "command" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
          <section className="rounded-xl border border-slate-800 bg-[#0B2133] p-4">
            <h3 className="mb-3 font-semibold"><Send className="mr-1 inline h-4 w-4" /> Create / Generate Wayplan</h3>
            <label className="text-xs text-slate-400">READY WAYBILL</label>
            <select value={selectedWaybill} onChange={(e) => setSelectedWaybill(e.target.value)} className="mb-3 mt-1 w-full rounded-lg border border-slate-700 bg-[#071827] p-2">
              {readyWaybills.map((r: any) => <option key={r.waybill_no} value={r.waybill_no}>{r.waybill_no} · {r.pickup_id} · {r.count} parcels</option>)}
              {wayplans.map((w: any) => <option key={w.waybill_no} value={w.waybill_no}>{w.waybill_no} · existing</option>)}
            </select>
            <label className="text-xs text-slate-400">FLEET ASSET / VEHICLE</label>
            <select value={selectedAsset} onChange={(e) => setSelectedAsset(e.target.value)} className="mb-3 mt-1 w-full rounded-lg border border-slate-700 bg-[#071827] p-2">
              {assets.map((a: any) => <option key={a.asset_code} value={a.asset_code}>{a.asset_name} · {a.asset_code}</option>)}
            </select>
            <label className="text-xs text-slate-400">ROUTE NAME</label>
            <input value={routeName} onChange={(e) => setRouteName(e.target.value)} className="mb-3 mt-1 w-full rounded-lg border border-slate-700 bg-[#071827] p-2" />
            <button onClick={createWayplan} className="mb-2 w-full rounded-lg bg-[#C09B30] px-3 py-2 font-semibold text-black">Create / Update Wayplan</button>
            <button onClick={generateByFleet} className="w-full rounded-lg bg-emerald-700 px-3 py-2 font-semibold text-white">Generate by Vans & Riders</button>
          </section>

          <section className="rounded-xl border border-slate-800 bg-[#0B2133] p-4">
            <h3 className="mb-3 font-semibold"><Truck className="mr-1 inline h-4 w-4" /> Operational Wayplans</h3>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-400"><tr><th>WAYPLAN</th><th>WAYBILL</th><th>PARCELS</th><th>STATUS</th><th>DISPATCH</th><th>ACTION</th></tr></thead>
                <tbody>
                  {wayplans.map((w: any) => (
                    <tr key={w.wayplan_code || w.wayplan_no} className="border-t border-slate-800">
                      <td className="py-2 text-[#C09B30]">{w.wayplan_code || w.wayplan_no}</td>
                      <td>{w.waybill_no}</td>
                      <td>{w.parcel_count || w.total_parcels}</td>
                      <td>{w.wayplan_status}</td>
                      <td>{w.dispatch_status}</td>
                      <td><button onClick={() => publish(w.wayplan_code || w.wayplan_no)} className="rounded bg-emerald-600 px-2 py-1 text-xs">Publish</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="lg:col-span-2 rounded-xl border border-slate-800 bg-[#0B2133] p-4">
            <h3 className="mb-3 font-semibold"><Database className="mr-1 inline h-4 w-4" /> Ready Queue From Warehouse</h3>
            <div className="max-h-[300px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#0B2133] text-left text-xs text-slate-400"><tr><th>PICKUP</th><th>WAYBILL</th><th>PROPOSED WAYPLAN</th><th>DELIVERY WAY</th><th>TOWNSHIP</th><th>STATUS</th></tr></thead>
                <tbody>
                  {ready.map((r: any) => (
                    <tr key={r.delivery_way_id} className="border-t border-slate-800">
                      <td className="py-2">{r.pickup_id}</td><td>{r.waybill_no}</td><td className="text-[#C09B30]">{r.proposed_wayplan_no}</td><td>{r.delivery_way_id}</td><td>{r.delivery_township}</td><td>{r.warehouse_status} / {r.wayplan_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === "fleet" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-800 bg-[#0B2133] p-4">
            <h3 className="mb-3 font-semibold"><Truck className="mr-1 inline h-4 w-4" /> Fleet Assets</h3>
            <div className="grid gap-2">
              {assets.map((a: any) => (
                <div key={a.asset_code} className="rounded-lg border border-slate-700 bg-[#071827] p-3">
                  <div className="font-semibold">{a.asset_name}</div>
                  <div className="text-xs text-sky-300">{a.asset_code} · {a.asset_type} · {a.operation_type}</div>
                  <div className="text-xs text-slate-400">{a.vehicle_plate || "-"} · {a.driver_email || a.rider_email || "-"}</div>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-xl border border-slate-800 bg-[#0B2133] p-4">
            <h3 className="mb-3 font-semibold"><Layers className="mr-1 inline h-4 w-4" /> Zones / Locations</h3>
            <div className="space-y-2">
              {zones.map((z: any) => <div key={z.zone_code} className="rounded-lg border border-slate-700 bg-[#071827] p-3"><div className="font-semibold">{z.zone_name}</div><div className="text-xs text-slate-400">{(z.townships_included || []).join(", ")}</div></div>)}
              {locations.map((l: any) => <div key={l.location_code} className="rounded-lg border border-slate-700 bg-[#071827] p-3"><MapPin className="mr-1 inline h-4 w-4 text-[#C09B30]" />{l.location_name} · {l.location_type}</div>)}
            </div>
          </section>
        </div>
      )}

      {tab === "mapbox" && (
        <pre className="max-h-[70vh] overflow-auto rounded-xl border border-slate-800 bg-[#0B2133] p-4 text-xs text-slate-300">
          {JSON.stringify({ zones, locations }, null, 2)}
        </pre>
      )}
    </div>
  );
}
