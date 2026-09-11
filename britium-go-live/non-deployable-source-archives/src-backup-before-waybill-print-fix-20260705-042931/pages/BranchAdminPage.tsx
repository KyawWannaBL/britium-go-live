import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { RefreshCw } from 'lucide-react';

export default function BranchAdminPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const loadData = () => { setLoading(true); setTimeout(() => setLoading(false), 500); };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start border-b border-[#1a3a5c] pb-4">
        <div>
          <h1 className="text-[#f6b84b] uppercase mb-1 text-[16px]">{t('BRANCH ADMINISTRATION', 'ရုံးခွဲ စီမံခန့်ခွဲမှု')}</h1>
          <p className="text-[#4d7a9b] text-[13px]">{t('Branch admin management, escalation controls, and record monitoring.', 'ရုံးခွဲကိစ္စရပ်များနှင့် ပြဿနာဖြေရှင်းမှုများကို စီမံပါ။')}</p>
        </div>
        <button onClick={loadData} className="bg-[#0b2236] border border-[#1a3a5c] text-[#eef8ff] px-4 py-2.5 rounded-xl text-[13px] hover:border-[#f6b84b] flex items-center gap-2 transition-colors cursor-pointer">
          <RefreshCw size={14} className={loading ? "animate-spin text-[#f6b84b]" : ""} /> <span className="hidden md:inline">{t('Sync', 'ချိန်ကိုက်မည်')}</span>
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-[#4ea8de] uppercase text-[11px] tracking-widest mb-1">{t('TOTAL RECORDS', 'စုစုပေါင်း မှတ်တမ်း')}</div><div className="text-[20px] text-[#eef8ff]">0</div></div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-rose-400 uppercase text-[11px] tracking-widest mb-1">{t('PENDING ESCALATION', 'အထက်တင်ပြမှုများ')}</div><div className="text-[20px] text-[#eef8ff]">0</div></div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-[#f6b84b] uppercase text-[11px] tracking-widest mb-1">{t('OVERRIDES TODAY', 'ယနေ့ ပြင်ဆင်မှုများ')}</div><div className="text-[20px] text-[#eef8ff]">0</div></div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-emerald-400 uppercase text-[11px] tracking-widest mb-1">{t('LAST SYNC', 'နောက်ဆုံး ချိန်ကိုက်မှု')}</div><div className="text-[14px] text-[#4d7a9b] mt-2">—</div></div>
      </div>

      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl min-h-[400px] flex flex-col p-6">
         <div className="flex justify-between items-center mb-4 border-b border-[#1a3a5c] pb-4">
           <h3 className="text-[#eef8ff] text-[14px] uppercase tracking-widest">{t('Branch Records', 'ရုံးခွဲ မှတ်တမ်းများ')}</h3>
           <select className="bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] px-4 py-2.5 rounded-xl outline-none text-[13px] focus:border-[#f6b84b]"><option>{t('All Branches', 'ရုံးခွဲအားလုံး')}</option></select>
         </div>
         <div className="flex-1 flex items-center justify-center text-[#4d7a9b] text-[13px]">
           {loading ? t('Loading...', 'ဖတ်နေသည်...') : t('No branch admin records found.', 'မှတ်တမ်းများ မရှိပါ။')}
         </div>
      </div>
    </div>
  );
}