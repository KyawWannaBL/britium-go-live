import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Truck, MapPin, UserCheck, RefreshCw, Send, CheckCircle2, AlertCircle, Package } from 'lucide-react';

export default function DispatchPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [readyForDelivery, setReadyForDelivery] = useState<any[]>([]);
  const [riders, setRiders] = useState<any[]>([]);
  const [selectedWaybills, setSelectedWaybills] = useState<string[]>([]);
  const [selectedRider, setSelectedRider] = useState<string>('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Items ready for dispatch or returning from a failed attempt
      const { data: items, error: itemsErr } = await supabase
        .from('be_portal_pickup_request_items')
        .select('*')
        .in('item_status', ['READY_FOR_DELIVERY', 'WAREHOUSE_RECEIVED'])
        .order('created_at', { ascending: false });
      
      if (itemsErr) throw itemsErr;
      if (items) setReadyForDelivery(items);

      // 2. Fetch Active Riders from workforce accounts
      const { data: workforce, error: wfErr } = await supabase
        .from('be_mobile_workforce_accounts')
        .select('auth_user_id, workforce_code, role')
        .in('role', ['RIDER', 'DRIVER']);
      
      if (wfErr) throw wfErr;
      if (workforce) setRiders(workforce);

    } catch (error: any) {
      console.error("Dispatch Load Error:", error);
      showMessage(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const toggleSelect = (waybillNo: string) => {
    setSelectedWaybills(prev => 
      prev.includes(waybillNo) ? prev.filter(w => w !== waybillNo) : [...prev, waybillNo]
    );
  };

  const toggleSelectAll = () => {
    if (selectedWaybills.length === readyForDelivery.length) {
      setSelectedWaybills([]);
    } else {
      setSelectedWaybills(readyForDelivery.map(item => item.waybill_no));
    }
  };

  const handleDispatch = async () => {
    if (selectedWaybills.length === 0) {
      showMessage(t('Please select at least one waybill.', 'ကျေးဇူးပြု၍ လမ်းညွှန်စာရွက် အနည်းဆုံးတစ်ခု ရွေးချယ်ပါ။'), 'error');
      return;
    }
    if (!selectedRider) {
      showMessage(t('Please select a rider to assign.', 'ကျေးဇူးပြု၍ ပို့ဆောင်မည့်သူကို ရွေးချယ်ပါ။'), 'error');
      return;
    }

    setAssigning(true);
    try {
      // Update all selected items to OUT_FOR_DELIVERY
      const { error } = await supabase
        .from('be_portal_pickup_request_items')
        .update({ 
          item_status: 'OUT_FOR_DELIVERY', 
          // In a real schema, you'd have an assigned_rider_id column here
          remarks: `Dispatched to Rider: ${selectedRider}` 
        })
        .in('waybill_no', selectedWaybills);

      if (error) throw error;

      showMessage(t(`Successfully dispatched ${selectedWaybills.length} items.`, `လမ်းညွှန်စာရွက် ${selectedWaybills.length} ခုကို အောင်မြင်စွာ စေလွှတ်ပြီးပါပြီ။`), 'success');
      setSelectedWaybills([]);
      setSelectedRider('');
      loadData();
    } catch (err: any) {
      showMessage(err.message, 'error');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6 notranslate" translate="no">
      {/* HEADER */}
      <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="text-[#f6b84b] text-[11px] font-bold uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            <Truck size={14}/> <span>{t('Dispatch Command', 'ပို့ဆောင်ရေး ကွပ်ကဲမှုဌာန')}</span>
          </div>
          <h1 className="text-2xl font-bold text-white m-0"><span>{t('Outbound Delivery Dispatch', 'ကုန်ပစ္စည်းပေးပို့ရန် စေလွှတ်ခြင်း')}</span></h1>
          <p className="text-[#4d7a9b] text-[14px] mt-1 m-0"><span>{t('Assign planned waybills to active riders for delivery.', 'စီစဉ်ထားသော လမ်းညွှန်စာရွက်များကို ပို့ဆောင်သူများထံ တာဝန်ချထားပါ။')}</span></p>
        </div>
        <button onClick={loadData} disabled={loading} className="bg-[#1a3a5c]/50 border border-[#1a3a5c] text-[#c8dff0] px-4 py-2 rounded-xl flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider hover:bg-[#1a3a5c] transition-colors cursor-pointer">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> <span>{t('Refresh', 'အချက်အလက် ပြန်လည်ရယူမည်')}</span>
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 font-bold text-[14px] ${message.type === 'error' ? 'bg-[#ff4f86]/10 text-[#ff4f86] border border-[#ff4f86]/30' : 'bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/30'}`}>
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />} <span>{message.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6">
        {/* LEFT: WAYBILL QUEUE */}
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl overflow-hidden flex flex-col min-h-[600px]">
          <div className="p-6 border-b border-[#1a3a5c] flex justify-between items-center bg-[#081b2e]">
            <h2 className="text-lg font-bold text-white m-0"><span>{t('Ready for Delivery', 'ပို့ဆောင်ရန် အသင့်ဖြစ်နေသော စာရင်း')}</span></h2>
            <div className="text-[12px] font-bold text-[#4d7a9b] bg-[#061524] px-3 py-1 rounded-md border border-[#1a3a5c]">
              {readyForDelivery.length} {t('Items', 'ခု')}
            </div>
          </div>
          
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead className="bg-[#081b2e]">
                <tr>
                  <th className="p-4 border-b border-[#1a3a5c] w-[50px]">
                    <input type="checkbox" className="w-4 h-4 rounded border-[#1a3a5c] bg-[#061524] accent-[#f6b84b] cursor-pointer" 
                      checked={selectedWaybills.length > 0 && selectedWaybills.length === readyForDelivery.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]">{t('Waybill No', 'လမ်းညွှန်စာရွက်')}</th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]">{t('Recipient', 'လက်ခံမည့်သူ')}</th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]">{t('Township', 'မြို့နယ်')}</th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]">{t('Attempts', 'ကြိုးစားမှု')}</th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]">{t('COD', 'ကောက်ခံငွေ')}</th>
                </tr>
              </thead>
              <tbody>
                {readyForDelivery.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-16 text-center text-[#4d7a9b]">
                      <Package size={40} className="mx-auto mb-4 opacity-30" />
                      <div className="text-[13px] font-medium">{t('No items are currently ready for dispatch.', 'ပို့ဆောင်ရန် စောင့်ဆိုင်းနေသော စာရင်းမရှိပါ။')}</div>
                    </td>
                  </tr>
                ) : (
                  readyForDelivery.map(item => (
                    <tr key={item.waybill_no} className="hover:bg-[#1a3a5c]/20 transition-colors border-b border-[#1a3a5c]/50">
                      <td className="p-4">
                        <input type="checkbox" className="w-4 h-4 rounded border-[#1a3a5c] bg-[#061524] accent-[#f6b84b] cursor-pointer"
                          checked={selectedWaybills.includes(item.waybill_no)}
                          onChange={() => toggleSelect(item.waybill_no)}
                        />
                      </td>
                      <td className="p-4">
                        <span className="text-[#38bdf8] bg-[#38bdf8]/10 px-2 py-1 rounded font-mono font-bold text-[12px]">{item.waybill_no}</span>
                      </td>
                      <td className="p-4 text-white font-bold text-[13px]">{item.recipient_name}</td>
                      <td className="p-4 text-[#c8dff0] text-[13px]">{item.delivery_township}</td>
                      <td className="p-4">
                        <span className={`text-[11px] font-bold px-2 py-1 rounded ${item.delivery_attempts > 0 ? 'bg-[#ff4f86]/10 text-[#ff4f86]' : 'bg-[#1a3a5c] text-[#4d7a9b]'}`}>
                          {item.delivery_attempts || 0}/3
                        </span>
                      </td>
                      <td className="p-4 text-[#f6b84b] font-bold text-[13px]">{Number(item.cod_amount).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT: ASSIGNMENT PANEL */}
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-6 h-fit shadow-xl sticky top-6">
          <h2 className="text-[18px] font-bold text-white mb-6 border-b border-[#1a3a5c] pb-4 flex items-center gap-2">
            <UserCheck className="text-[#f6b84b]" size={20} /> <span>{t('Assign Route', 'တာဝန်ချထားရန်')}</span>
          </h2>
          
          <div className="mb-6 bg-[#061524] border border-[#1a3a5c] p-4 rounded-xl text-center">
            <div className="text-[24px] font-black text-white">{selectedWaybills.length}</div>
            <div className="text-[11px] text-[#4d7a9b] font-bold uppercase tracking-wider">{t('Selected Items', 'ရွေးချယ်ထားသော အရေအတွက်')}</div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-[12px] font-bold uppercase tracking-wider text-[#4d7a9b] mb-2">{t('Select Delivery Rider', 'ပို့ဆောင်မည့်သူကို ရွေးချယ်ပါ')}</label>
              <select 
                value={selectedRider} 
                onChange={e => setSelectedRider(e.target.value)} 
                className="w-full bg-[#081b2e] border border-[#1a3a5c] text-[#eef8ff] rounded-xl px-4 py-3 text-[14px] outline-none focus:border-[#f6b84b] transition-colors cursor-pointer"
              >
                <option value="">-- {t('Choose Rider', 'ရွေးချယ်ပါ')} --</option>
                {riders.map(r => (
                  <option key={r.auth_user_id} value={r.workforce_code}>{r.workforce_code} - {r.role}</option>
                ))}
              </select>
            </div>

            <button 
              onClick={handleDispatch} 
              disabled={assigning || selectedWaybills.length === 0 || !selectedRider}
              className="w-full bg-[#f6b84b] hover:bg-[#e5a93a] text-[#061524] font-bold text-[14px] uppercase tracking-wider py-4 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-xl shadow-[#f6b84b]/10"
            >
              {assigning ? <RefreshCw className="animate-spin" size={18} /> : <Send size={18} />}
              <span>{t('Dispatch to Field', 'လုပ်ငန်းခွင်သို့ စေလွှတ်မည်')}</span>
            </button>
            
            <div className="text-[#4d7a9b] text-[11px] text-center leading-relaxed mt-4 px-2">
              {t('Items will immediately appear on the assigned rider\'s mobile application.', 'ရွေးချယ်ထားသောပစ္စည်းများသည် ပို့ဆောင်သူ၏ မိုဘိုင်းအက်ပ်တွင် ချက်ချင်းပေါ်လာမည်ဖြစ်သည်။')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}