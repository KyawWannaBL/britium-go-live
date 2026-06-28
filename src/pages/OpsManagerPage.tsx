import React, { useEffect, useState } from 'react';
import { CheckCircle, RefreshCw, Zap, Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' };
const FF = { body:"'Poppins', sans-serif" };

const TRANSLATIONS = {
  en: {
    title: "Operations Manager",
    subtitle: "Generate wayplans, review route loads, preview stop sequences and monitor COD exposure.",
    genWp: "Generate Wayplans",
    refresh: "Refresh",
    synced: "Live backend synchronized.",
    kpiRoutes: "Routes",
    kpiStops: "Stops",
    kpiCod: "Total COD",
    kpiSel: "Selected Stops",
    wpTitle: "Wayplans",
    thWpNo: "Wayplan No",
    thRoute: "Route Code",
    thDate: "Route Date",
    thTotalStops: "Total Stops",
    thTotalCod: "Total COD",
    thAssigned: "Assigned To",
    thStatus: "Status",
    stopTitle: "Route Stops Preview",
    thSeq: "Sequence No",
    thWayId: "Way ID",
    thCreatedAt: "Created At",
    loading: "Loading...",
    noRows: "No rows found.",
    rowsCount: (n: number) => `${n} row(s)`
  },
  mm: {
    title: "လုပ်ငန်းလည်ပတ်မှု မန်နေဂျာ",
    subtitle: "လမ်းကြောင်းများ ဖန်တီးခြင်း၊ စစ်ဆေးခြင်း နှင့် ကောက်ခံငွေများကို စောင့်ကြည့်ခြင်း။",
    genWp: "လမ်းကြောင်း ဖန်တီးမည်",
    refresh: "ပြန်လည်ဆန်းသစ်ရန်",
    synced: "နောက်ခံစနစ်နှင့် အချိန်ပြည့်ချိတ်ဆက်ထားသည်။",
    kpiRoutes: "လမ်းကြောင်းများ",
    kpiStops: "မှတ်တိုင်များ",
    kpiCod: "စုစုပေါင်း ကောက်ခံငွေ",
    kpiSel: "ရွေးချယ်ထားသော မှတ်တိုင်",
    wpTitle: "လမ်းကြောင်းများ",
    thWpNo: "လမ်းကြောင်း အမှတ်",
    thRoute: "လမ်းကြောင်း ကုဒ်",
    thDate: "နေ့စွဲ",
    thTotalStops: "မှတ်တိုင် စုစုပေါင်း",
    thTotalCod: "ကောက်ခံငွေ စုစုပေါင်း",
    thAssigned: "တာဝန်ပေးထားသူ",
    thStatus: "အခြေအနေ",
    stopTitle: "မှတ်တိုင် အစီအစဉ်များ",
    thSeq: "စဉ်",
    thWayId: "လမ်းညွှန် ID",
    thCreatedAt: "ဖန်တီးခဲ့ချိန်",
    loading: "ဆွဲယူနေပါသည်...",
    noRows: "မှတ်တမ်း မတွေ့ပါ။",
    rowsCount: (n: number) => `မှတ်တမ်း ${n} ခု`
  }
};

export default function OpsManagerPage() {
  const { lang, setLang } = useLanguage();
  const t = TRANSLATIONS[lang as 'en' | 'mm'] || TRANSLATIONS.en;

  const [routes, setRoutes] = useState<any[]>([]);
  const [stops, setStops] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      supabase.from('wayplan_routes').select('*').order('created_at', { ascending: false }),
      supabase.from('wayplan_stops').select('*').order('created_at', { ascending: false }),
    ]).then(([{ data: r }, { data: s }]) => {
      setRoutes(r ?? []);
      setStops(s ?? []);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const totalCod = (stops ?? []).reduce((acc, s) => acc + (parseFloat(s.cod_amount) || 0), 0);

  const kpis = [
    { label: t.kpiRoutes, value: (routes ?? []).length },
    { label: t.kpiStops, value: (stops ?? []).length },
    { label: t.kpiCod, value: `${totalCod.toLocaleString()} MMK` },
    { label: t.kpiSel, value: 0 },
  ];

  return (
    <div style={{ background: C.bg, padding: 24, minHeight: '100%', fontFamily: FF.body, color: C.text }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} tr:hover td{background:#0f2a42!important} ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-thumb{background:#1a3a5c;border-radius:4px}`}</style>

      <div style={{ maxWidth: 1600, margin: '0 auto', display: 'grid', gap: 20 }}>
        
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.gold, margin: 0 }}>{t.title}</h1>
            <p style={{ fontSize: 14, color: C.muted, marginTop: 6, marginBottom: 0 }}>{t.subtitle}</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', background: C.panel2, borderRadius: 8, padding: 4, border: `1px solid ${C.border}` }}>
              <button onClick={() => setLang('en')} style={{ padding: '6px 12px', borderRadius: 6, background: lang === 'en' ? C.panelHover : 'transparent', color: lang === 'en' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: FF.body }}>EN</button>
              <button onClick={() => setLang('mm')} style={{ padding: '6px 12px', borderRadius: 6, background: lang === 'mm' ? C.panelHover : 'transparent', color: lang === 'mm' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: FF.body }}>မြန်မာ</button>
            </div>
            <button style={{ border: 'none', background: `linear-gradient(135deg, ${C.gold}, ${C.orange})`, color: '#000', borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: FF.body }}>
              <Zap size={16} /> {t.genWp}
            </button>
            <button onClick={load} style={{ border: `1px solid ${C.border}`, background: C.panel2, color: C.text2, borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: FF.body }}>
              <RefreshCw size={16} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} /> {t.refresh}
            </button>
          </div>
        </div>

        <div style={{ background: 'rgba(34,197,94,0.1)', border: `1px solid ${C.success}40`, borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 10, color: C.success, fontWeight: 600, fontSize: 14 }}>
          <CheckCircle size={18} />
          {t.synced}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16 }}>
          {kpis.map((item, i) => (
            <div key={i} style={{ background: C.panel, border: `1px solid ${C.border}`, borderTop: `3px solid ${i === 2 ? C.gold : C.info}`, borderRadius: 16, padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted }}>{item.label}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: i === 2 ? C.gold : C.info, marginTop: 8 }}>{loading ? '—' : item.value}</div>
            </div>
          ))}
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 20, background: C.panel2, borderBottom: `1px solid ${C.border}` }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0 }}>{t.wpTitle}</h2>
            <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>{t.rowsCount(routes.length)}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead style={{ background: C.bg }}>
                <tr>
                  {[t.thWpNo, t.thRoute, t.thDate, t.thTotalStops, t.thTotalCod, t.thAssigned, t.thStatus].map(col => (
                    <th key={col} style={{ padding: '12px 16px', color: C.muted, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={7} style={{ padding: '30px', textAlign: 'center', color: C.muted }}>{t.loading}</td></tr>}
                {!loading && routes.length === 0 && <tr><td colSpan={7} style={{ padding: '30px', textAlign: 'center', color: C.muted }}>{t.noRows}</td></tr>}
                {!loading && routes.map((row, i) => (
                  <tr key={row.id ?? i} className="hover:bg-[#0f2a42] transition" style={{ borderBottom: `1px solid ${C.border}66` }}>
                    <td style={{ padding: '12px 16px', color: C.gold, fontWeight: 800 }}>{row.wayplan_no ?? '—'}</td>
                    <td style={{ padding: '12px 16px', color: C.text2 }}>{row.route_code ?? '—'}</td>
                    <td style={{ padding: '12px 16px', color: C.text2 }}>{row.route_date ? new Date(row.route_date).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '12px 16px', color: C.text2, fontWeight: 700 }}>{row.total_stops ?? '—'}</td>
                    <td style={{ padding: '12px 16px', color: C.orange, fontWeight: 800 }}>{row.total_cod != null ? Number(row.total_cod).toLocaleString() : '—'}</td>
                    <td style={{ padding: '12px 16px', color: C.info, fontWeight: 600 }}>{row.assigned_to ?? '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ display: 'inline-flex', padding: '4px 10px', borderRadius: 20, border: `1px solid ${String(row.status).toLowerCase() === 'active' ? C.success : C.info}40`, background: String(row.status).toLowerCase() === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(56,189,248,0.1)', color: String(row.status).toLowerCase() === 'active' ? C.success : C.info, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>
                        {row.status ?? '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 20, background: C.panel2, borderBottom: `1px solid ${C.border}` }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0 }}>{t.stopTitle}</h2>
            <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>{t.rowsCount(stops.length)}</span>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 500 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead style={{ background: C.bg, position: 'sticky', top: 0 }}>
                <tr>
                  {[t.thSeq, t.thWayId, t.thCreatedAt].map(col => (
                    <th key={col} style={{ padding: '12px 16px', color: C.muted, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={3} style={{ padding: '30px', textAlign: 'center', color: C.muted }}>{t.loading}</td></tr>}
                {!loading && stops.length === 0 && <tr><td colSpan={3} style={{ padding: '30px', textAlign: 'center', color: C.muted }}>{t.noRows}</td></tr>}
                {!loading && stops.map((row, i) => (
                  <tr key={row.id ?? i} className="hover:bg-[#0f2a42] transition" style={{ borderBottom: `1px solid ${C.border}66` }}>
                    <td style={{ padding: '12px 16px', fontWeight: 800, color: C.text2 }}>{row.sequence_no ?? i + 1}</td>
                    <td style={{ padding: '12px 16px', color: C.info, fontWeight: 700, fontFamily: 'monospace' }}>{row.way_id ?? '—'}</td>
                    <td style={{ padding: '12px 16px', color: C.muted }}>{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}