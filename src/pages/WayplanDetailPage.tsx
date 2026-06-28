import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, Download, Loader2, Map, Navigation,
  Play, RefreshCw, Search, Truck, UserPlus, XCircle, FileText
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' };

const TRANSLATIONS = {
  en: {
    back: "Back to Workflow",
    refresh: "Refresh",
    exportStops: "Export Stops",
    assign: "Assign / Edit",
    start: "Start Route",
    complete: "Complete",
    cancel: "Cancel",
    stops: "Stops",
    delivered: "Delivered",
    exceptions: "Exceptions",
    totalCod: "Total COD",
    lblRider: "Rider",
    lblDriver: "Driver",
    lblHelper: "Helper",
    lblVehicle: "Vehicle",
    lblNote: "Note",
    search: "Search stop, tracking, receiver, phone...",
    allStops: "All Stops",
    allStopsSub: "Dedicated route detail screen for dispatch tracking.",
    thSeq: "Seq", thTrack: "Tracking", thMerch: "Merchant", thRecv: "Receiver", thPhone: "Phone", thTown: "Township", thAddr: "Address", thCod: "COD", thWgt: "Weight", thStat: "Status", thAction: "Actions",
    noStops: "No stops found for this wayplan.",
    maps: "Maps", picked: "Picked", transit: "Transit", btnDelivered: "Done", btnFailed: "Failed",
    routeAct: "Route Activity",
    errNotFound: "Wayplan not found.",
    loading: "Loading wayplan detail...",
  },
  mm: {
    back: "အနောက်သို့ ပြန်သွားရန်",
    refresh: "ပြန်လည်ဆန်းသစ်ရန်",
    exportStops: "မှတ်တိုင်စာရင်း ထုတ်ယူရန်",
    assign: "တာဝန်ပေး / ပြင်ဆင်ရန်",
    start: "စတင်ရန်",
    complete: "ပြီးစီးပြီ",
    cancel: "ပယ်ဖျက်မည်",
    stops: "မှတ်တိုင်များ",
    delivered: "ပို့ဆောင်ပြီး",
    exceptions: "ပြဿနာများ",
    totalCod: "စုစုပေါင်း ကောက်ခံငွေ",
    lblRider: "ပို့ဆောင်သူ",
    lblDriver: "ယာဉ်မောင်း",
    lblHelper: "ယာဉ်နောက်လိုက်",
    lblVehicle: "ယာဉ်အမှတ်",
    lblNote: "မှတ်ချက်",
    search: "မှတ်တိုင်၊ ဖုန်း၊ လက်ခံသူ ရှာရန်...",
    allStops: "မှတ်တိုင်အားလုံး",
    allStopsSub: "ပို့ဆောင်ရေး ထိန်းချုပ်မှုအတွက် သီးသန့် မျက်နှာပြင်",
    thSeq: "စဉ်", thTrack: "ခြေရာခံအမှတ်", thMerch: "ကုန်သည်", thRecv: "လက်ခံသူ", thPhone: "ဖုန်း", thTown: "မြို့နယ်", thAddr: "လိပ်စာ", thCod: "ကောက်ခံငွေ", thWgt: "အလေးချိန်", thStat: "အခြေအနေ", thAction: "လုပ်ဆောင်ရန်",
    noStops: "ဤလမ်းကြောင်းအတွက် မှတ်တိုင်များ မတွေ့ပါ။",
    maps: "မြေပုံ", picked: "ကောက်ယူပြီး", transit: "ပို့ဆောင်ဆဲ", btnDelivered: "ပြီးစီး", btnFailed: "မအောင်မြင်",
    routeAct: "လမ်းကြောင်း လှုပ်ရှားမှုများ",
    errNotFound: "လမ်းကြောင်း မတွေ့ပါ။",
    loading: "လမ်းကြောင်း အသေးစိတ် ဆွဲယူနေပါသည်...",
  }
};

function formatMoney(value: any) { return `${Number(value || 0).toLocaleString()} MMK`; }

function StatusBadge({ status }: { status: string }) {
  const norm = (status || 'pending').toLowerCase();
  const tones: Record<string, { bg: string; c: string; b: string }> = {
    completed:{bg:'#052e16',c:C.success,b:'#166534'}, delivered:{bg:'#052e16',c:C.success,b:'#166534'}, resolved:{bg:'#052e16',c:C.success,b:'#166534'},
    assigned:{bg:'#082f49',c:C.info,b:'#0c4a6e'}, in_progress:{bg:'#082f49',c:C.info,b:'#0c4a6e'}, in_transit:{bg:'#082f49',c:C.info,b:'#0c4a6e'}, out_for_delivery:{bg:'#082f49',c:C.info,b:'#0c4a6e'}, picked_up:{bg:'#082f49',c:C.info,b:'#0c4a6e'},
    failed:{bg:'#4a0521',c:C.error,b:'#831843'}, exception:{bg:'#4a0521',c:C.error,b:'#831843'}, cancelled:{bg:'#4a0521',c:C.error,b:'#831843'}, refused:{bg:'#4a0521',c:C.error,b:'#831843'},
  };
  const t = tones[norm] || {bg:C.panel2, c:C.muted, b:C.border};
  return <span style={{ background: t.bg, color: t.c, border: `1px solid ${t.b}`, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{norm.replace(/_/g, ' ')}</span>;
}

function mapsUrl(stop: any) {
  if (stop.google_maps_url) return stop.google_maps_url;
  if (stop.latitude && stop.longitude) return `https://www.google.com/maps/search/?api=1&query=${stop.latitude},${stop.longitude}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${stop.address} ${stop.township}`)}`;
}

export default function WayplanDetailPage() {
  const { lang, setLang } = useLanguage();
  const t = TRANSLATIONS[lang as 'en' | 'mm'] || TRANSLATIONS.en;
  const { wayplanId } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<any>({ wayplan: null, summary: { stop_count: 0, total_cod: 0, delivered: 0, exceptions: 0 }, stops: [], events: [] });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadDetail = useCallback(async () => {
    if (!wayplanId) return;
    setLoading(true); setError('');
    const { data, error: rpcError } = await supabase.rpc('be_delivery_wayplan_detail', { p_wayplan_id: wayplanId });
    if (rpcError) { setError(rpcError.message); setDetail({ wayplan: null, summary: { stop_count: 0, total_cod: 0, delivered: 0, exceptions: 0 }, stops: [], events: [] }); } 
    else { setDetail(data || { wayplan: null, summary: { stop_count: 0, total_cod: 0, delivered: 0, exceptions: 0 }, stops: [], events: [] }); }
    setLoading(false);
  }, [wayplanId]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const filteredStops = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return detail.stops || [];
    return (detail.stops || []).filter((s: any) => [s.tracking_no, s.merchant_name, s.receiver_name, s.receiver_phone, s.township, s.address, s.status, s.rider_name].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [detail.stops, search]);

  async function assignWayplan() {
    if (!detail.wayplan) return;
    const riderName = window.prompt('Rider name', detail.wayplan.assigned_rider_name || '');
    if (riderName === null) return;
    const driverName = window.prompt('Driver name, optional', detail.wayplan.assigned_driver_name || '') || '';
    const helperName = window.prompt('Helper name, optional', detail.wayplan.assigned_helper_name || '') || '';
    const vehiclePlate = window.prompt('Vehicle plate, optional', detail.wayplan.assigned_vehicle_plate || '') || '';
    const note = window.prompt('Assignment note, optional', detail.wayplan.dispatcher_note || '') || '';
    setActionLoading('assign'); setError(''); setMessage('');
    const { error: rpcError } = await supabase.rpc('be_delivery_assign_wayplan', { p_wayplan_id: detail.wayplan.id, p_rider_name: riderName, p_driver_name: driverName, p_helper_name: helperName, p_vehicle_plate: vehiclePlate, p_note: note });
    if (rpcError) setError(rpcError.message); else { setMessage('Assignment saved.'); await loadDetail(); }
    setActionLoading('');
  }

  async function setWayplanStatus(status: string) {
    if (!detail.wayplan) return;
    const note = window.prompt(`Note for ${status}, optional`, '') || '';
    setActionLoading(status); setError(''); setMessage('');
    const { error: rpcError } = await supabase.rpc('be_delivery_set_wayplan_status', { p_wayplan_id: detail.wayplan.id, p_status: status, p_note: note });
    if (rpcError) setError(rpcError.message); else { setMessage(`Wayplan changed to ${status}.`); await loadDetail(); }
    setActionLoading('');
  }

  async function setStopStatus(stop: any, status: string) {
    const note = window.prompt(`Note for ${status}, optional`, stop.note || '') || '';
    setActionLoading(`${stop.id}-${status}`); setError(''); setMessage('');
    const { error: rpcError } = await supabase.rpc('be_delivery_update_stop_status', { p_stop_id: stop.id, p_status: status, p_note: note });
    if (rpcError) setError(rpcError.message); else { setMessage(`${stop.tracking_no || 'Stop'} changed to ${status}.`); await loadDetail(); }
    setActionLoading('');
  }

  function exportStops() {
    const rows = [['Seq', 'Tracking No', 'Merchant', 'Receiver', 'Phone', 'Township', 'Address', 'COD', 'Delivery Fee', 'Actual kg', 'Included kg', 'Extra kg', 'Weight Fee', 'Status', 'Rider', 'Note'], ...filteredStops.map((s: any) => [s.stop_seq, s.tracking_no, s.merchant_name, s.receiver_name, s.receiver_phone, s.township, s.address, s.cod_amount, s.delivery_fee, s.actual_kg, s.included_kg, s.extra_kg, s.weight_fee, s.status, s.rider_name, s.note])];
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `${detail.wayplan?.wayplan_no || 'wayplan'}-stops.csv`; link.click(); URL.revokeObjectURL(url);
  }

  if (loading) return <div style={{ minHeight: '100vh', background: C.bg, display: 'grid', placeItems: 'center', color: C.muted, fontFamily: "'Poppins', sans-serif" }}><div style={{ textAlign: 'center' }}><Loader2 size={32} className="animate-spin mb-4 mx-auto text-[#f6b84b]"/>{t.loading}</div></div>;
  if (!detail.wayplan) return <div style={{ minHeight: '100vh', background: C.bg, padding: 24, fontFamily: "'Poppins', sans-serif" }}><div style={{ background: 'rgba(255,79,134,0.1)', border: `1px solid ${C.error}`, borderRadius: 16, padding: 24, color: C.error }}><p style={{ fontWeight: 800, fontSize: 18 }}>{t.errNotFound}</p><button onClick={() => navigate('/delivery-workflow')} style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text, padding: '10px 16px', borderRadius: 8, marginTop: 16, cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}><ArrowLeft size={16} className="inline mr-2"/>{t.back}</button></div></div>;

  const wp = detail.wayplan;
  const btnStyle = (bg: string, color: string, border: string) => ({ display: 'inline-flex', alignItems: 'center', gap: 8, background: bg, color: color, border: `1px solid ${border}`, padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Poppins', sans-serif" });
  const smBtnStyle = (bg: string, color: string, border: string) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, background: bg, color: color, border: `1px solid ${border}`, padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'Poppins', sans-serif" });

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 24, color: C.text, fontFamily: "'Poppins', sans-serif" }}>
      <div style={{ maxWidth: 1600, margin: '0 auto', display: 'grid', gap: 20 }}>
        
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <button onClick={() => navigate('/delivery-workflow')} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 12, fontFamily: "'Poppins', sans-serif" }}><ArrowLeft size={16}/>{t.back}</button>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: C.gold, margin: 0, letterSpacing: '0.05em' }}>{wp.wayplan_no}</h1>
            <p style={{ color: C.text2, margin: '6px 0 12px', fontSize: 15, fontWeight: 600 }}>{wp.route_name}</p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <StatusBadge status={wp.status} />
              <span style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.muted, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{wp.planned_date ? new Date(wp.planned_date).toLocaleDateString() : '-'}</span>
              <span style={{ background: 'rgba(246,184,75,0.1)', border: `1px solid ${C.gold}40`, color: C.gold, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 800 }}>{formatMoney(detail.summary.total_cod)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', background: C.panel2, borderRadius: 8, padding: 4, border: `1px solid ${C.border}` }}>
              <button onClick={() => setLang('en')} style={{ padding: '6px 12px', borderRadius: 6, background: lang === 'en' ? C.panelHover : 'transparent', color: lang === 'en' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Poppins', sans-serif" }}>EN</button>
              <button onClick={() => setLang('mm')} style={{ padding: '6px 12px', borderRadius: 6, background: lang === 'mm' ? C.panelHover : 'transparent', color: lang === 'mm' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Poppins', sans-serif" }}>မြန်မာ</button>
            </div>
            <button onClick={loadDetail} disabled={!!actionLoading} style={btnStyle(C.panel2, C.text, C.border)}><RefreshCw size={16}/>{t.refresh}</button>
            <button onClick={exportStops} style={btnStyle(C.panel2, C.text, C.border)}><Download size={16}/>{t.exportStops}</button>
            <button onClick={assignWayplan} disabled={!!actionLoading} style={btnStyle(C.panel2, C.info, C.border)}><UserPlus size={16}/>{t.assign}</button>
            <button onClick={() => setWayplanStatus('in_progress')} disabled={!!actionLoading} style={btnStyle(C.panel2, C.success, C.border)}><Play size={16}/>{t.start}</button>
            <button onClick={() => setWayplanStatus('completed')} disabled={!!actionLoading} style={btnStyle(C.success, '#000', C.success)}><CheckCircle2 size={16}/>{t.complete}</button>
            <button onClick={() => setWayplanStatus('cancelled')} disabled={!!actionLoading} style={btnStyle(C.error, '#fff', C.error)}><XCircle size={16}/>{t.cancel}</button>
          </div>
        </div>

        {(message || error) && <div style={{ padding: 16, borderRadius: 12, background: error ? 'rgba(255,79,134,0.1)' : 'rgba(34,197,94,0.1)', color: error ? C.error : C.success, border: `1px solid ${error ? C.error : C.success}40`, fontSize: 14, fontWeight: 700 }}>{error || message}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {[[t.stops, detail.summary.stop_count, C.info], [t.delivered, detail.summary.delivered, C.success], [t.exceptions, detail.summary.exceptions, C.error], [t.totalCod, formatMoney(detail.summary.total_cod), C.gold]].map(([lbl, val, col]: any) => (
            <div key={lbl} style={{ background: C.panel, border: `1px solid ${C.border}`, borderTop: `3px solid ${col}`, borderRadius: 16, padding: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{lbl}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: col, marginTop: 8 }}>{val}</div>
            </div>
          ))}
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, fontSize: 14 }}>
            <div><span style={{ color: C.muted, fontWeight: 700, textTransform: 'uppercase', fontSize: 11, display: 'block', marginBottom: 4 }}>{t.lblRider}</span><span style={{ fontWeight: 700 }}>{wp.assigned_rider_name || '—'}</span></div>
            <div><span style={{ color: C.muted, fontWeight: 700, textTransform: 'uppercase', fontSize: 11, display: 'block', marginBottom: 4 }}>{t.lblDriver}</span><span style={{ fontWeight: 700 }}>{wp.assigned_driver_name || '—'}</span></div>
            <div><span style={{ color: C.muted, fontWeight: 700, textTransform: 'uppercase', fontSize: 11, display: 'block', marginBottom: 4 }}>{t.lblHelper}</span><span style={{ fontWeight: 700 }}>{wp.assigned_helper_name || '—'}</span></div>
            <div><span style={{ color: C.muted, fontWeight: 700, textTransform: 'uppercase', fontSize: 11, display: 'block', marginBottom: 4 }}>{t.lblVehicle}</span><span style={{ fontWeight: 700 }}>{wp.assigned_vehicle_plate || '—'}</span></div>
          </div>
          {wp.dispatcher_note && <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.border}` }}><span style={{ color: C.muted, fontWeight: 700, textTransform: 'uppercase', fontSize: 11, display: 'block', marginBottom: 4 }}>{t.lblNote}</span><span style={{ fontSize: 14, color: C.text2 }}>{wp.dispatcher_note}</span></div>}
        </div>

        <div style={{ position: 'relative' }}>
          <Search size={18} color={C.muted} style={{ position: 'absolute', left: 16, top: 16 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.search} style={{ width: '100%', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 16px 16px 48px', color: C.text, fontSize: 14, outline: 'none', fontFamily: "'Poppins', sans-serif" }} />
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: 20, borderBottom: `1px solid ${C.border}`, background: C.panel2 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}><FileText size={18} color={C.info}/> {t.allStops}</h2>
            <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0' }}>{t.allStopsSub}</p>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 1400, textAlign: 'left', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.bg }}>
                  {[t.thSeq, t.thTrack, t.thMerch, t.thRecv, t.thPhone, t.thTown, t.thAddr, t.thCod, t.thWgt, t.thStat, t.thAction].map(h => <th key={h} style={{ padding: '14px 16px', color: C.muted, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filteredStops.length === 0 ? <tr><td colSpan={11} style={{ padding: 40, textAlign: 'center', color: C.muted }}>{t.noStops}</td></tr> : filteredStops.map((stop: any) => (
                  <tr key={stop.id} style={{ borderBottom: `1px solid ${C.border}66`, background: 'transparent' }} className="hover:bg-[#0f2a42] transition">
                    <td style={{ padding: '14px 16px', fontWeight: 800, color: C.gold }}>{stop.stop_seq || '—'}</td>
                    <td style={{ padding: '14px 16px', fontWeight: 700, fontFamily: 'monospace', color: C.info }}>{stop.tracking_no || '—'}</td>
                    <td style={{ padding: '14px 16px' }}>{stop.merchant_name || '—'}</td>
                    <td style={{ padding: '14px 16px' }}>{stop.receiver_name || '—'}</td>
                    <td style={{ padding: '14px 16px', fontFamily: 'monospace' }}>{stop.receiver_phone || '—'}</td>
                    <td style={{ padding: '14px 16px' }}>{stop.township || '—'}</td>
                    <td style={{ padding: '14px 16px', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={stop.address}>{stop.address || '—'}</td>
                    <td style={{ padding: '14px 16px', fontWeight: 700, color: C.gold }}>{formatMoney(stop.cod_amount)}</td>
                    <td style={{ padding: '14px 16px', fontSize: 11, color: C.muted }}><div>Act: {stop.actual_kg || 0} kg</div><div>Inc: {stop.included_kg || 0} kg</div></td>
                    <td style={{ padding: '14px 16px' }}><StatusBadge status={stop.status} /></td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <a href={mapsUrl(stop)} target="_blank" rel="noreferrer" style={{ ...smBtnStyle(C.panel2, C.text, C.border), textDecoration: 'none' }}><Navigation size={12}/>{t.maps}</a>
                        <button onClick={() => setStopStatus(stop, 'picked_up')} disabled={!!actionLoading} style={smBtnStyle(C.panel2, C.text, C.border)}><Truck size={12}/>{t.picked}</button>
                        <button onClick={() => setStopStatus(stop, 'in_transit')} disabled={!!actionLoading} style={smBtnStyle(C.panel2, C.text, C.border)}><Map size={12}/>{t.transit}</button>
                        <button onClick={() => setStopStatus(stop, 'delivered')} disabled={!!actionLoading} style={smBtnStyle('rgba(34,197,94,0.1)', C.success, C.success)}><CheckCircle2 size={12}/>{t.btnDelivered}</button>
                        <button onClick={() => setStopStatus(stop, 'failed')} disabled={!!actionLoading} style={smBtnStyle('rgba(255,79,134,0.1)', C.error, C.error)}><XCircle size={12}/>{t.btnFailed}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {detail.events.length > 0 && (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 16px' }}>{t.routeAct}</h2>
            <div style={{ display: 'grid', gap: 10 }}>
              {detail.events.slice(0, 10).map((ev: any) => (
                <div key={ev.id} style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{ev.action}: <span style={{ color: C.muted }}>{ev.old_status || '—'}</span> <span style={{ color: C.info }}>→</span> <span style={{ color: C.gold }}>{ev.new_status || '—'}</span></p>
                    <span style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace' }}>{new Date(ev.created_at).toLocaleString()}</span>
                  </div>
                  {ev.note && <p style={{ margin: '8px 0 0', fontSize: 13, color: C.text2 }}>{ev.note}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}