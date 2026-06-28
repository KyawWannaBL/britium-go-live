import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, MapPin, RefreshCw, Route, Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';

const C = { bg:'#061524', panel:'#0b2236', panel2:'#081b2e', panelHover:'#0f2a42', border:'#1a3a5c', gold:'#f6b84b', orange:'#ff8a4c', text:'#eef8ff', text2:'#c8dff0', muted:'#4d7a9b', success:'#22c55e', error:'#ff4f86', warning:'#f59e0b', info:'#38bdf8' };
const FF = { body:"'Poppins', sans-serif" };

function text(v: any, fallback='—') { return v === null || v === undefined || v === '' ? fallback : String(v); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function formatDate(v: any) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? text(v) : d.toLocaleString('en-GB', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}

const TRANSLATIONS = {
  en: {
    header: "Operation Command",
    title: "Wayplan Generation & Route Control",
    subtitle: "Generate draft wayplans only after warehouse-ready status. Supervisor reviews and confirms delivery assignments.",
    refresh: "Refresh",
    kpiReady: "Ready for Wayplan",
    kpiDraft: "Draft Wayplans",
    kpiConfirmed: "Confirmed",
    kpiToday: "Today Plans",
    genTitle: "Generate Draft Wayplan",
    genSub: "Operation generates. Supervisor adjusts and confirms.",
    lblBranch: "Branch",
    lblDate: "Delivery Date",
    btnGen: "Generate Draft Wayplan",
    availRecs: (n: number) => `Available records: ${n}`,
    whReadyTitle: "Warehouse-Ready Requests",
    whReadySub: "These rows are eligible for draft wayplan generation.",
    thPickup: "Pickup ID",
    thMerch: "Merchant",
    thTown: "Township",
    thStat: "Status",
    thUpdated: "Updated",
    townTitle: "Township Grouping",
    townSub: "Draft grouping basis for delivery plan.",
    wpTitle: "Wayplan Register",
    wpSub: "Supervisor should review DRAFT wayplans.",
    thWpNo: "Wayplan No",
    thDate: "Date",
    thReviewed: "Reviewed",
    thConfirmed: "Confirmed",
    thCreated: "Created",
    msgSuccess: "Draft wayplan generated. Supervisor can now review and adjust.",
    msgNoRows: "No warehouse-ready rows yet."
  },
  mm: {
    header: "လုပ်ငန်းလည်ပတ်မှု ထိန်းချုပ်ရေး",
    title: "လမ်းကြောင်း ဖန်တီးခြင်းနှင့် ထိန်းချုပ်ခြင်း",
    subtitle: "ကုန်လှောင်ရုံမှ အသင့်ဖြစ်သောအခါမှသာ လမ်းကြောင်းမူကြမ်းကို ဖန်တီးပါ။ ကြီးကြပ်သူမှ စစ်ဆေးအတည်ပြုပါမည်။",
    refresh: "ပြန်လည်ဆန်းသစ်ရန်",
    kpiReady: "လမ်းကြောင်းဆွဲရန် အသင့်",
    kpiDraft: "လမ်းကြောင်း မူကြမ်းများ",
    kpiConfirmed: "အတည်ပြုပြီး",
    kpiToday: "ယနေ့ လမ်းကြောင်းများ",
    genTitle: "လမ်းကြောင်း မူကြမ်း ဖန်တီးရန်",
    genSub: "လည်ပတ်မှုအဖွဲ့မှ ဖန်တီးပြီး ကြီးကြပ်သူမှ ပြင်ဆင်အတည်ပြုသည်။",
    lblBranch: "ရုံးခွဲ",
    lblDate: "ပို့ဆောင်မည့်ရက်",
    btnGen: "လမ်းကြောင်း မူကြမ်း ဖန်တီးမည်",
    availRecs: (n: number) => `ရရှိနိုင်သော မှတ်တမ်း: ${n} ခု`,
    whReadyTitle: "ကုန်လှောင်ရုံမှ အသင့်ဖြစ်သော စာရင်း",
    whReadySub: "ဤစာရင်းများသည် လမ်းကြောင်းဖန်တီးရန် အကျုံးဝင်ပါသည်။",
    thPickup: "လာယူမည့် ID",
    thMerch: "ကုန်သည်",
    thTown: "မြို့နယ်",
    thStat: "အခြေအနေ",
    thUpdated: "နောက်ဆုံးပြင်ဆင်ချိန်",
    townTitle: "မြို့နယ်အလိုက် အုပ်စုဖွဲ့ခြင်း",
    townSub: "ပို့ဆောင်ရေး အစီအစဉ်အတွက် အုပ်စုဖွဲ့မှု မူကြမ်း။",
    wpTitle: "လမ်းကြောင်း မှတ်တမ်း",
    wpSub: "ကြီးကြပ်သူများသည် မူကြမ်းများကို စစ်ဆေးရမည်။",
    thWpNo: "လမ်းကြောင်း အမှတ်",
    thDate: "နေ့စွဲ",
    thReviewed: "စစ်ဆေးပြီး",
    thConfirmed: "အတည်ပြုပြီး",
    thCreated: "ဖန်တီးခဲ့ချိန်",
    msgSuccess: "လမ်းကြောင်း မူကြမ်း ဖန်တီးပြီးပါပြီ။ ကြီးကြပ်သူမှ စစ်ဆေးနိုင်ပါပြီ။",
    msgNoRows: "အသင့်ဖြစ်သော စာရင်း မရှိသေးပါ။"
  }
};

function badge(status: any): React.CSSProperties {
  const s = text(status, '').toUpperCase();
  const map: Record<string, any> = {
    READY_FOR_WAYPLAN: [C.success, '#052e16'],
    WAYPLAN_DRAFTED: [C.warning, '#451a03'],
    WAYPLAN_CONFIRMED: [C.gold, '#3b2503'],
    DRAFT: [C.warning, '#451a03'],
    CONFIRMED: [C.success, '#052e16'],
  };
  const v = map[s] || [C.text2, C.panel2];
  return { display:'inline-flex', alignItems:'center', padding:'4px 10px', borderRadius:999, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', background:v[1], color:v[0], border:`1px solid ${v[0]}40`, whiteSpace:'nowrap' };
}

export default function OpsCommandPage() {
  const { lang, setLang } = useLanguage();
  const t = TRANSLATIONS[lang as 'en' | 'mm'] || TRANSLATIONS.en;

  const [readyRows, setReadyRows] = useState<any[]>([]);
  const [wayplans, setWayplans] = useState<any[]>([]);
  const [date, setDate] = useState(todayISO());
  const [branch, setBranch] = useState('YGN');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  const load = async () => {
    setLoading(true);
    const r = await supabase.from('be_portal_pickup_requests').select('*').eq('status', 'READY_FOR_WAYPLAN').order('updated_at', { ascending: true }).limit(300);
    const w = await supabase.from('be_delivery_wayplans').select('*').order('created_at', { ascending: false }).limit(100);
    setReadyRows(r.data || []);
    setWayplans(w.data || []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const ch = supabase.channel('be-ops-command')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'be_portal_pickup_requests' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'be_delivery_wayplans' }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const generateWayplan = async () => {
    setMessage(null);
    setLoading(true);
    const rpc = await supabase.rpc('be_generate_delivery_wayplan', { p_branch_code: branch, p_delivery_date: date });
    
    if (rpc.error) {
      try {
        const wayplanNo = `WP-${branch}-${date.replaceAll('-','')}-${String(Date.now()).slice(-5)}`;
        const wp = await supabase.from('be_delivery_wayplans').insert({
          wayplan_no: wayplanNo, branch_code: branch, planned_delivery_date: date, status: 'DRAFT',
        }).select('wayplan_id,wayplan_no').single();
        
        if (wp.error) throw wp.error;
        
        const items = readyRows.map((r, i) => ({
          wayplan_id: wp.data.wayplan_id, pickup_request_id: r.id, pickup_item_id: r.id,
          pickup_id: r.pickup_id, delivery_township: r.delivery_township || r.pickup_township,
          proposed_sequence: i + 1, include_in_wayplan: true,
        }));
        
        if (items.length) await supabase.from('be_delivery_wayplan_items').insert(items);
        await supabase.from('be_portal_pickup_requests').update({ status: 'WAYPLAN_DRAFTED', delivery_wayplan_id: wp.data.wayplan_id, updated_at: new Date().toISOString() }).in('pickup_id', readyRows.map(r => r.pickup_id));
        await supabase.from('be_portal_cargo_events').insert({ pickup_id: wayplanNo, event_type: 'WAYPLAN_DRAFTED', description: `Draft wayplan generated for ${items.length} request(s).`, actor_role: 'operation' });
      } catch(e: any) {
        setMessage({type: 'error', text: e?.message || 'Unable to generate wayplan. Check wayplan tables.'}); 
        setLoading(false);
        return;
      }
    }
    setMessage({type: 'success', text: t.msgSuccess});
    await load();
  };

  const kpis = useMemo(() => ({
    ready: readyRows.length,
    draft: wayplans.filter(w => text(w.status,'').toUpperCase() === 'DRAFT').length,
    confirmed: wayplans.filter(w => text(w.status,'').toUpperCase() === 'CONFIRMED').length,
    today: wayplans.filter(w => text(w.planned_delivery_date,'') === todayISO()).length,
  }), [readyRows, wayplans]);

  const byTownship = useMemo(() => {
    const map: Record<string, number> = {};
    readyRows.forEach(r => { const k = text(r.delivery_township || r.pickup_township, 'Unknown'); map[k] = (map[k] || 0) + 1; });
    return Object.entries(map).sort((a,b) => b[1] - a[1]);
  }, [readyRows]);

  const inputStyle = { width: '100%', height: 42, borderRadius: 10, border: `1px solid ${C.border}`, background: C.panel2, color: C.text, padding: '0 12px', outline: 'none', fontFamily: FF.body, fontSize: 14 };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, padding: 24, fontFamily: FF.body }}>
      <div style={{ maxWidth: 1600, margin: '0 auto', display: 'grid', gap: 20 }}>
        
        <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'start', flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: C.gold, textTransform: 'uppercase', letterSpacing: '0.16em', fontWeight: 800, fontSize: 12 }}>{t.header}</div>
              <h1 style={{ margin: '8px 0', fontSize: 26, fontWeight: 900 }}>{t.title}</h1>
              <p style={{ margin: 0, color: C.text2, fontSize: 14 }}>{t.subtitle}</p>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ display: 'flex', background: C.panel2, borderRadius: 8, padding: 4, border: `1px solid ${C.border}` }}>
                <button onClick={() => setLang('en')} style={{ padding: '6px 12px', borderRadius: 6, background: lang === 'en' ? C.panelHover : 'transparent', color: lang === 'en' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: FF.body }}>EN</button>
                <button onClick={() => setLang('mm')} style={{ padding: '6px 12px', borderRadius: 6, background: lang === 'mm' ? C.panelHover : 'transparent', color: lang === 'mm' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: FF.body }}>မြန်မာ</button>
              </div>
              <button onClick={() => void load()} style={{ height: 42, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text2, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, cursor: 'pointer', fontFamily: FF.body }}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {t.refresh}
              </button>
            </div>
          </div>
        </section>

        {message && (
          <section style={{ padding: 16, borderRadius: 12, background: message.type === 'error' ? 'rgba(255,79,134,0.1)' : 'rgba(34,197,94,0.1)', border: `1px solid ${message.type === 'error' ? C.error : C.success}40`, color: message.type === 'error' ? C.error : C.success, display: 'flex', gap: 10, fontWeight: 600, fontSize: 14 }}>
            {message.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />} {message.text}
          </section>
        )}

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {[
            { label: t.kpiReady, value: kpis.ready, color: C.success },
            { label: t.kpiDraft, value: kpis.draft, color: C.warning },
            { label: t.kpiConfirmed, value: kpis.confirmed, color: C.gold },
            { label: t.kpiToday, value: kpis.today, color: C.info }
          ].map((k, i) => (
            <div key={i} style={{ background: C.panel, border: `1px solid ${C.border}`, borderTop: `3px solid ${k.color}`, borderRadius: 16, padding: 20 }}>
              <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800 }}>{k.label}</div>
              <div style={{ marginTop: 8, fontSize: 28, color: k.color, fontWeight: 900 }}>{k.value}</div>
            </div>
          ))}
        </section>

        <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ margin: 0, color: C.text, fontSize: 18, fontWeight: 800 }}>{t.genTitle}</h2>
            <p style={{ margin: '4px 0 0', color: C.text2, fontSize: 14 }}>{t.genSub}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', fontWeight: 800, marginBottom: 6 }}>{t.lblBranch}</div>
              <input style={inputStyle} value={branch} onChange={e => setBranch(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', fontWeight: 800, marginBottom: 6 }}>{t.lblDate}</div>
              <input type="date" style={inputStyle} value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <button onClick={() => void generateWayplan()} disabled={loading} style={{ height: 42, background: C.gold, color: '#000', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: FF.body }}>
              <Route size={16} /> {t.btnGen}
            </button>
            <div style={{ color: C.text2, fontSize: 14, fontWeight: 600, paddingBottom: 10 }}>{t.availRecs(readyRows.length)}</div>
          </div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(380px, 0.8fr)', gap: 20, alignItems: 'start' }}>
          
          {/* Warehouse Ready */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden' }}>
            <div style={{ padding: 20, borderBottom: `1px solid ${C.border}`, background: C.panel2 }}>
              <h2 style={{ margin: 0, color: C.text, fontSize: 18, fontWeight: 800 }}>{t.whReadyTitle}</h2>
              <p style={{ margin: '4px 0 0', color: C.muted, fontSize: 13 }}>{t.whReadySub}</p>
            </div>
            <div style={{ overflowX: 'auto', maxHeight: 400 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead style={{ background: C.bg }}>
                  <tr>
                    {[t.thPickup, t.thMerch, t.thTown, t.thStat, t.thUpdated].map(h => <th key={h} style={{ padding: '12px 16px', color: C.muted, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {readyRows.map(r => (
                    <tr key={r.id || r.pickup_id} className="hover:bg-[#0f2a42] transition">
                      <td style={{ padding: '12px 16px', fontWeight: 800, color: C.gold, borderBottom: `1px solid ${C.border}66` }}>{text(r.pickup_id)}</td>
                      <td style={{ padding: '12px 16px', color: C.text, borderBottom: `1px solid ${C.border}66` }}>{text(r.merchant_name)}<br/><span style={{ color: C.muted, fontSize: 11 }}>{text(r.merchant_code)}</span></td>
                      <td style={{ padding: '12px 16px', color: C.text2, borderBottom: `1px solid ${C.border}66` }}>{text(r.delivery_township || r.pickup_township)}</td>
                      <td style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}66` }}><span style={badge(r.status)}>{text(r.status)}</span></td>
                      <td style={{ padding: '12px 16px', color: C.text2, borderBottom: `1px solid ${C.border}66` }}>{formatDate(r.updated_at)}</td>
                    </tr>
                  ))}
                  {readyRows.length === 0 && <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', color: C.muted }}>{t.msgNoRows}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Township Grouping */}
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 20 }}>
            <h2 style={{ margin: 0, color: C.text, fontSize: 18, fontWeight: 800 }}>{t.townTitle}</h2>
            <p style={{ margin: '4px 0 16px', color: C.muted, fontSize: 13 }}>{t.townSub}</p>
            <div style={{ display: 'grid', gap: 10, maxHeight: 340, overflowY: 'auto', paddingRight: 4 }}>
              {byTownship.map(([name, count]) => (
                <div key={name} style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.text2, fontWeight: 600 }}><MapPin size={16} color={C.gold} /> {name}</span>
                  <span style={{ background: 'rgba(246,184,75,0.1)', color: C.gold, padding: '4px 12px', borderRadius: 20, fontWeight: 800, fontSize: 13 }}>{count}</span>
                </div>
              ))}
              {!byTownship.length && <div style={{ color: C.muted, textAlign: 'center', padding: 20 }}>{t.msgNoRows}</div>}
            </div>
          </div>
        </section>

        <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden' }}>
          <div style={{ padding: 20, borderBottom: `1px solid ${C.border}`, background: C.panel2 }}>
            <h2 style={{ margin: 0, color: C.text, fontSize: 18, fontWeight: 800 }}>{t.wpTitle}</h2>
            <p style={{ margin: '4px 0 0', color: C.muted, fontSize: 13 }}>{t.wpSub}</p>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead style={{ background: C.bg }}>
                <tr>
                  {[t.thWpNo, t.lblBranch, t.thDate, t.thStat, t.thReviewed, t.thConfirmed, t.thCreated].map(h => <th key={h} style={{ padding: '12px 16px', color: C.muted, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {wayplans.map(w => (
                  <tr key={w.wayplan_id || w.wayplan_no} className="hover:bg-[#0f2a42] transition">
                    <td style={{ padding: '12px 16px', fontWeight: 800, color: C.info, borderBottom: `1px solid ${C.border}66` }}>{text(w.wayplan_no)}</td>
                    <td style={{ padding: '12px 16px', color: C.text2, borderBottom: `1px solid ${C.border}66` }}>{text(w.branch_code)}</td>
                    <td style={{ padding: '12px 16px', color: C.text2, borderBottom: `1px solid ${C.border}66` }}>{text(w.planned_delivery_date)}</td>
                    <td style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}66` }}><span style={badge(w.status)}>{text(w.status)}</span></td>
                    <td style={{ padding: '12px 16px', color: C.muted, borderBottom: `1px solid ${C.border}66` }}>{formatDate(w.reviewed_at)}</td>
                    <td style={{ padding: '12px 16px', color: C.success, borderBottom: `1px solid ${C.border}66` }}>{formatDate(w.confirmed_at)}</td>
                    <td style={{ padding: '12px 16px', color: C.muted, borderBottom: `1px solid ${C.border}66` }}>{formatDate(w.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}