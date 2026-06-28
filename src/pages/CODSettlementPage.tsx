import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Search, RefreshCw, DollarSign, Layers, AlertTriangle, ShieldAlert, Download } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' };
const FF = { body: "'Poppins', sans-serif" };

const TRANSLATIONS = {
  en: {
    title: "COD SETTLEMENT CENTER",
    subtitle: "Track rider handovers, merchant settlement batches, and cash verification exceptions.",
    refresh: "Refresh",
    kpiPool: "Total COD Pool", kpiBatches: "Open Batches", kpiDisputes: "Disputed Cases", kpiShortages: "Shortage Cases",
    trackerTab: "COD Handover Tracker", batchTab: "Settlement Batches", exceptionTab: "Cash Exceptions",
    thId: "DELIVERY ID", thRider: "RIDER", thMerch: "MERCHANT", thAmount: "COD AMOUNT", thStatus: "STATUS", thTime: "COLLECTED AT", thRef: "REF",
    thBatch: "BATCH", thNet: "NET PAYABLE", thTrans: "TRANSFER DATE",
    empty: "No records found.", loading: "Loading...",
    searchPh: "Search delivery ID, receiver, rider, merchant or batch ref..."
  },
  mm: {
    title: "ကောက်ခံငွေ ရှင်းလင်းရေး ဗဟို",
    subtitle: "ပို့ဆောင်သူများထံမှ ကောက်ခံငွေများ၊ ကုန်သည်ငွေလွှဲအုပ်စုများနှင့် ငွေစာရင်းကွာဟမှု ပြဿနာများကို စောင့်ကြည့်ရန်။",
    refresh: "ဆန်းသစ်ရန်",
    kpiPool: "စုစုပေါင်း ကောက်ခံငွေစစ်ရင်း", kpiBatches: "လက်ရှိအုပ်စုများ", kpiDisputes: "ငြင်းခုံမှုများ", kpiShortages: "ငွေလိုအပ်မှုများ",
    trackerTab: "ကောက်ခံငွေ ခြေရာခံစနစ်", batchTab: "ငွေလွှဲအုပ်စုများ", exceptionTab: "ငွေစာရင်း ပြဿနာများ",
    thId: "ပို့ဆောင်မှု ID", thRider: "ပို့ဆောင်သူ", thMerch: "ကုန်သည်", thAmount: "ကောက်ခံငွေ", thStatus: "အခြေအနေ", thTime: "ကောက်ခံချိန်", thRef: "လွှဲပြောင်းမှု အမှတ်",
    thBatch: "အုပ်စု", thNet: "ရှင်းပေးရန်", thTrans: "လွှဲပြောင်းမည့်ရက်",
    empty: "မှတ်တမ်းများ မတွေ့ရှိပါ။", loading: "ဆွဲယူနေပါသည်...",
    searchPh: "ID၊ အမည်၊ ဖုန်း ရှာရန်..."
  }
};

export default function CODSettlementPage() {
  const { lang, setLang } = useLanguage();
  const t = TRANSLATIONS[lang as 'en' | 'mm'] || TRANSLATIONS.en;

  const [codRows, setCodRows] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('tracker');
  const [search, setSearch] = useState('');

  const fetchAll = async () => {
    setLoading(true);
    const [codRes, settRes] = await Promise.all([
      supabase.from('cod_deliveries').select('*').order('created_at', { ascending: false }),
      supabase.from('settlement_batches').select('*').order('created_at', { ascending: false }),
    ]);
    setCodRows(codRes.data || []);
    setBatches(settRes.data || []);
    setLoading(false);
  };

  useEffect(() => { void fetchAll(); }, []);

  const totalCOD = codRows.reduce((s, r) => s + (Number(r.cod_amount) || 0), 0);
  const filteredCod = codRows.filter(r => !search || [r.delivery_id, r.rider_name, r.batch_ref, r.merchant_code].some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase())));

  const btnSty = { height: 42, padding: '0 16px', background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: FF.body };

  return (
    <div style={{ background: C.bg, padding: 24, minHeight: '100vh', fontFamily: FF.body, color: C.text }}>
      <div style={{ maxWidth: 1600, margin: '0 auto', display: 'grid', gap: 20 }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: C.gold, margin: 0, textTransform: 'uppercase' }}>{t.title}</h1>
            <p style={{ fontSize: 14, color: C.muted, margin: '6px 0 0', fontWeight: 500 }}>{t.subtitle}</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', background: C.panel2, borderRadius: 8, padding: 4, border: `1px solid ${C.border}` }}>
              <button onClick={() => setLang('en')} style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'en' ? C.panelHover : 'transparent', color: lang === 'en' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: FF.body }}>EN</button>
              <button onClick={() => setLang('mm')} style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'mm' ? C.panelHover : 'transparent', color: lang === 'mm' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: FF.body }}>မြန်မာ</button>
            </div>
            <button onClick={fetchAll} disabled={loading} style={btnSty}>
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> {t.refresh}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {[
            { label: t.kpiPool, value: `${totalCOD.toLocaleString()} MMK`, icon: DollarSign, col: C.gold },
            { label: t.kpiBatches, value: batches.length, icon: Layers, col: C.info },
            { label: t.kpiDisputes, value: 0, icon: AlertTriangle, col: C.error },
            { label: t.kpiShortages, value: 0, icon: ShieldAlert, col: C.warning },
          ].map((k, i) => {
            const Icon = k.icon;
            return (
              <div key={i} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: C.muted, fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}><span>{k.label}</span><Icon size={16} color={k.col} /></div>
                <div style={{ fontSize: 26, fontWeight: 900, color: k.col, marginTop: 10 }}>{loading ? '—' : k.value}</div>
              </div>
            )
          })}
        </div>

        <div style={{ position: 'relative' }}>
          <Search size={16} color={C.muted} style={{ position: 'absolute', left: 16, top: 14 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.searchPh} style={{ width: '100%', height: 46, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, padding: '0 16px 0 44px', fontSize: 14, outline: 'none', fontFamily: FF.body }} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setTab('tracker')} style={{ ...btnSty, background: tab === 'tracker' ? C.panelHover : C.panel2, border: `1px solid ${tab === 'tracker' ? C.gold : C.border}`, color: tab === 'tracker' ? C.gold : C.text }}>{t.trackerTab}</button>
          <button onClick={() => setTab('batches')} style={{ ...btnSty, background: tab === 'batches' ? C.panelHover : C.panel2, border: `1px solid ${tab === 'batches' ? C.gold : C.border}`, color: tab === 'batches' ? C.gold : C.text }}>{t.batchTab}</button>
        </div>

        {tab === 'tracker' && (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead style={{ background: C.panel2 }}>
                  <tr>{[t.thId, t.thRider, t.thMerch, t.thAmount, t.thStatus, t.thTime, t.thRef].map(h => <th key={h} style={{ padding: '16px 20px', color: C.muted, fontSize: 11, fontWeight: 800, borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {loading ? <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: C.muted }}>{t.loading}</td></tr> : filteredCod.length === 0 ? <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: C.muted }}>{t.empty}</td></tr> : filteredCod.map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}66` }} className="hover:bg-[#0f2a42] transition">
                      <td style={{ padding: '16px 20px', color: C.gold, fontWeight: 800 }}>{r.delivery_id || '—'}</td>
                      <td style={{ padding: '16px 20px', fontWeight: 600 }}>{r.rider_name || '—'}</td>
                      <td style={{ padding: '16px 20px' }}>{r.merchant_code || '—'}</td>
                      <td style={{ padding: '16px 20px', fontWeight: 800 }}>{Number(r.cod_amount || 0).toLocaleString()}</td>
                      <td style={{ padding: '16px 20px' }}><span style={{ padding: '4px 10px', borderRadius: 20, background: 'rgba(56,189,248,0.1)', color: C.info, border: `1px solid ${C.info}40`, fontSize: 11, fontWeight: 800 }}>{r.status || 'COLLECTED'}</span></td>
                      <td style={{ padding: '16px 20px', color: C.muted }}>{r.collected_at ? new Date(r.collected_at).toLocaleString() : '—'}</td>
                      <td style={{ padding: '16px 20px', fontFamily: 'monospace' }}>{r.handover_ref || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'batches' && (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden' }}>
             <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead style={{ background: C.panel2 }}>
                  <tr>{[t.thBatch, t.thMerch, t.thAmount, t.thNet, t.thStatus, t.thTrans].map(h => <th key={h} style={{ padding: '16px 20px', color: C.muted, fontSize: 11, fontWeight: 800, borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {loading ? <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: C.muted }}>{t.loading}</td></tr> : batches.length === 0 ? <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: C.muted }}>{t.empty}</td></tr> : batches.map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}66` }} className="hover:bg-[#0f2a42] transition">
                      <td style={{ padding: '16px 20px', color: C.gold, fontWeight: 800 }}>{r.batch_ref || r.id || '—'}</td>
                      <td style={{ padding: '16px 20px', fontWeight: 600 }}>{r.merchant_name || r.merchant_code || '—'}</td>
                      <td style={{ padding: '16px 20px', fontWeight: 800 }}>{Number(r.cod_amount || 0).toLocaleString()}</td>
                      <td style={{ padding: '16px 20px', fontWeight: 800, color: C.info }}>{Number(r.net_payable || r.total_amount || 0).toLocaleString()}</td>
                      <td style={{ padding: '16px 20px' }}><span style={{ padding: '4px 10px', borderRadius: 20, background: 'rgba(34,197,94,0.1)', color: C.success, border: `1px solid ${C.success}40`, fontSize: 11, fontWeight: 800 }}>{r.status || 'PENDING'}</span></td>
                      <td style={{ padding: '16px 20px', color: C.muted }}>{r.transfer_date ? new Date(r.transfer_date).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}