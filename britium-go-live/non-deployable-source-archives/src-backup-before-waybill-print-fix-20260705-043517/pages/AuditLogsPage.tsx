import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { RefreshCw, Download, Filter } from 'lucide-react';

export default function AuditLogsPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const loadData = () => { setLoading(true); setTimeout(() => setLoading(false), 500); };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start border-b border-[#1a3a5c] pb-4">
        <div>
          <h1 className="text-[#f6b84b] uppercase mb-1 text-[16px]">{t('AUDIT LOGS', 'လုပ်ငန်းစဉ် မှတ်တမ်းများ')}</h1>
          <p className="text-[#4d7a9b] text-[13px]">{t('System activity audit trail, compliance review, and event filtering.', 'စနစ်အတွင်း ဝင်ရောက် လုပ်ဆောင်မှု မှတ်တမ်းများ။')}</p>
        </div>
        <div className="flex gap-2">
          <button className="bg-[#061524] text-[#eef8ff] border border-[#1a3a5c] px-4 py-2.5 rounded-xl text-[12px] uppercase tracking-wider hover:border-[#f6b84b] flex items-center gap-2 transition-colors cursor-pointer"><Download size={14}/> {t('Export Logs', 'မှတ်တမ်း ရယူမည်')}</button>
          <button onClick={loadData} className="bg-[#0b2236] border border-[#1a3a5c] text-[#eef8ff] px-4 py-2.5 rounded-xl text-[13px] hover:border-[#f6b84b] flex items-center gap-2 transition-colors cursor-pointer">
            <RefreshCw size={14} className={loading ? "animate-spin text-[#f6b84b]" : ""} /> <span className="hidden md:inline">{t('Refresh', 'ပြန်လည်စတင်ရန်')}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-[#4ea8de] uppercase text-[11px] tracking-widest mb-1">{t('TOTAL EVENTS', 'စုစုပေါင်း လုပ်ဆောင်မှု')}</div><div className="text-[20px] text-[#eef8ff]">0</div></div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-[#f6b84b] uppercase text-[11px] tracking-widest mb-1">{t('EVENTS TODAY', 'ယနေ့ လုပ်ဆောင်မှု')}</div><div className="text-[20px] text-[#eef8ff]">0</div></div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-rose-400 uppercase text-[11px] tracking-widest mb-1">{t('CRITICAL EVENTS', 'သတိပြုရန် အချက်များ')}</div><div className="text-[20px] text-[#eef8ff]">0</div></div>
      </div>

      <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl flex flex-col md:flex-row gap-4">
        <div className="w-full"><label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2"><Filter size={12} className="inline mr-1"/>{t('From Date', 'မှ (ရက်စွဲ)')}</label><input type="date" className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]" /></div>
        <div className="w-full"><label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2"><Filter size={12} className="inline mr-1"/>{t('To Date', 'ထိ (ရက်စွဲ)')}</label><input type="date" className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]" /></div>
        <div className="w-full"><label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">{t('Event Type', 'လုပ်ဆောင်မှု အမျိုးအစား')}</label><select className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]"><option>All</option></select></div>
        <div className="w-full"><label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">{t('User Filter', 'အသုံးပြုသူ')}</label><input type="text" placeholder="Filter by user..." className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]" /></div>
      </div>

      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl flex flex-col min-h-[400px]">
         <div className="p-4 border-b border-[#1a3a5c] flex justify-between items-center"><h3 className="text-[#eef8ff] text-[14px] uppercase tracking-widest">{t('Audit Event Register', 'လုပ်ငန်းစဉ် မှတ်တမ်း')}</h3><span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full text-[10px] uppercase tracking-widest font-bold">{t('NO CRITICAL EVENTS', 'ပြဿနာ မရှိပါ')}</span></div>
         <div className="flex-1 overflow-auto custom-scrollbar h-[400px]">
           <table className="w-full text-left text-[13px]">
             <thead className="bg-[#061524] sticky top-0 border-b border-[#1a3a5c] z-10">
               <tr className="text-[#4d7a9b] uppercase text-[11px] tracking-widest">
                 <th className="p-4">{t('TIMESTAMP', 'အချိန်')}</th>
                 <th className="p-4">{t('USER', 'အသုံးပြုသူ')}</th>
                 <th className="p-4">{t('ACTION', 'လုပ်ဆောင်ချက်')}</th>
                 <th className="p-4">{t('RESOURCE', 'နေရာ')}</th>
                 <th className="p-4">{t('DETAILS', 'အသေးစိတ်')}</th>
                 <th className="p-4">{t('IP ADDRESS', 'IP လိပ်စာ')}</th>
               </tr>
             </thead>
             <tbody>
               <tr><td colSpan={6} className="text-center p-8 text-[#4d7a9b]">{loading ? t('Loading...', 'ဖတ်နေသည်...') : t('No audit events recorded yet.', 'မှတ်တမ်း မရှိသေးပါ။')}</td></tr>
             </tbody>
           </table>
         </div>
      </div>
    </div>
  );
}