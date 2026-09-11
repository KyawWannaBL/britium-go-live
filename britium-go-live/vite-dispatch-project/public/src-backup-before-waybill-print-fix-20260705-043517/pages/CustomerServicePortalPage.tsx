import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Search, RefreshCw, AlertTriangle, Clock, Activity, HeadphonesIcon } from 'lucide-react';

export default function CustomerServicePortalPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const loadData = () => { setLoading(true); setTimeout(() => setLoading(false), 500); };

  return (
    <div className="space-y-6">
      <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-[#f6b84b] uppercase text-[11px] tracking-widest mb-1 flex items-center gap-2"><HeadphonesIcon size={14}/> {t('BRITIUM EXPRESS', 'ဘရစ်တီယမ် အမြန်ပို့ဆောင်ရေး')}</h2>
          <h1 className="text-[#eef8ff] text-[16px] mb-1">{t('Customer Service Portal', 'ဖောက်သည်ဝန်ဆောင်မှု စင်တာ')}</h1>
          <p className="text-[#4d7a9b] text-[13px]">{t('Track tickets and resolve exceptions.', 'ပို့ဆောင်မှု အဆင်မပြေမှုများကို စီမံပါ။')}</p>
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4d7a9b]" size={14} />
            <input type="text" placeholder={t('Search Waybill...', 'Waybill ရှာရန်...')} className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] pl-9 pr-4 py-2.5 rounded-xl focus:border-[#f6b84b] outline-none text-[13px]" />
          </div>
          <button onClick={loadData} className="bg-[#1a3a5c] text-[#eef8ff] px-4 py-2.5 rounded-xl border border-[#1a3a5c] hover:border-[#f6b84b] flex items-center justify-center cursor-pointer transition-colors text-[13px]">
            <RefreshCw size={14} className={loading ? "animate-spin text-[#f6b84b]" : ""} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl flex items-center gap-4">
          <div className="bg-blue-500/10 p-4 rounded-xl"><Activity className="text-blue-400" size={20} /></div>
          <div><p className="text-[#4d7a9b] text-[11px] uppercase tracking-widest">{t('Open Tickets', 'ဖွင့်ထားသော Ticket')}</p><p className="text-2xl text-[#eef8ff] mt-1">0</p></div>
        </div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl flex items-center gap-4">
          <div className="bg-yellow-500/10 p-4 rounded-xl"><Clock className="text-yellow-400" size={20} /></div>
          <div><p className="text-[#4d7a9b] text-[11px] uppercase tracking-widest">{t('SLA Breaches', 'SLA ကျော်လွန်မှုများ')}</p><p className="text-2xl text-[#eef8ff] mt-1">0</p></div>
        </div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl flex items-center gap-4">
          <div className="bg-rose-500/10 p-4 rounded-xl"><AlertTriangle className="text-rose-400" size={20} /></div>
          <div><p className="text-[#4d7a9b] text-[11px] uppercase tracking-widest">{t('Exceptions', 'ချို့ယွင်းချက်များ')}</p><p className="text-2xl text-[#eef8ff] mt-1">0</p></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl flex flex-col h-[500px]">
          <div className="p-4 border-b border-[#1a3a5c] flex items-center gap-3">
            <AlertTriangle className="text-rose-400" size={16} />
            <h3 className="text-[#eef8ff] text-[14px] uppercase tracking-widest">{t('Live Exceptions', 'ဖြေရှင်းရန် Exception များ')}</h3>
          </div>
          <div className="p-4 flex-1 flex items-center justify-center text-[#4d7a9b] text-[13px]">
             {loading ? t('Loading...', 'ဖတ်နေသည်...') : t('No active exceptions.', 'Exception မရှိပါ။')}
          </div>
        </div>

        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl flex flex-col h-[500px]">
          <div className="p-4 border-b border-[#1a3a5c] flex items-center gap-3">
            <Activity className="text-blue-400" size={16} />
            <h3 className="text-[#eef8ff] text-[14px] uppercase tracking-widest">{t('Active Tickets', 'လက်ရှိ Ticket များ')}</h3>
          </div>
          <div className="p-6 flex-1 flex items-center justify-center text-[#4d7a9b] text-[13px]">
             {loading ? t('Loading...', 'ဖတ်နေသည်...') : t('No active tickets found.', 'Ticket မရှိပါ။')}
          </div>
        </div>
      </div>
    </div>
  );
}