import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { RefreshCw, Plus } from 'lucide-react';

const HARDCODED_DRIVERS = [
  { id: 'DRV001', name: 'U Wai Phyo Lwin', phone: '09-260 741 691', license: 'D/00138/12', vehicle: 'Mini Truck', zone: 'Hlaing Thar Yar', status: 'Active', rate: '+75 / +200 MMK' },
  { id: 'DRV002', name: 'U Tun Min Aung', phone: '09-942 540 630', license: 'E/01923/25', vehicle: 'Van', zone: 'Thaketa', status: 'Active', rate: '+75 / +200 MMK' },
  { id: 'DRV003', name: 'U Aung Zaw Moe', phone: '09-750 099 581', license: 'B/06711/23', vehicle: 'Mini Truck', zone: 'Downtown', status: 'Active', rate: '+75 / +200 MMK' },
  { id: 'DRV004', name: 'U Wai Yan Phyo', phone: '09-757 052 761', license: 'B/08656/19', vehicle: 'Box Truck', zone: 'Shwe Pyi Thar', status: 'Active', rate: '+75 / +200 MMK' },
  { id: 'DRV005', name: 'U Kyaw Myo Aung', phone: '09-770 696 670', license: 'B/05214/18', vehicle: 'Van', zone: 'Mayangone', status: 'Active', rate: '+75 / +200 MMK' },
  { id: 'DRV006', name: 'U Win Naing Tun', phone: '09-679 874 786', license: 'B/19817/22', vehicle: 'Mini Truck', zone: 'South Dagon', status: 'Active', rate: '+75 / +200 MMK' }
];

const HARDCODED_HELPERS = [
  { id: 'HLP001', name: 'Ko Moe Sat Zin Tun', phone: '09-975 135 311', type: 'Permanent', status: 'Active', rate: '+75 / +200 MMK' },
  { id: 'HLP002', name: 'Ko Pyae Phyo Kyaw', phone: '09-750 629 255', type: 'Permanent', status: 'Active', rate: '+75 / +200 MMK' },
  { id: 'HLP003', name: 'Ko Htut Khaung Win', phone: '09-693 057 638', type: 'Contract', status: 'Active', rate: '+75 / +200 MMK' },
  { id: 'HLP004', name: 'Ko John Toe Lwin', phone: '09-979 796 688', type: 'Contract', status: 'Active', rate: '+75 / +200 MMK' },
  { id: 'HLP005', name: 'Ko Zaw Thet Paing', phone: '09-798 775 120', type: 'Contract', status: 'Active', rate: '+75 / +200 MMK' }
];

export default function DriverPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'drivers' | 'helpers'>('drivers');
  const loadData = () => { setLoading(true); setTimeout(() => setLoading(false), 500); };
  useEffect(() => { loadData(); }, []);

  const list = tab === 'drivers' ? HARDCODED_DRIVERS : HARDCODED_HELPERS;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start border-b border-[#1a3a5c] pb-4">
        <div>
          <h1 className="text-[#f6b84b] uppercase mb-1 text-[16px]">{t('DRIVER / HELPER MANAGEMENT', 'ယာဉ်မောင်း နှင့် နောက်လိုက် စီမံခန့်ခွဲမှု')}</h1>
          <p className="text-[#4d7a9b] text-[13px]">{t('Driver and helper profiles, assignments, operational status and commission visibility.', 'ယာဉ်မောင်း၊ နောက်လိုက် အချက်အလက်များနှင့် ကော်မရှင်များကို စီမံပါ။')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="bg-[#0b2236] border border-[#1a3a5c] text-[#eef8ff] px-4 py-2.5 rounded-xl text-[13px] hover:border-[#f6b84b] transition-colors flex items-center gap-2 cursor-pointer">
            <RefreshCw size={14} className={loading ? "animate-spin text-[#f6b84b]" : ""} /> <span className="hidden md:inline">{t('Refresh', 'ပြန်လည်စတင်ရန်')}</span>
          </button>
          <button className="bg-[#f6b84b] text-[#061524] px-4 py-2.5 rounded-xl text-[12px] uppercase tracking-wider hover:bg-[#e5a93a] transition-colors flex items-center gap-2 cursor-pointer">
            <Plus size={14} /> {t('Add Driver', 'ဝန်ထမ်းအသစ် ထည့်မည်')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-[#4ea8de] uppercase text-[11px] tracking-widest mb-1">{t('TOTAL DRIVERS', 'ယာဉ်မောင်း စုစုပေါင်း')}</div><div className="text-[20px] text-[#eef8ff]">{HARDCODED_DRIVERS.length}</div></div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-emerald-400 uppercase text-[11px] tracking-widest mb-1">{t('ACTIVE DRIVERS', 'လက်ရှိ ယာဉ်မောင်းများ')}</div><div className="text-[20px] text-[#eef8ff]">{HARDCODED_DRIVERS.length}</div></div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-[#4ea8de] uppercase text-[11px] tracking-widest mb-1">{t('TOTAL HELPERS', 'နောက်လိုက် စုစုပေါင်း')}</div><div className="text-[20px] text-[#eef8ff]">{HARDCODED_HELPERS.length}</div></div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-[#f6b84b] uppercase text-[11px] tracking-widest mb-1">{t('ON DUTY TODAY', 'ယနေ့ တာဝန်ကျသူ')}</div><div className="text-[20px] text-[#eef8ff]">{HARDCODED_DRIVERS.length + HARDCODED_HELPERS.length}</div></div>
      </div>

      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-6">
        <h3 className="text-[#eef8ff] text-[14px] mb-3 uppercase tracking-widest">{t('Commission Reference', 'ကော်မရှင် နှုန်းထားများ')}</h3>
        <div className="flex flex-wrap gap-3">
          <div className="bg-[#061524] border border-[#1a3a5c] px-4 py-2 rounded-xl text-[#eef8ff] text-[12px]">{t('Driver +75 MMK pickup', 'ယာဉ်မောင်း ကောက်ယူမှု +၇၅ ကျပ်')}</div>
          <div className="bg-[#061524] border border-[#1a3a5c] px-4 py-2 rounded-xl text-[#eef8ff] text-[12px]">{t('Driver +200 MMK delivery', 'ယာဉ်မောင်း ပို့ဆောင်မှု +၂၀၀ ကျပ်')}</div>
          <div className="bg-[#061524] border border-[#1a3a5c] px-4 py-2 rounded-xl text-[#eef8ff] text-[12px]">{t('Helper +75 MMK pickup', 'နောက်လိုက် ကောက်ယူမှု +၇၅ ကျပ်')}</div>
          <div className="bg-[#061524] border border-[#1a3a5c] px-4 py-2 rounded-xl text-[#eef8ff] text-[12px]">{t('Helper +200 MMK delivery', 'နောက်လိုက် ပို့ဆောင်မှု +၂၀၀ ကျပ်')}</div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-[#1a3a5c] pb-3">
        <button onClick={() => setTab('drivers')} className={`px-5 py-2.5 rounded-xl text-[12px] uppercase tracking-widest transition-colors cursor-pointer ${tab === 'drivers' ? 'bg-[#f6b84b] text-[#061524]' : 'bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] hover:border-[#f6b84b]'}`}>{t('Drivers', 'ယာဉ်မောင်းများ')}</button>
        <button onClick={() => setTab('helpers')} className={`px-5 py-2.5 rounded-xl text-[12px] uppercase tracking-widest transition-colors cursor-pointer ${tab === 'helpers' ? 'bg-[#f6b84b] text-[#061524]' : 'bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] hover:border-[#f6b84b]'}`}>{t('Helpers', 'နောက်လိုက်များ')}</button>
      </div>

      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl flex flex-col min-h-[400px]">
         <div className="p-4 border-b border-[#1a3a5c]">
           <h3 className="text-[#eef8ff] text-[14px] uppercase tracking-widest">{tab === 'drivers' ? t('Driver Directory', 'ယာဉ်မောင်း စာရင်း') : t('Helper Directory', 'နောက်လိုက် စာရင်း')}</h3>
         </div>
         <div className="flex-1 overflow-auto custom-scrollbar h-[500px]">
           <table className="w-full text-left text-[13px]">
             <thead className="bg-[#061524] sticky top-0 border-b border-[#1a3a5c] z-10">
               <tr className="text-[#4d7a9b] uppercase text-[11px] tracking-widest">
                 <th className="p-4">{tab === 'drivers' ? t('DRIVER ID', 'အိုင်ဒီ') : t('HELPER ID', 'အိုင်ဒီ')}</th>
                 <th className="p-4">{t('NAME', 'အမည်')}</th>
                 <th className="p-4">{t('PHONE', 'ဖုန်း')}</th>
                 {tab === 'drivers' && <th className="p-4">{t('LICENSE', 'လိုင်စင်')}</th>}
                 {tab === 'drivers' && <th className="p-4">{t('VEHICLE', 'ယာဉ်')}</th>}
                 <th className="p-4">{tab === 'drivers' ? t('ZONE', 'ဇုန်') : t('TYPE', 'အမျိုးအစား')}</th>
                 <th className="p-4">{t('STATUS', 'အခြေအနေ')}</th>
                 <th className="p-4">{t('COMMISSION RATE', 'ကော်မရှင်')}</th>
               </tr>
             </thead>
             <tbody>
               {loading ? (<tr><td colSpan={8} className="text-center p-8 text-[#4d7a9b]">{t('Loading...', 'ဖတ်နေသည်...')}</td></tr>) : list.length === 0 ? (<tr><td colSpan={8} className="text-center p-8 text-[#4d7a9b]">{t('No records found.', 'မှတ်တမ်း မရှိပါ။')}</td></tr>) : (
                 list.map((r: any, i: number) => (
                   <tr key={i} className="border-b border-[#1a3a5c]/50 hover:bg-[#061524] text-[#eef8ff] transition-colors">
                     <td className="p-4">{r.id}</td>
                     <td className="p-4">{r.name}</td>
                     <td className="p-4 text-[#4d7a9b]">{r.phone}</td>
                     {tab === 'drivers' && <td className="p-4 text-[#4ea8de]">{r.license}</td>}
                     {tab === 'drivers' && <td className="p-4 text-[#4d7a9b]">{r.vehicle}</td>}
                     <td className="p-4 text-[#4ea8de]">{tab === 'drivers' ? r.zone : r.type}</td>
                     <td className="p-4">
                       <span className={`px-2 py-1 rounded-full text-[10px] uppercase tracking-widest ${r.status?.toLowerCase() === 'active' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" : "bg-rose-500/10 text-rose-400 border border-rose-500/30"}`}>
                         {r.status?.toLowerCase() === 'active' ? t('Active', 'အသုံးပြုနေသည်') : t('Inactive', 'ရပ်နားထားသည်')}
                       </span>
                     </td>
                     <td className="p-4 text-[#f6b84b]">{r.rate}</td>
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