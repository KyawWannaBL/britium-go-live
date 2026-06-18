import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { RefreshCw, Search, CheckCircle2, AlertTriangle, Headset } from "lucide-react";
import FinancialReportGenerator from "@/components/shared/FinancialReportGenerator";

export default function CustomerServiceCommandCenterPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [pickups, setPickups] = useState<any[]>([]);

  const loadData = async () => {
    setLoading(true);
    setMessage("");
    try {
      // FIX for "ambiguous column": Point directly to the flat table instead of complex RPC joins for initial load
      const { data, error } = await supabase
        .from('be_portal_pickup_request_items')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setPickups(data || []);
    } catch (e: any) {
      setMessage(`Backend Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = pickups.filter(p => 
    !search || 
    p.waybill_no?.toLowerCase().includes(search.toLowerCase()) || 
    p.merchant_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6 notranslate" translate="no">
      <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="text-[#38bdf8] text-[11px] font-bold uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            <Headset size={14}/> <span>{t('Customer Service', 'ဖောက်သည်ဝန်ဆောင်မှု')}</span>
          </div>
          <h1 className="text-2xl font-bold text-white m-0"><span>{t('CS Command Center', 'စောင့်ကြည့်ရေး စင်တာ')}</span></h1>
          <p className="text-[#4d7a9b] text-[14px] mt-1 m-0">
            <span>{t('Manage live pickup requests, tickets, and operational exceptions.', 'အမှာစာများ၊ ကွန်ပလိန်းများနှင့် ချွင်းချက်ဖြစ်စဉ်များကို စီမံပါ။')}</span>
          </p>
        </div>
        <button onClick={loadData} disabled={loading} className="bg-[#1a3a5c]/50 border border-[#1a3a5c] text-[#c8dff0] px-4 py-2 rounded-xl flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider hover:bg-[#1a3a5c] transition-colors cursor-pointer">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> <span>{t('Refresh Live Data', 'အချက်အလက် ပြန်လည်ရယူမည်')}</span>
        </button>
      </div>

      {message && (
        <div className="flex items-center gap-2 rounded-2xl border border-[#ff4f86]/30 bg-[#ff4f86]/10 px-5 py-4 text-[13px] font-bold text-[#ff4f86]">
          <AlertTriangle className="shrink-0" size={18} /> <span>{message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl flex flex-col h-[650px] shadow-xl overflow-hidden">
          <div className="p-6 border-b border-[#1a3a5c] bg-[#081b2e]">
            <h2 className="text-lg font-bold text-white m-0"><span>{t('Live Pickup Queue', 'တောင်းဆိုထားသော စာရင်းများ')}</span></h2>
            <div className="mt-4 relative">
              <Search className="absolute left-4 top-3.5 text-[#4d7a9b]" size={18} />
              <input 
                value={search} onChange={(e) => setSearch(e.target.value)} 
                placeholder={t('Search Waybill or Merchant...', 'ရှာဖွေရန်...')}
                className="w-full bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-3 pl-12 pr-4 text-[13px] outline-none focus:border-[#38bdf8]"
              />
            </div>
          </div>
          <div className="flex-1 overflow-x-auto bg-[#061524]">
             <table className="w-full text-left border-collapse min-w-[800px]">
               <thead className="bg-[#081b2e] sticky top-0 shadow-sm">
                 <tr>
                   <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]">Waybill</th>
                   <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]">Merchant</th>
                   <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]">Township</th>
                   <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]">Status</th>
                 </tr>
               </thead>
               <tbody>
                 {filtered.map(row => (
                   <tr key={row.waybill_no} className="border-b border-[#1a3a5c]/50 hover:bg-[#1a3a5c]/30">
                     <td className="p-4 font-mono font-black text-[#f6b84b]">{row.waybill_no}</td>
                     <td className="p-4 font-bold text-white">{row.merchant_name}</td>
                     <td className="p-4 text-[#c8dff0]">{row.delivery_township}</td>
                     <td className="p-4"><span className="bg-[#061524] border border-[#1a3a5c] text-[#4d7a9b] px-2 py-1 rounded text-[10px] font-bold uppercase">{row.item_status}</span></td>
                   </tr>
                 ))}
               </tbody>
             </table>
          </div>
        </div>

        <div className="space-y-6">
          <FinancialReportGenerator moduleName="Customer_Service" />
        </div>
      </div>
    </div>
  );
}