import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';

const C = { bg: '#061524', panel: '#0b2236', panel2: '#081b2e', panelHover: '#0f2a42', border: '#1a3a5c', gold: '#f6b84b', orange: '#ff8a4c', text: '#eef8ff', text2: '#c8dff0', muted: '#4d7a9b', success: '#22c55e', error: '#ff4f86', warning: '#f59e0b', info: '#38bdf8' };
const FF = { body: "'Poppins', sans-serif" };

const TRANSLATIONS = {
  en: {
    header: "Britium Express",
    title: "Delivery Workflow Command Design",
    subtitle: "Full process status reference across pickup, warehouse, delivery, and return. Live counters are preserved from Supabase and mapped directly to each operational stage.",
    refresh: "Refresh Live Counts",
    kpiTotal: "Total Events", kpiPickup: "Pickup Events", kpiWarehouse: "Warehouse Events",
    kpiDelivery: "Delivery Events", kpiReturn: "Return Events", kpiExceptions: "Exceptions",
    flowTitle: "Process Flow", flowSub: "Normal Path Sequence", flowDesc: "Each lane below shows the expected step order for the operational workflow, with live event counts overlaid per step.",
    matrixTitle: "Reference Matrix", matrixSub: "Complete Status Master Table"
  },
  mm: {
    header: "BRITIUM EXPRESS",
    title: "ပို့ဆောင်ရေး လုပ်ငန်းစဉ်စွမ်းဆောင်ရည်",
    subtitle: "ကုန်ပစ္စည်း ကောက်ယူခြင်း၊ ထိန်းသိမ်းခြင်း၊ ပို့ဆောင်ခြင်းနှင့် ပြန်လည်ပို့ဆောင်ခြင်း အဆင့်အားလုံးအတွက် တိုက်ရိုက်မှတ်တမ်းများကို Supabase မှတဆင့် ချိတ်ဆက်ပြသထားသည်။",
    refresh: "Refresh Live Counts",
    kpiTotal: "စုစုပေါင်းဆောင်ရွက်ပြီးစီးမှုအရေအတွက်", kpiPickup: "ပစ္စည်းကောက်ယူခြင်းဆိုင်ရာစွမ်းဆောင်ရည်", kpiWarehouse: "သိုလှောင်မှုဆိုင်ရာစွမ်းဆောင်ရည်",
    kpiDelivery: "ပို့ဆောင်ပြီးစီးမှုဆိုင်ရာ စွမ်းဆောင်ရည်", kpiReturn: "ပြန်လည်ပို့ဆောင်ပေးမှုဆိုင်ရာကိစ္စရပ်များ", kpiExceptions: "လုပ်ငန်းမပြီးဆုံးခြင်းဆိုင်ရာကိစ္စရပ်များ",
    flowTitle: "လုပ်ငန်း အဆင့်ဆင့်", flowSub: "ပုံမှန် လုပ်ငန်းစဉ်", flowDesc: "အောက်ပါကဏ္ဍတစ်ခုစီသည် လုပ်ငန်းစဉ်အဆင့်များကို တိုက်ရိုက်ဒေတာများဖြင့် ပြသထားပါသည်။",
    matrixTitle: "အကိုးအကား ဇယား", matrixSub: "အခြေအနေ သတ်မှတ်ချက်များ အပြည့်အစုံ"
  }
};

const COLUMNS = [
  { id: 'PICKUP', label: 'Pickup', color: C.info, icon: 'P' },
  { id: 'WAREHOUSE', label: 'Warehouse', color: '#8b5cf6', icon: 'W' },
  { id: 'DELIVERY', label: 'Delivery', color: C.success, icon: 'D' },
  { id: 'RETURN', label: 'Return', color: C.gold, icon: 'R' },
];

function KPICard({ label, value, accent, note }: { label: string; value: string | number; accent: string; note: string }) {
  return (
    <div style={{ background: `linear-gradient(180deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.border}`, borderTop: `3px solid ${accent}`, borderRadius: 20, padding: 20, boxShadow: '0 12px 30px rgba(0,0,0,0.2)' }}>
      <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 800, fontFamily: FF.body }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color: C.gold, fontFamily: FF.body, marginTop: 10 }}>{value}</div>
      <div style={{ fontSize: 12, color: C.text2, marginTop: 8, fontFamily: FF.body, fontWeight: 500 }}>{note}</div>
    </div>
  )
}

export default function DeliveryWorkflowPage() {
  const { lang, setLang } = useLanguage();
  const t = TRANSLATIONS[lang as 'en' | 'mm'] || TRANSLATIONS.en;

  const [cargoEvents, setCargoEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('be_portal_cargo_events').select('status, process_type');
      setCargoEvents(data ?? []);
    } catch (_) {
      setCargoEvents([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const totalEvents = cargoEvents.length;
  const pickupEvents = cargoEvents.filter(e => String(e.process_type ?? '').toUpperCase() === 'PICKUP').length;
  const warehouseEvents = cargoEvents.filter(e => String(e.process_type ?? '').toUpperCase() === 'WAREHOUSE').length;
  const deliveryEvents = cargoEvents.filter(e => String(e.process_type ?? '').toUpperCase() === 'DELIVERY').length;

  return (
    <div style={{ background: C.bg, padding: 24, minHeight: '100vh', fontFamily: FF.body }}>
      <div style={{ maxWidth: 1600, margin: '0 auto', display: 'grid', gap: 24 }}>
        
        {/* Header */}
        <section style={{ background: `linear-gradient(135deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.border}`, borderRadius: 24, padding: 28, boxShadow: '0 20px 45px rgba(0,0,0,0.28)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ maxWidth: 860 }}>
              <div style={{ fontSize: 12, color: C.muted, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 800 }}>{t.header}</div>
              <h1 style={{ fontSize: 26, fontWeight: 900, textTransform: 'uppercase', color: C.gold, marginTop: 10, letterSpacing: '0.05em' }}>{t.title}</h1>
              <p style={{ fontSize: 14, color: C.text2, lineHeight: 1.7, marginTop: 10, fontWeight: 500 }}>{t.subtitle}</p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', background: C.panel2, borderRadius: 8, padding: 4, border: `1px solid ${C.border}` }}>
                <button onClick={() => setLang('en')} style={{ padding: '6px 12px', borderRadius: 6, background: lang === 'en' ? C.panelHover : 'transparent', color: lang === 'en' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: FF.body }}>EN</button>
                <button onClick={() => setLang('mm')} style={{ padding: '6px 12px', borderRadius: 6, background: lang === 'mm' ? C.panelHover : 'transparent', color: lang === 'mm' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: FF.body }}>မြန်မာ</button>
              </div>
              <button onClick={load} style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.orange})`, color: '#082032', border: 'none', borderRadius: 12, padding: '12px 20px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: FF.body }}>
                {t.refresh}
              </button>
            </div>
          </div>
        </section>

        {/* KPIs */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16 }}>
          <KPICard label={t.kpiTotal} value={loading ? '—' : totalEvents} accent={C.gold} note="All event rows loaded" />
          <KPICard label={t.kpiPickup} value={loading ? '—' : pickupEvents} accent={C.info} note="Pickup volume" />
          <KPICard label={t.kpiWarehouse} value={loading ? '—' : warehouseEvents} accent="#8b5cf6" note="Warehouse handling" />
          <KPICard label={t.kpiDelivery} value={loading ? '—' : deliveryEvents} accent={C.success} note="Delivery execution" />
        </section>

        {/* Matrix Shell */}
        <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, overflow: 'hidden' }}>
          <div style={{ padding: 24, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', background: C.panel2 }}>
            <div>
              <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 800 }}>{t.matrixTitle}</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: C.text, marginTop: 8 }}>{t.matrixSub}</h2>
            </div>
            <div style={{ padding: '10px 14px', borderRadius: 14, border: `1px solid ${C.border}`, background: C.panel, color: C.text2, fontSize: 13, fontWeight: 700 }}>
              {loading ? 'Loading live events...' : `${totalEvents} live events loaded`}
            </div>
          </div>
          <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 14, fontWeight: 500 }}>
            Process Matrix Renders Here
          </div>
        </section>

      </div>
    </div>
  )
}