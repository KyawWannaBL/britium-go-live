import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Database, Download, Layers, Loader2, MapPin, RefreshCw, Route, Send, Settings2, Truck, Printer, Globe } from "lucide-react";

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' };

const TRANSLATIONS = {
  en: {
    title: "WAYPLAN COMMAND CENTER",
    subtitle: "Live way management, fleet zoning, dispatch handoff",
    syncFresh: "Sync Fresh",
    generate: "Generate",
    manifest: "Manifest",
    geojson: "GeoJSON",
    tabCommand: "Command",
    tabFleet: "Fleet Zoning",
    tabMapbox: "Mapbox Payload",
    kpiReady: "READY ROWS",
    kpiWayplans: "WAYPLANS",
    kpiZones: "ZONES",
    kpiAssets: "ASSETS",
    createTitle: "Create / Generate Wayplan",
    lblWaybill: "READY WAYBILL",
    lblAsset: "FLEET ASSET / VEHICLE",
    lblRouteName: "ROUTE NAME",
    btnCreate: "Create / Update Wayplan",
    btnGenerateVans: "Generate by Vans & Riders",
    opsWayplans: "Operational Wayplans",
    thWayplan: "WAYPLAN",
    thWaybill: "WAYBILL",
    thParcels: "PARCELS",
    thStatus: "STATUS",
    thDispatch: "DISPATCH",
    thAction: "ACTION",
    btnPublish: "Publish",
    readyQueue: "Ready Queue From Warehouse",
    thPickup: "PICKUP",
    thProposed: "PROPOSED WAYPLAN",
    thDelWay: "DELIVERY WAY",
    thTownship: "TOWNSHIP",
    fleetAssets: "Fleet Assets",
    zonesLocs: "Zones / Locations",
  },
  mm: {
    title: "လမ်းကြောင်း ထိန်းချုပ်ရေး ဗဟို",
    subtitle: "လမ်းကြောင်းစီမံခြင်း၊ ယာဉ်များဇုန်သတ်မှတ်ခြင်း၊ ပို့ဆောင်ရေးလွှဲပြောင်းခြင်း",
    syncFresh: "ပြန်လည်ဆန်းသစ်ရန်",
    generate: "ဖန်တီးရန်",
    manifest: "စာရင်းထုတ်ရန်",
    geojson: "GeoJSON",
    tabCommand: "ထိန်းချုပ်ရန်",
    tabFleet: "ယာဉ်များဇုန်ခွဲခြင်း",
    tabMapbox: "မြေပုံဒေတာ",
    kpiReady: "အသင့်ဖြစ်သော စာရင်း",
    kpiWayplans: "လမ်းကြောင်းများ",
    kpiZones: "ဇုန်များ",
    kpiAssets: "ယာဉ်ယန္တရားများ",
    createTitle: "လမ်းကြောင်း ဖန်တီးရန်",
    lblWaybill: "အသင့်ဖြစ်သော လမ်းညွှန်",
    lblAsset: "ယာဉ်ယန္တရား",
    lblRouteName: "လမ်းကြောင်း အမည်",
    btnCreate: "ဖန်တီး / ပြင်ဆင်မည်",
    btnGenerateVans: "ယာဉ်နှင့် ပို့ဆောင်သူများဖြင့် ဖန်တီးမည်",
    opsWayplans: "လက်ရှိ လမ်းကြောင်းများ",
    thWayplan: "လမ်းကြောင်း",
    thWaybill: "လမ်းညွှန်",
    thParcels: "ပါဆယ်များ",
    thStatus: "အခြေအနေ",
    thDispatch: "စေလွှတ်မှု",
    thAction: "လုပ်ဆောင်ရန်",
    btnPublish: "ထုတ်ပြန်မည်",
    readyQueue: "ဂိုဒေါင်မှ အသင့်ဖြစ်သော စာရင်း",
    thPickup: "လာယူမည့် ID",
    thProposed: "အဆိုပြုလမ်းကြောင်း",
    thDelWay: "ပို့ဆောင်မည့် ID",
    thTownship: "မြို့နယ်",
    fleetAssets: "ယာဉ်ယန္တရားများ",
    zonesLocs: "ဇုန်များနှင့် တည်နေရာများ",
  }
};

export default function WayplanCommandCenterPage() {
  const { lang, setLang } = useLanguage();
  const t = TRANSLATIONS[lang as 'en' | 'mm'] || TRANSLATIONS.en;

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("command");
  const [snapshot, setSnapshot] = useState<any>({ stats: {}, ready_queue: [], wayplans: [], zones: [], assets: [], locations: [] });
  const [selectedWaybill, setSelectedWaybill] = useState("");
  const [selectedAsset, setSelectedAsset] = useState("");
  const [routeName, setRouteName] = useState("YGN Route 1");

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
    return <div className="min-h-screen bg-[#07111e] p-8 text-slate-300 font-['Poppins']"><Loader2 className="animate-spin" /> Loading wayplan command...</div>;
  }

  return (
    <div className="min-h-screen bg-[#07111e] p-6 text-slate-100 font-['Poppins']">
      <div className="mb-6 flex items-center justify-between border-b border-slate-800 pb-4 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Route className="text-[#C09B30]" size={28} />
          <div>
            <div className="font-bold tracking-[0.12em] text-[#C09B30] text-lg">{t.title}</div>
            <div className="text-sm text-slate-400">{t.subtitle}</div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex bg-[#081b2e] rounded-lg p-1 border border-slate-700">
            <button onClick={() => setLang('en')} className={`px-3 py-1.5 rounded-md text-xs font-bold ${lang === 'en' ? 'bg-[#0f2a42] text-white' : 'text-slate-400'}`}>EN</button>
            <button onClick={() => setLang('mm')} className={`px-3 py-1.5 rounded-md text-xs font-bold ${lang === 'mm' ? 'bg-[#0f2a42] text-white' : 'text-slate-400'}`}>မြန်မာ</button>
          </div>
          <button onClick={loadAll} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold flex items-center gap-2"><RefreshCw size={16} />{t.syncFresh}</button>
          <button onClick={generateByFleet} className="rounded-lg bg-[#C09B30] px-4 py-2 text-sm font-semibold text-black flex items-center gap-2"><Settings2 size={16} />{t.generate}</button>
          <button onClick={downloadGeoJson} className="rounded-lg border border-slate-700 px-4 py-2 text-sm flex items-center gap-2"><Download size={16} />{t.geojson}</button>
        </div>
      </div>

      {message && <div className="mb-4 rounded-lg border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-200">{message}</div>}

      <div className="mb-6 flex gap-2">
        {["command", "fleet", "mapbox"].map((tabName) => (
          <button key={tabName} onClick={() => setTab(tabName)} className={`rounded-lg px-5 py-2.5 text-sm font-bold uppercase tracking-wider ${tab === tabName ? "bg-[#C09B30] text-black" : "border border-slate-700 text-slate-300 hover:bg-[#0f2a42]"}`}>
            {tabName === "command" ? t.tabCommand : tabName === "fleet" ? t.tabFleet : t.tabMapbox}
          </button>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          [t.kpiReady, stats.ready_rows],
          [t.kpiWayplans, stats.wayplans],
          [t.kpiZones, stats.zones],
          [t.kpiAssets, stats.assets],
        ].map(([k, v]: any) => (
          <div key={k} className="rounded-xl border border-slate-800 bg-[#0B2133] p-4 text-center shadow-lg">
            <div className="text-2xl font-black text-[#C09B30]">{v ?? 0}</div>
            <div className="text-xs font-bold text-slate-400 tracking-wider mt-1">{k}</div>
          </div>
        ))}
      </div>

      {tab === "command" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
          <section className="rounded-2xl border border-slate-800 bg-[#0B2133] p-5 shadow-xl">
            <h3 className="mb-4 font-bold flex items-center gap-2"><Send size={18} className="text-[#38bdf8]" /> {t.createTitle}</h3>
            <label className="text-[11px] font-bold text-slate-400 tracking-widest">{t.lblWaybill}</label>
            <select value={selectedWaybill} onChange={(e) => setSelectedWaybill(e.target.value)} className="mb-4 mt-1 w-full rounded-xl border border-slate-700 bg-[#071827] p-3 text-sm outline-none focus:border-[#f6b84b]">
              {readyWaybills.map((r: any) => <option key={r.waybill_no} value={r.waybill_no}>{r.waybill_no} · {r.pickup_id} · {r.count} parcels</option>)}
              {wayplans.map((w: any) => <option key={w.waybill_no} value={w.waybill_no}>{w.waybill_no} · existing</option>)}
            </select>
            
            <label className="text-[11px] font-bold text-slate-400 tracking-widest">{t.lblAsset}</label>
            <select value={selectedAsset} onChange={(e) => setSelectedAsset(e.target.value)} className="mb-4 mt-1 w-full rounded-xl border border-slate-700 bg-[#071827] p-3 text-sm outline-none focus:border-[#f6b84b]">
              {assets.map((a: any) => <option key={a.asset_code} value={a.asset_code}>{a.asset_name} · {a.asset_code}</option>)}
            </select>
            
            <label className="text-[11px] font-bold text-slate-400 tracking-widest">{t.lblRouteName}</label>
            <input value={routeName} onChange={(e) => setRouteName(e.target.value)} className="mb-6 mt-1 w-full rounded-xl border border-slate-700 bg-[#071827] p-3 text-sm outline-none focus:border-[#f6b84b]" />
            
            <button onClick={createWayplan} className="mb-3 w-full rounded-xl bg-[#C09B30] px-4 py-3 font-bold text-black hover:bg-[#d49a36] transition">{t.btnCreate}</button>
            <button onClick={generateByFleet} className="w-full rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white hover:bg-emerald-600 transition">{t.btnGenerateVans}</button>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-[#0B2133] p-5 shadow-xl">
            <h3 className="mb-4 font-bold flex items-center gap-2"><Truck size={18} className="text-[#38bdf8]" /> {t.opsWayplans}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-[11px] font-bold text-slate-400 tracking-widest border-b border-slate-800">
                  <tr><th className="pb-3">{t.thWayplan}</th><th className="pb-3">{t.thWaybill}</th><th className="pb-3">{t.thParcels}</th><th className="pb-3">{t.thStatus}</th><th className="pb-3">{t.thDispatch}</th><th className="pb-3">{t.thAction}</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {wayplans.map((w: any) => (
                    <tr key={w.wayplan_code || w.wayplan_no} className="hover:bg-[#0f2a42] transition">
                      <td className="py-3 font-bold text-[#C09B30]">{w.wayplan_code || w.wayplan_no}</td>
                      <td className="py-3">{w.waybill_no}</td>
                      <td className="py-3 font-bold">{w.parcel_count || w.total_parcels}</td>
                      <td className="py-3"><span className="bg-slate-800 px-2 py-1 rounded-md text-xs">{w.wayplan_status}</span></td>
                      <td className="py-3"><span className="bg-slate-800 px-2 py-1 rounded-md text-xs">{w.dispatch_status}</span></td>
                      <td className="py-3"><button onClick={() => publish(w.wayplan_code || w.wayplan_no)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500">{t.btnPublish}</button></td>
                    </tr>
                  ))}
                  {wayplans.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-slate-500">No operational wayplans generated.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="lg:col-span-2 rounded-2xl border border-slate-800 bg-[#0B2133] p-5 shadow-xl">
            <h3 className="mb-4 font-bold flex items-center gap-2"><Database size={18} className="text-[#38bdf8]" /> {t.readyQueue}</h3>
            <div className="max-h-[350px] overflow-auto scrollbar-thin scrollbar-thumb-slate-700">
              <table className="w-full text-sm text-left">
                <thead className="sticky top-0 bg-[#0B2133] text-[11px] font-bold text-slate-400 tracking-widest border-b border-slate-800 z-10">
                  <tr><th className="pb-3 pt-1">{t.thPickup}</th><th className="pb-3 pt-1">{t.thWaybill}</th><th className="pb-3 pt-1">{t.thProposed}</th><th className="pb-3 pt-1">{t.thDelWay}</th><th className="pb-3 pt-1">{t.thTownship}</th><th className="pb-3 pt-1">{t.thStatus}</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {ready.map((r: any) => (
                    <tr key={r.delivery_way_id} className="hover:bg-[#0f2a42] transition">
                      <td className="py-3 font-mono font-bold text-white">{r.pickup_id}</td>
                      <td className="py-3">{r.waybill_no}</td>
                      <td className="py-3 font-bold text-[#C09B30]">{r.proposed_wayplan_no}</td>
                      <td className="py-3">{r.delivery_way_id}</td>
                      <td className="py-3">{r.delivery_township}</td>
                      <td className="py-3 text-xs text-slate-400">{r.warehouse_status}</td>
                    </tr>
                  ))}
                  {ready.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-slate-500">No warehouse-ready rows.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === "fleet" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-800 bg-[#0B2133] p-5">
            <h3 className="mb-4 font-bold flex items-center gap-2"><Truck size={18} className="text-[#38bdf8]" /> {t.fleetAssets}</h3>
            <div className="grid gap-3">
              {assets.map((a: any) => (
                <div key={a.asset_code} className="rounded-xl border border-slate-700 bg-[#071827] p-4 flex justify-between items-center">
                  <div>
                    <div className="font-bold text-white">{a.asset_name}</div>
                    <div className="text-xs text-[#38bdf8] font-semibold mt-1">{a.asset_code} · {a.asset_type}</div>
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <div>{a.vehicle_plate || "No Plate"}</div>
                    <div className="mt-1">{a.driver_email || a.rider_email || "Unassigned"}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-slate-800 bg-[#0B2133] p-5">
            <h3 className="mb-4 font-bold flex items-center gap-2"><Layers size={18} className="text-[#38bdf8]" /> {t.zonesLocs}</h3>
            <div className="space-y-3">
              {zones.map((z: any) => (
                <div key={z.zone_code} className="rounded-xl border border-slate-700 bg-[#071827] p-4">
                  <div className="font-bold text-white mb-2">{z.zone_name}</div>
                  <div className="text-xs text-slate-400 leading-relaxed">{(z.townships_included || []).join(", ")}</div>
                </div>
              ))}
              {locations.map((l: any) => (
                <div key={l.location_code} className="rounded-xl border border-slate-700 bg-[#071827] p-4 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-[#C09B30]" />
                  <span className="font-bold text-sm">{l.location_name}</span>
                  <span className="text-xs text-slate-500 ml-auto">{l.location_type}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === "mapbox" && (
        <pre className="max-h-[70vh] overflow-auto rounded-2xl border border-slate-800 bg-[#0B2133] p-6 text-xs text-slate-300 font-mono">
          {JSON.stringify({ zones, locations }, null, 2)}
        </pre>
      )}
    </div>
  );
}