import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { CheckCircle2, RefreshCw, Search, ShieldCheck, Truck, UserCheck, AlertTriangle } from "lucide-react";

export default function SupervisorPortalPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  
  const [queue, setQueue] = useState<any[]>([]);
  const [riders, setRiders] = useState<any[]>([]);
  const [fleets, setFleets] = useState<any[]>([]);
  
  const [selectedId, setSelectedId] = useState("");
  const [selectedRider, setSelectedRider] = useState("");
  const [selectedFleet, setSelectedFleet] = useState("");
  const [supervisorNote, setSupervisorNote] = useState("");

  async function loadData() {
    setLoading(true);
    setMessage("");
    try {
      // Load Pickups needing assignment
      const { data: pickups } = await supabase
        .from('be_portal_pickup_request_items')
        .select('*')
        .in('item_status', ['WAREHOUSE_RECEIVED', 'READY_FOR_WAYPLAN', 'SUBMITTED', 'PENDING'])
        .order('created_at', { ascending: false });
      
      if (pickups) setQueue(pickups);

      // Load Workforce
      const { data: workforce } = await supabase
        .from('be_mobile_workforce_accounts')
        .select('*');
      
      if (workforce) {
        setRiders(workforce.filter(w => w.role === 'RIDER' || w.role === 'DRIVER'));
      }

      // Load Fleets (Mocking fleet options if table isn't fully seeded)
      setFleets([
        { id: 'V-001', plate: 'YGN-1234', type: 'Van' },
        { id: 'V-002', plate: 'YGN-5678', type: 'Box Truck' },
        { id: 'B-001', plate: 'BICYCLE-01', type: 'Bicycle' },
      ]);

    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const filteredQueue = queue.filter(q => 
    !search || 
    q.waybill_no?.toLowerCase().includes(search.toLowerCase()) || 
    q.merchant_name?.toLowerCase().includes(search.toLowerCase())
  );

  const selectedItem = queue.find(q => q.waybill_no === selectedId);

  async function assignJob() {
    if (!selectedId || !selectedRider) {
      setMessage(t('Please select an item and a Rider/Driver.', 'ကျေးဇူးပြု၍ ပစ္စည်းနှင့် ပို့ဆောင်မည့်သူကို ရွေးချယ်ပါ။'));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('be_portal_pickup_request_items')
        .update({
          item_status: 'READY_FOR_DELIVERY',
          remarks: `Assigned to ${selectedRider}. Note: ${supervisorNote}`
        })
        .eq('waybill_no', selectedId);

      if (error) throw error;

      setMessage(t(`Successfully assigned ${selectedId} to field team.`, `ခရီးစဉ်အား အောင်မြင်စွာ တာဝန်ချထားပြီးပါပြီ။`));
      setSelectedId("");
      setSelectedRider("");
      setSupervisorNote("");
      loadData();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6 notranslate" translate="no">
      <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="text-[#f6b84b] text-[11px] font-bold uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            <ShieldCheck size={14}/> <span>{t('Supervisor Portal', 'ကြီးကြပ်ရေးမှူး ကွပ်ကဲမှုစင်တာ')}</span>
          </div>
          <h1 className="text-2xl font-bold text-white m-0"><span>{t('Pickup & Delivery Assignment', 'ကုန်ယူ/ကုန်ပို့ တာဝန်ချထားခြင်း')}</span></h1>
        </div>
        <button onClick={loadData} disabled={loading} className="bg-[#1a3a5c]/50 border border-[#1a3a5c] text-[#c8dff0] px-4 py-2 rounded-xl flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider hover:bg-[#1a3a5c] transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> <span>{t('Sync Master Data', 'အချက်အလက် ပြန်လည်ရယူမည်')}</span>
        </button>
      </div>

      {message && (
        <div className="flex items-center gap-2 rounded-2xl border border-[#22c55e]/30 bg-[#22c55e]/10 px-5 py-4 text-[13px] font-bold text-[#22c55e]">
          <CheckCircle2 className="shrink-0" size={18} /> <span>{message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        {/* QUEUE */}
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl flex flex-col h-[650px] shadow-xl overflow-hidden">
          <div className="p-6 border-b border-[#1a3a5c] bg-[#081b2e]">
            <h2 className="text-lg font-bold text-white m-0"><span>{t('Pending Queue', 'တာဝန်ချရန် စောင့်ဆိုင်းနေသော စာရင်း')}</span></h2>
            <div className="mt-4 relative">
              <Search className="absolute left-4 top-3.5 text-[#4d7a9b]" size={18} />
              <input 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
                placeholder={t('Search Waybill or Merchant...', 'ရှာဖွေရန်...')}
                className="w-full bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-3 pl-12 pr-4 text-[13px] outline-none focus:border-[#f6b84b]"
              />
            </div>
          </div>
          <div className="flex-1 overflow-auto bg-[#061524] p-4 space-y-3">
            {filteredQueue.length === 0 ? (
              <div className="p-10 text-center text-[#4d7a9b] font-medium"><span>{t('No pending items.', 'စောင့်ဆိုင်းနေသော စာရင်းမရှိပါ။')}</span></div>
            ) : filteredQueue.map(item => (
              <button 
                key={item.waybill_no} 
                onClick={() => setSelectedId(item.waybill_no)}
                className={`w-full text-left p-4 rounded-2xl border transition-all ${selectedId === item.waybill_no ? 'bg-[#1a3a5c] border-[#f6b84b]/50' : 'bg-[#081b2e] border-[#1a3a5c] hover:border-[#4d7a9b]'}`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-mono text-[13px] font-black text-[#38bdf8] mb-1"><span>{item.waybill_no}</span></div>
                    <div className="font-bold text-white text-[15px]"><span>{item.merchant_name || 'Merchant'}</span></div>
                    <div className="text-[12px] text-[#c8dff0] mt-1"><span>{item.delivery_address || 'No Address'}</span></div>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-[#4d7a9b] bg-[#061524] px-2 py-1 rounded border border-[#1a3a5c]">
                    <span>{String(item.item_status).replace(/_/g, ' ')}</span>
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ASSIGNMENT PANEL */}
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-6 shadow-xl h-fit">
          <h2 className="text-xl font-black text-white mb-6 border-b border-[#1a3a5c] pb-4 flex items-center gap-2">
            <UserCheck className="text-[#f6b84b]" size={20} /> <span>{t('Assign Field Team', 'တာဝန်ချထားရန်')}</span>
          </h2>

          <div className="space-y-5">
            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#4d7a9b] mb-2"><span>{t('Selected Item', 'ရွေးချယ်ထားသော စာရွက်')}</span></span>
              <div className="h-12 w-full rounded-xl bg-[#061524] border border-[#1a3a5c] flex items-center px-4 font-mono font-bold text-[#f6b84b]">
                <span>{selectedId || t('None selected', 'မရွေးချယ်ရသေးပါ')}</span>
              </div>
            </div>

            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#4d7a9b] mb-2"><span>{t('Rider / Driver', 'ပို့ဆောင်မည့်သူ')}</span></span>
              <select value={selectedRider} onChange={e => setSelectedRider(e.target.value)} className="h-12 w-full rounded-xl bg-[#061524] border border-[#1a3a5c] text-white px-4 text-[13px] font-bold outline-none focus:border-[#f6b84b] cursor-pointer">
                <option value=""><span>{t('Select Rider...', 'ပို့ဆောင်မည့်သူ ရွေးချယ်ပါ...')}</span></option>
                {riders.map(r => <option key={r.auth_user_id} value={r.workforce_code}>{r.workforce_code} - {r.role}</option>)}
              </select>
            </div>

            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#4d7a9b] mb-2"><span>{t('Vehicle / Fleet', 'ပို့ဆောင်မည့် ယာဉ်')}</span></span>
              <select value={selectedFleet} onChange={e => setSelectedFleet(e.target.value)} className="h-12 w-full rounded-xl bg-[#061524] border border-[#1a3a5c] text-white px-4 text-[13px] font-bold outline-none focus:border-[#f6b84b] cursor-pointer">
                <option value=""><span>{t('Select Vehicle...', 'ယာဉ် ရွေးချယ်ပါ...')}</span></option>
                {fleets.map(f => <option key={f.id} value={f.id}>{f.plate} - {f.type}</option>)}
              </select>
            </div>

            <div>
              <span className="block text-[11px] font-bold uppercase tracking-wider text-[#4d7a9b] mb-2"><span>{t('Supervisor Note', 'ကြီးကြပ်သူ မှတ်ချက်')}</span></span>
              <textarea value={supervisorNote} onChange={e => setSupervisorNote(e.target.value)} placeholder={t('Special instructions...', 'အထူးမှာကြားချက်...')} className="h-24 w-full rounded-xl bg-[#061524] border border-[#1a3a5c] text-white p-4 text-[13px] outline-none focus:border-[#f6b84b]" />
            </div>

            <button onClick={assignJob} disabled={loading || !selectedId} className="w-full h-14 rounded-2xl bg-[#f6b84b] hover:bg-[#e5a93a] text-[#061524] font-black uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer shadow-lg shadow-[#f6b84b]/10 flex items-center justify-center gap-2">
              <Truck size={18} /> <span>{t('Confirm Assignment', 'တာဝန်ချထားမှု အတည်ပြုမည်')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}