import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Banknote, Download, FileText, Loader2, ReceiptText, RefreshCw, Search, ShieldCheck, WalletCards, CheckCircle2, AlertTriangle } from "lucide-react";

const C = { bg: '#061524', panel: '#0b2236', panel2: '#081b2e', panelHover: '#0f2a42', border: '#1a3a5c', gold: '#f6b84b', orange: '#ff8a4c', text: '#eef8ff', text2: '#c8dff0', muted: '#4d7a9b', success: '#22c55e', error: '#ff4f86', warning: '#f59e0b', info: '#38bdf8' };
const FF = { body: "'Poppins', sans-serif" };

function money(value: unknown) { return Number(value || 0).toLocaleString("en-US"); }
function today(offsetDays = 0) { const d = new Date(); d.setDate(d.getDate() + offsetDays); return d.toISOString().slice(0, 10); }

const TRANSLATIONS = {
  en: {
    title: "Finance Operations Portal", subtitle: "COD settlement, delivery fee reporting, invoice readiness, and finance receipt tracking from live waybills.",
    refresh: "Refresh Data", export: "Export CSV",
    lblFrom: "From", lblTo: "To", lblMerchant: "Merchant Code", lblStatus: "Status", btnApply: "Apply Filters",
    kpiWaybills: "Waybills", kpiCod: "Total COD", kpiFees: "Delivery Fees", kpiReceivable: "Receivable", kpiReceived: "Received",
    secReceivables: "Merchant Receivables", secQueue: "COD Settlement Queue", queueSub: "Live waybill finance rows from Data Entry and Rider delivery status.",
    searchPh: "Search pickup, waybill, merchant, recipient...",
    thPickup: "Pickup", thWaybill: "Waybill", thMerch: "Merchant", thRecv: "Recipient", thStatus: "Status", thFinalCod: "Final COD", thFinCod: "Finance COD", thFee: "Deli Fee", thFinStat: "Finance", thAction: "Actions",
    btnConfirm: "Confirm Receipt", btnInvoice: "Invoice Pickup",
    emptyQueue: "No live finance rows found.", emptyMerch: "No merchant finance rows yet."
  },
  mm: {
    title: "ဘဏ္ဍာရေး လုပ်ငန်းလည်ပတ်မှု ဗဟို", subtitle: "ကောက်ခံငွေ ရှင်းလင်းခြင်း၊ ပို့ဆောင်ခ အစီရင်ခံစာများ၊ ပြေစာထုတ်ယူမှုနှင့် တိုက်ရိုက်လမ်းကြောင်းများမှ ငွေလက်ခံရရှိမှု ခြေရာခံခြင်း။",
    refresh: "ဒေတာ ဆန်းသစ်ရန်", export: "CSV ထုတ်ရန်",
    lblFrom: "မှ", lblTo: "အထိ", lblMerchant: "ကုန်သည် ကုဒ်", lblStatus: "အခြေအနေ", btnApply: "ရှာဖွေရန်",
    kpiWaybills: "လမ်းကြောင်းများ", kpiCod: "စုစုပေါင်း COD", kpiFees: "ပို့ဆောင်ခများ", kpiReceivable: "ရရန်ရှိငွေ", kpiReceived: "လက်ခံရရှိငွေ",
    secReceivables: "ကုန်သည်ထံမှ ရရန်ရှိငွေများ", secQueue: "COD ရှင်းလင်းရေး စာရင်း", queueSub: "လုပ်ငန်းလည်ပတ်မှုမှ တိုက်ရိုက်ရောက်ရှိလာသော ဘဏ္ဍာရေး မှတ်တမ်းများ။",
    searchPh: "ရှာဖွေရန်...",
    thPickup: "လာယူမည့် ID", thWaybill: "လမ်းညွှန်", thMerch: "ကုန်သည်", thRecv: "လက်ခံသူ", thStatus: "အခြေအနေ", thFinalCod: "နောက်ဆုံး COD", thFinCod: "ဘဏ္ဍာရေး COD", thFee: "ပို့ဆောင်ခ", thFinStat: "ဘဏ္ဍာရေး", thAction: "လုပ်ဆောင်ရန်",
    btnConfirm: "ငွေလက်ခံကြောင်း အတည်ပြုမည်", btnInvoice: "ပြေစာ ထုတ်မည်",
    emptyQueue: "ဘဏ္ဍာရေး မှတ်တမ်းများ မတွေ့ရှိပါ။", emptyMerch: "ကုန်သည် ဘဏ္ဍာရေး မှတ်တမ်းများ မတွေ့ရှိပါ။"
  }
};

export default function FinancePortalPage() {
  const { lang, setLang } = useLanguage();
  const t = TRANSLATIONS[lang as 'en' | 'mm'] || TRANSLATIONS.en;

  const [from, setFrom] = useState(today(-30));
  const [to, setTo] = useState(today(0));
  const [merchantCode, setMerchantCode] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [snapshot, setSnapshot] = useState<any>(null);
  const [queue, setQueue] = useState<any[]>([]);
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);
  const [loading, setLoading] = useState(false);

  const summary = snapshot?.summary || {};
  const byMerchant = Array.isArray(snapshot?.by_merchant) ? snapshot.by_merchant : [];

  const filteredQueue = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return queue;
    return queue.filter((r) => [r.pickup_id, r.deliver_way_id, r.merchant_name, r.merchant_code, r.recipient_name, r.recipient_phone, r.recipient_town].filter(Boolean).some(x => String(x).toLowerCase().includes(q)));
  }, [queue, search]);

  const loadFinance = async () => {
    setLoading(true); setMessage(null);
    try {
      const [{ data: dash, error: dErr }, { data: rows, error: rErr }] = await Promise.all([
        supabase.rpc("be_finance_dashboard_snapshot", { p_from: from || null, p_to: to || null, p_merchant_code: merchantCode || null }),
        supabase.rpc("be_finance_cod_settlement_queue", { p_status: statusFilter || "", p_search: "", p_limit: 500 })
      ]);
      if (dErr) throw dErr; if (rErr) throw rErr;
      setSnapshot(dash || {}); setQueue(Array.isArray(rows) ? rows : []);
    } catch (err: any) {
      console.error(err);
      // Fallback to table query if RPC fails in current environment
      try {
         const { data } = await supabase.from('be_delivery_wayplans').select('*').limit(100);
         setQueue(data || []);
      } catch (e) { setQueue([]); }
    } finally {
      setLoading(false);
    }
  };

  const confirmReceipt = async (row: any) => {
    setLoading(true); setMessage(null);
    try {
      const { error } = await supabase.rpc("be_finance_confirm_cod_receipt", { p_deliver_way_id: row.deliver_way_id || row.wayplan_id, p_received_by: "finance_portal", p_note: "Confirmed from Portal" });
      if (error) throw error;
      setMessage({ type: 'success', text: `Finance receipt confirmed for ${row.deliver_way_id || row.wayplan_id}.` });
      await loadFinance();
    } catch (err: any) { setMessage({ type: 'error', text: err.message || "Receipt confirmation failed." }); } finally { setLoading(false); }
  };

  const generateInvoice = async (pickupId: string) => {
    setLoading(true); setMessage(null);
    try {
      const { data, error } = await supabase.rpc("be_finance_generate_invoice_for_pickup", { p_pickup_id: pickupId, p_invoice_no: null });
      if (error) throw error;
      setMessage({ type: 'success', text: `Invoice ${data?.invoice_no || ""} generated.` });
      await loadFinance();
    } catch (err: any) { setMessage({ type: 'error', text: err.message || "Invoice generation failed." }); } finally { setLoading(false); }
  };

  useEffect(() => { void loadFinance(); }, []);

  const inputSty = { height: 42, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, padding: '0 12px', fontSize: 13, outline: 'none', fontFamily: FF.body };
  const btnSty = (primary=false) => ({ height: 42, background: primary ? C.gold : C.panel2, color: primary ? '#000' : C.text, border: `1px solid ${primary ? C.gold : C.border}`, borderRadius: 10, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, cursor: 'pointer', fontFamily: FF.body, fontSize: 13 });

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 24, color: C.text, fontFamily: FF.body }}>
      <div style={{ maxWidth: 1680, margin: '0 auto', display: 'grid', gap: 20 }}>
        
        <header style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ color: C.gold, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em' }}>Britium Enterprise</div>
            <h1 style={{ fontSize: 26, fontWeight: 900, margin: '8px 0 0' }}>{t.title}</h1>
            <p style={{ color: C.muted, margin: '6px 0 0', fontSize: 14 }}>{t.subtitle}</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', background: C.panel2, borderRadius: 8, padding: 4, border: `1px solid ${C.border}` }}>
              <button onClick={() => setLang('en')} style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'en' ? C.panelHover : 'transparent', color: lang === 'en' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: FF.body }}>EN</button>
              <button onClick={() => setLang('mm')} style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'mm' ? C.panelHover : 'transparent', color: lang === 'mm' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: FF.body }}>မြန်မာ</button>
            </div>
            <button onClick={loadFinance} disabled={loading} style={btnSty()}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {t.refresh}
            </button>
            <button onClick={() => alert("CSV Export Triggered")} style={btnSty(true)}><Download size={16} /> {t.export}</button>
          </div>
        </header>

        {message && (
          <div style={{ padding: 16, borderRadius: 12, background: message.type === 'error' ? 'rgba(255,79,134,0.1)' : 'rgba(34,197,94,0.1)', color: message.type === 'error' ? C.error : C.success, border: `1px solid ${message.type === 'error' ? C.error : C.success}40`, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
            {message.type === 'error' ? <AlertTriangle size={18}/> : <CheckCircle2 size={18}/>} {message.text}
          </div>
        )}

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {[
            { lbl: t.kpiWaybills, val: summary.total_waybills || queue.length || 0, ic: ReceiptText, col: C.info },
            { lbl: t.kpiCod, val: `${money(summary.total_finance_cod || queue.reduce((s,r)=>s+Number(r.final_cod||0),0))} Ks`, ic: WalletCards, col: C.gold },
            { lbl: t.kpiFees, val: `${money(summary.total_finance_deli)} Ks`, ic: Banknote, col: C.orange },
            { lbl: t.kpiReceivable, val: `${money(summary.total_receivable)} Ks`, ic: FileText, col: C.warning },
            { lbl: t.kpiReceived, val: `${money(summary.received_amount)} Ks`, ic: ShieldCheck, col: C.success }
          ].map((k, i) => (
            <div key={i} style={{ background: C.panel, border: `1px solid ${C.border}`, borderTop: `3px solid ${k.col}`, padding: 20, borderRadius: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: C.muted, fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}><span>{k.lbl}</span><k.ic size={16} color={k.col}/></div>
              <div style={{ fontSize: 24, fontWeight: 900, color: k.col, marginTop: 10 }}>{k.val}</div>
            </div>
          ))}
        </section>

        <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, alignItems: 'end' }}>
            <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>{t.lblFrom}</div><input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={inputSty} /></div>
            <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>{t.lblTo}</div><input type="date" value={to} onChange={e=>setTo(e.target.value)} style={inputSty} /></div>
            <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>{t.lblMerchant}</div><input value={merchantCode} onChange={e=>setMerchantCode(e.target.value.toUpperCase())} placeholder="MEL" style={{...inputSty, fontFamily: 'monospace'}} /></div>
            <div>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>{t.lblStatus}</div>
              <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={inputSty}>
                <option value="">All</option><option value="pending">Pending</option><option value="received">Received</option><option value="settled">Settled</option><option value="handed_over">Handed Over</option>
              </select>
            </div>
            <button onClick={loadFinance} style={{ ...btnSty(true), width: '100%', justifyContent: 'center' }}><Search size={16} /> {t.btnApply}</button>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 400px) 1fr', gap: 20, alignItems: 'start' }}>
          
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 900, margin: '0 0 16px' }}>{t.secReceivables}</h2>
            <div style={{ display: 'grid', gap: 12, maxHeight: 600, overflowY: 'auto', paddingRight: 4 }}>
              {byMerchant.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: C.muted, border: `1px dashed ${C.border}`, borderRadius: 12 }}>{t.emptyMerch}</div> : byMerchant.map((m: any) => (
                <button key={m.merchant_code} onClick={() => { setMerchantCode(m.merchant_code); setTimeout(loadFinance, 0); }} style={{ background: merchantCode === m.merchant_code ? C.panelHover : C.panel2, border: `1px solid ${merchantCode === m.merchant_code ? C.gold : C.border}`, padding: 16, borderRadius: 12, cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', transition: 'all 0.2s', fontFamily: FF.body }}>
                  <div>
                    <div style={{ fontWeight: 800, color: C.text }}>{m.merchant_name || m.merchant_code || "-"}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{m.cnt} ways · pending {m.pending_count}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: C.info }}>{money(m.receivable_total)} Ks</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>COD {money(m.cod_total)}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden' }}>
            <div style={{ padding: 20, borderBottom: `1px solid ${C.border}`, background: C.panel2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>{t.secQueue}</h2><p style={{ margin: '4px 0 0', color: C.muted, fontSize: 13 }}>{t.queueSub}</p></div>
              <div style={{ position: 'relative' }}><Search size={16} color={C.muted} style={{ position: 'absolute', left: 12, top: 12 }} /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t.searchPh} style={{...inputSty, paddingLeft: 38, width: 280, background: C.bg}} /></div>
            </div>
            <div style={{ overflowX: 'auto', maxHeight: 600 }}>
              <table style={{ width: '100%', minWidth: 1200, borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead style={{ background: C.bg, position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr>{[t.thPickup, t.thWaybill, t.thMerch, t.thRecv, t.thStatus, t.thFinalCod, t.thFinCod, t.thFee, t.thFinStat, t.thAction].map(h => <th key={h} style={{ padding: '14px 16px', color: C.muted, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {filteredQueue.length === 0 ? <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: C.muted }}>{t.emptyQueue}</td></tr> : filteredQueue.map(row => (
                    <tr key={`${row.id}-${row.deliver_way_id}`} style={{ borderBottom: `1px solid ${C.border}66` }} className="hover:bg-[#0f2a42] transition">
                      <td style={{ padding: '14px 16px', fontWeight: 800, color: C.gold, fontFamily: 'monospace' }}>{row.pickup_id || row.wayplan_id}</td>
                      <td style={{ padding: '14px 16px', fontFamily: 'monospace', color: C.text2 }}>{row.deliver_way_id || row.id}</td>
                      <td style={{ padding: '14px 16px', fontWeight: 600 }}>{row.merchant_name || row.merchant_code || "-"}</td>
                      <td style={{ padding: '14px 16px' }}><div style={{ fontWeight: 700 }}>{row.recipient_name || "-"}</div><div style={{ fontSize: 11, color: C.muted }}>{row.recipient_phone}</div></td>
                      <td style={{ padding: '14px 16px' }}><span style={{ padding: '4px 10px', borderRadius: 8, background: C.panel2, border: `1px solid ${C.border}`, fontSize: 10, fontWeight: 800 }}>{row.cod_collection_status || row.status || "pending"}</span></td>
                      <td style={{ padding: '14px 16px', fontWeight: 800, textAlign: 'right' }}>{money(row.final_cod || row.cod_amount)}</td>
                      <td style={{ padding: '14px 16px', fontWeight: 800, textAlign: 'right', color: C.info }}>{money(row.finance_cod)}</td>
                      <td style={{ padding: '14px 16px', fontWeight: 800, textAlign: 'right', color: C.orange }}>{money(row.finance_deli || row.delivery_fee)}</td>
                      <td style={{ padding: '14px 16px' }}><span style={{ padding: '4px 10px', borderRadius: 8, background: row.finance_status === 'received' ? 'rgba(34,197,94,0.1)' : C.panel2, color: row.finance_status === 'received' ? C.success : C.text, border: `1px solid ${row.finance_status === 'received' ? C.success : C.border}`, fontSize: 10, fontWeight: 800 }}>{row.finance_status || "pending"}</span></td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button disabled={loading || row.finance_status === "received"} onClick={() => confirmReceipt(row)} style={{ padding: '6px 12px', background: C.success, color: '#000', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: FF.body, opacity: row.finance_status === "received" ? 0.4 : 1 }}>{t.btnConfirm}</button>
                          <button disabled={loading} onClick={() => generateInvoice(row.pickup_id || row.wayplan_id)} style={{ padding: '6px 12px', background: C.panel2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: FF.body }}>{t.btnInvoice}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}