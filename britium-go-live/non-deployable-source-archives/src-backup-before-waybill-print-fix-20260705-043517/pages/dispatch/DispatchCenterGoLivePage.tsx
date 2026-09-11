// pages/dispatch/DispatchCenterGoLivePage.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { AlertCircle, CheckCircle2, Loader2, Map, Package, Route, Truck, Users } from 'lucide-react';

const C = { bg: "#061524", panel: "#0b2236", border: "#1a3a5c", text: "#eef8ff", text2: "#c8dff0", gold: "#f6b84b", blue: "#38bdf8", success: "#22c55e", error: "#ff4f86" };

// Bulletproof normalizer to prevent RLS or schema casing crashes
function normalizeWorker(row: any) {
  let rawType = String(row.workforce_type || row.role || row.role_type || row.type || '').toLowerCase();
  if (!rawType) {
    if (row.rider_id) rawType = 'rider';
    else if (row.driver_id) rawType = 'driver';
  }
  return {
    worker_code: String(row.workforce_code || row.worker_id || row.rider_id || row.user_id || row.id || ''),
    worker_type: rawType,
    display_name: String(row.display_name || row.full_name || row.rider_name || row.name || 'Unknown Staff'),
    branch_code: String(row.branch_code || 'YGN'),
    status: String(row.status || row.record_status || (row.is_active ? 'Active' : 'Inactive') || 'Active'),
    raw: row,
  };
}

export default function DispatchCenterGoLivePage() {
  const [roster, setRoster] = useState<any[]>([]);
  const [pendingQueue, setPendingQueue] = useState<any[]>([]);
  const [metrics, setMetrics] = useState({ activeRoutes: 0, totalStops: 0, completedRoutes: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  // Assignment State
  const [selectedRider, setSelectedRider] = useState('');
  const [selectedPickups, setSelectedPickups] = useState<string[]>([]);

  useEffect(() => {
    fetchDispatchData();
  }, []);

  const fetchDispatchData = async () => {
    setLoading(true);
    setMessage(null);
    
    try {
      // 1. Fetch Real Workforce (Bulletproof)
      const { data: workforceData, error: wError } = await supabase.from('be_mobile_workforce_accounts').select('*');
      if (!wError && workforceData) {
        const activeWorkers = workforceData
          .map(normalizeWorker)
          .filter(w => !['inactive', 'suspended', 'blacklisted'].includes(w.status.toLowerCase()));
        setRoster(activeWorkers);
      }
      
      // 2. Fetch Eligible Parcels (Both Inbound Pickups and Outbound Deliveries)
      const { data: pickupData, error: pError } = await supabase
        .from('be_portal_pickup_requests')
        .select('*')
        .in('status', ['PICKUP_REQUESTED', 'READY_FOR_DISPATCH', 'SORTING', 'RECEIVED_AT_ORIGIN'])
        .order('created_at', { ascending: true });
        
      if (pError) throw pError;
      setPendingQueue(pickupData || []);
      
      // Go-Live Spec: Counters are 0 until real routes exist. 
      setMetrics(prev => ({ ...prev })); 
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load dispatch data.' });
    } finally {
      setLoading(false);
    }
  };

  const togglePickupSelection = (pickupId: string) => {
    setSelectedPickups(prev => 
      prev.includes(pickupId) ? prev.filter(id => id !== pickupId) : [...prev, pickupId]
    );
  };

  const toggleAll = () => {
    if (selectedPickups.length === pendingQueue.length) {
      setSelectedPickups([]);
    } else {
      setSelectedPickups(pendingQueue.map(p => p.pickup_id));
    }
  };

  const generateAndAssignRoute = async () => {
    if (!selectedRider || selectedPickups.length === 0) {
      setMessage({ type: 'error', text: 'Validation Error: Select a rider and at least one parcel.' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      // Get rider details for the log
      const riderDetails = roster.find(r => r.worker_code === selectedRider);
      
      for (const pickupId of selectedPickups) {
        const job = pendingQueue.find(p => p.pickup_id === pickupId);
        const isOutbound = ['READY_FOR_DISPATCH', 'SORTING', 'RECEIVED_AT_ORIGIN'].includes(job.status);
        
        const targetStatus = isOutbound ? 'OUT_FOR_DELIVERY' : 'PICKUP_ASSIGNED';
        const processType = isOutbound ? 'DELIVERY' : 'PICKUP';

        // 1. Update master table with the assigned rider
        const { error: updateError } = await supabase.from('be_portal_pickup_requests')
          .update({ 
            assigned_rider_id: selectedRider,
            assigned_rider_name: riderDetails?.display_name || selectedRider 
          })
          .eq('pickup_id', pickupId);

        if (updateError) throw updateError;

        // 2. Trigger STRICT RPC Workflow Engine for secure logging and status transition
        const { error: rpcError } = await supabase.rpc('be_logistics_apply_workflow_event_strict', {
          p_pickup_id: pickupId,
          p_process_type: processType,
          p_new_status: targetStatus,
          p_actor_role: 'dispatch',
          p_actor_id: 'dispatch_command',
          p_notes: `Dispatched to ${riderDetails?.display_name || selectedRider} via Dispatch Center.`
        });

        if (rpcError) throw rpcError;
      }

      setMessage({ type: 'success', text: `Route Generated: Successfully dispatched ${selectedPickups.length} stops.` });
      
      // Update Spec Counters
      setMetrics(prev => ({
        ...prev,
        activeRoutes: prev.activeRoutes + 1,
        totalStops: prev.totalStops + selectedPickups.length
      }));
      
      setSelectedPickups([]);
      setSelectedRider('');
      await fetchDispatchData(); 
    } catch (error: any) {
      setMessage({ type: 'error', text: `System Error: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const activeRiders = useMemo(() => roster.filter(w => ['rider', 'driver'].includes(w.worker_type)), [roster]);

  if (loading && pendingQueue.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg, color: C.text }}>
        <div className="flex items-center gap-3 font-bold text-lg"><Loader2 className="animate-spin" /> Loading Dispatch Command...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 md:p-8 font-['Poppins']" style={{ background: C.bg, color: C.text }}>
      <div className="max-w-[1600px] mx-auto space-y-6">
        
        {/* Header */}
        <div style={{ background: C.panel, border: `1px solid ${C.border}` }} className="p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.2em] mb-2" style={{ color: C.blue }}>Ops Workflow Center</div>
            <h1 className="text-2xl font-black m-0 flex items-center gap-3">
              <Map className="w-7 h-7" style={{ color: C.blue }}/> Dispatch Command
            </h1>
          </div>
          <button 
            onClick={fetchDispatchData} 
            disabled={loading || saving} 
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{ background: '#061524', border: `1px solid ${C.border}`, color: C.text }}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh Board
          </button>
        </div>

        {/* Alerts */}
        {message && (
          <div className="p-4 rounded-xl flex items-center gap-3 font-bold text-sm shadow-md animate-in fade-in" style={{ 
            background: message.type === 'error' ? '#4a0521' : '#052e16', 
            color: message.type === 'error' ? C.error : C.success,
            border: `1px solid ${message.type === 'error' ? C.error : C.success}40`
          }}>
            {message.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />} {message.text}
          </div>
        )}

        {/* Go-Live Metrics Panel */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Active Routes", val: metrics.activeRoutes, color: C.blue },
            { label: "Total Stops", val: metrics.totalStops, color: C.gold },
            { label: "Completed Routes", val: metrics.completedRoutes, color: C.success },
            { label: "Available Fleet", val: activeRiders.length, color: C.orange }
          ].map((m, i) => (
            <div key={i} style={{ background: C.panel, border: `1px solid ${C.border}`, borderTopColor: m.color, borderTopWidth: '3px' }} className="p-5 rounded-2xl shadow-lg">
              <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: C.muted }}>{m.label}</div>
              <div className="text-3xl font-black">{m.val}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 items-start">
          
          {/* Left: Pending Queue */}
          <div className="space-y-4">
            <h2 className="font-bold text-lg flex items-center gap-2 m-0"><Package className="w-5 h-5" style={{ color: C.gold }}/> Routing Queue</h2>
            
            <div style={{ background: C.panel, border: `1px solid ${C.border}` }} className="rounded-2xl shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead style={{ background: '#061524' }}>
                    <tr>
                      <th className="p-4 border-b border-[#1a3a5c]">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded border-[#1a3a5c] bg-transparent cursor-pointer accent-[#f6b84b]"
                          checked={selectedPickups.length === pendingQueue.length && pendingQueue.length > 0}
                          onChange={toggleAll}
                        />
                      </th>
                      <th className="p-4 border-b border-[#1a3a5c] font-bold text-[#4d7a9b] uppercase tracking-wider text-[11px]">ID & Stage</th>
                      <th className="p-4 border-b border-[#1a3a5c] font-bold text-[#4d7a9b] uppercase tracking-wider text-[11px]">Merchant / Customer</th>
                      <th className="p-4 border-b border-[#1a3a5c] font-bold text-[#4d7a9b] uppercase tracking-wider text-[11px]">Zone & Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingQueue.length === 0 ? (
                      <tr><td colSpan={4} className="p-12 text-center text-[#4d7a9b] font-medium">No eligible parcels available for routing.</td></tr>
                    ) : pendingQueue.map(p => {
                      const isSelected = selectedPickups.includes(p.pickup_id);
                      return (
                        <tr key={p.pickup_id} className="transition-colors border-b border-[#1a3a5c]/50" style={{ background: isSelected ? 'rgba(246,184,75,0.05)' : 'transparent' }}>
                          <td className="p-4">
                            <input 
                              type="checkbox" 
                              className="w-4 h-4 cursor-pointer accent-[#f6b84b]"
                              checked={isSelected}
                              onChange={() => togglePickupSelection(p.pickup_id)}
                            />
                          </td>
                          <td className="p-4">
                            <div className="font-bold text-[14px]" style={{ color: C.gold }}>{p.pickup_id}</div>
                            <div className="text-[10px] font-bold uppercase tracking-wider mt-1 inline-block px-2 py-0.5 rounded bg-[#102b45] text-[#38bdf8] border border-[#1a3a5c]">
                              {String(p.status).replace(/_/g, ' ')}
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="font-bold text-[#eef8ff] text-[13px]">{p.merchant_name || p.merchant_code || 'Unknown'}</div>
                            <div className="text-[12px] text-[#4d7a9b] mt-0.5">{p.expected_parcels || 1} Parcels • {p.payment_terms || 'COD'}</div>
                          </td>
                          <td className="p-4">
                            <div className="font-bold text-[#c8dff0] text-[13px]">{p.township || 'Unknown'}, {p.city}</div>
                            <div className="text-[12px] text-[#4d7a9b] truncate max-w-[200px] mt-0.5" title={p.pickup_address}>{p.pickup_address}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right: Route Generator */}
          <div className="space-y-4 sticky top-6">
            <h2 className="font-bold text-lg flex items-center gap-2 m-0"><Route className="w-5 h-5" style={{ color: C.blue }}/> Assignment Control</h2>
            
            <div style={{ background: C.panel, border: `1px solid ${C.border}` }} className="rounded-2xl p-6 shadow-xl space-y-6">
              
              {/* Workforce Selector */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#4d7a9b] block mb-2">Assign to Rider / Driver</label>
                <select 
                  value={selectedRider} 
                  onChange={(e) => setSelectedRider(e.target.value)}
                  className="w-full h-12 bg-[#061524] border border-[#1a3a5c] text-white text-sm rounded-xl px-4 outline-none focus:border-[#f6b84b] appearance-none"
                >
                  <option value="">Select Workforce...</option>
                  {activeRiders.map(r => (
                    <option key={r.worker_code} value={r.worker_code}>
                      {r.display_name} ({r.worker_type.toUpperCase()}) - {r.branch_code}
                    </option>
                  ))}
                </select>
              </div>

              {/* Summary Box */}
              <div className="bg-[#061524] p-4 rounded-xl border border-[#1a3a5c]">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-semibold text-[#4d7a9b]">Selected Stops:</span>
                  <span className="font-black text-lg text-[#eef8ff]">{selectedPickups.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-[#4d7a9b]">Est. Capacity:</span>
                  <span className="font-bold text-sm text-[#f6b84b]">
                    {selectedPickups.reduce((acc, curr) => {
                      const job = pendingQueue.find(p => p.pickup_id === curr);
                      return acc + (Number(job?.expected_parcels) || 1);
                    }, 0)} Parcels
                  </span>
                </div>
              </div>

              {/* Action Button */}
              <button 
                className="w-full h-14 rounded-xl font-black uppercase tracking-wider text-[13px] flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ 
                  background: selectedPickups.length === 0 || !selectedRider ? '#102b45' : 'linear-gradient(135deg, #f6b84b, #d49a36)', 
                  color: selectedPickups.length === 0 || !selectedRider ? '#4d7a9b' : '#061524',
                  border: 'none',
                  boxShadow: selectedPickups.length > 0 && selectedRider ? '0 10px 25px rgba(246,184,75,0.2)' : 'none'
                }}
                onClick={generateAndAssignRoute}
                disabled={selectedPickups.length === 0 || !selectedRider || saving}
              >
                {saving ? <Loader2 className="animate-spin w-5 h-5" /> : <Truck className="w-5 h-5" />}
                {saving ? 'Dispatching...' : 'Confirm Dispatch Route'}
              </button>

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}