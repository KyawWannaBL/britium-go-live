import React, { useEffect, useMemo, useState } from "react";
import { Package2, Truck, Route, ClipboardCheck, Camera, Wallet, History, Headphones, User, Bell, MapPinned, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

const C = { bg: '#061524', panel: '#0b2236', panel2: '#081b2e', panelHover: '#0f2a42', border: '#1a3a5c', gold: '#f6b84b', text: '#eef8ff', text2: '#c8dff0', muted: '#4d7a9b', success: '#22c55e', error: '#ff4f86', info: '#38bdf8' };
const FF = { body: "'Poppins', sans-serif" };

export default function RiderDriverApp() {
  const { lang, setLang } = useLanguage();
  const [tab, setTab] = useState("jobs");
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const loadJobs = async () => {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      setCurrentUser(auth?.user);
      
      const email = auth?.user?.email || "";
      
      // Fetch live jobs assigned to this rider
      const { data } = await supabase
        .from('be_portal_pickup_requests')
        .select('*')
        .eq('assigned_rider_email', email)
        .order('created_at', { ascending: false });
        
      setJobs(data || []);
    } catch (e) {
      console.error("Rider app load error", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadJobs(); }, []);

  const updateStatus = async (pickupId: string, status: string) => {
    try {
      await supabase.from('be_portal_pickup_requests').update({ status, pickup_status: status }).eq('pickup_id', pickupId);
      await supabase.from('be_portal_cargo_events').insert({ pickup_id: pickupId, event_type: status, actor_role: 'rider' });
      await loadJobs();
    } catch (e) { alert("Status update failed"); }
  };

  const navTabs = [
    { id: "jobs", icon: Package2, label: "My Jobs" },
    { id: "active", icon: Truck, label: "Active" },
    { id: "cod", icon: Wallet, label: "COD" },
    { id: "profile", icon: User, label: "Profile" }
  ];

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.text, fontFamily: FF.body, paddingBottom: 80 }}>
      {/* Mobile App Header */}
      <header style={{ background: C.panel2, borderBottom: `1px solid ${C.border}`, padding: '20px 16px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: C.gold, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Field App</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Britium Rider</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setLang(lang === 'en' ? 'mm' : 'en')} style={{ background: C.panelHover, border: `1px solid ${C.border}`, color: C.text, padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>{lang === 'en' ? 'MM' : 'EN'}</button>
            <button onClick={loadJobs} style={{ background: C.gold, border: 'none', color: '#000', padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 800 }}><RefreshCw size={14}/></button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div style={{ padding: 16 }}>
        {tab === "jobs" && (
          <div style={{ display: 'grid', gap: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 8px', color: C.text2 }}>Assigned Jobs ({jobs.length})</h2>
            {loading ? <div style={{ textAlign: 'center', padding: 40, color: C.muted }}><Loader2 className="animate-spin inline" size={24}/></div> : 
             jobs.length === 0 ? <div style={{ textAlign: 'center', padding: 40, background: C.panel, borderRadius: 16, color: C.muted }}>No jobs assigned currently.</div> :
             jobs.map(job => (
              <div key={job.pickup_id} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 900, color: C.gold, fontSize: 15 }}>{job.pickup_id}</div>
                    <div style={{ fontSize: 12, color: C.text2, marginTop: 4 }}>{job.merchant_name}</div>
                  </div>
                  <span style={{ background: C.panel2, border: `1px solid ${C.border}`, padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800, color: C.info }}>{job.status}</span>
                </div>
                <div style={{ marginTop: 12, fontSize: 13, color: C.muted, display: 'flex', alignItems: 'center', gap: 6 }}><MapPinned size={14} color={C.gold}/> {job.pickup_address || job.township}</div>
                
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button onClick={() => updateStatus(job.pickup_id, 'PICKED_UP')} style={{ flex: 1, background: C.success, color: '#000', border: 'none', padding: '10px', borderRadius: 10, fontWeight: 800, fontSize: 12 }}><CheckCircle2 size={14} className="inline mr-1"/> Picked Up</button>
                  <button onClick={() => updateStatus(job.pickup_id, 'FAILED')} style={{ background: C.error, color: '#fff', border: 'none', padding: '10px', borderRadius: 10, fontWeight: 800, fontSize: 12 }}><AlertTriangle size={14}/></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "cod" && (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, textAlign: 'center' }}>
            <Wallet size={40} color={C.gold} style={{ margin: '0 auto 12px' }} />
            <h2 style={{ fontSize: 18, fontWeight: 800 }}>COD Handover</h2>
            <p style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>Total COD to handover to finance office.</p>
            <div style={{ fontSize: 32, fontWeight: 900, color: C.gold, marginTop: 20 }}>0 MMK</div>
            <button style={{ width: '100%', marginTop: 24, background: C.panel2, border: `1px solid ${C.border}`, color: C.text, padding: 12, borderRadius: 10, fontWeight: 800 }}>View History</button>
          </div>
        )}

        {tab === "profile" && (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, background: C.panel2, border: `2px solid ${C.gold}`, borderRadius: 32, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 900 }}>👤</div>
            <h2 style={{ fontSize: 18, fontWeight: 800 }}>{currentUser?.email || "Rider"}</h2>
            <p style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Active Field Worker</p>
            <button style={{ width: '100%', marginTop: 24, background: C.error, border: 'none', color: '#fff', padding: 12, borderRadius: 10, fontWeight: 800 }}>Sign Out</button>
          </div>
        )}
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: C.panel2, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-around', padding: '12px 8px 24px', zIndex: 50 }}>
        {navTabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ background: 'transparent', border: 'none', color: tab === t.id ? C.gold : C.muted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <t.icon size={20} />
            <span style={{ fontSize: 10, fontWeight: 800 }}>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}