import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, CheckCircle2, MessageSquare, PhoneCall, RefreshCw, Send, ShieldAlert, Loader2, Info } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const C = { bg: '#061524', panel: '#0b2236', border: '#1a3a5c', gold: '#f6b84b', text: '#eef8ff', text2: '#c8dff0', error: '#ff4f86', success: '#22c55e', info: '#38bdf8', warning: '#f59e0b' };

// --- MYANMAR EXCEPTION MASTER RULES (From JSON Spec) ---
const EXCEPTION_MASTER: Record<string, any> = {
  "CUSTOMER_NOT_AVAILABLE": { en: "Customer not available", mm: "Customer မရှိ / မရရှိနိုင်", severity: "Low", next: "RESCHEDULE", msg: "လက်ခံသူ မရှိသောကြောင့် Delivery မအောင်မြင်ပါ။" },
  "MERCHANT_CLOSED": { en: "Merchant closed", mm: "ဆိုင်ပိတ်ထားသည်", severity: "Low", next: "RESCHEDULE", msg: "ဆိုင်/ရုံး ပိတ်ထားသောကြောင့် Pickup မအောင်မြင်ပါ။" },
  "PARCEL_NOT_READY": { en: "Parcel not ready", mm: "ပစ္စည်းမပြင်ဆင်ရသေးပါ", severity: "Low", next: "RESCHEDULE", msg: "ပစ္စည်း မပြင်ဆင်ရသေးသောကြောင့် Pickup မပြီးမြောက်ပါ။" },
  "WRONG_PICKUP_ADDRESS": { en: "Wrong pickup address", mm: "Pickup လိပ်စာ မှားယွင်းသည်", severity: "Medium", next: "CS_ADDRESS_REVIEW", msg: "Pickup လိပ်စာ ပြင်ဆင်ရန် လိုအပ်သောကြောင့် Pickup မပြီးမြောက်ပါ။" },
  "PAYMENT_ISSUE": { en: "Payment issue", mm: "ငွေပေးချေမှု ပြဿနာ", severity: "High", next: "FINANCE_REVIEW", msg: "ငွေပေးချေမှု ပြဿနာကြောင့် Pickup ကို ယာယီရပ်ဆိုင်းထားပါသည်။ Support ကို ဆက်သွယ်ပါ။" },
  "OVERSIZED_PARCEL": { en: "Oversized parcel", mm: "အရွယ်အစား/အလေးချိန် ကျော်လွန်သည်", severity: "Medium", next: "REASSIGN_VEHICLE", msg: "ပစ္စည်းအရွယ်အစား/အလေးချိန်ကြီးသောကြောင့် အထူးစီမံဆောင်ရွက်ရန် လိုအပ်ပါသည်။" },
  "RESTRICTED_ITEM": { en: "Restricted item", mm: "တားမြစ်ပစ္စည်း", severity: "Critical", next: "COMPLIANCE_REVIEW", msg: "ပို့ဆောင်ခွင့်မပြုထားသော ပစ္စည်းဖြစ်သောကြောင့် ဆက်လက်မလုပ်ဆောင်နိုင်ပါ။" },
  "DUPLICATE_REQUEST": { en: "Duplicate request", mm: "ထပ်နေသော Pickup Request", severity: "Low", next: "CANCEL_DUPLICATE", msg: "ထပ်နေသော Pickup Request ကို ပယ်ဖျက်ထားပါသည်။" },
  "WAYBILL_MISMATCH": { en: "Waybill mismatch", mm: "Waybill မကိုက်ညီပါ", severity: "High", next: "DATA_CORRECTION", msg: "Waybill ပြင်ဆင်ရန်လိုအပ်သောကြောင့် Shipment ကို ယာယီရပ်ဆိုင်းထားပါသည်။" },
  "WEIGHT_MISMATCH": { en: "Weight mismatch", mm: "အလေးချိန် မကိုက်ညီပါ", severity: "High", next: "RECALCULATE_TARIFF", msg: "တကယ့်အလေးချိန်နှင့် ကြေညာထားသောအလေးချိန် မကိုက်ညီသောကြောင့် ယာယီရပ်ဆိုင်းထားပါသည်။" },
  "DAMAGED_PARCEL": { en: "Damaged parcel", mm: "ပစ္စည်း ပျက်စီးနေသည်", severity: "High", next: "DAMAGE_REVIEW", msg: "ပစ္စည်းအခြေအနေ စစ်ဆေးရန်လိုအပ်သောကြောင့် ယာယီရပ်ဆိုင်းထားပါသည်။" },
  "MISSING_INVOICE": { en: "Missing invoice", mm: "Invoice မပါရှိပါ", severity: "High", next: "REQUEST_DOCUMENT", msg: "လိုအပ်သော Invoice/စာရွက်စာတမ်း မပါရှိသောကြောင့် ယာယီရပ်ဆိုင်းထားပါသည်။" },
  "UNIDENTIFIED_PARCEL": { en: "Unidentified parcel", mm: "မသိရှိနိုင်သော ပစ္စည်း", severity: "High", next: "MANUAL_INVESTIGATION", msg: "ပစ္စည်းကို မသိရှိနိုင်သောကြောင့် Shipment ကို ယာယီရပ်ဆိုင်းထားပါသည်။" },
  "WRONG_DESTINATION": { en: "Wrong destination", mm: "ဦးတည်ရာ မှားယွင်းသည်", severity: "High", next: "REROUTE", msg: "ဦးတည်ရာမှားယွင်းသွားသောကြောင့် ပြန်လည်လမ်းကြောင်းသတ်မှတ်နေပါသည်။" },
  "DUPLICATE_SCAN": { en: "Duplicate scan", mm: "Scan ထပ်နေသည်", severity: "Low", next: "IGNORE_OR_REVIEW", msg: "Scan ထပ်နေမှု တွေ့ရှိပါသည်။ Customer ဘက်မှ လုပ်ဆောင်ရန်မလိုပါ။" },
  "HOLD_BY_FINANCE": { en: "Hold by finance", mm: "Finance မှ Hold ပြုလုပ်ထားသည်", severity: "High", next: "FINANCE_RELEASE_REQUIRED", msg: "Finance Hold ဖြစ်နေသောကြောင့် Finance မှ Release ပြုလုပ်ပြီးမှ ဆက်လက်လုပ်ဆောင်ပါမည်။" },
  "HOLD_BY_CUSTOMER_SERVICE": { en: "Hold by customer service", mm: "Customer Service မှ Hold ပြုလုပ်ထားသည်", severity: "Medium", next: "CS_RELEASE_REQUIRED", msg: "Customer Service မှ စစ်ဆေးနေသောကြောင့် ယာယီရပ်ဆိုင်းထားပါသည်။" },
  "CUSTOMER_REFUSED": { en: "Customer refused", mm: "Customer မှ လက်မခံပါ", severity: "Medium", next: "CS_REVIEW_OR_RTO", msg: "လက်ခံသူမှ ပစ္စည်းကို လက်မခံပါ။" },
  "WRONG_ADDRESS": { en: "Wrong address", mm: "လိပ်စာ မှားယွင်းသည်", severity: "Medium", next: "CS_ADDRESS_REVIEW", msg: "လိပ်စာ ပြင်ဆင်ရန် လိုအပ်သောကြောင့် Delivery နှောင့်နှေးနေပါသည်။" },
  "PHONE_UNREACHABLE": { en: "Phone unreachable", mm: "ဖုန်းဆက်မရပါ", severity: "Low", next: "RETRY_OR_CS_FOLLOWUP", msg: "Delivery ပြုလုပ်ချိန်တွင် လက်ခံသူအား ဖုန်းဖြင့် ဆက်သွယ်၍ မရပါ။" },
  "COD_NOT_READY": { en: "COD not ready", mm: "COD ငွေ မပြင်ဆင်ရသေးပါ", severity: "Low", next: "RESCHEDULE", msg: "COD ငွေ မပြင်ဆင်ရသေးသောကြောင့် Delivery မပြီးမြောက်ပါ။" },
  "CUSTOMER_REQUESTED_RESCHEDULE": { en: "Customer requested reschedule", mm: "Customer မှ ပြန်ချိန်းဆိုရန် တောင်းဆိုသည်", severity: "Low", next: "SET_NEXT_ATTEMPT_DATE", msg: "လက်ခံသူ တောင်းဆိုချက်အရ Delivery ကို ပြန်လည်ချိန်းဆိုထားပါသည်။" },
  "NO_ACCESS_TO_BUILDING": { en: "No access to building", mm: "အဆောက်အဦး/ဝင်းအတွင်း ဝင်ခွင့်မရပါ", severity: "Medium", next: "CUSTOMER_ACCESS_REQUIRED", msg: "Rider သည် Delivery နေရာသို့ ဝင်ရောက်ခွင့်မရသောကြောင့် Delivery မအောင်မြင်ပါ။" },
  "PARCEL_DAMAGED": { en: "Parcel damaged", mm: "ပစ္စည်း ပျက်စီးနေသည်", severity: "High", next: "DAMAGE_REVIEW", msg: "ပစ္စည်းအခြေအနေ စစ်ဆေးရန် လိုအပ်သောကြောင့် ယာယီရပ်ဆိုင်းထားပါသည်။" },
  "WEATHER_TRAFFIC_ISSUE": { en: "Weather/traffic issue", mm: "ရာသီဥတု/လမ်းကြောင်း ပြဿနာ", severity: "Low", next: "AUTO_RESCHEDULE", msg: "ရာသီဥတု သို့မဟုတ် လမ်းကြောင်းအခြေအနေကြောင့် Delivery နှောင့်နှေးနေပါသည်။" },
  "RIDER_ISSUE": { en: "Rider issue", mm: "Rider ဘက်မှ လုပ်ငန်းဆိုင်ရာ ပြဿနာ", severity: "Medium", next: "REASSIGN_RIDER", msg: "လုပ်ငန်းဆိုင်ရာ အကြောင်းပြချက်ကြောင့် နှောင့်နှေးနေပါသည်။ Rider ပြန်လည်သတ်မှတ်ပါမည်။" }
};

export default function ExceptionsPage() {
  const { lang, setLang } = useLanguage();
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEx, setSelectedEx] = useState<any>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadExceptions = async () => {
    setLoading(true);
    // Pulls from the exception board view
    const { data, error } = await supabase
      .from('be_parcel_exception_events')
      .select('*')
      .is('resolved_at', null)
      .order('created_at', { ascending: false });
    
    if (!error && data) setExceptions(data);
    setLoading(false);
  };

  useEffect(() => { loadExceptions(); }, []);

  const resolveException = async (nextStatus: string) => {
    if (!selectedEx) return;
    setSubmitting(true);
    try {
      // 1. Mark Exception as Resolved
      await supabase.from('be_parcel_exception_events')
        .update({ 
          resolved_at: new Date().toISOString(), 
          resolved_by_email: 'cs_agent@britium.com', // In production, grab from auth context
          remarks: resolutionNote 
        })
        .eq('id', selectedEx.id);

      // 2. Push parcel back to Dispatch or RTO via Universal Engine
      await supabase.rpc('be_logistics_apply_workflow_event_strict', {
        p_pickup_id: selectedEx.tracking_no || selectedEx.pickup_id,
        p_process_type: 'CUSTOMER_SERVICE',
        p_new_status: nextStatus,
        p_actor_role: 'customer_service',
        p_actor_id: 'cs_agent@britium.com',
        p_notes: `CS Resolution: ${resolutionNote}`
      });

      setSelectedEx(null);
      setResolutionNote('');
      await loadExceptions();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const getRule = (code: string) => EXCEPTION_MASTER[code] || { en: code, mm: 'အခြား', severity: 'Unknown', next: 'REVIEW', msg: 'စစ်ဆေးရန်' };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1500, margin: '0 auto', display: 'grid', gap: 20 }}>
        
        {/* Header */}
        <header style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: C.error, fontSize: 12, fontWeight: 900, letterSpacing: '0.1em' }}>CUSTOMER SERVICE</div>
            <h1 style={{ margin: "8px 0 4px", fontSize: 26, display: 'flex', alignItems: 'center', gap: 10 }}>
              <ShieldAlert color={C.error}/> Exception Command Center
            </h1>
            <p style={{ margin: 0, color: C.text2, fontSize: 14 }}>Resolve field exceptions based on Myanmar regulatory guidelines.</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ display: 'flex', background: C.panel2, borderRadius: 8, padding: 4, border: '1px solid ' + C.border }}>
              <button onClick={() => setLang('en')} style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'en' ? C.panelHover : 'transparent', color: lang === 'en' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>EN</button>
              <button onClick={() => setLang('mm')} style={{ padding: '6px 12px', borderRadius: 4, background: lang === 'mm' ? C.panelHover : 'transparent', color: lang === 'mm' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>မြန်မာ</button>
            </div>
            <button onClick={loadExceptions} disabled={loading} style={{ padding: "10px 16px", background: C.panel, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', fontWeight: 'bold' }}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
            </button>
          </div>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 420px', gap: 20, alignItems: 'start' }}>
          
          {/* Active Exceptions Queue */}
          <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden' }}>
            <div style={{ padding: 18, borderBottom: `1px solid ${C.border}`, background: '#061524' }}>
              <h2 style={{ margin: 0, fontSize: 16, color: C.text }}>Pending Resolutions ({exceptions.length})</h2>
            </div>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: 14, borderBottom: `1px solid ${C.border}` }}>ID / Waybill</th>
                  <th style={{ padding: 14, borderBottom: `1px solid ${C.border}` }}>Exception Rule</th>
                  <th style={{ padding: 14, borderBottom: `1px solid ${C.border}` }}>Customer Details</th>
                  <th style={{ padding: 14, borderBottom: `1px solid ${C.border}` }}>Time Logged</th>
                </tr>
              </thead>
              <tbody>
                {exceptions.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: C.muted }}>No active exceptions! Great job.</td></tr>
                ) : exceptions.map(ex => {
                  const rule = getRule(ex.exception_code);
                  return (
                    <tr 
                      key={ex.id} 
                      onClick={() => setSelectedEx(ex)}
                      style={{ cursor: 'pointer', background: selectedEx?.id === ex.id ? 'rgba(255,79,134,0.1)' : 'transparent', borderBottom: `1px solid ${C.border}` }}
                    >
                      <td style={{ padding: 14, fontWeight: 'bold', color: C.gold }}>{ex.tracking_no || ex.pickup_id}</td>
                      <td style={{ padding: 14 }}>
                        <span style={{ color: rule.severity === 'Critical' || rule.severity === 'High' ? C.error : C.warning, fontWeight: 'bold', fontSize: 13 }}>
                          {ex.exception_code}
                        </span><br/>
                        <span style={{ color: C.text2, fontSize: 12 }}>{lang === 'en' ? rule.en : rule.mm}</span>
                      </td>
                      <td style={{ padding: 14, fontSize: 13, color: C.text2 }}>
                        <div>{ex.recipient_name || ex.merchant_name || 'Unknown Sender'}</div>
                        <div style={{ color: C.info, display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}><PhoneCall size={12}/> {ex.recipient_phone || 'No Phone'}</div>
                      </td>
                      <td style={{ padding: 14, fontSize: 12, color: C.muted }}>{new Date(ex.created_at).toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>

          {/* Resolution Control Panel */}
          <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 22, position: 'sticky', top: 20 }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 16, color: C.info, display: 'flex', alignItems: 'center', gap: 8 }}><MessageSquare size={18}/> Resolution Action</h2>
            
            {!selectedEx ? (
              <div style={{ padding: 30, textAlign: 'center', color: C.muted, border: `1px dashed ${C.border}`, borderRadius: 12 }}>
                Select an exception from the queue to review Myanmar guidelines and resolve it.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 16 }}>
                
                {/* Selected Info & Rule Guide */}
                <div style={{ padding: 16, background: '#061524', border: `1px solid ${C.border}`, borderRadius: 12 }}>
                  <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', fontWeight: 'bold', marginBottom: 4 }}>Resolving ID</div>
                  <div style={{ fontSize: 18, fontWeight: 'bold', color: C.text }}>{selectedEx.tracking_no || selectedEx.pickup_id}</div>
                  
                  {/* Intelligent Rule Rendering */}
                  {(() => {
                    const rule = getRule(selectedEx.exception_code);
                    return (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.gold, fontSize: 12, fontWeight: 'bold', marginBottom: 6 }}>
                          <Info size={14}/> {lang === 'en' ? 'Standard Procedure' : 'လုပ်ငန်းစဉ် လမ်းညွှန်'}
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: C.text2, lineHeight: 1.5 }}>{lang === 'en' ? rule.msg : rule.msg}</p>
                        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted }}>Severity: {rule.severity}</span>
                          <span style={{ fontSize: 11, padding: '2px 8px', background: 'rgba(56,189,248,0.1)', border: `1px solid ${C.info}`, borderRadius: 4, color: C.info }}>Action: {rule.next}</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>

                <div>
                  <label style={{ fontSize: 11, color: C.muted, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Resolution Notes / Corrected Address</label>
                  <textarea 
                    value={resolutionNote} 
                    onChange={e => setResolutionNote(e.target.value)} 
                    placeholder="E.g., Called customer, confirmed new address is No. 42 Bogyoke Road..." 
                    style={{ width: '100%', minHeight: 100, padding: 14, background: '#061524', border: `1px solid ${C.border}`, color: '#fff', borderRadius: 12, outline: 'none', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
                  <button 
                    disabled={submitting || !resolutionNote} 
                    onClick={() => resolveException('READY_FOR_DISPATCH')}
                    style={{ padding: 14, background: C.success, color: '#000', border: 'none', borderRadius: 12, fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: 8, opacity: submitting || !resolutionNote ? 0.6 : 1 }}
                  >
                    {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} Push back to Dispatch
                  </button>
                  <button 
                    disabled={submitting || !resolutionNote} 
                    onClick={() => resolveException('RTO_INITIATED')}
                    style={{ padding: 14, background: '#4a0521', color: C.error, border: `1px solid ${C.error}55`, borderRadius: 12, fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: 8, opacity: submitting || !resolutionNote ? 0.6 : 1 }}
                  >
                    Return to Origin (RTO)
                  </button>
                  <button 
                    disabled={submitting || !resolutionNote} 
                    onClick={() => resolveException('CANCELLED')}
                    style={{ padding: 14, background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 12, fontWeight: 'bold', cursor: 'pointer', display: 'flex', justifyContent: 'center', gap: 8 }}
                  >
                    Cancel Request entirely
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}