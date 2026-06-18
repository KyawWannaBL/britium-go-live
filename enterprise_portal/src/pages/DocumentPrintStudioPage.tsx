import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Printer, Search, RefreshCw, FileText, Barcode, CheckCircle2 } from "lucide-react";

export default function DocumentPrintStudioPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('be_portal_pickup_request_items')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (data) setRecords(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = records.filter(r => !search || r.waybill_no?.toLowerCase().includes(search.toLowerCase()) || r.merchant_name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6 notranslate" translate="no">
      <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="text-[#38bdf8] text-[11px] font-bold uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            <Printer size={14}/> <span>{t('Print Operations', 'စာရွက်စာတမ်း ထုတ်လုပ်ရေး')}</span>
          </div>
          <h1 className="text-2xl font-bold text-white m-0"><span>{t('Document Print Studio', 'လမ်းညွှန်စာရွက်နှင့် ဘားကုဒ် ထုတ်လုပ်ရေး')}</span></h1>
        </div>
        <div className="flex gap-3">
          <button onClick={loadData} className="bg-[#1a3a5c]/50 border border-[#1a3a5c] text-[#c8dff0] px-4 py-2 rounded-xl flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider hover:bg-[#1a3a5c] transition-colors cursor-pointer">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> <span>{t('Sync Pickups', 'အချက်အလက် ရယူမည်')}</span>
          </button>
          <button onClick={() => window.print()} className="bg-[#f6b84b] hover:bg-[#e5a93a] text-[#061524] px-6 py-2 rounded-xl flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-lg shadow-[#f6b84b]/10">
            <Barcode size={16}/> <span>{t('Print Selected', 'ရွေးချယ်ထားသည်များ ထုတ်မည်')}</span>
          </button>
        </div>
      </div>

      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl flex flex-col min-h-[600px] shadow-xl overflow-hidden">
        <div className="p-6 border-b border-[#1a3a5c] bg-[#081b2e] flex flex-col md:flex-row gap-4 justify-between items-center">
          <h2 className="text-[16px] font-bold text-white m-0 flex items-center gap-2">
            <FileText className="text-[#f6b84b]" size={18} /> <span>{t('Waybill Queue', 'စောင့်ဆိုင်းနေသော လမ်းညွှန်စာရွက်များ')}</span>
          </h2>
          <div className="relative w-full md:w-[350px]">
            <Search size={16} className="absolute left-4 top-3.5 text-[#4d7a9b]" />
            <input 
              value={search} onChange={(e) => setSearch(e.target.value)} 
              placeholder={t('Search waybill, merchant, receiver...', 'ရှာဖွေရန်...')}
              className="w-full bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-3 pl-11 pr-4 text-[13px] outline-none focus:border-[#f6b84b]"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-x-auto bg-[#061524]">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="bg-[#081b2e] sticky top-0 shadow-sm z-10">
              <tr>
                <th className="p-4 border-b border-[#1a3a5c] w-[50px]"><input type="checkbox" className="accent-[#f6b84b] w-4 h-4" /></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Waybill', 'စာရွက်အမှတ်')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Merchant', 'ကုန်သည်')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Destination', 'ပို့ဆောင်မည့်နေရာ')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('COD Amount', 'ကောက်ခံငွေ')}</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => (
                <tr key={row.waybill_no} className="hover:bg-[#1a3a5c]/30 transition-colors border-b border-[#1a3a5c]/50">
                  <td className="p-4"><input type="checkbox" className="accent-[#f6b84b] w-4 h-4 cursor-pointer" /></td>
                  <td className="p-4 font-mono font-black text-[#38bdf8] text-[13px]"><span>{row.waybill_no}</span></td>
                  <td className="p-4 font-bold text-white text-[13px]"><span>{row.merchant_name}</span></td>
                  <td className="p-4 font-medium text-[#c8dff0] text-[13px]"><span>{row.delivery_township}</span></td>
                  <td className="p-4 font-bold text-[#22c55e] text-[13px]"><span>{Number(row.cod_amount).toLocaleString()} Ks</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}