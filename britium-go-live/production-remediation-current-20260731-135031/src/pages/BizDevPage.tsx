import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { RefreshCw, Plus } from 'lucide-react';

export default function BizDevPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const loadData = () => { setLoading(true); setTimeout(() => setLoading(false), 500); };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start border-b border-[#1a3a5c] pb-4">
        <div>
          <h1 className="text-[#f6b84b] uppercase mb-1 text-[16px]">{t('BUSINESS DEVELOPMENT', 'စီးပွားရေး တိုးချဲ့မှု')}</h1>
          <p className="text-[#4d7a9b] text-[13px]">{t('Partner acquisition pipeline, stage tracking, and deal value visibility.', 'မိတ်ဖက်အသစ်များ ရှာဖွေမှုနှင့် စီးပွားရေး တိုးချဲ့မှုများကို စီမံပါ။')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="bg-[#0b2236] border border-[#1a3a5c] text-[#eef8ff] px-4 py-2.5 rounded-xl text-[13px] hover:border-[#f6b84b] flex items-center gap-2 transition-colors cursor-pointer">
            <RefreshCw size={14} className={loading ? "animate-spin text-[#f6b84b]" : ""} /> <span className="hidden md:inline">{t('Refresh', 'ပြန်လည်စတင်ရန်')}</span>
          </button>
          <button className="bg-[#f6b84b] text-[#061524] px-4 py-2.5 rounded-xl text-[12px] uppercase font-bold tracking-wider hover:bg-[#e5a93a] flex items-center gap-2 transition-colors cursor-pointer">
            <Plus size={14} /> {t('Add Prospect', 'မိတ်ဖက်သစ် ထည့်မည်')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-[#4ea8de] uppercase text-[11px] tracking-widest mb-1">{t('ACTIVE PROSPECTS', 'ဆွေးနွေးဆဲ မိတ်ဖက်များ')}</div><div className="text-[#eef8ff] text-[20px]">0</div></div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-emerald-400 uppercase text-[11px] tracking-widest mb-1">{t('DEALS CLOSED', 'သဘောတူညီပြီး')}</div><div className="text-[#eef8ff] text-[20px]">0</div></div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-[#f6b84b] uppercase text-[11px] tracking-widest mb-1">{t('PIPELINE VALUE', 'ခန့်မှန်းတန်ဖိုး')}</div><div className="text-[#eef8ff] text-[20px]">0 MMK</div></div>
      </div>

      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl flex flex-col min-h-[400px] p-6">
         <div className="flex gap-2 mb-6 border-b border-[#1a3a5c] pb-4 flex-wrap">
           <button className="bg-[#f6b84b] text-[#061524] px-4 py-2 rounded-xl text-[11px] uppercase tracking-widest font-bold">{t('ALL', 'အားလုံး')}</button>
           <button className="bg-[#061524] text-[#eef8ff] border border-[#1a3a5c] px-4 py-2 rounded-xl text-[11px] uppercase tracking-widest hover:border-[#4ea8de] transition-colors">{t('PROSPECT', 'အလားအလာရှိသူ')}</button>
           <button className="bg-[#061524] text-[#eef8ff] border border-[#1a3a5c] px-4 py-2 rounded-xl text-[11px] uppercase tracking-widest hover:border-[#4ea8de] transition-colors">{t('NEGOTIATION', 'ညှိနှိုင်းဆဲ')}</button>
           <button className="bg-[#061524] text-[#eef8ff] border border-[#1a3a5c] px-4 py-2 rounded-xl text-[11px] uppercase tracking-widest hover:border-emerald-400 transition-colors">{t('CLOSED WON', 'အောင်မြင်သည်')}</button>
         </div>
         <h3 className="text-[#eef8ff] text-[14px] uppercase tracking-widest mb-4">{t('Prospect Register', 'မိတ်ဖက်သစ် စာရင်း')}</h3>
         <div className="flex-1 flex items-center justify-center text-[#4d7a9b] text-[13px] border border-dashed border-[#1a3a5c] rounded-xl">
           {loading ? t('Loading...', 'ဖတ်နေသည်...') : t('No prospects found.', 'မှတ်တမ်း မရှိပါ။')}
         </div>
      </div>
    </div>
  );
}