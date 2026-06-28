import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Truck, Search, Plus, Send, RefreshCw, UserCheck, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

const C = { bg: '#061524', panel: '#0b2236', panel2: '#081b2e', panelHover: '#0f2a42', border: '#1a3a5c', gold: '#f6b84b', text: '#eef8ff', text2: '#c8dff0', muted: '#4d7a9b', success: '#22c55e', error: '#ff4f86', warning: '#f59e0b', info: '#38bdf8' };
const FF = { body: "'Poppins', sans-serif" };

const TRANSLATIONS = {
  en: {
    title: "Route Builder & Assignment", subtitle: "Select pending waybills and assign them to a rider to dispatch a route.",
    qTitle: "Pending Queue", rTitle: "Current Route", btnRefresh: "Sync Queue", btnDispatch: "Dispatch Route",
    lblRider: "Assign Rider", lblVehicle: "Assign Vehicle", searchPh: "Scan or search ID...",
    emptyQ: "No pending parcels.", emptyR: "No parcels added to route.", success: "Route dispatched successfully!"
  },
  mm: {
    title: "လမ်းကြောင်းဖန်တီးခြင်း နှင့် တာဝန်ချထားခြင်း", subtitle: "ပို့ဆောင်ရန်ကျန်ရှိသော ပါဆယ်များကို ရွေးချယ်ပြီး ရိုင်ဒါထံသို့ တာဝန်ချထားပါ။",
    qTitle: "စောင့်ဆိုင်းနေသော စာရင်း", rTitle: "လက်ရှိ လမ်းကြောင်း", btnRefresh: "စာရင်း ဆန်းသစ်ရန်", btnDispatch: "လမ်းကြောင်း စတင်မည်",
    lblRider: "ရိုင်ဒါ ရွေးပါ", lblVehicle: "ယာဉ် ရွေးပါ", searchPh: "ရှာဖွေရန်...",
    emptyQ: "ပို့ဆောင်ရန် ပါဆယ်မရှိပါ။", emptyR: "လမ်းကြောင်းထဲတွင် ပါဆယ်မရှိပါ။", success: "လမ်းကြောင်း စတင်ပါပြီ!"
  }
};

export default function DispatchPage() {
  const { lang } = useLanguage();
  const t = TRANSLATIONS[lang as 'en' | 'mm'] || TRANSLATIONS.en;

  const [queue, setQueue] = useState<any[]>([]);
  const [routeItems, setRouteItems] = useState<any[]>([]);
  const [riders, setRiders] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  
  const [selectedRider, setSelectedRider] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);

  const load = async () => {
    setLoading(true); setMessage(null);
    try {
      const [q, r, v] = await Promise.all([
        supabase.from('be_portal_pickup_requests').select('*').in('status', ['PICKUP_COMPLETED', 'HUB_PROCESSING']).limit(100),
        supabase.from('be_mobile_workforce_accounts').select('*').eq('is_active', true).eq('role', 'RIDER'),
        supabase.from('be_fleet_master').select('*').eq('status', 'Available')
      ]);
      setQueue(q.data || []); setRiders(r.data || []); setVehicles(v.data || []);
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const addToRoute = (item: any) => {
    setRouteItems(prev => [...prev, item]);
    setQueue(prev => prev.filter(q => q.pickup_id !== item.pickup_id));
  };

  const removeFromRoute = (item: any) => {
    setQueue(prev => [item, ...prev]);
    setRouteItems(prev => prev.filter(r => r.pickup_id !== item.pickup_id));
  };

  const handleDispatch = async () => {
    if (!selectedRider || routeItems.length === 0) return setMessage({ type: 'error', text: "Select a rider and at least 1 parcel." });
    setSaving(true); setMessage(null);
    try {
      const ids = routeItems.map(r => r.pickup_id);
      const riderName = riders.find(r => r.workforce_code === selectedRider)?.display_name || selectedRider;
      
      const { error } = await supabase.from('be_portal_pickup_requests')
        .update({ status: 'OUT_FOR_DELIVERY', pickup_status: 'Out for Delivery', assigned_rider_id: selectedRider, assigned_rider_name: riderName, vehicle_type: selectedVehicle })
        .in('pickup_id', ids);
      if (error) throw error;

      setMessage({ type: 'success', text: t.success });
      setRouteItems([]); setSelectedRider(''); setSelectedVehicle('');
      await load();
    } catch (e: any) { setMessage({ type: 'error', text: e.message }); } finally { setSaving(false); }
  };

  const filteredQueue = queue.filter(q => !search || q.pickup_id.toLowerCase().includes(search.toLowerCase()) || (q.merchant_name || '').toLowerCase().includes(search.toLowerCase()));

  const inpSty = { width: '100%', height: 42, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0 14px', color: C.text, fontSize: 13, outline: 'none', fontFamily: FF.body };

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 24, color: C.text, fontFamily: FF.body }}>
      <div style={{ maxWidth: 1600, margin: '0 auto', display: 'grid', gap: 24 }}>
        
        <header style={{ background: C.panel, border: `1px solid ${C.border}`, padding: 24, borderRadius: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: C.gold, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', display: 'flex', alignItems: 'center', gap: 8 }}><Truck size={16} /> <span>Dispatch Operations</span></div>
            <h1 style={{ margin: '8px 0 0', fontSize: 26, fontWeight: 900 }}>{t.title}</h1>
            <p style={{ color: C.muted, margin: '6px 0 0', fontSize: 14 }}>{t.subtitle}</p>
          </div>
          <button onClick={load} disabled={loading} style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text, height: 42, padding: '0 16px', borderRadius: 10, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: FF.body }}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {t.btnRefresh}
          </button>
        </header>

        {message && <div style={{ padding: 18, background: message.type === 'error' ? 'rgba(255,79,134,0.1)' : 'rgba(34,197,94,0.1)', border: `1px solid ${message.type === 'error' ? C.error : C.success}40`, color: message.type === 'error' ? C.error : C.success, borderRadius: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>{message.type === 'error' ? <AlertTriangle size={20}/> : <CheckCircle2 size={20}/>} {message.text}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 24, alignItems: 'start' }}>
          
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, overflow: 'hidden' }}>
            <div style={{ padding: 20, borderBottom: `1px solid ${C.border}`, background: C.panel2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>{t.qTitle} ({filteredQueue.length})</h2>
              <div style={{ position: 'relative' }}><Search size={16} color={C.muted} style={{ position: 'absolute', left: 12, top: 12 }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={t.searchPh} style={{ ...inpSty, paddingLeft: 40, width: 260 }} /></div>
            </div>
            <div style={{ padding: 20, display: 'grid', gap: 12, maxHeight: 600, overflowY: 'auto' }}>
              {filteredQueue.map(item => (
                <div key={item.pickup_id} style={{ background: C.panel2, border: `1px solid ${C.border}`, padding: 16, borderRadius: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 900, color: C.text, fontSize: 15 }}>{item.pickup_id}</div>
                    <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{item.merchant_name} · {item.township}</div>
                  </div>
                  <button onClick={() => addToRoute(item)} style={{ background: 'rgba(56,189,248,0.1)', color: C.info, border: `1px solid ${C.info}40`, padding: '8px 16px', borderRadius: 10, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: FF.body }}><Plus size={16}/> Add</button>
                </div>
              ))}
              {filteredQueue.length === 0 && !loading && <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>{t.emptyQ}</div>}
            </div>
          </div>

          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, padding: 24, position: 'sticky', top: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 900, margin: '0 0 20px' }}>{t.rTitle} ({routeItems.length})</h2>
            
            <div style={{ display: 'grid', gap: 16, marginBottom: 20 }}>
              <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>{t.lblRider}</div><select value={selectedRider} onChange={e => setSelectedRider(e.target.value)} style={inpSty}><option value="">Select Rider</option>{riders.map(r => <option key={r.workforce_code} value={r.workforce_code}>{r.display_name} ({r.workforce_code})</option>)}</select></div>
              <div><div style={{ fontSize: 11, color: C.muted, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>{t.lblVehicle}</div><select value={selectedVehicle} onChange={e => setSelectedVehicle(e.target.value)} style={inpSty}><option value="">Select Vehicle</option>{vehicles.map(v => <option key={v.vehicle_code} value={v.vehicle_code}>{v.registration_no} ({v.vehicle_type})</option>)}</select></div>
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20, marginBottom: 20, display: 'grid', gap: 10, maxHeight: 300, overflowY: 'auto' }}>
              {routeItems.map(item => (
                <div key={item.pickup_id} style={{ background: C.bg, border: `1px solid ${C.gold}40`, padding: 12, borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 800, color: C.gold, fontSize: 13 }}>{item.pickup_id}</div>
                  <button onClick={() => removeFromRoute(item)} style={{ background: 'transparent', border: 'none', color: C.error, cursor: 'pointer' }}><X size={16}/></button>
                </div>
              ))}
              {routeItems.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: C.muted, fontSize: 13 }}>{t.emptyR}</div>}
            </div>

            <button onClick={handleDispatch} disabled={saving || routeItems.length === 0 || !selectedRider} style={{ width: '100%', height: 48, background: C.success, color: '#000', border: 'none', borderRadius: 12, fontWeight: 900, cursor: routeItems.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: FF.body, opacity: routeItems.length === 0 || !selectedRider ? 0.5 : 1 }}>
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} {t.btnDispatch}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}