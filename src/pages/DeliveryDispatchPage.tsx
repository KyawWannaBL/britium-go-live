import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Truck, CheckSquare, Download, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';

type DeliveryStatus = 'out_for_delivery' | 'delivered' | 'failed' | string;

interface DeliveryRow {
  id?: string | number | null;
  workflow_id?: string | null;
  merchant_name?: string | null;
  receiver?: string | null;
  township?: string | null;
  status?: DeliveryStatus | null;
  cod_amount?: string | number | null;
  delivery_fee?: string | number | null;
  created_at?: string | null;
}

const C = {
  bg: '#061524',
  panel: '#0b2236',
  panel2: '#081b2e',
  panelHover: '#0f2a42',
  border: '#1a3a5c',
  gold: '#f6b84b',
  orange: '#ff8a4c',
  text: '#eef8ff',
  text2: '#c8dff0',
  muted: '#4d7a9b',
  success: '#22c55e',
  error: '#ff4f86',
  warning: '#f59e0b',
  info: '#38bdf8',
};

const ALL = 'All';
const DELIVERY_STATUSES = [ALL, 'out_for_delivery', 'delivered', 'failed'] as const;

const TRANSLATIONS = {
  en: {
    title: 'High Density Delivery Hub',
    subtitle: 'Filter inventory, build dispatch routes, sync Supervisor/Rider queues, and prepare merchant payment settlement.',
    refresh: 'Refresh',
    kpiFilteredRows: 'Filtered Rows',
    kpiTownships: 'Townships',
    kpiFleet: 'Active Fleet',
    kpiCodTotal: 'COD Total',
    kpiDelFee: 'Delivery Fee',
    filterTownship: 'Township',
    filterStatus: 'Status',
    btnDispatch: 'Generate Dispatch Plan',
    btnConfirm: 'Confirm Merchant Payment Queue',
    btnDownload: 'Download Filtered Inventory',
    invTitle: 'Filtered Operational Inventory',
    rowsCount: (n: number) => `${n} row(s)`,
    colId: 'Workflow ID',
    colMerch: 'Merchant',
    colRecv: 'Receiver',
    colTown: 'Town',
    colStat: 'Status',
    colCod: 'COD',
    colFee: 'Del Fee',
    msgLoading: 'Loading live dispatch data...',
    msgEmpty: 'No operational rows found. Save Data Entry or Warehouse rows first.',
    msgLoadFail: 'Unable to load delivery workflows. Please refresh and try again.',
    all: 'All',
  },
  mm: {
    title: 'ပို့ဆောင်မှု ထိန်းချုပ်ရေး ဗဟိုဌာန',
    subtitle: 'ကုန်ပစ္စည်းစာရင်းများကို စစ်ထုတ်ခြင်း၊ ပို့ဆောင်ရေးလမ်းကြောင်းများ ရေးဆွဲခြင်း၊ လုပ်ငန်းစဉ်များကို ချိတ်ဆက်ခြင်းနှင့် ငွေချေမှုစာရင်းများကို ပြင်ဆင်ခြင်း။',
    refresh: 'ပြန်လည်ဆန်းသစ်ရန်',
    kpiFilteredRows: 'စစ်ထုတ်ထားသော စာကြောင်းများ',
    kpiTownships: 'မြို့နယ်များ',
    kpiFleet: 'အသုံးပြုနေသော ယာဉ်များ',
    kpiCodTotal: 'စုစုပေါင်း ကောက်ခံငွေ',
    kpiDelFee: 'ပို့ဆောင်ခ',
    filterTownship: 'မြို့နယ်',
    filterStatus: 'အခြေအနေ',
    btnDispatch: 'ပို့ဆောင်ရေး အစီအစဉ် ရေးဆွဲရန်',
    btnConfirm: 'ကုန်သည် ငွေချေမှုစာရင်း အတည်ပြုရန်',
    btnDownload: 'စစ်ထုတ်ထားသော စာရင်းကို ဒေါင်းလုဒ်ရယူရန်',
    invTitle: 'စစ်ထုတ်ထားသော လုပ်ငန်းလည်ပတ်မှု စာရင်း',
    rowsCount: (n: number) => `စာကြောင်းရေ ${n} ကြောင်း`,
    colId: 'လုပ်ငန်းအမှတ်',
    colMerch: 'ကုန်သည်',
    colRecv: 'လက်ခံသူ',
    colTown: 'မြို့နယ်',
    colStat: 'အခြေအနေ',
    colCod: 'ကောက်ခံငွေ',
    colFee: 'ပို့ဆောင်ခ',
    msgLoading: 'တိုက်ရိုက်ဒေတာ ဆွဲယူနေပါသည်...',
    msgEmpty: 'လုပ်ငန်းလည်ပတ်မှု မှတ်တမ်းများ မတွေ့ရှိပါ။ ကုန်လှောင်ရုံ မှတ်တမ်းများကို ဦးစွာ သိမ်းဆည်းပါ။',
    msgLoadFail: 'ပို့ဆောင်မှုလုပ်ငန်းစဉ်များကို ဆွဲယူ၍မရပါ။ ပြန်လည်ဆန်းသစ်ပြီး ထပ်မံကြိုးစားပါ။',
    all: 'အားလုံး',
  },
};

const statusStyle = (status: string): React.CSSProperties => {
  const map: Record<string, React.CSSProperties> = {
    out_for_delivery: { background: 'rgba(56,189,248,0.1)', color: C.info, border: `1px solid ${C.info}40` },
    delivered: { background: 'rgba(34,197,94,0.1)', color: C.success, border: `1px solid ${C.success}40` },
    failed: { background: 'rgba(255,79,134,0.1)', color: C.error, border: `1px solid ${C.error}40` },
  };

  return {
    ...(map[(status || '').toLowerCase()] ?? { background: C.panel2, color: C.muted, border: `1px solid ${C.border}` }),
    display: 'inline-flex', alignItems: 'center', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: "'Poppins', sans-serif", textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
  };
};

const formatStatus = (status: string) => status.replace(/_/g, ' ');
const csvEscape = (value: unknown) => { const text = value == null ? '' : String(value); return '"' + text.replace(/"/g, '""') + '"'; };
const toNumber = (value: unknown) => { const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '')); return Number.isFinite(parsed) ? parsed : 0; };

function SelectBox({ value, onChange, options, label, allLabel }: { label: string, value: string, options: readonly string[], allLabel: string, onChange: (value: string) => void }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, marginBottom: 8, fontFamily: "'Poppins', sans-serif" }}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', padding: '12px 14px', background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 13, fontFamily: "'Poppins', sans-serif", fontWeight: 600, outline: 'none', minWidth: 200, cursor: 'pointer' }} className="focus:border-[#f6b84b] transition-colors">
        {options.map(option => (
          <option key={option} value={option}>{option === ALL ? allLabel : formatStatus(option).toUpperCase()}</option>
        ))}
      </select>
    </div>
  );
}

export default function DeliveryDispatchPage() {
  const { lang, setLang } = useLanguage();
  const t = TRANSLATIONS[lang as 'en' | 'mm'] || TRANSLATIONS.en;

  const [data, setData] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [townFilter, setTownFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data: rows, error } = await supabase
        .from('delivery_workflows')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw new Error(error.message || t.msgLoadFail);
      setData(rows ?? []);
    } catch (error) {
      console.error(error);
      setData([]);
      setLoadError(error instanceof Error ? error.message : t.msgLoadFail);
    } finally {
      setLoading(false);
    }
  }, [t.msgLoadFail]);

  useEffect(() => { void load(); }, [load]);

  const uniqueTownships = useMemo(() => Array.from(new Set(data.map(row => row.township).filter((township): township is string => Boolean(township)))).sort(), [data]);

  const filtered = useMemo(() => data.filter(row => {
    const byTown = townFilter === ALL || row.township === townFilter;
    const byStatus = statusFilter === ALL || row.status === statusFilter;
    return byTown && byStatus;
  }), [data, statusFilter, townFilter]);

  const sumField = useCallback((rows: DeliveryRow[], field: 'cod_amount' | 'delivery_fee') => rows.reduce((acc, row) => acc + toNumber(row[field]), 0), []);

  const handleDownload = useCallback(() => {
    const headers = ['Workflow ID', 'Merchant', 'Receiver', 'Township', 'Status', 'COD Amount', 'Delivery Fee'];
    const rows = filtered.map(row => [row.workflow_id, row.merchant_name, row.receiver, row.township, row.status, row.cod_amount, row.delivery_fee]);
    const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `filtered-delivery-inventory-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  const kpis = [
    { label: t.kpiFilteredRows, value: filtered.length },
    { label: t.kpiTownships, value: uniqueTownships.length },
    { label: t.kpiFleet, value: 0 },
    { label: t.kpiCodTotal, value: `${sumField(filtered, 'cod_amount').toLocaleString()} MMK` },
    { label: t.kpiDelFee, value: `${sumField(filtered, 'delivery_fee').toLocaleString()} MMK` },
  ];

  return (
    <div style={{ background: C.bg, padding: 24, minHeight: '100vh', fontFamily: "'Poppins', sans-serif" }}>
      <div style={{ maxWidth: 1600, margin: '0 auto', display: 'grid', gap: 20 }}>
        
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ color: C.info, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Britium Operations</div>
            <h1 style={{ fontSize: 26, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.gold, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Truck size={26} color={C.gold} /> {t.title}
            </h1>
            <p style={{ fontSize: 14, color: C.muted, marginTop: 8, marginBottom: 0, fontWeight: 500 }}>{t.subtitle}</p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', background: C.panel2, borderRadius: 8, padding: 4, border: `1px solid ${C.border}` }}>
              <button type="button" onClick={() => setLang('en')} style={{ padding: '6px 12px', borderRadius: 6, background: lang === 'en' ? C.panelHover : 'transparent', color: lang === 'en' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: "'Poppins', sans-serif", transition: 'all 0.2s' }}>EN</button>
              <button type="button" onClick={() => setLang('mm')} style={{ padding: '6px 12px', borderRadius: 6, background: lang === 'mm' ? C.panelHover : 'transparent', color: lang === 'mm' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: "'Poppins', sans-serif", transition: 'all 0.2s' }}>မြန်မာ</button>
            </div>
            <button type="button" onClick={() => void load()} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text2, fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: "'Poppins', sans-serif", transition: 'all 0.2s' }} className="hover:bg-[#0f2a42]">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {t.refresh}
            </button>
          </div>
        </div>

        {loadError && (
          <div style={{ background: 'rgba(255,79,134,0.1)', border: `1px solid ${C.error}40`, borderRadius: 12, padding: '16px 20px', color: C.error, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertCircle size={18} /> {loadError}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16 }}>
          {kpis.map(({ label, value }, idx) => (
            <div key={label} style={{ background: C.panel, border: `1px solid ${C.border}`, borderTop: `3px solid ${idx >= 3 ? C.gold : C.info}`, borderRadius: 16, padding: 20, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, marginBottom: 8 }}>{label}</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: idx >= 3 ? C.gold : C.info }}>{loading ? '—' : value}</div>
            </div>
          ))}
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24, boxShadow: '0 15px 40px rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 20, alignItems: 'end', marginBottom: 24 }}>
            <SelectBox label={t.filterTownship} value={townFilter} onChange={setTownFilter} options={[ALL, ...uniqueTownships]} allLabel={t.all} />
            <SelectBox label={t.filterStatus} value={statusFilter} onChange={setStatusFilter} options={DELIVERY_STATUSES} allLabel={t.all} />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', height: '100%', alignItems: 'flex-end' }}>
              <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', background: `linear-gradient(135deg, ${C.gold}, ${C.orange})`, color: '#000', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }} className="hover:opacity-90 transition-opacity">
                <Truck size={16} /> {t.btnDispatch}
              </button>
              <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', background: C.panel2, color: C.text, border: `1px solid ${C.success}50`, borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }} className="hover:bg-[#052e16] transition-colors">
                <CheckSquare size={16} color={C.success} /> {t.btnConfirm}
              </button>
              <button type="button" onClick={handleDownload} disabled={loading || filtered.length === 0} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 10, color: C.text2, fontSize: 14, fontWeight: 700, cursor: loading || filtered.length === 0 ? 'not-allowed' : 'pointer', opacity: loading || filtered.length === 0 ? 0.5 : 1, fontFamily: "'Poppins', sans-serif" }} className="hover:bg-[#0f2a42] transition-colors">
                <Download size={16} /> {t.btnDownload}
              </button>
            </div>
          </div>

          <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottom: `1px solid ${C.border}`, background: C.panelHover }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0 }}>{t.invTitle}</h2>
              <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>{t.rowsCount(filtered.length)}</span>
            </div>
            
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontFamily: "'Poppins', sans-serif" }}>
                <thead>
                  <tr style={{ background: C.bg }}>
                    {[t.colId, t.colMerch, t.colRecv, t.colTown, t.colStat, t.colCod, t.colFee].map(col => (
                      <th key={col} style={{ padding: '14px 20px', color: C.muted, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {loading ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '40px 20px', color: C.muted, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>
                        <Loader2 size={24} className="animate-spin mx-auto mb-3 text-[#38bdf8]" />
                        {t.msgLoading}
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '40px 20px', color: C.muted, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>{t.msgEmpty}</td>
                    </tr>
                  ) : (
                    filtered.map((row, i) => (
                      <tr key={row.id ?? row.workflow_id ?? i} className="hover:bg-[#0f2a42] transition-colors" style={{ borderBottom: `1px solid ${C.border}66` }}>
                        <td style={{ padding: '14px 20px', fontSize: 14, color: C.info, fontWeight: 800, fontFamily: 'monospace' }}>{row.workflow_id ?? '—'}</td>
                        <td style={{ padding: '14px 20px', fontSize: 14, color: C.text, fontWeight: 600 }}>{row.merchant_name ?? '—'}</td>
                        <td style={{ padding: '14px 20px', fontSize: 14, color: C.text2, fontWeight: 500 }}>{row.receiver ?? '—'}</td>
                        <td style={{ padding: '14px 20px', fontSize: 14, color: C.text2, fontWeight: 500 }}>{row.township ?? '—'}</td>
                        <td style={{ padding: '14px 20px' }}>
                          <span style={statusStyle(row.status ?? '')}>{formatStatus(row.status ?? '—')}</span>
                        </td>
                        <td style={{ padding: '14px 20px', fontSize: 14, color: C.gold, fontWeight: 800 }}>{row.cod_amount != null ? toNumber(row.cod_amount).toLocaleString() : '—'}</td>
                        <td style={{ padding: '14px 20px', fontSize: 14, color: C.text2, fontWeight: 500 }}>{row.delivery_fee != null ? toNumber(row.delivery_fee).toLocaleString() : '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}