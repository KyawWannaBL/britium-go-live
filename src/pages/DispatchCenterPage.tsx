import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Users2, CarFront, Activity, RefreshCw, Loader2, CheckCircle2, ShieldAlert } from 'lucide-react';

const C = { bg: '#061524', panel: '#0b2236', panel2: '#081b2e', panelHover: '#0f2a42', border: '#1a3a5c', gold: '#f6b84b', text: '#eef8ff', text2: '#c8dff0', muted: '#4d7a9b', success: '#22c55e', error: '#ff4f86', warning: '#f59e0b', info: '#38bdf8' };
const FF = { body: "'Poppins', sans-serif" };

const TRANSLATIONS = {
  en: {
    title: "Fleet & Workforce Center", subtitle: "Monitor real-time status of delivery personnel and enterprise vehicles.",
    tabStaff: "Workforce Status", tabFleet: "Fleet Status", refresh: "Sync Data",
    thName: "Name / Code", thRole: "Role", thPhone: "Contact", thStatus: "Status",
    thVeh: "Vehicle", thPlate: "Plate No.", thType: "Type", thCap: "Capacity"
  },
  mm: {
    title: "ဝန်ထမ်းနှင့် ယာဉ်များ ဗဟို", subtitle: "ပို့ဆောင်ရေးဝန်ထမ်းများနှင့် ကုမ္ပဏီသုံးယာဉ်များ၏ လက်ရှိအခြေအနေကို စောင့်ကြည့်ပါ။",
    tabStaff: "ဝန်ထမ်း အခြေအနေ", tabFleet: "ယာဉ် အခြေအနေ", refresh: "ဒေတာ ဆန်းသစ်ရန်",
    thName: "အမည် / ကုဒ်", thRole: "ရာထူး", thPhone: "ဖုန်း", thStatus: "အခြေအနေ",
    thVeh: "ယာဉ်", thPlate: "နံပါတ်ပြား", thType: "အမျိုးအစား", thCap: "စွမ်းရည်"
  }
};

export default function DispatchCenterPage() {
  const { lang } = useLanguage();
  const t = TRANSLATIONS[lang as 'en' | 'mm'] || TRANSLATIONS.en;

  const [staff, setStaff] = useState<any[]>([]);
  const [fleet, setFleet] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [s, f] = await Promise.all([
        supabase.from('be_mobile_workforce_accounts').select('*').order('created_at', { ascending: false }),
        supabase.from('be_fleet_master').select('*').order('created_at', { ascending: false })
      ]);
      setStaff(s.data || []); setFleet(f.data || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const activeStaff = staff.filter(s => s.is_active !== false).length;
  const activeFleet = fleet.filter(f => String(f.status).toUpperCase() === 'AVAILABLE').length;

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 24, color: C.text, fontFamily: FF.body }}>
      <div style={{ maxWidth: 1600, margin: '0 auto', display: 'grid', gap: 24 }}>
        
        <header style={{ background: C.panel, border: `1px solid ${C.border}`, padding: 24, borderRadius: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: C.gold, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', display: 'flex', alignItems: 'center', gap: 8 }}><Users2 size={16} /> <span>Resource Management</span></div>
            <h1 style={{ margin: '8px 0 0', fontSize: 26, fontWeight: 900 }}>{t.title}</h1>
            <p style={{ color: C.muted, margin: '6px 0 0', fontSize: 14 }}>{t.subtitle}</p>
          </div>
          <button onClick={load} disabled={loading} style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text, height: 42, padding: '0 16px', borderRadius: 10, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: FF.body }}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {t.refresh}
          </button>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
          
          {/* WORKFORCE PANEL */}
          <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, overflow: 'hidden' }}>
            <div style={{ padding: 24, borderBottom: `1px solid ${C.border}`, background: C.panel2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>{t.tabStaff}</h2><p style={{ margin: '4px 0 0', color: C.success, fontSize: 13, fontWeight: 700 }}>{activeStaff} Active Personnel</p></div>
              <Activity size={24} color={C.muted} />
            </div>
            <div style={{ overflowX: 'auto', maxHeight: 600 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead style={{ background: C.bg, position: 'sticky', top: 0 }}>
                  <tr>{[t.thName, t.thRole, t.thPhone, t.thStatus].map(h => <th key={h} style={{ padding: '14px 16px', color: C.muted, fontWeight: 800, textTransform: 'uppercase' }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {staff.map(s => {
                    const active = s.is_active !== false;
                    return (
                      <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}40`, opacity: active ? 1 : 0.5 }} className="hover:bg-[#0f2a42]">
                        <td style={{ padding: '14px 16px' }}><div style={{ fontWeight: 800, fontSize: 14 }}>{s.display_name}</div><div style={{ fontSize: 11, color: C.muted }}>{s.workforce_code}</div></td>
                        <td style={{ padding: '14px 16px', fontWeight: 800, color: C.info }}>{s.role}</td>
                        <td style={{ padding: '14px 16px', fontFamily: 'monospace' }}>{s.phone || '-'}</td>
                        <td style={{ padding: '14px 16px' }}><span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 10, fontWeight: 900, background: active ? 'rgba(34,197,94,0.1)' : 'rgba(255,79,134,0.1)', color: active ? C.success : C.error }}>{active ? 'ACTIVE' : 'INACTIVE'}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* FLEET PANEL */}
          <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, overflow: 'hidden' }}>
            <div style={{ padding: 24, borderBottom: `1px solid ${C.border}`, background: C.panel2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>{t.tabFleet}</h2><p style={{ margin: '4px 0 0', color: C.gold, fontSize: 13, fontWeight: 700 }}>{activeFleet} Vehicles Available</p></div>
              <CarFront size={24} color={C.muted} />
            </div>
            <div style={{ overflowX: 'auto', maxHeight: 600 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead style={{ background: C.bg, position: 'sticky', top: 0 }}>
                  <tr>{[t.thVeh, t.thPlate, t.thType, t.thStatus].map(h => <th key={h} style={{ padding: '14px 16px', color: C.muted, fontWeight: 800, textTransform: 'uppercase' }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {fleet.map(f => {
                    const status = String(f.status || 'AVAILABLE').toUpperCase();
                    const ready = status === 'AVAILABLE';
                    return (
                      <tr key={f.id} style={{ borderBottom: `1px solid ${C.border}40`, opacity: ready ? 1 : 0.6 }} className="hover:bg-[#0f2a42]">
                        <td style={{ padding: '14px 16px', fontWeight: 800 }}>{f.vehicle_code}</td>
                        <td style={{ padding: '14px 16px', fontFamily: 'monospace', color: C.text2 }}>{f.registration_no}</td>
                        <td style={{ padding: '14px 16px', color: C.muted }}>{f.vehicle_type}</td>
                        <td style={{ padding: '14px 16px' }}><span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 10, fontWeight: 900, background: ready ? 'rgba(246,184,75,0.1)' : 'rgba(255,79,134,0.1)', color: ready ? C.gold : C.error }}>{status}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}