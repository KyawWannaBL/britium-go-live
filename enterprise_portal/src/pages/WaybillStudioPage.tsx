import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { QrCode, Search, RefreshCw, Plus, PackageCheck, Calculator, Download, CheckCircle2 } from "lucide-react";

export default function WaybillStudioPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [waybills, setWaybills] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('be_portal_pickup_request_items')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      setWaybills(data || []);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = waybills.filter(w => 
    !search || 
    w.waybill_no?.toLowerCase().includes(search.toLowerCase()) || 
    w.merchant_name?.toLowerCase().includes(search.toLowerCase()) ||
    w.recipient_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6 notranslate" translate="no">
      
      {/* ── HEADER ── */}
      <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="text-[#38bdf8] text-[11px] font-bold uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            <QrCode size={14}/> <span>{t('Data Entry & Operations', 'ဒေတာ ထည့်သွင်းခြင်း')}</span>
          </div>
          <h1 className="text-2xl font-bold text-white m-0"><span>{t('Waybill Studio', 'လမ်းညွှန်စာရွက် ဗဟိုဌာန')}</span></h1>
          <p className="text-[#4d7a9b] text-[14px] mt-1 m-0 max-w-2xl">
            <span>{t('Register new parcels, generate tracking codes, and calculate tariffs dynamically.', 'ပါဆယ်အသစ်များ စာရင်းသွင်းခြင်း၊ ခြေရာခံကုဒ်များ ထုတ်လုပ်ခြင်းနှင့် ပို့ဆောင်ခ တွက်ချက်ခြင်း။')}</span>
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={loadData} disabled={loading} className="bg-[#1a3a5c]/50 border border-[#1a3a5c] text-[#c8dff0] px-4 py-2 rounded-xl flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider hover:bg-[#1a3a5c] transition-colors cursor-pointer">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> <span>{t('Sync Waybills', 'အချက်အလက် ရယူမည်')}</span>
          </button>
          <button className="bg-[#f6b84b] hover:bg-[#e5a93a] text-[#061524] px-6 py-2 rounded-xl flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-lg shadow-[#f6b84b]/10">
            <Plus size={16}/> <span>{t('Create Waybill', 'အသစ် ဖန်တီးမည်')}</span>
          </button>
        </div>
      </div>

      {message && (
        <div className="flex items-center gap-2 rounded-2xl border border-[#22c55e]/30 bg-[#22c55e]/10 px-5 py-4 text-[13px] font-bold text-[#22c55e]">
          <CheckCircle2 className="shrink-0" size={18} /> <span>{message}</span>
        </div>
      )}

      {/* ── QUICK ENTRY FORM ── */}
      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-6 shadow-xl">
        <h2 className="text-[16px] font-bold text-white mb-5 flex items-center gap-2">
          <PackageCheck className="text-[#f6b84b]" size={18} /> <span>{t('Quick Entry & Auto Tariff', 'အမြန် စာရင်းသွင်းခြင်း')}</span>
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-[11px] uppercase font-bold text-[#4d7a9b] block mb-2"><span>{t('Merchant', 'ကုန်သည်')}</span></label>
            <select className="w-full bg-[#061524] border border-[#1a3a5c] text-white p-3 rounded-xl outline-none focus:border-[#f6b84b]">
              <option value=""><span>{t('Select Merchant...', 'ကုန်သည် ရွေးချယ်ပါ...')}</span></option>
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase font-bold text-[#4d7a9b] block mb-2"><span>{t('Recipient Name', 'လက်ခံမည့်သူ အမည်')}</span></label>
            <input type="text" className="w-full bg-[#061524] border border-[#1a3a5c] text-white p-3 rounded-xl outline-none focus:border-[#f6b84b]" />
          </div>
          <div>
            <label className="text-[11px] uppercase font-bold text-[#4d7a9b] block mb-2"><span>{t('Phone', 'ဖုန်းနံပါတ်')}</span></label>
            <input type="text" className="w-full bg-[#061524] border border-[#1a3a5c] text-white p-3 rounded-xl outline-none focus:border-[#f6b84b] font-mono" />
          </div>
          <div>
            <label className="text-[11px] uppercase font-bold text-[#4d7a9b] block mb-2"><span>{t('Township', 'မြို့နယ်')}</span></label>
            <select className="w-full bg-[#061524] border border-[#1a3a5c] text-white p-3 rounded-xl outline-none focus:border-[#f6b84b]">
              <option value=""><span>{t('Select Township...', 'မြို့နယ် ရွေးချယ်ပါ...')}</span></option>
            </select>
          </div>
          <div className="md:col-span-2 lg:col-span-2">
            <label className="text-[11px] uppercase font-bold text-[#4d7a9b] block mb-2"><span>{t('Full Address', 'လိပ်စာအပြည့်အစုံ')}</span></label>
            <input type="text" className="w-full bg-[#061524] border border-[#1a3a5c] text-white p-3 rounded-xl outline-none focus:border-[#f6b84b]" />
          </div>
          <div>
            <label className="text-[11px] uppercase font-bold text-[#4d7a9b] block mb-2"><span>{t('Weight (KG)', 'အလေးချိန်')}</span></label>
            <input type="number" defaultValue="1" className="w-full bg-[#061524] border border-[#1a3a5c] text-white p-3 rounded-xl outline-none focus:border-[#f6b84b] font-mono" />
          </div>
          <div>
            <label className="text-[11px] uppercase font-bold text-[#4d7a9b] block mb-2"><span>{t('COD Amount', 'ကောက်ခံငွေ')}</span></label>
            <input type="number" className="w-full bg-[#061524] border border-[#1a3a5c] text-white p-3 rounded-xl outline-none focus:border-[#f6b84b] font-mono" />
          </div>
        </div>
        
        <div className="mt-6 flex flex-col md:flex-row justify-between items-center gap-4 pt-4 border-t border-[#1a3a5c]">
          <div className="flex items-center gap-2 text-[13px] font-bold text-[#38bdf8]">
            <Calculator size={16} /> <span>{t('Tariff automatically calculated based on Master Data.', 'ပို့ဆောင်ခကို Master Data မှ အလိုအလျောက် တွက်ချက်ပေးမည်။')}</span>
          </div>
          <button className="w-full md:w-auto bg-[#22c55e] hover:bg-[#1ea34d] text-[#061524] px-8 py-3 rounded-xl text-[13px] font-black uppercase tracking-wider transition-colors shadow-lg shadow-[#22c55e]/10">
            <span>{t('Save Waybill', 'မှတ်မ်းတင်မည်')}</span>
          </button>
        </div>
      </div>

      {/* ── WAYBILL LIST ── */}
      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl flex flex-col min-h-[500px] shadow-xl overflow-hidden">
        <div className="p-6 border-b border-[#1a3a5c] bg-[#081b2e] flex flex-col md:flex-row gap-4 justify-between items-center">
          <h2 className="text-[16px] font-bold text-white m-0"><span>{t('Recent Waybills', 'မကြာသေးမီက စာရင်းများ')}</span></h2>
          <div className="relative w-full md:w-[350px]">
            <Search size={16} className="absolute left-4 top-3.5 text-[#4d7a9b]" />
            <input 
              value={search} onChange={(e) => setSearch(e.target.value)} 
              placeholder={t('Search Waybill or Recipient...', 'ရှာဖွေရန်...')}
              className="w-full bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-3 pl-11 pr-4 text-[13px] outline-none focus:border-[#f6b84b]"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-x-auto bg-[#061524]">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead className="bg-[#081b2e] sticky top-0 shadow-sm z-10">
              <tr>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Waybill ID', 'စာရွက်အမှတ်')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Merchant', 'ကုန်သည်')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Recipient', 'လက်ခံမည့်သူ')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Township', 'မြို့နယ်')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c] text-right"><span>{t('Delivery Fee', 'ပို့ဆောင်ခ')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c] text-right text-[#22c55e]"><span>{t('COD', 'ကောက်ခံငွေ')}</span></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="p-16 text-center text-[#4d7a9b]"><RefreshCw className="animate-spin mx-auto" size={24}/></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="p-16 text-center text-[#4d7a9b] font-medium"><span>{t('No waybills found.', 'မှတ်တမ်းများ မရှိပါ။')}</span></td></tr>
              ) : filtered.map((row, i) => (
                <tr key={i} className="hover:bg-[#1a3a5c]/30 transition-colors border-b border-[#1a3a5c]/50">
                  <td className="p-4 font-mono font-black text-[#38bdf8] text-[13px]"><span>{row.waybill_no}</span></td>
                  <td className="p-4 font-bold text-white text-[13px]"><span>{row.merchant_name}</span></td>
                  <td className="p-4 font-medium text-[#c8dff0] text-[13px]"><span>{row.recipient_name}</span><br/><span className="text-[11px] font-mono text-[#4d7a9b]">{row.recipient_phone}</span></td>
                  <td className="p-4 font-medium text-[#c8dff0] text-[13px]"><span>{row.delivery_township}</span></td>
                  <td className="p-4 font-mono font-bold text-[#c8dff0] text-[13px] text-right"><span>{Number(row.delivery_fee || 0).toLocaleString()} Ks</span></td>
                  <td className="p-4 font-mono font-black text-[#22c55e] text-[13px] text-right"><span>{Number(row.cod_amount || 0).toLocaleString()} Ks</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}