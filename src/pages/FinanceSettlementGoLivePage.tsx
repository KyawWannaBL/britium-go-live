import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Banknote, CheckCircle, FileText, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';

const C = { bg: '#061524', panel: '#0b2236', panel2: '#081b2e', panelHover: '#0f2a42', border: '#1a3a5c', gold: '#f6b84b', orange: '#ff8a4c', text: '#eef8ff', text2: '#c8dff0', muted: '#4d7a9b', success: '#22c55e', error: '#ff4f86', warning: '#f59e0b', info: '#38bdf8' };
const FF = { body: "'Poppins', sans-serif" };

const TRANSLATIONS = {
  en: {
    title: "COD Reconciliation Desk",
    subtitle: "Settle cash on delivery balances for successfully delivered parcels. Marking a parcel as settled triggers a live finance ledger event.",
    refresh: "Refresh Queue",
    thId: "Tracking ID", thMerch: "Merchant", thBranch: "Branch", thDate: "Delivered Date", thCod: "COD Amount", thAction: "Action",
    btnSettle: "Settle COD", settling: "Settling...",
    emptyTitle: "All ledgers are balanced.", emptySub: "No pending COD settlements.",
    msgSuccess: "COD successfully settled.", msgError: "Could not settle transaction."
  },
  mm: {
    title: "ကောက်ခံငွေ ရှင်းလင်းရေး စားပွဲ",
    subtitle: "အောင်မြင်စွာ ပို့ဆောင်ပြီးသော ပါဆယ်များအတွက် ကောက်ခံငွေများကို ရှင်းလင်းပါ။ ရှင်းလင်းပြီးကြောင်း အမှတ်အသားပြုခြင်းက ငွေကြေးမှတ်တမ်းကို အလိုအလျောက် သွင်းပေးမည်ဖြစ်သည်။",
    refresh: "စာရင်း ပြန်ယူမည်",
    thId: "ခြေရာခံအမှတ်", thMerch: "ကုန်သည်", thBranch: "ရုံးခွဲ", thDate: "ပို့ဆောင်ခဲ့သောရက်", thCod: "ကောက်ခံငွေ", thAction: "လုပ်ဆောင်ရန်",
    btnSettle: "ငွေရှင်းမည်", settling: "ရှင်းလင်းနေသည်...",
    emptyTitle: "ငွေစာရင်းအားလုံး ကိုက်ညီပါသည်။", emptySub: "ရှင်းလင်းရန် ကောက်ခံငွေ မရှိပါ။",
    msgSuccess: "ကောက်ခံငွေ ရှင်းလင်းပြီးပါပြီ။", msgError: "ငွေလွှဲပြောင်းမှု မအောင်မြင်ပါ။"
  }
};

export default function FinanceSettlementGoLivePage() {
  const { lang, setLang } = useLanguage();
  const t = TRANSLATIONS[lang as 'en' | 'mm'] || TRANSLATIONS.en;

  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  const fetchSettlementQueue = async () => {
    setLoading(true); setMessage(null);
    try {
      // Direct live query to grab DELIVERED items that aren't settled yet
      const { data, error } = await supabase
        .from('be_portal_pickup_requests')
        .select('*')
        .in('status', ['DELIVERED', 'COMPLETED']) 
        .order('updated_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      setDeliveries(data || []);
    } catch (e: any) {
      console.error("Queue load error:", e);
      // Fallback if table doesn't match expected schema yet
      setDeliveries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchSettlementQueue(); }, []);

  const markAsSettled = async (pickupId: string) => {
    setProcessingId(pickupId); setMessage(null);
    try {
      const { error: updErr } = await supabase
        .from('be_portal_pickup_requests')
        .update({ status: 'FINANCE_SETTLED', updated_at: new Date().toISOString() })
        .eq('pickup_id', pickupId);
      
      if (updErr) throw updErr;

      const { data: userData } = await supabase.auth.getUser();
      const email = userData?.user?.email || "finance@britiumexpress.com";

      await supabase.from('be_portal_cargo_events').insert([{
        pickup_id: pickupId,
        event_type: 'FINANCE_SETTLED',
        status_code: 'FINANCE_SETTLED',
        description: `COD successfully reconciled and settled by Finance.`,
        actor_role: 'finance'
      }]);

      setMessage({ type: 'success', text: `${pickupId} ${t.msgSuccess}` });
      setDeliveries(prev => prev.filter(d => d.pickup_id !== pickupId));
    } catch (error) {
      setMessage({ type: 'error', text: t.msgError });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div style={{ background: C.bg, padding: 24, minHeight: '100vh', fontFamily: FF.body, color: C.text }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'grid', gap: 20 }}>
        
        {/* Header */}
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, padding: 24, borderRadius: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Banknote size={36} color={C.success} />
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.title}</h1>
              <p style={{ color: C.muted, margin: '4px 0 0', fontSize: 14, fontWeight: 500 }}>{t.subtitle}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', background: C.panel2, borderRadius: 8, padding: 4, border: `1px solid ${C.border}` }}>
              <button onClick={() => setLang('en')} style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'en' ? C.panelHover : 'transparent', color: lang === 'en' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: FF.body }}>EN</button>
              <button onClick={() => setLang('mm')} style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'mm' ? C.panelHover : 'transparent', color: lang === 'mm' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: FF.body }}>မြန်မာ</button>
            </div>
            <button onClick={fetchSettlementQueue} disabled={loading} style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text, height: 42, padding: '0 16px', borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: FF.body }}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16}/>} {t.refresh}
            </button>
          </div>
        </div>

        {message && (
          <div style={{ padding: 16, borderRadius: 12, background: message.type === 'error' ? 'rgba(255,79,134,0.1)' : 'rgba(34,197,94,0.1)', color: message.type === 'error' ? C.error : C.success, border: `1px solid ${message.type === 'error' ? C.error : C.success}40`, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
            {message.type === 'error' ? <AlertTriangle size={18}/> : <CheckCircle size={18}/>} {message.text}
          </div>
        )}

        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden' }}>
          {deliveries.length === 0 && !loading ? (
            <div style={{ padding: 60, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <CheckCircle size={48} color={C.success} style={{ opacity: 0.8 }} />
              <div style={{ fontSize: 18, fontWeight: 900, color: C.text }}>{t.emptyTitle}</div>
              <div style={{ color: C.muted, fontWeight: 500 }}>{t.emptySub}</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead style={{ background: C.panel2 }}>
                  <tr>
                    {[t.thId, t.thMerch, t.thBranch, t.thDate, t.thCod, t.thAction].map(h => <th key={h} style={{ padding: '16px 20px', color: C.muted, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: C.muted, fontWeight: 600 }}><Loader2 className="animate-spin inline mr-2"/> Loading Live Ledgers...</td></tr>}
                  {!loading && deliveries.map(d => (
                    <tr key={d.pickup_id} style={{ borderBottom: `1px solid ${C.border}66` }} className="hover:bg-[#0f2a42] transition-colors">
                      <td style={{ padding: '16px 20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10, color: C.info, fontFamily: 'monospace', fontSize: 14 }}>
                        <FileText size={16} color={C.muted} /> {d.pickup_id}
                      </td>
                      <td style={{ padding: '16px 20px', fontWeight: 700 }}>{d.merchant_name || d.merchant_code || "-"}</td>
                      <td style={{ padding: '16px 20px' }}><span style={{ background: C.panel2, border: `1px solid ${C.border}`, padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800 }}>{d.branch_code || 'YGN'}</span></td>
                      <td style={{ padding: '16px 20px', color: C.muted, fontWeight: 500 }}>{new Date(d.updated_at || d.created_at).toLocaleDateString()}</td>
                      <td style={{ padding: '16px 20px', color: C.gold, fontWeight: 900, fontSize: 15 }}>{Number(d.cod_amount || 0).toLocaleString()}</td>
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <button 
                          onClick={() => markAsSettled(d.pickup_id)}
                          disabled={processingId === d.pickup_id}
                          style={{ background: C.success, color: '#000', border: 'none', padding: '10px 18px', borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: processingId === d.pickup_id ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: FF.body, opacity: processingId === d.pickup_id ? 0.6 : 1 }}
                        >
                          {processingId === d.pickup_id ? <Loader2 size={16} className="animate-spin" /> : <Banknote size={16} />} 
                          {processingId === d.pickup_id ? t.settling : t.btnSettle}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}