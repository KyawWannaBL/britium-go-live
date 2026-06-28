import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Map as MapIcon, MapPin, RefreshCw, Route, Search, Sparkles, Truck, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' };

const TRANSLATIONS = {
  en: {
    title: 'Wayplan Zone Operations',
    subtitle: 'Monitor active routes, dispatch zones, live map readiness, COD exposure, and fleet distribution.',
    refresh: 'Refresh', download: 'Download CSV',
    kpiRoutes: 'Active Routes', kpiZones: 'Active Zones', kpiCod: 'Expected COD', kpiStops: 'Total Stops',
    searchPh: 'Search routes or zones...',
    tblTitle: 'Zone Dispatch Register',
    thRoute: 'Route Code', thZone: 'Zone', thStops: 'Stops', thCod: 'COD Amount', thRider: 'Assigned To', thStat: 'Status', thTraffic: 'Traffic', thResult: 'Done / Failed',
    msgEmpty: 'No active wayplan routes found. Generate a wayplan after warehouse READY_FOR_WAYPLAN.',
    aiBtn: 'Ops Load Check', aiTitle: 'Zone Distribution Analysis',
    liveMap: 'Live Mapbox Operations Screen', liveMapSub: 'Mapbox-ready display area for current ways, traffic condition, rider movement, and active zone density.',
  },
  mm: {
    title: 'လမ်းကြောင်း ဇုန် လုပ်ငန်းလည်ပတ်မှု',
    subtitle: 'လက်ရှိ ယာဉ်ကြောများ၊ ဇုန်များ၊ Live Map အသင့်ဖြစ်မှု၊ COD ပမာဏနှင့် ယာဉ်ဖြန့်ကျက်မှုများကို စောင့်ကြည့်ရန်။',
    refresh: 'ပြန်လည်ဆန်းသစ်ရန်', download: 'CSV ဒေါင်းလုဒ်',
    kpiRoutes: 'လက်ရှိ ယာဉ်ကြောများ', kpiZones: 'လက်ရှိ ဇုန်များ', kpiCod: 'မျှော်မှန်း COD', kpiStops: 'စုစုပေါင်း မှတ်တိုင်',
    searchPh: 'ယာဉ်ကြော သို့မဟုတ် ဇုန်များကို ရှာရန်...',
    tblTitle: 'ဇုန်အလိုက် စေလွှတ်မှု မှတ်တမ်း',
    thRoute: 'ယာဉ်ကြော ကုဒ်', thZone: 'ဇုန်', thStops: 'မှတ်တိုင်', thCod: 'COD ပမာဏ', thRider: 'တာဝန်ပေးထားသူ', thStat: 'အခြေအနေ', thTraffic: 'ယာဉ်ကြော', thResult: 'အောင်မြင် / မအောင်မြင်',
    msgEmpty: 'လက်ရှိ ယာဉ်ကြောများ မတွေ့ပါ။ ကုန်လှောင်ရုံ READY_FOR_WAYPLAN ပြီးနောက် လမ်းကြောင်းဖန်တီးပါ။',
    aiBtn: 'လုပ်ငန်းဝန် စစ်ဆေးရန်', aiTitle: 'ဇုန်အလိုက် ဖြန့်ကျက်မှု ခွဲခြမ်းစိတ်ဖြာချက်',
    liveMap: 'Mapbox Live လုပ်ငန်း မျက်နှာပြင်', liveMapSub: 'လက်ရှိ လမ်းကြောင်းများ၊ ယာဉ်ကြောအခြေအနေ၊ Rider လှုပ်ရှားမှုနှင့် ဇုန်အလိုက် ပမာဏကို ပြသရန် Mapbox အသင့်နေရာ။',
  }
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function badge(status: string | null | undefined): React.CSSProperties {
  const tones: Record<string, { bg: string; c: string; b: string }> = {
    active:{bg:'#052e16',c:C.success,b:'#166534'}, completed:{bg:'#052e16',c:C.success,b:'#166534'}, paid:{bg:'#052e16',c:C.success,b:'#166534'},
    dispatched:{bg:'#082f49',c:C.info,b:'#0c4a6e'}, pending:{bg:'#451a03',c:C.warning,b:'#92400e'}, failed:{bg:'#4a0521',c:C.error,b:'#831843'},
  };
  const tone = tones[String(status ?? '').toLowerCase()] ?? { bg: C.panel2, c: C.muted, b: C.border };
  return { display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, fontFamily:"'Poppins', sans-serif", textTransform:'uppercase', letterSpacing:'0.05em', whiteSpace:'nowrap', background:tone.bg, color:tone.c, border:`1px solid ${tone.b}` };
}

export default function WayplanZonePage() {
  const { lang, setLang } = useLanguage();
  const t = TRANSLATIONS[lang as 'en' | 'mm'] || TRANSLATIONS.en;
  
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [analysis, setAnalysis] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('dispatch_routes').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      setRoutes(data ?? []);
    } catch (err) {
      console.error(err);
      setRoutes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return routes.filter(route => !q || [route.route_code, route.zone, route.assigned_to, route.rider, route.status].some(v => String(v ?? '').toLowerCase().includes(q)));
  }, [routes, search]);

  const uniqueZones = new Set(routes.map(route => route.zone).filter(Boolean)).size;
  const totalCod = routes.reduce((sum, route) => sum + toNumber(route.total_cod), 0);
  const totalStops = routes.reduce((sum, route) => sum + toNumber(route.total_stops), 0);
  const activeRoute = filtered[0];

  const buildLocalAnalysis = () => {
    if (routes.length === 0) return `${t.aiTitle}: No active routes are loaded.`;
    const byZone = new Map<string, number>();
    routes.forEach(r => byZone.set(r.zone ?? 'Unknown', (byZone.get(r.zone ?? 'Unknown') ?? 0) + toNumber(r.total_stops)));
    const busiest = [...byZone.entries()].sort((a, b) => b[1] - a[1])[0];
    const failed = routes.reduce((sum, r) => sum + toNumber(r.failed_stops), 0);
    return `Busiest zone: ${busiest?.[0] ?? 'N/A'} with ${busiest?.[1] ?? 0} stop(s). Total failed stops: ${failed}. Prioritize standby riders for high-stop zones.`;
  };

  const downloadCsv = () => {
    const headers = ['route_code','zone','total_stops','total_cod','assigned_to','status','traffic_condition','successful_stops','failed_stops'];
    const body = filtered.map(row => headers.map(key => JSON.stringify(String(row[key] ?? ''))).join(',')).join('\n');
    const blob = new Blob([headers.join(',') + '\n' + body], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `dispatch-zone-routes-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div style={{ background:C.bg, padding:24, minHeight:'100%', fontFamily:"'Poppins', sans-serif", color:C.text }}>
      <style>{`input:focus{outline:none;border-color:#f6b84b!important;box-shadow:0 0 0 3px rgba(246,184,75,0.12)!important} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}`}</style>
      <div style={{ maxWidth:1600, margin:'0 auto', display:'grid', gap:18 }}>
        <section style={{ background:`linear-gradient(135deg, ${C.panel}, ${C.panel2})`, border:`1px solid ${C.border}`, borderRadius:22, padding:22 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
            <div>
              <h1 style={{ fontSize:22, fontWeight:900, textTransform:'uppercase', letterSpacing:'0.06em', color:C.gold, margin:0 }}>{t.title}</h1>
              <p style={{ fontSize:14, color:C.muted, margin:'6px 0 0', fontWeight: 500 }}>{t.subtitle}</p>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
              <div style={{ display:'flex', background:C.panel2, borderRadius:8, padding:4, border:`1px solid ${C.border}` }}>
                <button type="button" onClick={() => setLang('en')} style={{ padding:'6px 12px', borderRadius:4, background:lang === 'en' ? C.panelHover : 'transparent', color:lang === 'en' ? C.text : C.muted, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:"'Poppins', sans-serif" }}>EN</button>
                <button type="button" onClick={() => setLang('mm')} style={{ padding:'6px 12px', borderRadius:4, background:lang === 'mm' ? C.panelHover : 'transparent', color:lang === 'mm' ? C.text : C.muted, border:'none', cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:"'Poppins', sans-serif" }}>မြန်မာ</button>
              </div>
              <button type="button" onClick={() => setAnalysis(buildLocalAnalysis())} style={{ background:`linear-gradient(135deg, ${C.gold}, ${C.orange})`, color:'#082032', border:'none', borderRadius:10, padding:'10px 16px', fontWeight:800, display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontFamily:"'Poppins', sans-serif" }}><Sparkles size={14}/>{t.aiBtn}</button>
              <button type="button" onClick={downloadCsv} style={{ border:`1px solid ${C.border}`, background:C.panel2, color:C.text2, borderRadius:10, padding:'10px 14px', display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontWeight: 600, fontFamily:"'Poppins', sans-serif" }}><Download size={14}/>{t.download}</button>
              <button type="button" onClick={() => void load()} disabled={loading} style={{ border:`1px solid ${C.border}`, background:C.panel2, color:C.text2, borderRadius:10, padding:'10px 14px', display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontWeight: 600, fontFamily:"'Poppins', sans-serif" }}><RefreshCw size={14} className={loading ? "animate-spin" : ""}/>{t.refresh}</button>
            </div>
          </div>
        </section>

        {analysis && (
          <section style={{ padding:18, background:'linear-gradient(135deg,#0f2a42,#0b2236)', border:`1px solid ${C.info}`, borderRadius:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:10 }}>
              <strong style={{ color:C.info, display:'flex', gap:8, alignItems:'center', fontWeight: 800 }}><Sparkles size={16}/>{t.aiTitle}</strong>
              <button type="button" onClick={() => setAnalysis(null)} style={{ background:'transparent', border:'none', color:C.muted, cursor:'pointer' }}><X size={18}/></button>
            </div>
            <p style={{ color:C.text2, lineHeight:1.6, margin:'10px 0 0', fontWeight: 500 }}>{analysis}</p>
          </section>
        )}

        <section style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12 }}>
          {[{ label:t.kpiRoutes, value:routes.length, icon:Route }, { label:t.kpiZones, value:uniqueZones, icon:MapPin }, { label:t.kpiCod, value:`${totalCod.toLocaleString()} MMK`, icon:MapIcon }, { label:t.kpiStops, value:totalStops, icon:Truck }].map(item => {
            const Icon = item.icon;
            return <div key={item.label} style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:18 }}><div style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em', color:C.muted, marginBottom:8, display:'flex', alignItems:'center', gap:8 }}><Icon size={14} color={C.gold}/>{item.label}</div><div style={{ fontSize:24, fontWeight:900, color:C.gold }}>{loading ? '—' : item.value}</div></div>
          })}
        </section>

        <section style={{ display:'grid', gridTemplateColumns:'minmax(0,1.1fr) minmax(360px,.9fr)', gap:18 }}>
          <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:16, padding:20 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, gap:12, flexWrap:'wrap' }}>
              <h2 style={{ fontSize:18, fontWeight:800, color:C.text2, margin:0 }}>{t.tblTitle}</h2>
              <div style={{ position:'relative', width:300 }}><Search size={14} color={C.muted} style={{ position:'absolute', left:12, top:13 }}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchPh} style={{ width:'100%', padding:'10px 12px 10px 34px', background:C.panel2, border:`1px solid ${C.border}`, borderRadius:8, color:C.text, outline:'none', fontSize:13, fontFamily:"'Poppins', sans-serif" }}/></div>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:"'Poppins', sans-serif" }}>
                <thead><tr>{[t.thRoute, t.thZone, t.thStops, t.thCod, t.thRider, t.thTraffic, t.thResult, t.thStat].map(h => <th key={h} style={{ padding:'12px 14px', background:C.panel2, color:C.muted, fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'left', borderBottom:`1px solid ${C.border}`, whiteSpace:'nowrap' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={8} style={{ padding:28, color:C.muted, textAlign:'center', fontWeight: 600 }}><Loader2 size={16} className="inline animate-spin mr-2"/> Loading live zone data...</td></tr> : filtered.length === 0 ? <tr><td colSpan={8} style={{ padding:28, color:C.muted, textAlign:'center', fontWeight: 600 }}>{t.msgEmpty}</td></tr> : filtered.map((row, i) => <tr key={row.id ?? row.route_code ?? i} style={{ background:i % 2 === 0 ? C.panel : C.panel2 }}><td style={{ padding:'12px 14px', color:C.gold, fontWeight:800, borderBottom:`1px solid ${C.border}22` }}>{row.route_code ?? '—'}</td><td style={{ padding:'12px 14px', color:C.text2, fontWeight: 500, borderBottom:`1px solid ${C.border}22` }}>{row.zone ?? '—'}</td><td style={{ padding:'12px 14px', color:C.text2, fontWeight: 500, borderBottom:`1px solid ${C.border}22` }}>{toNumber(row.total_stops)}</td><td style={{ padding:'12px 14px', color:C.text2, fontWeight: 500, borderBottom:`1px solid ${C.border}22` }}>{toNumber(row.total_cod).toLocaleString()}</td><td style={{ padding:'12px 14px', color:C.info, fontWeight: 600, borderBottom:`1px solid ${C.border}22` }}>{row.assigned_to ?? row.rider ?? '—'}</td><td style={{ padding:'12px 14px', color:C.text2, fontWeight: 500, borderBottom:`1px solid ${C.border}22` }}>{row.traffic_condition ?? '—'}</td><td style={{ padding:'12px 14px', color:C.text2, fontWeight: 500, borderBottom:`1px solid ${C.border}22` }}>{toNumber(row.successful_stops)} / {toNumber(row.failed_stops)}</td><td style={{ padding:'12px 14px', borderBottom:`1px solid ${C.border}22` }}><span style={badge(row.status)}>{row.status ?? '—'}</span></td></tr>)}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ background:`linear-gradient(135deg, ${C.panel2}, ${C.panel})`, border:`1px solid ${C.border}`, borderRadius:16, padding:20, minHeight:360 }}>
            <h2 style={{ fontSize:18, fontWeight: 800, margin:'0 0 6px', color:C.text }}>{t.liveMap}</h2>
            <p style={{ color:C.text2, fontSize:13, fontWeight: 500, lineHeight:1.5, margin:'0 0 16px' }}>{t.liveMapSub}</p>
            <div style={{ height:230, border:`1px dashed ${C.border}`, borderRadius:16, display:'grid', placeItems:'center', background:'radial-gradient(circle at 30% 20%, rgba(56,189,248,.18), transparent 35%), radial-gradient(circle at 70% 70%, rgba(246,184,75,.16), transparent 35%)' }}>
              <div style={{ textAlign:'center' }}><MapIcon size={42} color={C.gold}/><div style={{ marginTop:8, color:C.text2, fontWeight: 700 }}>Mapbox layer placeholder</div><div style={{ color:C.muted, fontSize:12, fontWeight: 500 }}>Route: {activeRoute?.route_code ?? '—'} • Zone: {activeRoute?.zone ?? '—'}</div></div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginTop:14 }}>
              <div style={{ background:C.panel2, border:`1px solid ${C.border}`, borderRadius:12, padding:12 }}><div style={{ color:C.muted, fontSize:11, fontWeight: 800, textTransform: 'uppercase' }}>Traffic</div><strong style={{ color:C.warning, display: 'block', marginTop: 4 }}>{activeRoute?.traffic_condition ?? '—'}</strong></div>
              <div style={{ background:C.panel2, border:`1px solid ${C.border}`, borderRadius:12, padding:12 }}><div style={{ color:C.muted, fontSize:11, fontWeight: 800, textTransform: 'uppercase' }}>Success</div><strong style={{ color:C.success, display: 'block', marginTop: 4 }}>{toNumber(activeRoute?.successful_stops)}</strong></div>
              <div style={{ background:C.panel2, border:`1px solid ${C.border}`, borderRadius:12, padding:12 }}><div style={{ color:C.muted, fontSize:11, fontWeight: 800, textTransform: 'uppercase' }}>Wayfail</div><strong style={{ color:C.error, display: 'block', marginTop: 4 }}>{toNumber(activeRoute?.failed_stops)}</strong></div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}