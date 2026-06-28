import { useLanguage } from '@/contexts/LanguageContext';
import { RefreshCw, UserCog } from 'lucide-react';
import { HARDCODED_EMPLOYEES } from "../constants/employees";
import { useState, useEffect } from 'react';

export default function AccountsPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const loadData = () => { setLoading(true); setTimeout(() => setLoading(false), 500); };
  useEffect(() => { loadData(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start border-b border-[#1a3a5c] pb-4">
        <div className="flex items-start gap-4">
          <div className="bg-[#1a3a5c] p-3 rounded-xl hidden md:block"><UserCog className="text-[#f6b84b]" size={20}/></div>
          <div>
            <h1 className="text-[#f6b84b] uppercase mb-1 text-[16px]">{t('ACCOUNT MANAGEMENT', 'အကောင့် စီမံခန့်ခွဲမှု')}</h1>
            <p className="text-[#4d7a9b] text-[13px]">{t('Create accounts, approve requests, reset access, block users and assign permissions.', 'အကောင့်များ ပြုလုပ်ခြင်း နှင့် ဝင်ရောက်ခွင့်များကို စီမံပါ။')}</p>
          </div>
        </div>
        <button onClick={loadData} className="bg-[#0b2236] border border-[#1a3a5c] text-[#eef8ff] px-4 py-2.5 rounded-xl text-[13px] hover:border-[#f6b84b] transition-colors flex items-center gap-2 cursor-pointer">
          <RefreshCw size={14} className={loading ? "animate-spin text-[#f6b84b]" : ""} /> <span className="hidden md:inline">{t('Refresh', 'ပြန်လည်စတင်ရန်')}</span>
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-[#4ea8de] uppercase text-[11px] tracking-widest mb-1">{t('TOTAL USERS', 'အကောင့် စုစုပေါင်း')}</div><div className="text-[20px] text-[#f6b84b]">{HARDCODED_EMPLOYEES.length}</div></div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-[#4ea8de] uppercase text-[11px] tracking-widest mb-1">{t('ACTIVE', 'အသုံးပြုနေသည်')}</div><div className="text-[20px] text-[#f6b84b]">{HARDCODED_EMPLOYEES.length}</div></div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-[#4d7a9b] uppercase text-[11px] tracking-widest mb-1">{t('PENDING', 'စောင့်ဆိုင်းဆဲ')}</div><div className="text-[20px] text-[#f6b84b]">0</div></div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl"><div className="text-[#4ea8de] uppercase text-[11px] tracking-widest mb-1">{t('ROLES', 'ရာထူးများ')}</div><div className="text-[20px] text-[#eef8ff]">14</div></div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="bg-[#f6b84b] text-[#061524] px-5 py-2.5 rounded-xl text-[13px] transition-colors cursor-pointer">{t('Users', 'အကောင့်များ')}</button>
        <button className="bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] hover:border-[#4ea8de] px-5 py-2.5 rounded-xl text-[13px] transition-colors cursor-pointer">{t('Create Account', 'အကောင့် ဖွင့်မည်')}</button>
        <button className="bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] hover:border-[#4ea8de] px-5 py-2.5 rounded-xl text-[13px] transition-colors cursor-pointer">{t('Reset / Block', 'ပိတ်မည် / ပြင်မည်')}</button>
        <button className="bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] hover:border-[#4ea8de] px-5 py-2.5 rounded-xl text-[13px] transition-colors cursor-pointer">{t('Roles & Permissions', 'ဝင်ရောက်ခွင့်များ')}</button>
        <button className="bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] hover:border-[#4ea8de] px-5 py-2.5 rounded-xl text-[13px] transition-colors cursor-pointer">{t('Approvals', 'အတည်ပြုရန်')}</button>
      </div>

      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl min-h-[400px] flex flex-col">
         <div className="p-4 border-b border-[#1a3a5c]"><h3 className="text-[#eef8ff] text-[14px] uppercase tracking-widest">{t('Users', 'အကောင့်များ')}</h3></div>
         <div className="flex-1 overflow-auto custom-scrollbar h-[500px]">
           <table className="w-full text-left text-[13px]">
             <thead className="bg-[#061524] sticky top-0 border-b border-[#1a3a5c] z-10">
               <tr className="text-[#4d7a9b] uppercase text-[11px] tracking-widest">
                 <th className="p-4">{t('NAME', 'အမည်')}</th>
                 <th className="p-4">{t('EMAIL', 'အီးမေးလ်')}</th>
                 <th className="p-4">{t('ROLE', 'ရာထူး')}</th>
                 <th className="p-4">{t('PHONE', 'ဖုန်း')}</th>
                 <th className="p-4">{t('STATUS', 'အခြေအနေ')}</th>
                 <th className="p-4">{t('ACTION', 'လုပ်ဆောင်ချက်')}</th>
               </tr>
             </thead>
             <tbody>
               {loading ? (<tr><td colSpan={6} className="text-center p-8 text-[#4d7a9b]">{t('Loading...', 'ဖတ်နေသည်...')}</td></tr>) : (
                 HARDCODED_EMPLOYEES.map((e, i) => (
                   <tr key={i} className="border-b border-[#1a3a5c]/50 hover:bg-[#061524] text-[#eef8ff] transition-colors">
                     <td className="p-4">{e.name}</td><td className="p-4 text-[#4d7a9b]">{e.email}</td><td className="p-4 text-[#4ea8de]">{e.role}</td><td className="p-4 text-[#4d7a9b]">{e.phone}</td>
                     <td className="p-4"><span className="px-2 py-1 rounded-full text-[10px] uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">Active</span></td>
                     <td className="p-4"><button className="text-[#4ea8de] hover:underline text-[12px]">{t('Manage', 'ပြင်မည်')}</button></td>
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