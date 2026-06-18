import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { 
  GitBranch, RefreshCw, CheckCircle2, Clock, XCircle, AlertCircle, 
  ChevronRight, Truck, Warehouse, MapPin, Repeat
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const PROCESS_STATUSES = [
  // PICKUP
  { code: 'PICKUP_REQUESTED', nameEn: 'Pickup Requested', nameMm: 'ကောက်ယူမည်ဟုတောင်းဆို', type: 'PICKUP', group: 'Pickup', isFinal: false, isException: false },
  { code: 'PICKUP_ASSIGNED', nameEn: 'Pickup Assigned', nameMm: 'ကောက်ယူသူသတ်မှတ်ပြီး', type: 'PICKUP', group: 'Pickup', isFinal: false, isException: false },
  { code: 'PICKUP_COMPLETED', nameEn: 'Pickup Completed', nameMm: 'ကောက်ယူမှုပြီးဆုံး', type: 'PICKUP', group: 'Pickup', isFinal: false, isException: false },
  { code: 'PICKUP_FAILED', nameEn: 'Pickup Failed', nameMm: 'ကောက်ယူမှုမအောင်မြင်', type: 'PICKUP', group: 'Exception', isFinal: false, isException: true },
  
  // WAREHOUSE
  { code: 'RECEIVED_AT_ORIGIN', nameEn: 'Received at Origin', nameMm: 'မူလဂိုဒေါင်ရောက်ပြီ', type: 'WAREHOUSE', group: 'Warehouse', isFinal: false, isException: false },
  { code: 'SORTING', nameEn: 'Sorting', nameMm: 'စီစစ်နေဆဲ', type: 'WAREHOUSE', group: 'Warehouse', isFinal: false, isException: false },
  { code: 'IN_TRANSIT_TO_HUB', nameEn: 'In Transit to Hub', nameMm: 'ဟပ်ဆီသို့သွားနေဆဲ', type: 'WAREHOUSE', group: 'In Transit', isFinal: false, isException: false },
  { code: 'WAREHOUSE_HOLD', nameEn: 'Warehouse Hold', nameMm: 'ဂိုဒေါင်တွင်ဆိုင်းထားသည်', type: 'WAREHOUSE', group: 'Exception', isFinal: false, isException: true },
  
  // DELIVERY
  { code: 'READY_FOR_DELIVERY', nameEn: 'Ready for Delivery', nameMm: 'ပို့ဆောင်ရန်အဆင်သင့်', type: 'DELIVERY', group: 'Delivery', isFinal: false, isException: false },
  { code: 'OUT_FOR_DELIVERY', nameEn: 'Out for Delivery', nameMm: 'ပို့ဆောင်နေဆဲ', type: 'DELIVERY', group: 'Delivery', isFinal: false, isException: false },
  { code: 'DELIVERED', nameEn: 'Delivered', nameMm: 'ပို့ဆောင်ပြီးဆုံး', type: 'DELIVERY', group: 'Delivery', isFinal: true, isException: false },
  { code: 'DELIVERY_FAILED', nameEn: 'Delivery Failed', nameMm: 'ပို့ဆောင်မှုမအောင်မြင်', type: 'DELIVERY', group: 'Exception', isFinal: false, isException: true },

  // RETURN
  { code: 'RETURNED_TO_SENDER', nameEn: 'Returned to Sender', nameMm: 'ပေးပို့သူထံပြန်ရောက်ပြီ', type: 'RETURN', group: 'Return', isFinal: true, isException: false },
];

const COLUMNS = [
  { id: 'PICKUP', label: 'Pickup', color: '#38bdf8', icon: <MapPin size={16} /> },
  { id: 'WAREHOUSE', label: 'Warehouse', color: '#a855f7', icon: <Warehouse size={16} /> },
  { id: 'DELIVERY', label: 'Delivery', color: '#22c55e', icon: <Truck size={16} /> },
  { id: 'RETURN', label: 'Return', color: '#f6b84b', icon: <Repeat size={16} /> },
];

export default function DeliveryWorkflowPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [liveCounts, setLiveCounts] = useState<Record<string, number>>({});

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('be_portal_pickup_request_items')
        .select('item_status');
        
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data?.forEach(item => {
        const status = String(item.item_status).toUpperCase();
        counts[status] = (counts[status] || 0) + 1;
      });
      setLiveCounts(counts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const totalEvents = Object.values(liveCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6 notranslate" translate="no">
      
      {/* ── HEADER ── */}
      <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="text-[#f6b84b] text-[11px] font-bold uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            <GitBranch size={14}/> <span>{t('BRITIUM EXPRESS', 'လုပ်ငန်းစဉ် စည်းမျဉ်းများ')}</span>
          </div>
          <h1 className="text-2xl font-bold text-white m-0"><span>{t('Process Status Master', 'လုပ်ငန်းစဉ် အခြေအနေ သတ်မှတ်ချက်များ')}</span></h1>
          <p className="text-[#4d7a9b] text-[14px] mt-1 m-0 max-w-2xl">
            <span>{t('Full pipeline status catalogue — Pickup, Warehouse, Delivery, and Return with live event counts.', 'Pickup, Warehouse, Delivery, နှင့် Return လုပ်ငန်းစဉ်များ၏ အခြေအနေများနှင့် တိုက်ရိုက် အရေအတွက်များ။')}</span>
          </p>
        </div>
        <button onClick={loadData} disabled={loading} className="bg-[#1a3a5c]/50 border border-[#1a3a5c] text-[#c8dff0] px-4 py-2 rounded-xl flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider hover:bg-[#1a3a5c] transition-colors cursor-pointer">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> <span>{t('Refresh Counts', 'အချက်အလက် ပြန်လည်ရယူမည်')}</span>
        </button>
      </div>

      {/* ── KANBAN COLUMNS ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {COLUMNS.map(col => {
          const statuses = PROCESS_STATUSES.filter(s => s.type === col.id);
          const colTotal = statuses.reduce((sum, s) => sum + (liveCounts[s.code] || 0), 0);

          return (
            <div key={col.id} className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl flex flex-col shadow-xl overflow-hidden">
              <div className="p-4 border-b border-[#1a3a5c] bg-[#081b2e] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#061524] border border-[#1a3a5c]" style={{ color: col.color }}>
                    {col.icon}
                  </div>
                  <div>
                    <h2 className="text-[14px] font-bold text-white m-0"><span>{col.label}</span></h2>
                    <p className="text-[10px] font-mono uppercase text-[#4d7a9b] m-0"><span>{statuses.length} {t('statuses', 'အဆင့်များ')}</span></p>
                  </div>
                </div>
                {colTotal > 0 && (
                  <span className="px-3 py-1 rounded-full text-[12px] font-black bg-[#061524] border border-[#1a3a5c]" style={{ color: col.color }}>
                    {colTotal}
                  </span>
                )}
              </div>

              <div className="flex-1 p-4 space-y-3 bg-[#061524] overflow-y-auto max-h-[600px]">
                {statuses.map(s => {
                  const count = liveCounts[s.code] || 0;
                  return (
                    <div key={s.code} className={`rounded-2xl p-4 border transition-colors ${s.isException ? 'bg-[#ff4f86]/5 border-[#ff4f86]/20' : 'bg-[#081b2e] border-[#1a3a5c] hover:border-[#4d7a9b]'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-mono font-bold px-2 py-1 rounded-md bg-[#061524] border border-[#1a3a5c]" style={{ color: col.color }}>
                          <span>{s.code}</span>
                        </span>
                        {count > 0 && (
                          <span className="text-[12px] font-black text-[#f6b84b]">
                            {count}
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] font-bold text-white mb-1"><span>{s.nameEn}</span></p>
                      <p className="text-[11px] font-semibold text-[#4d7a9b]"><span>{s.nameMm}</span></p>
                      
                      <div className="mt-3 flex gap-2">
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[#1a3a5c] text-[#c8dff0]">
                          <span>{s.group}</span>
                        </span>
                        {s.isFinal && <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[#22c55e]/20 text-[#22c55e]">FINAL</span>}
                        {s.isException && <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-[#ff4f86]/20 text-[#ff4f86]">EXCEPTION</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── FULL REFERENCE TABLE ── */}
      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl shadow-xl overflow-hidden mt-6">
        <div className="p-6 border-b border-[#1a3a5c] bg-[#081b2e] flex justify-between items-center">
          <div>
            <h2 className="text-[16px] font-bold text-white m-0"><span>{t('Full Status Reference Table', 'အခြေအနေ သတ်မှတ်ချက် အပြည့်အစုံ')}</span></h2>
            <p className="text-[#4d7a9b] text-[12px] mt-1 m-0"><span>{t(`All ${PROCESS_STATUSES.length} statuses across all process types`, `လုပ်ငန်းစဉ် အားလုံးရှိ အဆင့် ${PROCESS_STATUSES.length} ခု`)}</span></p>
          </div>
          <span className="text-[#f6b84b] text-[13px] font-black">{totalEvents} Live Events</span>
        </div>
        
        <div className="overflow-x-auto bg-[#061524]">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead className="bg-[#081b2e]">
              <tr>
                <th className="p-4 text-[#4d7a9b] text-[10px] font-bold uppercase tracking-widest border-b border-[#1a3a5c]">CODE</th>
                <th className="p-4 text-[#4d7a9b] text-[10px] font-bold uppercase tracking-widest border-b border-[#1a3a5c]">NAME EN</th>
                <th className="p-4 text-[#4d7a9b] text-[10px] font-bold uppercase tracking-widest border-b border-[#1a3a5c]">NAME MM</th>
                <th className="p-4 text-[#4d7a9b] text-[10px] font-bold uppercase tracking-widest border-b border-[#1a3a5c]">PROCESS TYPE</th>
                <th className="p-4 text-[#4d7a9b] text-[10px] font-bold uppercase tracking-widest border-b border-[#1a3a5c]">FINAL</th>
                <th className="p-4 text-[#4d7a9b] text-[10px] font-bold uppercase tracking-widest border-b border-[#1a3a5c]">EXCEPTION</th>
                <th className="p-4 text-[#4d7a9b] text-[10px] font-bold uppercase tracking-widest border-b border-[#1a3a5c]">LIVE COUNT</th>
              </tr>
            </thead>
            <tbody>
              {PROCESS_STATUSES.map((s, i) => {
                const col = COLUMNS.find(c => c.id === s.type) || COLUMNS[0];
                const count = liveCounts[s.code] || 0;
                return (
                  <tr key={i} className={`border-b border-[#1a3a5c]/50 hover:bg-[#1a3a5c]/20 transition-colors ${s.isException ? 'bg-[#ff4f86]/5' : ''}`}>
                    <td className="p-4">
                      <span className="text-[11px] font-mono font-bold px-2 py-1 rounded-md bg-[#061524] border border-[#1a3a5c]" style={{ color: col.color }}>
                        <span>{s.code}</span>
                      </span>
                    </td>
                    <td className="p-4 text-[13px] font-bold text-white"><span>{s.nameEn}</span></td>
                    <td className="p-4 text-[12px] font-semibold text-[#c8dff0]"><span>{s.nameMm}</span></td>
                    <td className="p-4 text-[11px] font-bold uppercase" style={{ color: col.color }}><span>{s.type}</span></td>
                    <td className="p-4">
                      {s.isFinal ? <span className="bg-[#22c55e]/20 text-[#22c55e] px-2 py-1 rounded text-[10px] font-bold">YES</span> : <span className="text-[#4d7a9b]">-</span>}
                    </td>
                    <td className="p-4">
                      {s.isException ? <span className="bg-[#ff4f86]/20 text-[#ff4f86] px-2 py-1 rounded text-[10px] font-bold">YES</span> : <span className="text-[#4d7a9b]">-</span>}
                    </td>
                    <td className="p-4">
                      {count > 0 ? (
                        <span className="text-[12px] font-black text-[#f6b84b]">{count}</span>
                      ) : (
                        <span className="text-[12px] font-mono text-[#4d7a9b]">0</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}