import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { ShieldAlert, Search, RefreshCw, AlertTriangle, CheckCircle2, PackageX, MapPin, Phone } from 'lucide-react';

export default function ExceptionsPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('be_portal_pickup_request_items')
        .select('*')
        .in('item_status', ['DELIVERY_FAILED', 'RETURN_TO_SENDER'])
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setExceptions(data || []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = exceptions.filter(ex => 
    !search || 
    ex.waybill_no?.toLowerCase().includes(search.toLowerCase()) || 
    ex.merchant_name?.toLowerCase().includes(search.toLowerCase())
  );

  const kpis = {
    total: exceptions.length,
    failed: exceptions.filter(e => e.item_status === 'DELIVERY_FAILED').length,
    returns: exceptions.filter(e => e.item_status === 'RETURN_TO_SENDER').length
  };

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6 notranslate" translate="no">
      {/* HEADER */}
      <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="text-[#ff4f86] text-[11px] font-bold uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            <ShieldAlert size={14}/> <span>{t('Exception Control Center', 'ချွင်းချက်ဖြစ်စဉ် ထိန်းချုပ်ရေးစင်တာ')}</span>
          </div>
          <h1 className="text-2xl font-bold text-white m-0"><span>{t('Delivery Exceptions & Returns', 'ပို့ဆောင်ရန် ပျက်ကွက်မှုများနှင့် အပြန်အမ်းများ')}</span></h1>
          <p className="text-[#4d7a9b] text-[14px] mt-1 m-0 max-w-2xl">
            <span>{t('Monitor and resolve failed delivery attempts and return-to-sender parcels centrally.', 'ပို့ဆောင်ရန် ပျက်ကွက်သော ကုန်ပစ္စည်းများနှင့် ပေးပို့သူထံ ပြန်လည်ပေးပို့မည့် အရာများကို စောင့်ကြည့်ဖြေရှင်းပါ။')}</span>
          </p>
        </div>
        <button onClick={loadData} disabled={loading} className="bg-[#1a3a5c]/50 border border-[#1a3a5c] text-[#c8dff0] px-4 py-2 rounded-xl flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider hover:bg-[#1a3a5c] transition-colors cursor-pointer">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> <span>{t('Refresh List', 'စာရင်း ပြန်လည်ရယူမည်')}</span>
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-3xl shadow-lg border-t-2 border-t-[#f6b84b]">
          <div className="text-[11px] font-bold text-[#4d7a9b] uppercase tracking-wider mb-2"><span>{t('Total Exceptions', 'စုစုပေါင်း ချွင်းချက်ဖြစ်စဉ်')}</span></div>
          <div className="text-3xl font-black text-white"><span>{kpis.total}</span></div>
        </div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-3xl shadow-lg border-t-2 border-t-[#f59e0b]">
          <div className="text-[11px] font-bold text-[#4d7a9b] uppercase tracking-wider mb-2"><span>{t('Failed Attempts (Action Required)', 'ပို့ဆောင်ရန် ပျက်ကွက်မှု (လုပ်ဆောင်ရန် လိုအပ်)')}</span></div>
          <div className="text-3xl font-black text-white"><span>{kpis.failed}</span></div>
        </div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-3xl shadow-lg border-t-2 border-t-[#ff4f86]">
          <div className="text-[11px] font-bold text-[#4d7a9b] uppercase tracking-wider mb-2"><span>{t('Locked: Return to Sender', 'ပေးပို့သူထံ ပြန်လည်ပေးပို့မည့် စာရင်း')}</span></div>
          <div className="text-3xl font-black text-[#ff4f86]"><span>{kpis.returns}</span></div>
        </div>
      </div>

      {/* DATA GRID */}
      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl flex flex-col min-h-[500px] shadow-xl overflow-hidden">
        <div className="p-6 border-b border-[#1a3a5c] bg-[#081b2e] flex flex-col md:flex-row gap-4 justify-between items-center">
          <h2 className="text-[16px] font-bold text-white m-0 flex items-center gap-2">
            <PackageX className="text-[#ff4f86]" size={18} /> 
            <span>{t('Exception Log', 'ချွင်းချက်ဖြစ်စဉ် မှတ်တမ်း')}</span>
          </h2>
          <div className="relative w-full md:w-[300px]">
            <Search size={16} className="absolute left-4 top-3.5 text-[#4d7a9b]" />
            <input 
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('Search Waybill or Merchant...', 'လမ်းညွှန်စာရွက် (သို့) ကုန်သည် ရှာဖွေရန်...')}
              className="w-full bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-3 pl-11 pr-4 text-[13px] outline-none focus:border-[#f6b84b]"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-x-auto bg-[#061524]">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead className="bg-[#081b2e] sticky top-0 shadow-sm z-10">
              <tr>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Waybill', 'စာရွက်အမှတ်')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Merchant', 'ကုန်သည်')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Destination', 'ပို့ဆောင်မည့်နေရာ')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Contact', 'ဆက်သွယ်ရန်')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Attempts', 'ကြိုးစားမှု')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Exception Status', 'အခြေအနေ')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Last Updated', 'နောက်ဆုံးပြင်ဆင်မှု')}</span></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="p-16 text-center text-[#4d7a9b]"><RefreshCw className="animate-spin mx-auto" size={24}/></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-16 text-center text-[#4d7a9b] font-medium"><span>{t('No exception records found.', 'ချွင်းချက်ဖြစ်စဉ် မှတ်တမ်းများ မရှိပါ။')}</span></td></tr>
              ) : filtered.map((ex, i) => (
                <tr key={i} className="hover:bg-[#1a3a5c]/30 transition-colors border-b border-[#1a3a5c]/50">
                  <td className="p-4 font-mono font-black text-[#f6b84b] text-[13px]"><span>{ex.waybill_no}</span></td>
                  <td className="p-4 font-bold text-white text-[13px]"><span>{ex.merchant_name}</span></td>
                  <td className="p-4 text-[#c8dff0] text-[13px] font-medium">
                    <div className="flex items-center gap-1"><MapPin size={12}/> <span>{ex.delivery_township}</span></div>
                  </td>
                  <td className="p-4 text-[#c8dff0] text-[13px]">
                     <div className="flex items-center gap-1"><Phone size={12}/> <span>{ex.recipient_phone}</span></div>
                  </td>
                  <td className="p-4">
                     <span className={`text-[11px] font-bold px-2 py-1 rounded ${ex.delivery_attempts >= 3 ? 'bg-[#ff4f86] text-[#061524]' : 'bg-[#f59e0b]/20 text-[#f59e0b]'}`}>
                       <span>{ex.delivery_attempts || 0}/3</span>
                     </span>
                  </td>
                  <td className="p-4">
                    <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded border ${ex.item_status === 'RETURN_TO_SENDER' ? 'bg-[#ff4f86]/10 text-[#ff4f86] border-[#ff4f86]/30' : 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/30'}`}>
                      <span>{String(ex.item_status).replace(/_/g, ' ')}</span>
                    </span>
                  </td>
                  <td className="p-4 text-[#4d7a9b] text-[12px]"><span>{new Date(ex.updated_at).toLocaleString()}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}