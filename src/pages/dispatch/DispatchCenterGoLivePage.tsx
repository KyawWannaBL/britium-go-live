import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AlertCircle, CheckCircle2, Loader2, Map, Package, Route, Truck, RefreshCw } from 'lucide-react';
import { useEnterpriseMasterData } from '@/hooks/useEnterpriseMasterData';
import { useLanguage } from '@/contexts/LanguageContext';

const C = { bg: '#061524', panel: '#0b2236', panel2: '#081b2e', panelHover: '#0f2a42', border: '#1a3a5c', gold: '#f6b84b', orange: '#ff8a4c', text: '#eef8ff', text2: '#c8dff0', muted: '#4d7a9b', success: '#22c55e', error: '#ff4f86' };

const TRANSLATIONS = {
  en: {
    opCenter: 'Operations Center',
    title: 'Route Dispatch',
    activeRoutes: 'Active Routes',
    totalStops: 'Total Stops',
    availableFleet: 'Available Fleet',
    queueTitle: 'Routing Queue',
    thCheck: 'Select',
    thId: 'ID & Stage',
    thClient: 'Client',
    thZone: 'Zone',
    emptyQueue: 'No eligible parcels available for routing.',
    assignment: 'Assignment',
    selectWorkforce: 'Select Workforce',
    phSelectWorker: '— Select Rider / Driver —',
    selectedStops: 'Selected Stops:',
    btnConfirm: 'Confirm Route',
    btnGenerating: 'Generating...',
    msgSelectErr: 'Select a worker and at least one parcel.',
    msgSuccess: (count: number) => `Successfully dispatched ${count} stops.`,
    msgLoadErr: 'Failed to load dispatch queue.',
    refresh: 'Refresh'
  },
  mm: {
    opCenter: 'လုပ်ငန်းလည်ပတ်မှု ဗဟို',
    title: 'လမ်းကြောင်း စေလွှတ်ခြင်း',
    activeRoutes: 'လက်ရှိ လမ်းကြောင်းများ',
    totalStops: 'စုစုပေါင်း မှတ်တိုင်',
    availableFleet: 'ရရှိနိုင်သော ယာဉ်များ',
    queueTitle: 'လမ်းကြောင်းဆွဲရန် စာရင်း',
    thCheck: 'ရွေးချယ်ရန်',
    thId: 'ID နှင့် အဆင့်',
    thClient: 'ဖောက်သည်',
    thZone: 'ဇုန်',
    emptyQueue: 'လမ်းကြောင်းဆွဲရန် ပါဆယ်ထုပ်များ မရှိပါ။',
    assignment: 'တာဝန်ချထားခြင်း',
    selectWorkforce: 'ဝန်ထမ်း ရွေးချယ်ပါ',
    phSelectWorker: '— ပို့ဆောင်သူ / ယာဉ်မောင်း ရွေးပါ —',
    selectedStops: 'ရွေးချယ်ထားသော မှတ်တိုင်များ:',
    btnConfirm: 'လမ်းကြောင်း အတည်ပြုမည်',
    btnGenerating: 'ဆောင်ရွက်နေပါသည်...',
    msgSelectErr: 'ဝန်ထမ်းနှင့် ပါဆယ်ထုပ် အနည်းဆုံးတစ်ခု ရွေးချယ်ပါ။',
    msgSuccess: (count: number) => `မှတ်တိုင် ${count} ခုအား အောင်မြင်စွာ တာဝန်ချထားပြီးပါပြီ။`,
    msgLoadErr: 'စာရင်းဆွဲယူခြင်း မအောင်မြင်ပါ။',
    refresh: 'ပြန်လည်ဆန်းသစ်ရန်'
  }
};

export default function DispatchCenterGoLivePage() {
  const { lang, setLang } = useLanguage();
  const t = TRANSLATIONS[(lang || 'en').toLowerCase() as 'en' | 'mm'] || TRANSLATIONS.en;
  
  const { snapshot, loading: loadingMaster } = useEnterpriseMasterData();
  
  const [pendingQueue, setPendingQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [selectedWorker, setSelectedWorker] = useState('');
  const [selectedPickups, setSelectedPickups] = useState<string[]>([]);
  const [metrics, setMetrics] = useState({ activeRoutes: 0, totalStops: 0, completedRoutes: 0 });

  const activeWorkforce = useMemo(() => {
    const riders = snapshot.rider || [];
    const drivers = snapshot.driver || [];
    return [...riders, ...drivers].filter((w: any) => 
      String(w.status || w.is_active || 'active').toLowerCase().includes('active')
    );
  }, [snapshot]);

  const fetchQueue = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const { data, error } = await supabase
        .from('be_portal_pickup_requests')
        .select('*')
        .in('status', ['PICKUP_REQUESTED', 'READY_FOR_DISPATCH', 'SORTING', 'RECEIVED_AT_ORIGIN'])
        .order('created_at', { ascending: true });
        
      if (error) throw error;
      setPendingQueue(data || []);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || t.msgLoadErr });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchQueue(); }, []);

  const toggleSelection = (id: string) => {
    setSelectedPickups(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    if (selectedPickups.length === pendingQueue.length) setSelectedPickups([]);
    else setSelectedPickups(pendingQueue.map(p => p.pickup_id));
  };

  const generateRoute = async () => {
    if (!selectedWorker || selectedPickups.length === 0) {
      setMessage({ type: 'error', text: t.msgSelectErr });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const workerDetails = activeWorkforce.find((w: any) => w.record_code === selectedWorker || w.rider_id === selectedWorker);
      const workerName = workerDetails?.display_name || workerDetails?.rider_name || selectedWorker;

      for (const pickupId of selectedPickups) {
        const job = pendingQueue.find(p => p.pickup_id === pickupId);
        const isOutbound = ['READY_FOR_DISPATCH', 'SORTING', 'RECEIVED_AT_ORIGIN'].includes(job.status);
        const targetStatus = isOutbound ? 'OUT_FOR_DELIVERY' : 'PICKUP_ASSIGNED';
        const processType = isOutbound ? 'DELIVERY' : 'PICKUP';

        const { error: updateError } = await supabase.from('be_portal_pickup_requests')
          .update({ assigned_rider_id: selectedWorker, assigned_rider_name: workerName })
          .eq('pickup_id', pickupId);

        if (updateError) throw updateError;

        const { error: rpcError } = await supabase.rpc('be_logistics_apply_workflow_event_strict', {
          p_pickup_id: pickupId,
          p_process_type: processType,
          p_new_status: targetStatus,
          p_actor_role: 'dispatch',
          p_actor_id: 'dispatch_system',
          p_notes: `Dispatched to ${workerName}.`
        });

        if (rpcError) throw rpcError;
      }

      setMessage({ type: 'success', text: t.msgSuccess(selectedPickups.length) });
      setMetrics(prev => ({ ...prev, activeRoutes: prev.activeRoutes + 1, totalStops: prev.totalStops + selectedPickups.length }));
      setSelectedPickups([]);
      setSelectedWorker('');
      await fetchQueue(); 
    } catch (error: any) {
      setMessage({ type: 'error', text: `System Error: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, padding: 24, fontFamily: "'Poppins', sans-serif" }}>
      <div style={{ maxWidth: 1600, margin: '0 auto', display: 'grid', gap: 20 }}>
        
        {/* Header */}
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.info, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{t.opCenter}</div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Map size={24} color={C.info}/> {t.title}
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', background: C.panel2, borderRadius: 8, padding: 4, border: `1px solid ${C.border}` }}>
              <button onClick={() => setLang('en')} style={{ padding: '6px 12px', borderRadius: 6, background: lang === 'en' ? C.panelHover : 'transparent', color: lang === 'en' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Poppins', sans-serif" }}>EN</button>
              <button onClick={() => setLang('mm')} style={{ padding: '6px 12px', borderRadius: 6, background: lang === 'mm' ? C.panelHover : 'transparent', color: lang === 'mm' ? C.text : C.muted, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: "'Poppins', sans-serif" }}>မြန်မာ</button>
            </div>
            <button onClick={fetchQueue} disabled={loading} style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text, padding: '10px 16px', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, fontFamily: "'Poppins', sans-serif" }}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {t.refresh}
            </button>
          </div>
        </div>

        {message && (
          <div style={{ padding: 16, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, background: message.type === 'error' ? 'rgba(255,79,134,0.1)' : 'rgba(34,197,94,0.1)', color: message.type === 'error' ? C.error : C.success, border: `1px solid ${message.type === 'error' ? C.error : C.success}40` }}>
            {message.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />} {message.text}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {[
            { label: t.activeRoutes, val: metrics.activeRoutes, color: C.info },
            { label: t.totalStops, val: metrics.totalStops, color: C.gold },
            { label: t.availableFleet, val: activeWorkforce.length, color: C.success }
          ].map((m, i) => (
            <div key={i} style={{ background: C.panel, border: `1px solid ${C.border}`, borderTop: `3px solid ${m.color}`, padding: 20, borderRadius: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: m.color, marginTop: 8 }}>{m.val}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 20, alignItems: 'start' }}>
          
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden' }}>
            <div style={{ padding: 20, borderBottom: `1px solid ${C.border}`, background: C.panel2, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Package size={18} color={C.gold}/>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text }}>{t.queueTitle}</h2>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: C.bg }}>
                    <th style={{ padding: 16, borderBottom: `1px solid ${C.border}` }}>
                      <input type="checkbox" checked={selectedPickups.length === pendingQueue.length && pendingQueue.length > 0} onChange={toggleAll} style={{ width: 16, height: 16, cursor: 'pointer' }}/>
                    </th>
                    <th style={{ padding: 16, color: C.muted, fontWeight: 700, borderBottom: `1px solid ${C.border}` }}>{t.thId}</th>
                    <th style={{ padding: 16, color: C.muted, fontWeight: 700, borderBottom: `1px solid ${C.border}` }}>{t.thClient}</th>
                    <th style={{ padding: 16, color: C.muted, fontWeight: 700, borderBottom: `1px solid ${C.border}` }}>{t.thZone}</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingQueue.length === 0 ? (
                    <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: C.muted }}>{t.emptyQueue}</td></tr>
                  ) : pendingQueue.map(p => (
                    <tr key={p.pickup_id} style={{ borderBottom: `1px solid ${C.border}66`, background: selectedPickups.includes(p.pickup_id) ? 'rgba(246,184,75,0.05)' : 'transparent' }}>
                      <td style={{ padding: 16 }}>
                        <input type="checkbox" checked={selectedPickups.includes(p.pickup_id)} onChange={() => toggleSelection(p.pickup_id)} style={{ width: 16, height: 16, cursor: 'pointer' }}/>
                      </td>
                      <td style={{ padding: 16 }}>
                        <div style={{ fontWeight: 700, color: C.gold }}>{p.pickup_id}</div>
                        <div style={{ fontSize: 12, color: C.info, marginTop: 4 }}>{String(p.status).replace(/_/g, ' ')}</div>
                      </td>
                      <td style={{ padding: 16, color: C.text }}>{p.merchant_name || 'Unknown'}</td>
                      <td style={{ padding: 16, color: C.text2 }}>{p.township || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 24, position: 'sticky', top: 24 }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Route size={18} color={C.info}/> {t.assignment}
            </h2>
            
            <div style={{ display: 'grid', gap: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>{t.selectWorkforce}</label>
                <select 
                  value={selectedWorker} 
                  onChange={(e) => setSelectedWorker(e.target.value)}
                  style={{ width: '100%', height: 46, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, padding: '0 14px', fontSize: 14, fontFamily: "'Poppins', sans-serif", outline: 'none' }}
                >
                  <option value="">{loadingMaster ? 'Loading synced workforce...' : t.phSelectWorker}</option>
                  {activeWorkforce.map((w: any) => (
                    <option key={w.record_code || w.rider_id} value={w.record_code || w.rider_id}>
                      {w.display_name || w.rider_name} - {w.branch_code || 'YGN'}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ background: C.bg, padding: 16, borderRadius: 10, border: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: C.text2, marginBottom: 8 }}>
                  <span>{t.selectedStops}</span>
                  <span style={{ fontWeight: 700, color: C.text }}>{selectedPickups.length}</span>
                </div>
              </div>

              <button 
                onClick={generateRoute}
                disabled={selectedPickups.length === 0 || !selectedWorker || saving}
                style={{ width: '100%', height: 50, background: selectedPickups.length === 0 || !selectedWorker ? C.panel2 : `linear-gradient(135deg, ${C.gold}, #d49a36)`, color: selectedPickups.length === 0 || !selectedWorker ? C.muted : '#000', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: selectedPickups.length === 0 || !selectedWorker || saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontFamily: "'Poppins', sans-serif", textTransform: 'uppercase', transition: 'all 0.2s' }}
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Truck size={18} />}
                {saving ? t.btnGenerating : t.btnConfirm}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}