import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { RefreshCw, Plus } from 'lucide-react';

export default function MarketingPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const loadData = () => { setLoading(true); setTimeout(() => setLoading(false), 500); };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start border-b border-[#1a3a5c] pb-4">
        <div>
          <h1 className="text-[#f6b84b] uppercase mb-1 text-[16px]">{t('MARKETING', 'စျေးကွက်ရှာဖွေရေး')}</h1>
          <p className="text-[#4d7a9b] text-[13px]">{t('Campaign portfolio, reach performance, and promotion lifecycle visibility.', 'ကမ်ပိန်းများ၊ ပျံ့နှံ့မှုစွမ်းဆောင်ရည်နှင့် ပရိုမိုးရှင်းများကို စီမံပါ။')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="bg-[#0b2236] border border-[#1a3a5c] text-[#eef8ff] px-4 py-2.5 rounded-xl text-[13px] hover:border-[#f6b84b] flex items-center gap-2 transition-colors cursor-pointer">
            <RefreshCw size={14} className={loading ? "animate-spin text-[#f6b84b]" : ""} /> <span className="hidden md:inline">{t('Refresh', 'ပြန်လည်စတင်ရန်')}</span>
          </button>
          <button className="bg-[#f6b84b] text-[#061524] px-4 py-2.5 rounded-xl text-[12px] uppercase tracking-wider hover:bg-[#e5a93a] flex items-center gap-2 transition-colors cursor-pointer font-medium">
            <Plus size={14} /> {t('New Campaign', 'ကမ်ပိန်း အသစ်ဖန်တီးမည်')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-[#4ea8de] uppercase text-[11px] tracking-widest mb-1">{t('ACTIVE CAMPAIGNS', 'လက်ရှိ ကမ်ပိန်းများ')}</div><div className="text-[#eef8ff] text-[20px]">2</div></div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-[#f6b84b] uppercase text-[11px] tracking-widest mb-1">{t('TOTAL REACH', 'စုစုပေါင်း ပျံ့နှံ့မှု')}</div><div className="text-[#eef8ff] text-[20px]">0</div></div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-emerald-400 uppercase text-[11px] tracking-widest mb-1">{t('CONVERSION RATE', 'အောင်မြင်မှုနှုန်း')}</div><div className="text-[#eef8ff] text-[20px]">0.0%</div></div>
      </div>

      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl flex flex-col min-h-[400px]">
         <div className="p-4 border-b border-[#1a3a5c] flex justify-between items-center">
           <div>
             <h3 className="text-[#eef8ff] text-[14px] uppercase tracking-widest">{t('Campaign Register', 'ကမ်ပိန်း မှတ်တမ်း')}</h3>
             <p className="text-[#4d7a9b] text-[12px] mt-1">{t('5 campaign(s) from Supabase.', 'မှတ်တမ်း ၅ ခု ရှိပါသည်။')}</p>
           </div>
           <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full text-[11px] uppercase tracking-widest font-bold">2 {t('ACTIVE', 'အသုံးပြုနေသည်')}</span>
         </div>
         <div className="flex-1 overflow-auto custom-scrollbar">
           <table className="w-full text-left text-[13px]">
             <thead className="bg-[#061524] sticky top-0 border-b border-[#1a3a5c] z-10">
               <tr className="text-[#4d7a9b] uppercase text-[11px] tracking-widest">
                 <th className="p-4">{t('CAMPAIGN NAME', 'ကမ်ပိန်း အမည်')}</th>
                 <th className="p-4">{t('TYPE', 'အမျိုးအစား')}</th>
                 <th className="p-4">{t('STATUS', 'အခြေအနေ')}</th>
                 <th className="p-4">{t('START DATE', 'စတင်မည့်ရက်')}</th>
                 <th className="p-4">{t('END DATE', 'ပြီးဆုံးမည့်ရက်')}</th>
                 <th className="p-4">{t('REACH', 'ပျံ့နှံ့မှု')}</th>
               </tr>
             </thead>
             <tbody>
               {loading ? (<tr><td colSpan={6} className="text-center p-8 text-[#4d7a9b]">{t('Loading...', 'ဖတ်နေသည်...')}</td></tr>) : (
                 <>
                   <tr className="border-b border-[#1a3a5c]/50 hover:bg-[#061524] text-[#eef8ff]">
                     <td className="p-4">—</td><td className="p-4 text-[#4d7a9b]">—</td>
                     <td className="p-4"><span className="px-2 py-1 rounded-full text-[10px] uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">{t('ACTIVE', 'အသုံးပြုနေသည်')}</span></td>
                     <td className="p-4 text-[#4d7a9b]">2026-04-01</td><td className="p-4 text-[#4d7a9b]">2026-06-30</td><td className="p-4 text-[#4ea8de]">—</td>
                   </tr>
                   <tr className="border-b border-[#1a3a5c]/50 hover:bg-[#061524] text-[#eef8ff]">
                     <td className="p-4">—</td><td className="p-4 text-[#4d7a9b]">—</td>
                     <td className="p-4"><span className="px-2 py-1 rounded-full text-[10px] uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">{t('ACTIVE', 'အသုံးပြုနေသည်')}</span></td>
                     <td className="p-4 text-[#4d7a9b]">2026-04-15</td><td className="p-4 text-[#4d7a9b]">2026-05-15</td><td className="p-4 text-[#4ea8de]">—</td>
                   </tr>
                   <tr className="border-b border-[#1a3a5c]/50 hover:bg-[#061524] text-[#eef8ff]">
                     <td className="p-4">—</td><td className="p-4 text-[#4d7a9b]">—</td>
                     <td className="p-4"><span className="px-2 py-1 rounded-full text-[10px] uppercase tracking-widest bg-[#1a3a5c] text-[#90b4ce] border border-[#1a3a5c]">{t('DRAFT', 'အကြမ်းဖျင်း')}</span></td>
                     <td className="p-4 text-[#4d7a9b]">2026-05-01</td><td className="p-4 text-[#4d7a9b]">2026-07-31</td><td className="p-4 text-[#4ea8de]">—</td>
                   </tr>
                   <tr className="border-b border-[#1a3a5c]/50 hover:bg-[#061524] text-[#eef8ff]">
                     <td className="p-4">—</td><td className="p-4 text-[#4d7a9b]">—</td>
                     <td className="p-4"><span className="px-2 py-1 rounded-full text-[10px] uppercase tracking-widest bg-blue-500/10 text-blue-400 border border-blue-500/30">{t('COMPLETED', 'ပြီးစီး')}</span></td>
                     <td className="p-4 text-[#4d7a9b]">2026-03-15</td><td className="p-4 text-[#4d7a9b]">2026-04-20</td><td className="p-4 text-[#4ea8de]">—</td>
                   </tr>
                   <tr className="border-b border-[#1a3a5c]/50 hover:bg-[#061524] text-[#eef8ff]">
                     <td className="p-4">—</td><td className="p-4 text-[#4d7a9b]">—</td>
                     <td className="p-4"><span className="px-2 py-1 rounded-full text-[10px] uppercase tracking-widest bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">{t('PAUSED', 'ရပ်နားထားသည်')}</span></td>
                     <td className="p-4 text-[#4d7a9b]">2026-04-01</td><td className="p-4 text-[#4d7a9b]">2026-09-30</td><td className="p-4 text-[#4ea8de]">—</td>
                   </tr>
                 </>
               )}
             </tbody>
           </table>
         </div>
      </div>
    </div>
  );
}