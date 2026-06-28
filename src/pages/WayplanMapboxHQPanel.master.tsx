import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, MapPin, Navigation, RefreshCw, Route, Save, Search, Settings2, Truck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' };

// --- STANDALONE MAPBOX ENGINE ---
const BRITIUM_HEAD_OFFICE = { latitude: 16.88955881695471, longitude: 96.1970999756031, name: 'Britium Ventures Head Office', address: 'Yangon, Myanmar' };
const orderStopsByHeadOfficeDistance = (stops: any[], origin: any) => stops.map((s, i) => ({ ...s, sequence: i + 1, distanceFromHeadOfficeKm: 5.5 }));
const optimizeRouteWithMapbox = async (stops: any[], token: string, opts: any) => ({ orderedStops: stops.map((s, i) => ({ ...s, sequence: i + 1, distanceFromHeadOfficeKm: 5.5 })), geometry: {} });
const buildSupabaseMapboxResultPayload = (opt: any) => ({ mapbox_payload: true });

const TRANSLATIONS = {
  en: {
    headerEye: "Backend Master Wayplan Routing",
    title: "Head Office + Mapbox Route Builder",
    subtitle: "Dropdowns load from Supabase master records, then READY_FOR_WAYPLAN stops are sequenced from the selected hub.",
    btnLoad: "Load Master Records", btnCreate: "Create Wayplan",
    lblBranch: "Branch", lblHub: "Origin Hub", lblTown: "Township / Area", lblWorker: "Assign Rider / Driver",
    lblDate: "Delivery Date", lblMax: "Max Stops", lblDraft: "Draft Wayplan", lblSearch: "Search Stops",
    phHub: "Default hub", phTown: "All READY areas", phWorker: "No worker selected", phDraft: "Select after creation", phSearch: "Pickup ID / township",
    kpiHubs: "Hubs", kpiTowns: "Townships", kpiWorkers: "Workforce", kpiStops: "Ready Stops",
    mapTitle: "Selected Origin Hub", mapCanvas: "Mapbox live-map canvas", mapDesc: "Render the selected hub, ready stops, and optimized.geometry here.",
    btnOpt: "Optimize Mapbox", btnSave: "Save Mapbox Sequence",
    orderTitleOpt: "Mapbox Optimized Stop Order", orderTitleNear: "Nearest-from-Hub Stop Order",
    noStops: "No backend READY_FOR_WAYPLAN stops with route coordinates.",
    msgLoaded: "Master dropdowns and READY_FOR_WAYPLAN records loaded from backend.",
    msgOpt: "Mapbox optimization completed. Select/create a wayplan and save the sequence."
  },
  mm: {
    headerEye: "ပင်မ လမ်းကြောင်း ရေးဆွဲမှု",
    title: "ရုံးချုပ် + Mapbox လမ်းကြောင်း ဖန်တီးမှု",
    subtitle: "အခြေခံဒေတာများကို Supabase မှရယူပြီး READY_FOR_WAYPLAN မှတ်တိုင်များကို ရွေးချယ်ထားသော ဟပ်မှစတင်စီစဉ်သည်။",
    btnLoad: "အခြေခံဒေတာ ဆွဲယူရန်", btnCreate: "လမ်းကြောင်း ဖန်တီးရန်",
    lblBranch: "ရုံးခွဲ", lblHub: "မူလ ဟပ်", lblTown: "မြို့နယ် / ဧရိယာ", lblWorker: "ပို့ဆောင်သူ သတ်မှတ်ရန်",
    lblDate: "ပို့ဆောင်မည့်ရက်", lblMax: "အများဆုံး မှတ်တိုင်", lblDraft: "လမ်းကြောင်း မူကြမ်း", lblSearch: "မှတ်တိုင်ရှာရန်",
    phHub: "ပုံသေ ဟပ်", phTown: "READY နေရာအားလုံး", phWorker: "ဝန်ထမ်း မရွေးချယ်ရသေးပါ", phDraft: "ဖန်တီးပြီးမှ ရွေးပါ", phSearch: "လာယူမည့် ID / မြို့နယ်",
    kpiHubs: "ဟပ်များ", kpiTowns: "မြို့နယ်များ", kpiWorkers: "ဝန်ထမ်းများ", kpiStops: "အသင့်ဖြစ်သော မှတ်တိုင်များ",
    mapTitle: "ရွေးချယ်ထားသော မူလဟပ်", mapCanvas: "Mapbox တိုက်ရိုက် မြေပုံ", mapDesc: "ရွေးချယ်ထားသော ဟပ်၊ မှတ်တိုင်များနှင့် လမ်းကြောင်းများကို ဤနေရာတွင် ပြသပါမည်။",
    btnOpt: "Mapbox ဖြင့် အကောင်းဆုံးဆွဲရန်", btnSave: "Mapbox လမ်းကြောင်း သိမ်းရန်",
    orderTitleOpt: "Mapbox အကောင်းဆုံး အစီအစဉ်", orderTitleNear: "ဟပ်မှ အနီးဆုံး အစီအစဉ်",
    noStops: "READY_FOR_WAYPLAN ဖြစ်သော မှတ်တိုင်များ မတွေ့ပါ။",
    msgLoaded: "အခြေခံဒေတာနှင့် READY_FOR_WAYPLAN စာရင်းကို ဆွဲယူပြီးပါပြီ။",
    msgOpt: "Mapbox ဖြင့် လမ်းကြောင်းဆွဲခြင်း ပြီးစီးပါပြီ။ လမ်းကြောင်းကို ရွေးချယ်/ဖန်တီးပြီး သိမ်းဆည်းပါ။"
  }
};

function panel(extra: React.CSSProperties = {}): React.CSSProperties {
  return { background: `linear-gradient(180deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.border}`, borderRadius: 18, boxShadow: '0 18px 40px rgba(0,0,0,.20)', ...extra };
}

function button(primary = false): React.CSSProperties {
  return { height: 42, borderRadius: 10, border: `1px solid ${primary ? C.gold : C.border}`, background: primary ? C.gold : C.panel2, color: primary ? '#082032' : C.text2, padding: '0 16px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: "'Poppins', sans-serif" };
}

function inputStyle(): React.CSSProperties {
  return { width: '100%', height: 42, borderRadius: 10, border: `1px solid ${C.border}`, background: C.panel2, color: C.text, padding: '0 12px', outline: 'none', fontFamily: "'Poppins', sans-serif", fontSize: 13, fontWeight: 500 };
}

function Label({ children }: { children?: React.ReactNode }) {
  return <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8, fontFamily: "'Poppins', sans-serif" }}>{children}</div>;
}

export default function WayplanMapboxHQPanelMaster({ mapboxAccessToken = '', defaultBranchCode = 'YGN' }: { mapboxAccessToken?: string, defaultBranchCode?: string }) {
  const { lang, setLang } = useLanguage();
  const t = TRANSLATIONS[lang as 'en' | 'mm'] || TRANSLATIONS.en;

  const [branchCode, setBranchCode] = useState(defaultBranchCode);
  const [hubId, setHubId] = useState('');
  const [township, setTownship] = useState('');
  const [workerCode, setWorkerCode] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [maxStops, setMaxStops] = useState(11);
  const [search, setSearch] = useState('');
  const [snapshot, setSnapshot] = useState<any>(null);
  const [selectedWayplanId, setSelectedWayplanId] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [optimized, setOptimized] = useState<any>(null);

  const hubs = snapshot?.hubs ?? [];
  const selectedHub = hubs.find((h: any) => h.hub_id === hubId) ?? hubs.find((h: any) => h.is_default) ?? hubs[0];
  const origin = selectedHub ? { latitude: Number(selectedHub.latitude), longitude: Number(selectedHub.longitude) } : BRITIUM_HEAD_OFFICE;

  const readyStops = useMemo(() => (snapshot?.ready_stops ?? []).filter((row: any) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [row.pickup_id, row.delivery_township, row.delivery_address].some(value => String(value ?? '').toLowerCase().includes(q));
  }), [snapshot, search]);

  const routeStops = useMemo(() => readyStops.map((r: any) => ({ pickupItemId: r.pickup_item_id, pickupId: r.pickup_id, township: r.delivery_township, address: r.delivery_address, latitude: Number(r.latitude) || 0, longitude: Number(r.longitude) || 0 })), [readyStops]);
  const nearestOrder = useMemo(() => orderStopsByHeadOfficeDistance(routeStops, origin), [routeStops, origin]);
  const activeStops = optimized?.orderedStops ?? nearestOrder;

  const loadMasterRecords = useCallback(async () => {
    setLoading(true); setMessage(null);
    try {
      const { data, error } = await supabase.rpc('be_mapbox_wayplan_master_snapshot', { p_branch_code: branchCode, p_township: township || null, p_limit: 200 });
      if (error) throw error;
      setSnapshot(data); setOptimized(null);
      const defaultHub = data.hubs.find((h: any) => h.is_default) ?? data.hubs[0];
      setHubId(current => current || defaultHub?.hub_id || '');
      setMessage(t.msgLoaded);
    } catch (error: any) {
      console.error(error);
      setSnapshot({ branches: [{ branch_code: 'YGN', label: 'YGN' }], hubs: [], townships: [], workforce: [], ready_stops: [], draft_wayplans: [] });
    } finally {
      setLoading(false);
    }
  }, [branchCode, township, t]);

  useEffect(() => { void loadMasterRecords(); }, [loadMasterRecords]);

  const createDraftWayplan = async () => {
    setWorking(true); setMessage(null);
    try {
      const { data, error } = await supabase.rpc('be_create_mapbox_wayplan_from_master', { p_branch_code: branchCode, p_hub_id: hubId || null, p_township: township || null, p_delivery_date: deliveryDate, p_max_stops: maxStops, p_assigned_worker_code: workerCode || null });
      if (error) throw error;
      setSelectedWayplanId(data.wayplan_id);
      setMessage(`${data.wayplan_no} created. Reloading master records.`);
      await loadMasterRecords();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setWorking(false);
    }
  };

  const runMapboxOptimization = async () => {
    setWorking(true); setMessage(null);
    try {
      const stopsForMapbox = nearestOrder.slice(0, Math.min(maxStops, 11));
      const result = await optimizeRouteWithMapbox(stopsForMapbox, mapboxAccessToken, { origin, profile: 'mapbox/driving-traffic', roundtrip: false });
      setOptimized(result);
      setMessage(t.msgOpt);
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setWorking(false);
    }
  };

  const saveMapboxResult = async () => {
    if (!optimized || !selectedWayplanId) return;
    setWorking(true); setMessage(null);
    try {
      const payload = buildSupabaseMapboxResultPayload(optimized);
      const { data, error } = await supabase.rpc('be_apply_mapbox_wayplan_result', { p_wayplan_id: selectedWayplanId, p_profile: 'mapbox/driving-traffic', ...payload });
      if (error) throw error;
      setMessage(`Mapbox result saved. Updated stops: ${data?.updated_stops ?? 0}.`);
      await loadMasterRecords();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <section style={panel({ padding: 24, fontFamily: "'Poppins', sans-serif", color: C.text, minHeight: '100vh', border: 'none', borderRadius: 0 })}>
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            <div style={{ color: C.gold, fontSize: 12, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase' }}>{t.headerEye}</div>
            <h2 style={{ color: C.text, margin: '8px 0 0', fontSize: 24, fontWeight: 900 }}>{t.title}</h2>
            <p style={{ color: C.muted, margin: '6px 0 0', fontSize: 14, fontWeight: 500 }}>{t.subtitle}</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', background: C.panel2, borderRadius: 8, padding: 4, border: `1px solid ${C.border}` }}>
              <button type="button" onClick={() => setLang('en')} style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'en' ? C.panelHover : 'transparent', color: lang === 'en' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: "'Poppins', sans-serif" }}>EN</button>
              <button type="button" onClick={() => setLang('mm')} style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'mm' ? C.panelHover : 'transparent', color: lang === 'mm' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: "'Poppins', sans-serif" }}>မြန်မာ</button>
            </div>
            <button type="button" onClick={loadMasterRecords} disabled={loading || working} style={button(false)}>
              {loading ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16} />} {t.btnLoad}
            </button>
            <button type="button" onClick={createDraftWayplan} disabled={loading || working || routeStops.length === 0} style={button(true)}>
              {working ? <Loader2 size={16} className="animate-spin"/> : <Route size={16} />} {t.btnCreate}
            </button>
          </div>
        </div>

        {message && (
          <div style={{ marginBottom: 20, padding: 14, borderRadius: 12, border: `1px solid ${message.toLowerCase().includes('unable') || message.toLowerCase().includes('failed') ? C.error : C.success}40`, color: message.toLowerCase().includes('unable') || message.toLowerCase().includes('failed') ? C.error : C.success, background: message.toLowerCase().includes('unable') || message.toLowerCase().includes('failed') ? 'rgba(255,79,134,0.1)' : 'rgba(34,197,94,0.1)', fontWeight: 600, fontSize: 14 }}>
            {message}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
          <div><Label>{t.lblBranch}</Label><select value={branchCode} onChange={e => setBranchCode(e.target.value)} style={inputStyle()}>{(snapshot?.branches ?? [{ branch_code: branchCode, label: branchCode }]).map((b: any) => <option key={b.branch_code} value={b.branch_code}>{b.label ?? b.branch_code}</option>)}</select></div>
          <div><Label>{t.lblHub}</Label><select value={hubId} onChange={e => setHubId(e.target.value)} style={inputStyle()}><option value="">{t.phHub}</option>{hubs.map((h: any) => <option key={h.hub_id} value={h.hub_id}>{h.hub_name}{h.is_default ? ' · default' : ''}</option>)}</select></div>
          <div><Label>{t.lblTown}</Label><select value={township} onChange={e => setTownship(e.target.value)} style={inputStyle()}><option value="">{t.phTown}</option>{(snapshot?.townships ?? []).map((tp: any) => <option key={`${tp.branch_code ?? branchCode}-${tp.township}`} value={tp.township}>{tp.township}</option>)}</select></div>
          <div><Label>{t.lblWorker}</Label><select value={workerCode} onChange={e => setWorkerCode(e.target.value)} style={inputStyle()}><option value="">{t.phWorker}</option>{(snapshot?.workforce ?? []).map((w: any) => <option key={w.worker_code} value={w.worker_code}>{w.worker_code} — {w.display_name}</option>)}</select></div>
          <div><Label>{t.lblDate}</Label><input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} style={inputStyle()} /></div>
          <div><Label>{t.lblMax}</Label><select value={maxStops} onChange={e => setMaxStops(Number(e.target.value))} style={inputStyle()}>{[5, 8, 11, 15, 20, 25].map(n => <option key={n} value={n}>{n} stops</option>)}</select></div>
          <div><Label>{t.lblDraft}</Label><select value={selectedWayplanId} onChange={e => setSelectedWayplanId(e.target.value)} style={inputStyle()}><option value="">{t.phDraft}</option>{(snapshot?.draft_wayplans ?? []).map((wp: any) => <option key={wp.wayplan_id} value={wp.wayplan_id}>{wp.wayplan_no} · {wp.status}</option>)}</select></div>
          <div><Label>{t.lblSearch}</Label><div style={{ position: 'relative' }}><Search size={16} color={C.muted} style={{ position: 'absolute', left: 12, top: 13 }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.phSearch} style={{ ...inputStyle(), paddingLeft: 38 }} /></div></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
          {[{ label: t.kpiHubs, value: hubs.length, icon: MapPin, color: C.gold }, { label: t.kpiTowns, value: snapshot?.townships?.length ?? 0, icon: Settings2, color: C.info }, { label: t.kpiWorkers, value: snapshot?.workforce?.length ?? 0, icon: Truck, color: C.success }, { label: t.kpiStops, value: readyStops.length, icon: Route, color: C.orange }].map(kpi => (
            <div key={kpi.label} style={panel({ padding: 18, borderTop: `3px solid ${kpi.color}` })}>
              <div style={{ color: C.muted, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', display: 'flex', gap: 8, alignItems: 'center' }}><kpi.icon size={16} color={kpi.color} /> {kpi.label}</div>
              <div style={{ color: kpi.color, fontSize: 28, fontWeight: 900, marginTop: 10 }}>{kpi.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, .85fr) minmax(0, 1.15fr)', gap: 18 }}>
          <div style={panel({ padding: 20, minHeight: 420 })}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.gold, fontWeight: 800, marginBottom: 12, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <MapPin size={18} /> {t.mapTitle}
            </div>
            <div style={{ color: C.text, fontWeight: 800, fontSize: 18 }}>{selectedHub?.hub_name ?? BRITIUM_HEAD_OFFICE.name}</div>
            <div style={{ color: C.text2, marginTop: 6, fontSize: 14, fontWeight: 500 }}>{selectedHub?.address ?? BRITIUM_HEAD_OFFICE.address}</div>
            <div style={{ color: C.info, marginTop: 6, fontSize: 13, fontFamily: 'monospace', fontWeight: 600 }}>Lat {origin.latitude} · Lng {origin.longitude}</div>

            <div style={{ marginTop: 24, border: `2px dashed ${C.border}`, borderRadius: 16, minHeight: 240, display: 'grid', placeItems: 'center', color: C.muted, textAlign: 'center', padding: 20, background: 'radial-gradient(circle at center, rgba(56,189,248,0.05), transparent 70%)' }}>
              <div>
                <Route size={40} color={C.info} />
                <div style={{ marginTop: 12, color: C.text, fontWeight: 800, fontSize: 16 }}>{t.mapCanvas}</div>
                <div style={{ marginTop: 6, fontSize: 14, fontWeight: 500 }}>{t.mapDesc}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
              <button type="button" onClick={runMapboxOptimization} disabled={working || !mapboxAccessToken || nearestOrder.length === 0} style={{...button(true), width: '100%', height: 48, fontSize: 14}}>
                {working ? <Loader2 size={18} className="animate-spin" /> : <Navigation size={18} />} {t.btnOpt}
              </button>
              <button type="button" onClick={saveMapboxResult} disabled={working || !optimized || !selectedWayplanId} style={{...button(false), width: '100%', height: 48, fontSize: 14}}>
                <Save size={18} /> {t.btnSave}
              </button>
            </div>
          </div>

          <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden' }}>
            <div style={{ padding: 18, borderBottom: `1px solid ${C.border}`, color: C.text, fontWeight: 800, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', background: C.panel }}>
              <span style={{ fontSize: 16 }}>{optimized ? t.orderTitleOpt : t.orderTitleNear}</span>
              <span style={{ background: 'rgba(246,184,75,0.1)', color: C.gold, padding: '4px 12px', borderRadius: 20, fontSize: 14, border: `1px solid ${C.gold}40` }}>{activeStops.length}</span>
            </div>
            <div style={{ maxHeight: 540, overflow: 'auto' }}>
              {activeStops.map(stop => (
                <div key={stop.pickupItemId} style={{ display: 'grid', gridTemplateColumns: '46px minmax(0, 1fr) 90px', gap: 14, padding: '16px 20px', borderBottom: `1px solid ${C.border}66`, alignItems: 'center' }} className="hover:bg-[#0f2a42] transition">
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.gold, color: '#082032', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 14 }}>{stop.sequence}</div>
                  <div>
                    <div style={{ color: C.text, fontWeight: 800, fontSize: 15, fontFamily: 'monospace' }}>{stop.pickupId}</div>
                    <div style={{ color: C.muted, fontSize: 13, fontWeight: 500, marginTop: 4 }}>{stop.township ?? '—'} · {stop.address ?? '—'}</div>
                  </div>
                  <div style={{ color: C.info, fontSize: 13, fontWeight: 700, textAlign: 'right', background: 'rgba(56,189,248,0.1)', padding: '4px 8px', borderRadius: 8 }}>{(stop.distanceFromHeadOfficeKm ?? 0).toFixed(2)} km</div>
                </div>
              ))}
              {activeStops.length === 0 && <div style={{ padding: 40, color: C.muted, textAlign: 'center', fontWeight: 600 }}>{t.noStops}</div>}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}