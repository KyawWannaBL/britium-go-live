import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Calculator, CheckCircle2, Database, Loader2, RefreshCw, Pencil, Save, Plus, X, Search, ShieldAlert } from 'lucide-react';

const C = { bg: '#061524', panel: '#0b2236', panel2: '#081b2e', panelHover: '#0f2a42', border: '#1a3a5c', gold: '#f6b84b', text: '#eef8ff', muted: '#4d7a9b', success: '#22c55e', error: '#ff4f86', warning: '#f59e0b', info: '#38bdf8', orange: '#f97316' };
const FF = { body: "'Poppins', sans-serif" };

type Tier = 'STANDARD' | 'ROYAL' | 'COMMITMENT_1500' | 'COMMITMENT_3000';

type TariffRow = {
  township: string;
  zone: string;
  zoneCode: string;
  customerTier: Tier;
  baseFee: number;
  includedKg: number;
  extraPerKg: number;
  highwayDropoffFee: number;
  commitmentMinWays: number;
  commitmentRefundPerWay: number;
  status: string;
  source: string;
};

const TRANSLATIONS = {
  en: {
    title: "Tariff Network Control", subtitle: "Manage operational multi-tier price grids. Changes reflect instantly.",
    refresh: "Sync Live Network", unauthorized: "Access Restricted", unauthSub: "You have view-only access.",
    btnSave: "Add Rate", btnUpdate: "Update Grid", btnCancel: "Cancel", btnEdit: "Edit",
    lblTown: "Township", lblZone: "Zone", lblTier: "Customer Tier", lblBase: "Base Rate", lblIncKg: "Allowance", lblExtraKg: "Extra/KG", lblHighway: "Highway Fee", lblStatus: "Status",
    lblMinWays: "Min Ways", lblRefund: "Refund / Way", lblMonthlyWays: "Monthly Volume",
    calcTitle: "Quick Quote Matrix", calcNet: "Net Charge", searchPh: "Search network...", empty: "No records found."
  },
  mm: {
    title: "ပို့ဆောင်ခ နှုန်းထားကွန်ရက်", subtitle: "နှုန်းထားဇယားများကို ဤနေရာမှ တိုက်ရိုက်ထိန်းချုပ်စီမံနိုင်ပါသည်။",
    refresh: "ဆန်းသစ်ရန်", unauthorized: "ခွင့်ပြုချက်မရှိပါ", unauthSub: "ကြည့်ရှုရန်သာ ခွင့်ပြုထားပါသည်။",
    btnSave: "နှုန်းထားအသစ်ထည့်မည်", btnUpdate: "ပြင်ဆင်မည်", btnCancel: "ပယ်ဖျက်မည်", btnEdit: "ပြင်မည်",
    lblTown: "မြို့နယ်", lblZone: "ဇုန်", lblTier: "ကဏ္ဍအဆင့်", lblBase: "အခြေခံနှုန်းထား", lblIncKg: "ကီလိုစွမ်းရည်", lblExtraKg: "ထပ်တိုးကြေး", lblHighway: "ဂိတ်ချခ", lblStatus: "အခြေအနေ",
    lblMinWays: "အနည်းဆုံး အရေအတွက်", lblRefund: "အမ်းငွေ / အော်ဒါ", lblMonthlyWays: "လစဉ် အော်ဒါအရေအတွက်",
    calcTitle: "နှုန်းထား တွက်ချက်စမ်းသပ်မှု", calcNet: "ကျသင့်ငွေ", searchPh: "ရှာဖွေရန်...", empty: "မှတ်တမ်းများ မတွေ့ရှိပါ။"
  }
};

const emptyForm: TariffRow = { township: '', zone: 'Zone A', zoneCode: 'YGN', customerTier: 'STANDARD', baseFee: 4000, includedKg: 3, extraPerKg: 500, highwayDropoffFee: 3000, commitmentMinWays: 0, commitmentRefundPerWay: 0, status: 'active', source: 'Manual Entry' };

const SOURCE_TARIFFS = [
  ['ပန်းဘဲတန်း', 'Yangon', 'YGN', 4000], ['ကျောက်တံတား', 'Yangon', 'YGN', 4000], ['လမ်းမတော်', 'Yangon', 'YGN', 4000],
  ['လသာ', 'Yangon', 'YGN', 4000], ['ပုဇွန်တောင်', 'Yangon', 'YGN', 4000], ['ဗိုလ်တထောင်', 'Yangon', 'YGN', 4000],
  ['ဒဂုံ', 'Yangon', 'YGN', 4000], ['အလုံ', 'Yangon', 'YGN', 4000], ['ကြည့်မြင်တိုင်', 'Yangon', 'YGN', 4000],
  ['စမ်းချောင်း', 'Yangon', 'YGN', 4000], ['မင်္ဂလာတောင်ညွန့်', 'Yangon', 'YGN', 4000], ['တာမွေ', 'Yangon', 'YGN', 4000],
  ['ဗဟန်း', 'Yangon', 'YGN', 4000], ['တောင်ဥက္ကလာပ', 'Yangon', 'YGN', 4000], ['မြောက်ဒဂုံ', 'Yangon', 'YGN', 4000],
  ['အရှေ့ဒဂုံ', 'Yangon', 'YGN', 4000], ['ရန်ကင်း', 'Yangon', 'YGN', 4000], ['ကမာရွတ်', 'Yangon', 'YGN', 4000],
  ['သာကေတ', 'Yangon', 'YGN', 4000], ['သင်္ဃန်းကျွန်း', 'Yangon', 'YGN', 4000], ['မရမ်းကုန်း', 'Yangon', 'YGN', 4000],
  ['တောင်ဒဂုံ', 'Yangon', 'YGN', 4000], ['ဒဂုံဆိပ်ကမ်း', 'Yangon', 'YGN', 4000], ['ဒေါပုံ', 'Yangon', 'YGN', 4000],
  ['လှိုင်', 'Yangon', 'YGN', 4000], ['အင်းစိန်', 'Yangon', 'YGN', 4000], ['မြောက်ဥက္ကလာပ', 'Yangon', 'YGN', 4500],
  ['မင်္ဂလာဒုံ', 'Yangon', 'YGN', 4500], ['ရွှေပြည်သာ', 'Yangon', 'YGN', 4500], ['လှိုင်သာယာ', 'Yangon', 'YGN', 4500],
  ['ရွှေပေါက်ကံ', 'Yangon', 'YGN', 4500], ['အောင်မင်္ဂလာကားဂိတ်', 'Yangon', 'YGN', 3000], ['ပရမီ ကားဝင်း (ဗန္ဓုလ)', 'Yangon', 'YGN', 3000],
  ['အောင်ဆန်းကွင်း', 'Yangon', 'YGN', 3000], ['ဂိတ်ချ', 'Yangon', 'YGN', 3000], ['အဝေးပြေး ဂိတ်ချ', 'Yangon', 'YGN', 3000],
  ['ရန်ကုန်စာတိုက်ကြီး', 'Yangon', 'YGN', 3000], ['ဘုရင့်နောင် ကားဝင်း', 'Yangon', 'YGN', 4000], ['လိူင်သာယာအဝေးပြေး (ဒဂုံဧရာ)', 'Yangon', 'YGN', 4000],
  ['အောင်မြေသာစံမြို့နယ်', 'Mandalay', 'MDY', 6000], ['ချမ်းအေးသာစံမြို့နယ်', 'Mandalay', 'MDY', 6000], ['မဟာအောင်မြေမြို့နယ်', 'Mandalay', 'MDY', 6000],
  ['ချမ်းမြသာစည်မြို့နယ်', 'Mandalay', 'MDY', 6000], ['ပြည်ကြီးတံခွန်မြို့နယ်', 'Mandalay', 'MDY', 6000], ['အမရပူရမြို့နယ်', 'Mandalay', 'MDY', 6000],
  ['ပုသိမ်ကြီးမြို့နယ်', 'Mandalay', 'MDY', 6000], ['ဇမ္ဗူသီရိမြို့နယ်', 'Nay Pyi Taw', 'NPT', 6000], ['ဒက္ခိဏသီရိမြို့နယ်', 'Nay Pyi Taw', 'NPT', 6000],
  ['ပုဗ္ဗသီရိမြို့နယ်', 'Nay Pyi Taw', 'NPT', 6000], ['ဥတ္တရသီရိမြို့နယ်', 'Nay Pyi Taw', 'NPT', 6000], ['ဇေယျာသီရိမြို့နယ်', 'Nay Pyi Taw', 'NPT', 6000],
  ['ပျဉ်းမနားမြို့နယ်', 'Nay Pyi Taw', 'NPT', 6000]
].map(([township, zone, zoneCode, baseFee]) => ({
  township: String(township), zone: String(zone), zoneCode: String(zoneCode), baseFee: Number(baseFee), status: 'active', source: 'go-live fallback'
}));

function expandTierRows(rowsArray: any[], source: string): TariffRow[] {
  return rowsArray.flatMap((row) => [
    { ...row, customerTier: 'STANDARD' as Tier, includedKg: 3, extraPerKg: 500, highwayDropoffFee: 3000, commitmentMinWays: 0, commitmentRefundPerWay: 0, source },
    { ...row, customerTier: 'ROYAL' as Tier, includedKg: 5, extraPerKg: 500, highwayDropoffFee: 3000, commitmentMinWays: 0, commitmentRefundPerWay: 0, source },
    { ...row, customerTier: 'COMMITMENT_1500' as Tier, includedKg: 5, extraPerKg: 500, highwayDropoffFee: 3000, commitmentMinWays: 1500, commitmentRefundPerWay: 500, source },
    { ...row, customerTier: 'COMMITMENT_3000' as Tier, includedKg: 6, extraPerKg: 500, highwayDropoffFee: 3000, commitmentMinWays: 3000, commitmentRefundPerWay: 700, source },
  ]);
}

const FALLBACK_ROWS = expandTierRows(SOURCE_TARIFFS, 'go-live fallback');

export default function TariffPage() {
  const { lang } = useLanguage();
  const t = TRANSLATIONS[lang as 'en' | 'mm'] || TRANSLATIONS.en;

  const [rows, setRows] = useState<TariffRow[]>(FALLBACK_ROWS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [form, setForm] = useState<TariffRow>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [calcTownship, setCalcTownship] = useState('တာမွေ');
  const [calcTier, setCalcTier] = useState<Tier>('STANDARD');
  const [calcWeight, setCalcWeight] = useState(1.5);
  const [calcSurcharge, setCalcSurcharge] = useState(0);
  const [calcMonthlyWays, setCalcMonthlyWays] = useState(0);

  const initialize = async () => {
    setLoading(true); setMessage(null);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const email = authData.user?.email || "";
      const userMeta = authData.user?.user_metadata || {};
      setIsSuperAdmin(email.includes('admin') || userMeta.role === 'superadmin' || userMeta.role === 'director');

      const { data, error } = await supabase.from('townships').select('*').order('township_name', { ascending: true });
      if (error) throw error;

      if (data && data.length > 0) {
        setRows(data.flatMap((r: any) => expandTierRows([{ township: r.township_name || r.township_code, zone: r.zone || 'Yangon', zoneCode: r.branch_code || 'YGN', baseFee: Number(r.delivery_fee || 4000), status: r.is_active === false ? 'blocked' : 'active' }], 'Live Database')));
      }
    } catch (e: any) { setRows(FALLBACK_ROWS); } finally { setLoading(false); }
  };

  useEffect(() => { void initialize(); }, []);

  const handleSave = () => {
    if (!isSuperAdmin) return setMessage({ type: 'error', text: t.unauthorized });
    setSaving(true);
    if (editingId) setRows(prev => prev.map(r => (r.township === form.township && r.customerTier === form.customerTier) ? { ...r, ...form } : r));
    else setRows(prev => [{ ...form, status: 'active', source: 'Frontend Overwrite' }, ...prev]);
    setMessage({ type: 'success', text: "Tariff successfully updated." });
    setEditingId(null); setForm(emptyForm); setSaving(false);
  };

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rows.filter(r => !q || [r.township, r.zone, r.zoneCode, r.customerTier].map(x => String(x || '')).join(' ').toLowerCase().includes(q));
  }, [rows, search]);

  const calcResult = useMemo(() => {
    const activeRow = rows.find(r => r.township === calcTownship && r.customerTier === calcTier) || rows.find(r => r.customerTier === calcTier) || FALLBACK_ROWS[0];
    const cw = Math.ceil(Math.max(0, calcWeight));
    const extraKg = Math.max(0, cw - activeRow.includedKg);
    const wSurcharge = extraKg * activeRow.extraPerKg;
    const isHighway = ['ဂိတ်ချ', 'အဝေးပြေး', 'ကားဂိတ်', 'ကားဝင်း', 'drop off'].some(x => activeRow.township.toLowerCase().includes(x));
    const refundApplied = calcMonthlyWays >= activeRow.commitmentMinWays ? activeRow.commitmentRefundPerWay : 0;
    const total = activeRow.baseFee + wSurcharge + Math.max(0, calcSurcharge) + (isHighway ? activeRow.highwayDropoffFee : 0) - refundApplied;
    return { ...activeRow, cw, extraKg, wSurcharge, refundApplied, total: Math.max(0, total), isHighway };
  }, [rows, calcTownship, calcTier, calcWeight, calcSurcharge, calcMonthlyWays]);

  const inpSty = { width: '100%', height: 42, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0 14px', color: C.text, fontSize: 13, outline: 'none', fontFamily: FF.body };
  const btnSty = (primary = false) => ({ height: 42, background: primary ? C.gold : C.panel2, color: primary ? '#000' : C.text, border: `1px solid ${primary ? C.gold : C.border}`, borderRadius: 10, padding: '0 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: FF.body });

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 24, color: C.text, fontFamily: FF.body }}>
      <div style={{ maxWidth: 1600, margin: '0 auto', display: 'grid', gap: 24 }}>
        <header style={{ background: C.panel, border: `1px solid ${C.border}`, padding: 24, borderRadius: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
          <div>
            <div style={{ color: C.gold, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', display: 'flex', alignItems: 'center', gap: 8 }}><Database size={16} /> <span>Britium Enterprise</span></div>
            <h1 style={{ margin: '8px 0 0', fontSize: 26, fontWeight: 900 }}>{t.title}</h1>
            <p style={{ color: C.muted, margin: '6px 0 0', fontSize: 14, fontWeight: 500 }}>{t.subtitle}</p>
          </div>
          <button onClick={initialize} disabled={loading} style={btnSty()}>{loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {t.refresh}</button>
        </header>

        {message && <div style={{ padding: 18, background: message.type==='error'?'rgba(255,79,134,0.1)':'rgba(34,197,94,0.1)', border: `1px solid ${message.type==='error'?C.error:C.success}40`, color: message.type==='error'?C.error:C.success, borderRadius: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}><CheckCircle2 size={20} /> {message.text}</div>}
        {!isSuperAdmin && !loading && <div style={{ padding: 18, background: 'rgba(245,158,11,0.1)', border: `1px solid ${C.warning}40`, color: C.warning, borderRadius: 16, display: 'flex', alignItems: 'flex-start', gap: 12 }}><ShieldAlert size={24} className="shrink-0" /><div><div style={{ fontWeight: 900, fontSize: 15, textTransform: 'uppercase' }}>{t.unauthorized}</div><div style={{ fontSize: 13, marginTop: 4 }}>{t.unauthSub}</div></div></div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 24, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 24 }}>
            <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}><div style={{ background: 'rgba(56,189,248,0.1)', padding: 10, borderRadius: 12 }}><Calculator size={20} color={C.info} /></div><h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>{t.calcTitle}</h2></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, alignItems: 'end' }}>
                <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>{t.lblTown}</div><select value={calcTownship} onChange={e => setCalcTownship(e.target.value)} style={inpSty}>{Array.from(new Set(rows.map(r => r.township))).map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div>
                  <div style={{ fontSize: 11, color: C.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>{t.lblTier}</div>
                  <select value={calcTier} onChange={e => setCalcTier(e.target.value as Tier)} style={inpSty}><option value="STANDARD">Standard</option><option value="ROYAL">Royal</option><option value="COMMITMENT_1500">1500 Ways</option><option value="COMMITMENT_3000">3000 Ways</option></select>
                </div>
                <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>Weight (KG)</div><input type="number" min="0" step="0.1" value={calcWeight} onChange={e => setCalcWeight(Number(e.target.value))} style={inpSty} /></div>
                <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>{t.lblMonthlyWays}</div><input type="number" min="0" value={calcMonthlyWays} onChange={e => setCalcMonthlyWays(Number(e.target.value))} style={inpSty} /></div>
              </div>
              <div style={{ marginTop: 20, background: C.panel2, border: `1px solid ${C.info}40`, borderRadius: 16, padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <div style={{ display: 'flex', gap: 16, fontSize: 13, color: C.muted, flexWrap: 'wrap' }}>
                  <div>Base: <strong style={{ color: C.text }}>{calcResult.baseFee.toLocaleString()}</strong></div>
                  <div>Extra: <strong style={{ color: C.text }}>{calcResult.extraKg}kg ({calcResult.wSurcharge.toLocaleString()} Ks)</strong></div>
                  {calcResult.isHighway && <div style={{ color: C.orange }}>Highway: +{calcResult.highwayDropoffFee.toLocaleString()}</div>}
                  {calcResult.refundApplied > 0 && <div style={{ color: C.success, fontWeight: 800 }}>Refund: -{calcResult.refundApplied.toLocaleString()}</div>}
                </div>
                <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11, color: C.info, fontWeight: 900, textTransform: 'uppercase' }}>{t.calcNet}</div><div style={{ fontSize: 24, fontWeight: 900, color: C.gold, marginTop: 4 }}>{calcResult.total.toLocaleString()} MMK</div></div>
              </div>
            </section>

            <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, overflow: 'hidden' }}>
              <div style={{ padding: 20, borderBottom: `1px solid ${C.border}`, background: C.panel2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>Active Tariff Matrix</h2>
                <div style={{ position: 'relative' }}><Search size={16} color={C.muted} style={{ position: 'absolute', left: 12, top: 12 }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.searchPh} style={{ ...inpSty, paddingLeft: 40, width: 260 }} /></div>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 500 }}>
                <table style={{ width: '100%', minWidth: 1000, borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                  <thead style={{ background: C.bg, position: 'sticky', top: 0 }}>
                    <tr>{[t.lblTown, t.lblTier, t.lblBase, t.lblIncKg, t.lblExtraKg, t.lblRefund, ""].map(h => <th key={h} style={{ padding: '14px 16px', color: C.muted, fontWeight: 800, textTransform: 'uppercase' }}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}40`, opacity: r.status === 'blocked' ? 0.5 : 1 }} className="hover:bg-[#0f2a42]">
                        <td style={{ padding: '14px 16px', fontWeight: 800 }}>{r.township}</td>
                        <td style={{ padding: '14px 16px', fontWeight: 800, color: r.customerTier.includes('COMMITMENT') ? C.success : C.info }}>{r.customerTier}</td>
                        <td style={{ padding: '14px 16px', fontWeight: 700 }}>{r.baseFee.toLocaleString()}</td>
                        <td style={{ padding: '14px 16px' }}>{r.includedKg} kg</td>
                        <td style={{ padding: '14px 16px' }}>+{r.extraPerKg}</td>
                        <td style={{ padding: '14px 16px', color: C.success, fontWeight: 700 }}>{r.commitmentRefundPerWay > 0 ? `-${r.commitmentRefundPerWay}` : '—'}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>{isSuperAdmin && <button onClick={() => { setEditingId(r.township); setForm(r); }} style={{ background: 'transparent', border: 'none', color: C.gold, cursor: 'pointer' }}><Pencil size={14} /></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, padding: 24, position: 'sticky', top: 24, opacity: isSuperAdmin ? 1 : 0.5, pointerEvents: isSuperAdmin ? 'auto' : 'none' }}>
            <h2 style={{ fontSize: 18, fontWeight: 900, margin: '0 0 24px', display: 'flex', alignItems: 'center', gap: 8 }}>{editingId ? <Pencil size={18} color={C.gold}/> : <Plus size={18} color={C.info}/>} {editingId ? t.btnUpdate : t.btnSave}</h2>
            <div style={{ display: 'grid', gap: 16 }}>
              <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>{t.lblTown}</div><input value={form.township || ''} onChange={e => setForm({ ...form, township: e.target.value })} style={inpSty} /></div>
              <div>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>{t.lblTier}</div>
                <select value={form.customerTier || 'STANDARD'} onChange={e => setForm({ ...form, customerTier: e.target.value as Tier })} style={inpSty}><option value="STANDARD">STANDARD</option><option value="ROYAL">ROYAL</option><option value="COMMITMENT_1500">COMMITMENT (1500)</option><option value="COMMITMENT_3000">COMMITMENT (3000)</option></select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>{t.lblBase}</div><input type="number" value={form.baseFee || ''} onChange={e => setForm({ ...form, baseFee: Number(e.target.value) })} style={inpSty} /></div>
                <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>{t.lblIncKg}</div><input type="number" value={form.includedKg || ''} onChange={e => setForm({ ...form, includedKg: Number(e.target.value) })} style={inpSty} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>{t.lblMinWays}</div><input type="number" value={form.commitmentMinWays || 0} onChange={e => setForm({ ...form, commitmentMinWays: Number(e.target.value) })} style={inpSty} /></div>
                <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>{t.lblRefund}</div><input type="number" value={form.commitmentRefundPerWay || 0} onChange={e => setForm({ ...form, commitmentRefundPerWay: Number(e.target.value) })} style={inpSty} /></div>
              </div>
              <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>{t.lblExtraKg}</div><input type="number" value={form.extraPerKg || ''} onChange={e => setForm({ ...form, extraPerKg: Number(e.target.value) })} style={inpSty} /></div>
              <div>
                <div style={{ fontSize: 11, color: C.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>{t.lblStatus}</div>
                <select value={form.status || 'active'} onChange={e => setForm({ ...form, status: e.target.value })} style={inpSty}><option value="active">Active</option><option value="blocked">Blocked</option></select>
              </div>
              <button onClick={handleSave} disabled={saving} style={{ ...btnSty(true), width: '100%', justifyContent: 'center', height: 46, fontSize: 14, marginTop: 10 }}><Save size={16} /> {editingId ? t.btnUpdate : t.btnSave}</button>
              {editingId && <button onClick={() => { setEditingId(null); setForm(emptyForm); }} style={{ ...btnSty(), width: '100%', justifyContent: 'center' }}><X size={16} /> {t.btnCancel}</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}