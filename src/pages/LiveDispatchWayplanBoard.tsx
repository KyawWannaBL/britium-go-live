import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Map, RefreshCw, Loader2, Navigation, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

const C = { bg: '#061524', panel: '#0b2236', panel2: '#081b2e', panelHover: '#0f2a42', border: '#1a3a5c', gold: '#f6b84b', text: '#eef8ff', text2: '#c8dff0', muted: '#4d7a9b', success: '#22c55e', error: '#ff4f86', warning: '#f59e0b', info: '#38bdf8' };
const FF = { body: "'Poppins', sans-serif" };

const TRANSLATIONS = {
  en: {
    title: "Live Dispatch Board", subtitle: "Real-time tracking of active riders and delivery progress.",
    refresh: "Live Sync", empty: "No active routes currently on the road.",
    lblRider: "RIDER", lblItems: "PARCELS", lblStatus: "LIVE STATUS",
  },
  mm: {
    title: "ပို့ဆောင်မှု လမ်းကြောင်း ခြေရာခံစနစ်", subtitle: "လက်ရှိ ပို့ဆောင်နေသော ရိုင်ဒါများနှင့် လုပ်ငန်းစဉ်များကို တိုက်ရိုက်စောင့်ကြည့်ပါ။",
    refresh: "တိုက်ရိုက် ဆန်းသစ်ရန်", empty: "လက်ရှိ ပို့ဆောင်နေသော လမ်းကြောင်းများ မရှိပါ။",
    lblRider: "ရိုင်ဒါ", lblItems: "ပါဆယ်များ", lblStatus: "လက်ရှိ အခြေအနေ",
  }
};

export default function LiveDispatchWayplanBoard() {
  const { lang } = useLanguage();
  const t = TRANSLATIONS[lang as 'en' | 'mm'] || TRANSLATIONS.en;

  const [activeRoutes, setActiveRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      // Fetch parcels that are currently out for delivery or recently resolved
      const { data } = await supabase.from('be_portal_pickup_requests')
        .select('*')
        .in('status', ['OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED'])
        .order('updated_at', { ascending: false })
        .limit(200);

      // Group by rider to build the "Route Cards"
      const grouped = (data || []).reduce((acc: any, curr: any) => {
        if (!curr.assigned_rider_id) return acc;
        const rider = curr.assigned_rider_name || curr.assigned_rider_id;
        if (!acc[rider]) acc[rider] = { rider, total: 0, delivered: 0, failed: 0, pending: 0, parcels: [] };
        
        acc[rider].total += 1;
        if (curr.status === 'DELIVERED') acc[rider].delivered += 1;
        else if (curr.status === 'FAILED') acc[rider].failed += 1;
        else acc[rider].pending += 1;
        
        acc[rider].parcels.push(curr);
        return acc;
      }, {});

      // Only show riders who still have pending items on their route OR just finished today
      const routes = Object.values(grouped).filter((r: any) => r.pending > 0 || r.total > 0);
      setActiveRoutes(routes);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { 
    void load(); 
    const interval = setInterval(load, 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 24, color: C.text, fontFamily: FF.body }}>
      <div style={{ maxWidth: 1600, margin: '0 auto', display: 'grid', gap: 24 }}>
        
        <header style={{ background: C.panel, border: `1px solid ${C.border}`, padding: 24, borderRadius: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: C.success, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', display: 'flex', alignItems: 'center', gap: 8 }}><Navigation size={16} className="animate-pulse" /> <span>Active Tracking</span></div>
            <h1 style={{ margin: '8px 0 0', fontSize: 26, fontWeight: 900 }}>{t.title}</h1>
            <p style={{ color: C.muted, margin: '6px 0 0', fontSize: 14 }}>{t.subtitle}</p>
          </div>
          <button onClick={load} disabled={loading} style={{ background: C.success, border: 'none', color: '#000', height: 42, padding: '0 20px', borderRadius: 10, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: FF.body }}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {t.refresh}
          </button>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 24 }}>
          {loading && activeRoutes.length === 0 && <div style={{ padding: 40, color: C.muted, gridColumn: '1/-1', textAlign: 'center' }}><Loader2 className="animate-spin inline mr-2"/> Loading live routes...</div>}
          {!loading && activeRoutes.length === 0 && <div style={{ padding: 40, color: C.muted, gridColumn: '1/-1', textAlign: 'center', border: `1px dashed ${C.border}`, borderRadius: 24 }}>{t.empty}</div>}
          
          {activeRoutes.map((route: any, idx: number) => {
            const isComplete = route.pending === 0;
            const progress = ((route.delivered + route.failed) / route.total) * 100;
            
            return (
              <div key={idx} style={{ background: C.panel, border: `1px solid ${isComplete ? C.success : C.border}`, borderRadius: 24, overflow: 'hidden', position: 'relative' }}>
                {isComplete && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: C.success }}/>}
                <div style={{ padding: 24, borderBottom: `1px solid ${C.border}`, background: C.panel2 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 11, color: C.muted, fontWeight: 800, letterSpacing: '0.1em' }}>{t.lblRider}</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: C.text, marginTop: 4 }}>{route.rider}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: C.muted, fontWeight: 800, letterSpacing: '0.1em' }}>{t.lblStatus}</div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: isComplete ? C.success : C.gold, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isComplete ? <><CheckCircle2 size={16}/> Completed</> : <><Clock size={16}/> En Route</>}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ padding: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 900 }}>{route.total}</div><div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase' }}>Total</div></div>
                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 900, color: C.success }}>{route.delivered}</div><div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase' }}>Delivered</div></div>
                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 900, color: C.error }}>{route.failed}</div><div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase' }}>Failed</div></div>
                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 900, color: C.gold }}>{route.pending}</div><div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase' }}>Pending</div></div>
                  </div>

                  <div style={{ width: '100%', height: 8, background: C.bg, borderRadius: 4, overflow: 'hidden', marginTop: 24 }}>
                    <div style={{ width: `${progress}%`, height: '100%', background: isComplete ? C.success : C.gold, transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}