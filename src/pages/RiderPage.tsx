import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { RefreshCw, Plus } from 'lucide-react';

const HARDCODED_RIDERS = [
  { id: 'RID001', name: 'Ko Kyaw Zin Khant', phone: '09-779 052 872', zone: 'Yangon Central', vehicle: 'Motorcycle', status: 'Active', rate: '+150 / +300 MMK' },
  { id: 'RID002', name: 'Ko Paing Zay Htet', phone: '09-779 615 147', zone: 'Yangon South', vehicle: 'Motorcycle', status: 'Active', rate: '+150 / +300 MMK' },
  { id: 'RID003', name: 'Ko Chit Yin Htoo', phone: '09-662 385 475', zone: 'Yangon North', vehicle: 'Motorcycle', status: 'Active', rate: '+150 / +300 MMK' },
  { id: 'RID004', name: 'Ko Wai Lin Phyo', phone: '09-779 634 710', zone: 'Yangon North', vehicle: 'Motorcycle', status: 'Active', rate: '+150 / +300 MMK' },
  { id: 'RID005', name: 'Ko Aye Chan Soe', phone: '09-259 725 323', zone: 'Yangon North', vehicle: 'Motorcycle', status: 'Active', rate: '+150 / +300 MMK' },
  { id: 'RID006', name: 'Ma Myo Pa Pa Aung', phone: '09-779 617 044', zone: 'Yangon East', vehicle: 'Motorcycle', status: 'Active', rate: '+150 / +300 MMK' },
  { id: 'RID007', name: 'Ko Myo Min Kyaw', phone: '09-775 018 446', zone: 'Yangon Central', vehicle: 'Motorcycle', status: 'Active', rate: '+150 / +300 MMK' },
  { id: 'RID008', name: 'Ko Than Min Soe', phone: '09-786 015 602', zone: 'Yangon South', vehicle: 'Motorcycle', status: 'Active', rate: '+150 / +300 MMK' },
  { id: 'RID009', name: 'Ko S Lin Phyo', phone: '09-965 023 790', zone: 'Yangon Central', vehicle: 'Motorcycle', status: 'Active', rate: '+150 / +300 MMK' }
];

export default function RiderPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const loadData = () => { setLoading(true); setTimeout(() => setLoading(false), 500); };
  useEffect(() => { loadData(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start border-b border-[#1a3a5c] pb-4">
        <div>
          <h1 className="text-[#f6b84b] uppercase mb-1 text-[16px]">{t('RIDER MANAGEMENT', 'ပို့ဆောင်ရေးဝန်ထမ်း (Rider) စီမံခန့်ခွဲမှု')}</h1>
          <p className="text-[#4d7a9b] text-[13px]">{t('Field rider profiles, service zones, commission visibility and daily duty readiness.', 'ဝန်ထမ်းအချက်အလက်၊ တာဝန်ကျဇုန် နှင့် ကော်မရှင်များကို စီမံပါ။')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="bg-[#0b2236] border border-[#1a3a5c] text-[#eef8ff] px-4 py-2.5 rounded-xl text-[13px] hover:border-[#f6b84b] transition-colors flex items-center gap-2 cursor-pointer">
            <RefreshCw size={14} className={loading ? "animate-spin text-[#f6b84b]" : ""} /> <span className="hidden md:inline">{t('Refresh', 'ပြန်လည်စတင်ရန်')}</span>
          </button>
          <button className="bg-[#f6b84b] text-[#061524] px-4 py-2.5 rounded-xl text-[12px] uppercase tracking-wider hover:bg-[#e5a93a] transition-colors flex items-center gap-2 cursor-pointer">
            <Plus size={14} /> {t('Add Rider', 'ဝန်ထမ်းသစ် ထည့်မည်')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-[#4ea8de] uppercase text-[11px] tracking-widest mb-1">{t('TOTAL RIDERS', 'စုစုပေါင်း')}</div><div className="text-[20px] text-[#eef8ff]">{HARDCODED_RIDERS.length}</div></div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-[#4ea8de] uppercase text-[11px] tracking-widest mb-1">{t('ACTIVE RIDERS', 'လက်ရှိ အသုံးပြုနေသူ')}</div><div className="text-[20px] text-[#eef8ff]">{HARDCODED_RIDERS.length}</div></div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-[#4ea8de] uppercase text-[11px] tracking-widest mb-1">{t('ON DUTY TODAY', 'ယနေ့ တာဝန်ကျသူ')}</div><div className="text-[20px] text-[#eef8ff]">{HARDCODED_RIDERS.length}</div></div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-[#4ea8de] uppercase text-[11px] tracking-widest mb-1">{t('COMMISSION TODAY', 'ယနေ့ ကော်မရှင်')}</div><div className="text-[20px] text-[#f6b84b]">0 MMK</div></div>
      </div>

      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-5 mb-4 flex gap-4 flex-wrap items-center">
        <div className="text-[#eef8ff] text-[13px] mr-4">{t('Commission Reference', 'ကော်မရှင် နှုန်းထားများ')}</div>
        <div className="bg-[#061524] border border-[#1a3a5c] text-[#f6b84b] px-4 py-2 rounded-xl text-[12px] flex items-center gap-2">{t('Pickup +150 MMK', 'ကောက်ယူမှု +၁၅၀ ကျပ်')}</div>
        <div className="bg-[#061524] border border-[#1a3a5c] text-[#4ea8de] px-4 py-2 rounded-xl text-[12px] flex items-center gap-2">{t('Delivery +300 MMK', 'ပို့ဆောင်မှု +၃၀၀ ကျပ်')}</div>
      </div>

      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl flex flex-col min-h-[400px]">
         <div className="p-4 border-b border-[#1a3a5c] flex justify-between items-center">
           <h3 className="text-[#eef8ff] text-[14px] uppercase tracking-widest">{t('Rider Directory', 'ဝန်ထမ်း စာရင်း')}</h3>
         </div>
         <div className="flex-1 overflow-auto custom-scrollbar h-[500px]">
           <table className="w-full text-left text-[13px]">
             <thead className="bg-[#061524] sticky top-0 border-b border-[#1a3a5c] z-10">
               <tr className="text-[#4d7a9b] uppercase text-[11px] tracking-widest">
                 <th className="p-4">{t('RIDER ID', 'အိုင်ဒီ')}</th>
                 <th className="p-4">{t('NAME', 'အမည်')}</th>
                 <th className="p-4">{t('PHONE', 'ဖုန်း')}</th>
                 <th className="p-4">{t('ZONE', 'ဇုန်')}</th>
                 <th className="p-4">{t('VEHICLE', 'ယာဉ်')}</th>
                 <th className="p-4">{t('STATUS', 'အခြေအနေ')}</th>
                 <th className="p-4">{t('COMMISSION RATE', 'ကော်မရှင်')}</th>
                 <th className="p-4">{t('ACTION', 'လုပ်ဆောင်ချက်')}</th>
               </tr>
             </thead>
             <tbody>
               {loading ? (<tr><td colSpan={8} className="text-center p-8 text-[#4d7a9b]">{t('Loading...', 'ဖတ်နေသည်...')}</td></tr>) : (
                 HARDCODED_RIDERS.map((r, i) => (
                   <tr key={i} className="border-b border-[#1a3a5c]/50 hover:bg-[#061524] text-[#eef8ff] transition-colors">
                     <td className="p-4">{r.id}</td><td className="p-4">{r.name}</td><td className="p-4 text-[#4d7a9b]">{r.phone}</td><td className="p-4 text-[#4ea8de]">{r.zone}</td>
                     <td className="p-4 text-[#4d7a9b]">{r.vehicle}</td>
                     <td className="p-4"><span className="px-2 py-1 rounded-full text-[10px] uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">{r.status}</span></td>
                     <td className="p-4 text-[#f6b84b]">{r.rate}</td>
                     <td className="p-4"><button className="text-[#4ea8de] hover:underline text-[12px]">{t('Edit', 'ပြင်မည်')}</button></td>
                   </tr>
                 ))
               )}
             </tbody>
           </table>
         </div>
      </div>
    </div>
  );
}