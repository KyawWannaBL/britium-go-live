import React, { useState, useEffect } from 'react';
import { RefreshCw, Map as MapIcon, ChevronDown, BellRing, PackageCheck, AlertTriangle, Coins, MapPin, Truck, Send, CheckCircle2, Loader2, Clock, Check } from 'lucide-react';

// --- MOCK SUPABASE TO FIX IMPORT ERRORS IN PREVIEW ---
const supabase = {
  from: (table: string) => ({
    select: (cols: string) => ({
      eq: (col: string, val: any) => ({
        order: () => Promise.resolve({ data: [] })
      }),
      in: (col: string, val: any[]) => ({
        eq: () => Promise.resolve({ data: [] })
      })
    }),
    update: (data: any) => ({
      eq: (col: string, val: any) => Promise.resolve({ error: null })
    }),
    insert: (data: any) => Promise.resolve({ error: null })
  })
};
// -----------------------------------------------------

// --- MOCK DATA (Matches the UI flow from screenshots) ---
const MOCK_QUEUE = [
  { pickup_id: 'P0611-BRV-001', merchant_name: 'Britium Ventures', township: 'Bahan', expected_parcels: 4, status: 'SUBMITTED' },
  { pickup_id: 'P0611-MSY-002', merchant_name: 'Mega Store Yangon', township: 'Sanchaung', expected_parcels: 14, status: 'PENDING_PICKUP' },
  { pickup_id: 'P0611-FHB-003', merchant_name: 'Fashion Hub', township: 'Yankin', expected_parcels: 2, status: 'READY_FOR_WAYPLAN' }
];

const MOCK_WAYPLANS = [
  { id: 'WP-YGN-0611-001', title: 'YGN - Bahan / Yankin', date: '29/06/2026, 15:27', status: 'CONFIRMED' },
  { id: 'WP-YGN-0611-002', title: 'YGN - Sanchaung / Kamayut', date: '29/06/2026, 15:27', status: 'DRAFT' }
];

const MOCK_RIDERS = [
  { id: 'RID001', name: 'Myo Thant', role: 'Rider', location: 'Bahan', tasks: 9 },
  { id: 'RID002', name: 'Kyaw Zin Khant', role: 'Rider', location: 'Sanchaung', tasks: 3 }
];
// -----------------------------------------------------

const C = { bg: '#040d17', card: '#091a2f', border: '#1e3a5f', text: '#e2e8f0', muted: '#64748b', gold: '#fbbf24', green: '#10b981', red: '#ef4444', blue: '#3b82f6', orange: '#f97316' };
const FF = { body: "'Poppins', sans-serif" };

export default function SupervisorPortalPage() {
  const [loading, setLoading] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  
  const [pendingPickups, setPendingPickups] = useState<any[]>(MOCK_QUEUE);
  const [riders, setRiders] = useState<any[]>(MOCK_RIDERS);
  
  const [selectedPickup, setSelectedPickup] = useState('P0611-BRV-001');
  const [selectedRider, setSelectedRider] = useState('RID001');
  const [selectedWayplan, setSelectedWayplan] = useState('WP-YGN-0611-001');
  const [selectedDropRider, setSelectedDropRider] = useState('RID001');

  const handleAssignRider = async () => {
    if (!selectedPickup || !selectedRider) return;
    
    setAssignLoading(true);
    try {
      // Simulated delay for DB operation
      await new Promise(resolve => setTimeout(resolve, 800));
      alert(`Successfully assigned ${selectedPickup} to Rider! Mobile App Synced.`);
      
      // Update local state to reflect assignment
      setPendingPickups(prev => prev.map(p => p.pickup_id === selectedPickup ? { ...p, status: 'RIDER_ASSIGNED' } : p));
      setSelectedPickup('');
    } catch (err: any) {
      alert(err.message || 'Failed to assign rider');
    } finally {
      setAssignLoading(false);
    }
  };

  const StatBox = ({ title, count, subtitle, color }: { title: string, count: string|number, subtitle: string, color: string }) => (
    <div style={{ borderColor: color }} className={`bg-[#091a2f] border-t-2 rounded-xl p-4 flex flex-col justify-between shadow-xl`}>
      <h3 className="text-[10px] font-bold text-[#64748b] uppercase tracking-widest mb-2">{title}</h3>
      <div style={{ color }} className="text-3xl font-black">{count}</div>
      <p className="text-[11px] text-[#e2e8f0] mt-1 font-medium">{subtitle}</p>
    </div>
  );

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ backgroundColor: C.bg, fontFamily: FF.body }}>
      <div className="max-w-[1600px] mx-auto space-y-4 md:space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border border-[#1e3a5f] bg-[#091a2f] p-4 md:p-6 rounded-2xl shadow-2xl gap-4">
          <div>
            <div className="text-[10px] text-[#64748b] font-black uppercase tracking-[0.2em] mb-1 flex items-center gap-2">
              SUPERVISOR PORTAL
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white mb-1 tracking-tight">Operational Assignment & Wayplan Control</h1>
            <p className="text-xs md:text-sm text-[#64748b] max-w-3xl">Assign pickup riders, assign drop-off riders, monitor live ways, track failures, and follow COD settlement from one supervisor console.</p>
            <div className="text-[10px] text-[#10b981] font-bold mt-3 flex items-center gap-1.5 w-max">
              <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse"></div> Realtime connected
            </div>
          </div>
          <div className="flex gap-2 h-10 w-full md:w-auto">
            <div className="flex bg-[#040d17] border border-[#1e3a5f] rounded-lg overflow-hidden h-full">
              <button className="px-3 text-[11px] font-bold text-white bg-[#1e3a5f]">EN</button>
              <button className="px-3 text-[11px] font-bold text-[#64748b]">မြန်မာ</button>
            </div>
            <button className="bg-gradient-to-r from-[#fbbf24] to-[#f59e0b] text-[#040d17] px-4 rounded-lg text-xs font-black flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(251,191,36,0.3)] hover:opacity-90 transition-opacity flex-1 md:flex-none">
              <BellRing size={14}/> AI Ops Briefing
            </button>
            <button className="bg-[#040d17] border border-[#1e3a5f] text-white px-4 rounded-lg text-xs font-bold flex items-center justify-center gap-2 hover:bg-[#1e3a5f] transition-all">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <StatBox title="NEED PICKUP ASSIGNMENT" count="1" subtitle="SUBMITTED" color={C.gold} />
          <StatBox title="PENDING PICKUP" count="1" subtitle="Rider assigned" color={C.blue} />
          <StatBox title="DRAFT WAYPLANS" count="1" subtitle="Needs drop-off assignment" color={C.gold} />
          <StatBox title="LIVE / CONFIRMED WAYS" count="1" subtitle="Delivery in operation" color={C.green} />
          <StatBox title="WAYFAIL" count="1" subtitle="Failed route events" color={C.red} />
          <StatBox title="COD PENDING" count="775,000 MMK" subtitle="Settlement required" color={C.orange} />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* LEFT COLUMN: ASSIGNMENTS */}
          <div className="col-span-1 flex flex-col gap-6">
            
            {/* Pickup Assignment Box */}
            <div className="bg-[#091a2f] border border-[#1e3a5f] rounded-2xl p-5 shadow-xl">
              <div className="flex justify-between items-center mb-1">
                <h2 className="text-[14px] font-black text-white tracking-wide">Order Picking Assignment</h2>
                <PackageCheck size={16} className="text-[#fbbf24]"/>
              </div>
              <p className="text-[10px] text-[#64748b] mb-4">Assign riders to CS-submitted pickup requests.</p>
              
              <div className="space-y-3">
                <div>
                  <label className="text-[9px] text-[#64748b] font-bold uppercase tracking-widest mb-1 block">PICKUP REQUEST</label>
                  <div className="relative">
                    <select value={selectedPickup} onChange={e => setSelectedPickup(e.target.value)} className="w-full bg-[#040d17] border border-[#1e3a5f] rounded-lg py-2.5 px-3 text-[#e2e8f0] text-xs appearance-none focus:outline-none focus:border-[#fbbf24] cursor-pointer">
                      {pendingPickups.map((p, i) => <option key={i} value={p.pickup_id}>{p.pickup_id} - {p.merchant_name} - {p.township}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-2.5 text-[#64748b] pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="text-[9px] text-[#64748b] font-bold uppercase tracking-widest mb-1 block">RIDER / DRIVER</label>
                  <div className="relative">
                    <select value={selectedRider} onChange={e => setSelectedRider(e.target.value)} className="w-full bg-[#040d17] border border-[#1e3a5f] rounded-lg py-2.5 px-3 text-[#e2e8f0] text-xs appearance-none focus:outline-none focus:border-[#fbbf24] cursor-pointer">
                      {riders.map((r, i) => <option key={i} value={r.id}>{r.name} - {r.role} - {r.location} - {r.tasks} tasks</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-2.5 text-[#64748b] pointer-events-none" />
                  </div>
                </div>
                <button 
                  onClick={handleAssignRider} 
                  disabled={assignLoading}
                  className="w-full border border-[#fbbf24] text-[#fbbf24] bg-[#fbbf24]/10 hover:bg-[#fbbf24]/20 disabled:opacity-50 py-2.5 rounded-lg text-xs font-bold flex justify-center items-center gap-2 transition-colors uppercase tracking-widest mt-2"
                >
                  {assignLoading ? <Loader2 size={14} className="animate-spin"/> : <Send size={14} className="rotate-[-45deg] pb-0.5"/>} Assign pickup rider
                </button>
              </div>
              
              {/* Pickup Queue Example beneath */}
              <div className="mt-4 pt-4 border-t border-[#1e3a5f]">
                <div className="flex justify-between items-center bg-[#040d17] p-3 rounded-lg border border-[#1e3a5f]">
                  <div>
                    <div className="text-xs font-bold text-white">P0611-BRV-001</div>
                    <div className="text-[10px] text-[#64748b]">Britium Ventures - Bahan - 4 parcel(s)</div>
                  </div>
                  <div className="text-[9px] font-black text-[#fbbf24] border border-[#fbbf24] px-2 py-0.5 rounded uppercase tracking-wider">SUBMITTED</div>
                </div>
              </div>
            </div>

            {/* Drop-off Assignment Box */}
            <div className="bg-[#091a2f] border border-[#1e3a5f] rounded-2xl p-5 shadow-xl">
              <div className="flex justify-between items-center mb-1">
                <h2 className="text-[14px] font-black text-white tracking-wide">Drop-off Assignment</h2>
                <Truck size={16} className="text-[#3b82f6]"/>
              </div>
              <p className="text-[10px] text-[#64748b] mb-4">Assign delivery riders or drivers to reviewed wayplans before dispatch.</p>
              
              <div className="space-y-3">
                <div>
                  <label className="text-[9px] text-[#64748b] font-bold uppercase tracking-widest mb-1 block">WAYPLAN</label>
                  <div className="relative">
                    <select value={selectedWayplan} onChange={e=>setSelectedWayplan(e.target.value)} className="w-full bg-[#040d17] border border-[#1e3a5f] rounded-lg py-2.5 px-3 text-[#e2e8f0] text-xs appearance-none focus:outline-none focus:border-[#3b82f6]">
                      {MOCK_WAYPLANS.map(wp => <option key={wp.id} value={wp.id}>{wp.id} - {wp.title.replace('YGN - ', '')}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-2.5 text-[#64748b] pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="text-[9px] text-[#64748b] font-bold uppercase tracking-widest mb-1 block">RIDER / DRIVER</label>
                  <div className="relative">
                    <select value={selectedDropRider} onChange={e=>setSelectedDropRider(e.target.value)} className="w-full bg-[#040d17] border border-[#1e3a5f] rounded-lg py-2.5 px-3 text-[#e2e8f0] text-xs appearance-none focus:outline-none focus:border-[#3b82f6]">
                      {riders.map((r, i) => <option key={i} value={r.id}>{r.name} - {r.role} - {r.location} - {r.tasks} tasks</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-2.5 text-[#64748b] pointer-events-none" />
                  </div>
                </div>
                <button className="w-full border border-[#3b82f6] text-[#3b82f6] bg-[#3b82f6]/10 hover:bg-[#3b82f6]/20 py-2.5 rounded-lg text-xs font-bold flex justify-center items-center gap-2 transition-colors uppercase tracking-widest mt-2">
                  <Send size={14} className="rotate-[-45deg] pb-0.5"/> Assign drop-off rider
                </button>
              </div>

              {/* Drop Queue Examples beneath */}
              <div className="mt-4 pt-4 border-t border-[#1e3a5f] space-y-2">
                <div className="flex justify-between items-center bg-[#040d17] p-3 rounded-lg border border-[#1e3a5f]">
                  <div>
                    <div className="text-xs font-bold text-white">WP-YGN-0611-001</div>
                    <div className="text-[10px] text-[#64748b]">Bahan / Yankin - 18 stops - COD 865,000 MMK</div>
                  </div>
                  <div className="text-[9px] font-black text-[#10b981] border border-[#10b981] px-2 py-0.5 rounded uppercase tracking-wider">CONFIRMED</div>
                </div>
                <div className="flex justify-between items-center bg-[#040d17] p-3 rounded-lg border border-[#1e3a5f]">
                  <div>
                    <div className="text-xs font-bold text-white">WP-YGN-0611-002</div>
                    <div className="text-[10px] text-[#64748b]">Sanchaung / Kamayut - 14 stops - COD 430,000 MMK</div>
                  </div>
                  <div className="text-[9px] font-black text-[#f97316] border border-[#f97316] px-2 py-0.5 rounded uppercase tracking-wider">DRAFT</div>
                </div>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMNS (Spans 2 columns on large screens) */}
          <div className="col-span-1 lg:col-span-2 flex flex-col gap-6">
            
            {/* Notification Boxes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#091a2f] border border-[#1e3a5f] rounded-2xl p-5 shadow-xl">
                <h2 className="text-xs font-black text-white mb-3 flex items-center gap-2 uppercase tracking-widest"><BellRing size={14}/> Pickup Notifications</h2>
                <div className="bg-[#fbbf24]/10 border-l-2 border-[#fbbf24] p-3 rounded-r-lg">
                  <div className="text-[10px] font-black text-[#fbbf24] flex items-center gap-1.5 mb-1"><AlertTriangle size={12}/> Pickup waiting</div>
                  <div className="text-xs text-white mb-1.5 leading-snug">P0611-BRV-001 needs rider assignment for Bahan.</div>
                  <div className="text-[9px] text-[#64748b] font-medium">29/06/2026, 15:27</div>
                </div>
              </div>
              <div className="bg-[#091a2f] border border-[#1e3a5f] rounded-2xl p-5 shadow-xl">
                <h2 className="text-xs font-black text-white mb-3 flex items-center gap-2 uppercase tracking-widest"><BellRing size={14}/> Drop-off Notifications</h2>
                <div className="bg-[#3b82f6]/10 border-l-2 border-[#3b82f6] p-3 rounded-r-lg">
                  <div className="text-[10px] font-black text-[#3b82f6] flex items-center gap-1.5 mb-1"><BellRing size={12}/> Draft wayplan ready</div>
                  <div className="text-xs text-white mb-1.5 leading-snug">WP-YGN-0611-002 is ready for drop-off rider assignment.</div>
                  <div className="text-[9px] text-[#64748b] font-medium">29/06/2026, 15:27</div>
                </div>
              </div>
            </div>

            {/* Map Area Placeholder */}
            <div className="bg-[#091a2f] border border-[#1e3a5f] rounded-2xl p-5 flex-1 flex flex-col shadow-xl min-h-[300px]">
              <div className="flex justify-between items-center mb-1">
                <h2 className="text-[14px] font-black text-white tracking-wide">Livemap Screen / Mapbox Area</h2>
                <MapIcon size={16} className="text-[#64748b]" />
              </div>
              <p className="text-[10px] text-[#64748b] mb-4">Mapbox-ready display area for current ways, rider telemetry, live route condition, successful stops, wayfail, and COD collection.</p>
              
              <div className="flex-1 bg-[#040d17] border border-[#1e3a5f] rounded-xl relative overflow-hidden flex min-h-[250px]">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1e3a5f]/40 via-[#040d17] to-[#040d17]"></div>
                
                <div className="absolute top-3 left-3 flex gap-2">
                  <div className="bg-[#e2e8f0] text-[#040d17] text-[9px] font-bold px-2 py-1 rounded flex items-center gap-1 shadow-lg">
                     <MapPin size={10}/> MapboxGL mount point
                  </div>
                </div>
                
                {/* Map blips */}
                <div className="absolute top-1/3 left-1/4 w-2 h-2 bg-[#10b981] rounded-full shadow-[0_0_15px_rgba(16,185,129,1)]"></div>
                <div className="absolute bottom-1/3 right-1/3 w-2 h-2 bg-[#fbbf24] rounded-full shadow-[0_0_15px_rgba(251,191,36,1)] animate-pulse"></div>

                <div className="absolute bottom-4 left-4 border border-[#1e3a5f] bg-[#091a2f]/90 backdrop-blur-md p-3 rounded-lg max-w-[200px] shadow-2xl">
                  <div className="text-[#fbbf24] text-[11px] font-black mb-1">Current Ways</div>
                  <div className="text-[9px] text-[#e2e8f0] leading-relaxed">Mapbox token can be mounted here with mapbox-gl and live rider coordinates.</div>
                </div>

                {/* Wayplan Live Status Widget */}
                <div className="absolute top-4 right-4 border border-[#1e3a5f] bg-[#091a2f]/90 backdrop-blur-md p-3 rounded-lg shadow-2xl min-w-[180px]">
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-[#3b82f6] text-[11px] font-black">WP-YGN-0611-001</div>
                    <div className="bg-white text-black px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider">TRAFFIC</div>
                  </div>
                  <div className="text-[9px] text-white leading-snug mb-2">Rider is moving toward stop 12. Moderate traffic near Kabar Aye.</div>
                  <div className="flex justify-between text-[9px] text-[#64748b]">
                    <div><MapPin size={8} className="inline mr-1"/>Stops: 10/18</div>
                    <div><Coins size={8} className="inline mr-1"/>COD collected: 520,000</div>
                  </div>
                </div>

              </div>
            </div>

            {/* Bottom Status Section */}
            <div className="bg-[#091a2f] border border-[#1e3a5f] rounded-2xl p-5 shadow-xl">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-[13px] font-black text-white tracking-wide">Way Notifications & COD Settlement</h2>
                <BellRing size={14} className="text-[#64748b]" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border border-[#10b981]/50 bg-[#10b981]/5 p-3 rounded-lg">
                  <div className="text-[10px] font-black text-[#10b981] flex items-center gap-1.5 mb-1.5"><CheckCircle2 size={12}/> Successful ways</div>
                  <div className="text-[10px] text-white leading-snug">WP-YGN-0611-001 • Myo Thant • COD 120,000</div>
                </div>
                <div className="border border-[#ef4444]/50 bg-[#ef4444]/5 p-3 rounded-lg">
                  <div className="text-[10px] font-black text-[#ef4444] flex items-center gap-1.5 mb-1.5"><AlertTriangle size={12}/> Wayfail / failed reasons</div>
                  <div className="text-[10px] text-white leading-snug">WP-YGN-0611-001 • Customer phone unreachable - 29/06/2026, 15:27</div>
                </div>
                <div className="border border-[#f97316]/50 bg-[#f97316]/5 p-3 rounded-lg">
                  <div className="text-[10px] font-black text-[#f97316] flex items-center gap-1.5 mb-1.5"><Coins size={12}/> COD settlement</div>
                  <div className="text-[10px] text-white flex items-center gap-1.5">WP-YGN-0611-001 • <span className="bg-white text-black px-1 py-0.5 rounded text-[8px] font-black">COD_PENDING</span> • 345,000 MMK</div>
                </div>
              </div>
            </div>

            {/* List Views Bottom */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="bg-[#091a2f] border border-[#1e3a5f] rounded-2xl p-5 shadow-xl">
                 <h2 className="text-[13px] font-black text-white mb-1">Recent Pickup Requests</h2>
                 <p className="text-[9px] text-[#64748b] mb-4">Operational status overview.</p>
                 <div className="space-y-3">
                   {MOCK_QUEUE.map(p => (
                     <div key={p.pickup_id} className="flex justify-between items-center border-b border-[#1e3a5f] pb-3 last:border-0 last:pb-0">
                       <div>
                         <div className="text-xs font-bold text-white">{p.pickup_id}</div>
                         <div className="text-[9px] text-[#64748b] mt-0.5">{p.merchant_name} • {p.township} • {p.status === 'SUBMITTED' ? 'Unassigned' : 'Assigned'}</div>
                       </div>
                       <div className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border ${p.status==='SUBMITTED'?'text-[#fbbf24] border-[#fbbf24]':p.status==='PENDING_PICKUP'?'text-[#f97316] border-[#f97316]':'text-[#10b981] border-[#10b981]'}`}>{p.status}</div>
                     </div>
                   ))}
                 </div>
               </div>
               <div className="bg-[#091a2f] border border-[#1e3a5f] rounded-2xl p-5 shadow-xl">
                 <h2 className="text-[13px] font-black text-white mb-1">Recent Wayplans</h2>
                 <p className="text-[9px] text-[#64748b] mb-4">Draft, assigned, and live delivery plans.</p>
                 <div className="space-y-3">
                   {MOCK_WAYPLANS.map(wp => (
                     <div key={wp.id} className="flex justify-between items-center border-b border-[#1e3a5f] pb-3 last:border-0 last:pb-0">
                       <div>
                         <div className="text-xs font-bold text-white">{wp.id}</div>
                         <div className="text-[9px] text-[#64748b] mt-0.5">{wp.title}<br/><Clock size={8} className="inline mr-1"/>{wp.date}</div>
                       </div>
                       <div className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border ${wp.status==='CONFIRMED'?'text-[#10b981] border-[#10b981]':'text-[#f97316] border-[#f97316]'}`}>{wp.status}</div>
                     </div>
                   ))}
                 </div>
               </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}