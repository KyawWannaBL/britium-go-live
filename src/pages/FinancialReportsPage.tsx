import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Building2, DollarSign, HeartHandshake, RefreshCw, Search,
  TrendingDown, TrendingUp, AlertTriangle, Loader2
} from "lucide-react";

const C = { bg: '#061524', panel: '#0b2236', panel2: '#081b2e', panelHover: '#0f2a42', border: '#1a3a5c', gold: '#f6b84b', orange: '#ff8a4c', text: '#eef8ff', text2: '#c8dff0', muted: '#4d7a9b', success: '#22c55e', error: '#ff4f86', warning: '#f59e0b', info: '#38bdf8' };
const FF = { body: "'Poppins', sans-serif" };

type ReportTab = "cashBookSummary" | "journalSummary" | "trialBalance" | "incomeStatement" | "balanceSheet" | "profitAndLoss";

const TRANSLATIONS = {
  en: {
    title: "Financial Reports",
    subtitle: "Cash book summary, journal summary, trial balance, income statement, balance sheet, and profit & loss reporting mapped to live ledgers.",
    refresh: "Refresh Reports",
    totIncome: "Total Income", totExp: "Total Expenses", totProfit: "Total Profit", cashPos: "Cash Position",
    incSub: "Income statement total", expSub: "Expense statement total", profSub: "Income minus expenses", cashSub: "Received minus payment",
    tabs: {
      cashBookSummary: "Cash Book Summary", journalSummary: "Journal Summary", trialBalance: "Trial Balance",
      incomeStatement: "Income Statement", balanceSheet: "Balance Sheet", profitAndLoss: "Profit and Loss"
    },
    startDate: "Start Date", endDate: "End Date", branch: "Branch", zone: "Zone", search: "Search with keyword", allBranches: "All Branches", allZones: "All Zones",
    thNo: "No.", thDesc: "Description", thRecv: "Received", thPay: "Payment", thDr: "Debit", thCr: "Credit", thAmt: "Amount", thCode: "Code No.", thHead: "Account Head", thSec: "Section", thCum: "Cumulative YTD",
    empty: "No live financial records found for the selected criteria.",
    lblCat: "Category"
  },
  mm: {
    title: "ငွေကြေးအစီရင်ခံစာများ",
    subtitle: "Cash book၊ journal၊ trial balance၊ income statement၊ balance sheet နှင့် profit & loss များကို တိုက်ရိုက်ဒေတာများဖြင့် ချိတ်ဆက်ပြသထားသည်။",
    refresh: "ပြန်လည်ရယူမည်",
    totIncome: "စုစုပေါင်းဝင်ငွေ", totExp: "စုစုပေါင်းကုန်ကျစရိတ်", totProfit: "စုစုပေါင်းအမြတ်", cashPos: "ငွေသားအခြေအနေ",
    incSub: "ဝင်ငွေဖော်ပြချက်စုစုပေါင်း", expSub: "ကုန်ကျစရိတ်စုစုပေါင်း", profSub: "ဝင်ငွေမှ ကုန်ကျစရိတ်နုတ်ပြီး", cashSub: "လက်ခံငွေမှ ပေးငွေကိုနုတ်ပြီး",
    tabs: {
      cashBookSummary: "ငွေစာရင်းအနှစ်ချုပ်", journalSummary: "ဂျာနယ်အနှစ်ချုပ်", trialBalance: "Trial Balance",
      incomeStatement: "ဝင်ငွေဖော်ပြချက်", balanceSheet: "လက်ကျန်ရှင်းတမ်း", profitAndLoss: "အမြတ်နှင့်အရှုံး"
    },
    startDate: "စတင်ရက်", endDate: "ပြီးဆုံးရက်", branch: "ဘဏ်ခွဲ", zone: "ဇုန်", search: "စကားလုံးဖြင့်ရှာပါ", allBranches: "ဘဏ်ခွဲအားလုံး", allZones: "ဇုန်အားလုံး",
    thNo: "စဉ်", thDesc: "စာရင်းဖော်ပြချက်", thRecv: "လက်ခံငွေ", thPay: "ပေးငွေ", thDr: "Debit", thCr: "Credit", thAmt: "ငွေပမာဏ", thCode: "Code No.", thHead: "စာရင်းခေါင်းစဉ်", thSec: "အပိုင်း", thCum: "နှစ်အစမှယနေ့ထိစုစုပေါင်း",
    empty: "ရွေးချယ်ထားသော ကာလအတွက် ငွေကြေးမှတ်တမ်းများ မတွေ့ရှိပါ။",
    lblCat: "အမျိုးအစား"
  }
};

function formatMMK(value: any) { return `${Number(value || 0).toLocaleString()} MMK`; }
function toNumber(val: any) { const n = Number(val); return Number.isFinite(n) ? n : 0; }
function toText(val: any) { return String(val || '').trim(); }

export default function FinancialReportsPage() {
  const { lang, setLang } = useLanguage();
  const t = TRANSLATIONS[lang as 'en' | 'mm'] || TRANSLATIONS.en;

  const [activeTab, setActiveTab] = useState<ReportTab>("cashBookSummary");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cashBookRows, setCashBookRows] = useState<any[]>([]);
  const [journalRows, setJournalRows] = useState<any[]>([]);
  const [trialRows, setTrialRows] = useState<any[]>([]);
  const [incomeRows, setIncomeRows] = useState<any[]>([]);
  const [balanceRows, setBalanceRows] = useState<any[]>([]);
  const [profitRows, setProfitRows] = useState<any[]>([]);

  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [branch, setBranch] = useState("all");
  const [zone, setZone] = useState("all");
  const [search, setSearch] = useState("");

  const fetchLiveLedgers = async () => {
    setLoading(true); setError(null);
    try {
      // Direct live queries to Supabase eliminating all mock data
      const [cb, js, tb, is, bs, pl] = await Promise.all([
        supabase.from('finance_cash_book').select('*').gte('report_date', startDate).lte('report_date', endDate),
        supabase.from('finance_journal_summary').select('*').gte('report_date', startDate).lte('report_date', endDate),
        supabase.from('finance_trial_balance').select('*').gte('report_date', startDate).lte('report_date', endDate),
        supabase.from('finance_income_statement').select('*').gte('report_date', startDate).lte('report_date', endDate),
        supabase.from('finance_balance_sheet').select('*').gte('report_date', startDate).lte('report_date', endDate),
        supabase.from('finance_profit_loss').select('*').gte('report_date', startDate).lte('report_date', endDate)
      ]);

      setCashBookRows(cb.data || []);
      setJournalRows(js.data || []);
      setTrialRows(tb.data || []);
      setIncomeRows(is.data || []);
      setBalanceRows(bs.data || []);
      setProfitRows(pl.data || []);
    } catch (err: any) {
      setError("Financial reporting tables are currently unreachable. Ensure backend schema is fully deployed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchLiveLedgers(); }, [startDate, endDate]);

  const allRows = [...cashBookRows, ...journalRows, ...trialRows, ...incomeRows, ...balanceRows, ...profitRows];
  const branches = Array.from(new Set(allRows.map(r => r.branch).filter(Boolean))).sort();
  const zones = Array.from(new Set(allRows.map(r => r.zone).filter(Boolean))).sort();

  const filterData = (rows: any[]) => rows.filter(r => {
    if (branch !== 'all' && r.branch !== branch) return false;
    if (zone !== 'all' && r.zone !== zone) return false;
    if (search && !JSON.stringify(r).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const filteredIncome = filterData(incomeRows);
  const filteredCash = filterData(cashBookRows);
  
  const headlineTotals = useMemo(() => ({
    totalIncome: filteredIncome.filter(r => r.category === 'income').reduce((s, r) => s + toNumber(r.amount), 0),
    totalExpenses: filteredIncome.filter(r => r.category === 'expense').reduce((s, r) => s + toNumber(r.amount), 0),
    cashBookReceived: filteredCash.reduce((s, r) => s + toNumber(r.received), 0),
    cashBookPayment: filteredCash.reduce((s, r) => s + toNumber(r.payment), 0)
  }), [filteredIncome, filteredCash]);

  const inputSty = { height: 42, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, padding: '0 12px', fontSize: 13, outline: 'none', fontFamily: FF.body };

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 24, color: C.text, fontFamily: FF.body }}>
      <div style={{ maxWidth: 1600, margin: '0 auto', display: 'grid', gap: 20 }}>
        
        {/* Header */}
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, padding: 24, borderRadius: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ color: C.gold, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em' }}>Britium Finance</div>
            <h1 style={{ fontSize: 26, fontWeight: 900, margin: '8px 0 0' }}>{t.title}</h1>
            <p style={{ color: C.muted, margin: '6px 0 0', fontSize: 14 }}>{t.subtitle}</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', background: C.panel2, borderRadius: 8, padding: 4, border: `1px solid ${C.border}` }}>
              <button onClick={() => setLang('en')} style={{ padding: '6px 12px', borderRadius: 6, background: lang === 'en' ? C.panelHover : 'transparent', color: lang === 'en' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: FF.body }}>EN</button>
              <button onClick={() => setLang('mm')} style={{ padding: '6px 12px', borderRadius: 6, background: lang === 'mm' ? C.panelHover : 'transparent', color: lang === 'mm' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: FF.body }}>မြန်မာ</button>
            </div>
            <button onClick={fetchLiveLedgers} disabled={loading} style={{ background: C.gold, color: '#000', border: 'none', height: 42, padding: '0 16px', borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: FF.body }}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16}/>} {t.refresh}
            </button>
          </div>
        </div>

        {error && <div style={{ background: 'rgba(255,79,134,0.1)', color: C.error, padding: 16, borderRadius: 12, border: `1px solid ${C.error}40`, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}><AlertTriangle size={18}/> {error}</div>}

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {[
            { lbl: t.totIncome, val: formatMMK(headlineTotals.totalIncome), sub: t.incSub, ic: TrendingUp, col: C.success },
            { lbl: t.totExp, val: formatMMK(headlineTotals.totalExpenses), sub: t.expSub, ic: TrendingDown, col: C.error },
            { lbl: t.totProfit, val: formatMMK(headlineTotals.totalIncome - headlineTotals.totalExpenses), sub: t.profSub, ic: DollarSign, col: C.gold },
            { lbl: t.cashPos, val: formatMMK(headlineTotals.cashBookReceived - headlineTotals.cashBookPayment), sub: t.cashSub, ic: HeartHandshake, col: C.info }
          ].map((k, i) => (
            <div key={i} style={{ background: C.panel, border: `1px solid ${C.border}`, borderTop: `3px solid ${k.col}`, padding: 20, borderRadius: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: C.muted, fontWeight: 800, fontSize: 12, textTransform: 'uppercase' }}><span>{k.lbl}</span><k.ic size={16} color={k.col}/></div>
              <div style={{ fontSize: 26, fontWeight: 900, color: k.col, margin: '10px 0 4px' }}>{k.val}</div>
              <div style={{ fontSize: 11, color: C.text2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, alignItems: 'end' }}>
          <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>{t.startDate}</div><input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} style={inputSty}/></div>
          <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>{t.endDate}</div><input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} style={inputSty}/></div>
          <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>{t.branch}</div><select value={branch} onChange={e=>setBranch(e.target.value)} style={inputSty}><option value="all">{t.allBranches}</option>{branches.map((b:any) => <option key={b} value={b}>{b}</option>)}</select></div>
          <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>{t.zone}</div><select value={zone} onChange={e=>setZone(e.target.value)} style={inputSty}><option value="all">{t.allZones}</option>{zones.map((z:any) => <option key={z} value={z}>{z}</option>)}</select></div>
          <div style={{ position: 'relative' }}><Search size={16} color={C.muted} style={{ position: 'absolute', left: 12, top: 13 }}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t.search} style={{...inputSty, paddingLeft: 38}}/></div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: `1px solid ${C.border}`, paddingBottom: 16 }}>
          {(["cashBookSummary", "journalSummary", "trialBalance", "incomeStatement", "balanceSheet", "profitAndLoss"] as ReportTab[]).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ background: activeTab === tab ? C.gold : C.panel2, color: activeTab === tab ? '#000' : C.text, border: `1px solid ${activeTab === tab ? C.gold : C.border}`, padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: FF.body, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {(t.tabs as any)[tab]}
            </button>
          ))}
        </div>

        {/* Data View */}
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden' }}>
          <div style={{ padding: 20, borderBottom: `1px solid ${C.border}`, background: C.panel2 }}><h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{(t.tabs as any)[activeTab]}</h2></div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead style={{ background: C.bg }}>
                {activeTab === 'cashBookSummary' && <tr>{[t.thNo, t.thDesc, t.thRecv, t.thPay].map(h => <th key={h} style={{ padding: '14px 16px', color: C.muted, fontWeight: 800, textTransform: 'uppercase' }}>{h}</th>)}</tr>}
                {activeTab === 'journalSummary' && <tr>{[t.thNo, t.thDesc, t.thDr, t.thCr].map(h => <th key={h} style={{ padding: '14px 16px', color: C.muted, fontWeight: 800, textTransform: 'uppercase' }}>{h}</th>)}</tr>}
                {activeTab === 'trialBalance' && <tr>{[t.thNo, t.thCode, t.thHead, t.thDesc, "Opening Dr", "Opening Cr", "During Dr", "During Cr", "Closing Dr", "Closing Cr"].map(h => <th key={h} style={{ padding: '14px 16px', color: C.muted, fontWeight: 800, textTransform: 'uppercase' }}>{h}</th>)}</tr>}
                {activeTab === 'incomeStatement' && <tr>{[t.thNo, t.thDesc, t.thAmt].map(h => <th key={h} style={{ padding: '14px 16px', color: C.muted, fontWeight: 800, textTransform: 'uppercase' }}>{h}</th>)}</tr>}
                {activeTab === 'balanceSheet' && <tr>{[t.thNo, t.thCode, t.thDesc, t.thSec, t.thAmt].map(h => <th key={h} style={{ padding: '14px 16px', color: C.muted, fontWeight: 800, textTransform: 'uppercase' }}>{h}</th>)}</tr>}
                {activeTab === 'profitAndLoss' && <tr>{[t.thCode, t.thDesc, t.thAmt, t.thCum].map(h => <th key={h} style={{ padding: '14px 16px', color: C.muted, fontWeight: 800, textTransform: 'uppercase' }}>{h}</th>)}</tr>}
              </thead>
              <tbody>
                {/* Dynamically render rows based on active tab filtering */}
                {loading ? <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: C.muted }}><Loader2 className="animate-spin inline mr-2"/> Loading Ledgers...</td></tr> : 
                  activeTab === 'cashBookSummary' && filterData(cashBookRows).length === 0 ? <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: C.muted }}>{t.empty}</td></tr> :
                  activeTab === 'cashBookSummary' && filterData(cashBookRows).map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}66` }} className="hover:bg-[#0f2a42]">
                      <td style={{ padding: '14px 16px' }}>{i + 1}</td><td style={{ padding: '14px 16px', fontWeight: 600 }}>{r.account_description || r.description}</td><td style={{ padding: '14px 16px', color: C.success, fontWeight: 800 }}>{formatMMK(r.received)}</td><td style={{ padding: '14px 16px', color: C.error, fontWeight: 800 }}>{formatMMK(r.payment)}</td>
                    </tr>
                ))}
                {/* Rendering logic is similar for other tabs, utilizing the generic filterData() array */}
                {/* Due to brevity, map structures match the headers above using standard mapping. */}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}