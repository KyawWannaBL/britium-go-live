import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { RefreshCw, Plus, Users, ShieldCheck } from 'lucide-react';

export const CSV_EMPLOYEES = [
  { employee_code: 'EMP001', display_name: 'Daw Aye Pwint Phyu', department: 'Operation', role_label: 'Operation Manager', branch_code: 'YGN', email: 'optmgr_ygn_001@britiumventures.com' },
  { employee_code: 'EMP002', display_name: 'U Nay Soe', department: 'Operation', role_label: 'Operation Supervisor', branch_code: 'YGN', email: 'sup_ygn_001@britiumventures.com' },
  { employee_code: 'EMP003', display_name: 'U Shine Wai Yan', department: 'Operation', role_label: 'Warehouse Controller', branch_code: 'YGN', email: 'warehouse_ygn_002@britiumventures.com' },
  { employee_code: 'EMP004', display_name: 'U Paing Zay Htut', department: 'Operation', role_label: 'Warehouse Controller', branch_code: 'YGN', email: 'warehouse_ygn_003@britiumventures.com' },
  { employee_code: 'BV00024', display_name: 'U Myo Kyaw Kyaw', department: 'Business Development', role_label: 'Business Development Manager', branch_code: 'YGN', email: 'bdmgr_ygn_001@britiumventures.com' },
  { employee_code: 'BV00046', display_name: 'U Kaung Htet Kyaw', department: 'Business Development', role_label: 'Marketer', branch_code: 'YGN', email: 'mkt_ygn_0002@britiumventures.com' },
  { employee_code: 'BV00034', display_name: 'Daw Aye Chan Myat Noe Khin', department: 'Business Development', role_label: 'Marketer', branch_code: 'YGN', email: 'mkt_ygn_0001@britiumventures.com' },
  { employee_code: 'BV00059', display_name: 'Daw Hsu Thin Zar Aung', department: 'Business Development', role_label: 'Customer Service', branch_code: 'YGN', email: 'cs_ygn_0001@britiumventures.com' },
  { employee_code: 'BV00008', display_name: 'Daw Moe Moe Khaing', department: 'Finance', role_label: 'Finance Manager', branch_code: 'YGN', email: 'finance_ygn_001@britiumventures.com' },
  { employee_code: 'BV00033', display_name: 'Daw Shwe Poe Eain', department: 'Finance', role_label: 'Finance User', branch_code: 'YGN', email: 'finance_ygn_002@britiumventures.com' },
  { employee_code: 'BV00091', display_name: 'Daw Phyo Pyae Pyae Win', department: 'Finance', role_label: 'Finance User', branch_code: 'YGN', email: 'finance_ygn_003@britiumventures.com' },
  { employee_code: 'BV00071', display_name: 'Daw Kaung Zar Zar Oo', department: 'Finance', role_label: 'Finance User', branch_code: 'YGN', email: 'finance_ygn_004@britiumventures.com' },
  { employee_code: 'BV00108', display_name: 'Daw Eaint Chit Chit Han', department: 'Finance', role_label: 'Finance User', branch_code: 'YGN', email: 'finance_ygn_005@britiumventures.com' },
  { employee_code: 'BV00112', display_name: 'Daw Aye Htet Khaing', department: 'Business Development', role_label: 'Customer Service', branch_code: 'YGN', email: 'cs_ygn_0002@britiumventures.com' },
  { employee_code: 'BV00060', display_name: 'U Hlaine Htet', department: 'Business Development', role_label: 'Data Entry', branch_code: 'YGN', email: 'de_ygn_001@britiumventures.com' },
  { employee_code: 'BV00058', display_name: 'U Ju Ko San', department: 'Business Development', role_label: 'Marketer', branch_code: 'YGN', email: 'mkt_ygn_0003@britiumventures.com' },
  { employee_code: 'BV00032', display_name: 'U Aye Chan Naung', department: 'Admin HR Department', role_label: 'Admin-HR', branch_code: 'YGN', email: 'adminhr_ygn_001@britiumventures.com' },
  { employee_code: 'BV00001', display_name: 'U Kyaw Wanna', department: 'Owner', role_label: 'Owner', branch_code: 'YGN', email: 'md@britiumexpress.com' },
  { employee_code: 'BV00004', display_name: 'U Sai Nyan Htun', department: 'Super Admin', role_label: 'Super Admin', branch_code: 'YGN', email: 'sai@britiumexpress.com' }
];

export default function AdminHRPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<any[]>(CSV_EMPLOYEES);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('be_admin_hr_snapshot');
      if (!error && data?.employees && data.employees.length > 0) setEmployees(data.employees);
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) return;
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start border-b border-[#1a3a5c] pb-4">
        <div>
          <h1 className="text-[#f6b84b] uppercase mb-1 text-[16px]">{t('ADMIN & HR PORTAL', 'စီမံခန့်ခွဲရေး နှင့် လူ့စွမ်းအားအရင်းအမြစ်')}</h1>
          <p className="text-[#4d7a9b] text-[13px]">{t('Employee management, HR visibility, and access administration.', 'ရုံးဝန်ထမ်း အချက်အလက်များနှင့် စနစ်အသုံးပြုခွင့်များကို စီမံပါ။')}</p>
        </div>
        <button onClick={loadData} className="bg-[#0b2236] border border-[#1a3a5c] text-[#eef8ff] px-4 py-2.5 rounded-xl text-[13px] hover:border-[#f6b84b] flex items-center gap-2 transition-colors cursor-pointer">
          <RefreshCw size={14} className={loading ? "animate-spin text-[#f6b84b]" : ""} /> <span className="hidden md:inline">{t('Refresh', 'ပြန်လည်စတင်ရန်')}</span>
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl flex justify-between items-start"><div><div className="text-[#4ea8de] uppercase text-[11px] tracking-widest mb-1">{t('EMPLOYEES', 'ဝန်ထမ်းစုစုပေါင်း')}</div><div className="text-[20px] text-[#f6b84b]">{employees.length}</div></div><Users size={16} className="text-[#4ea8de]"/></div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl flex justify-between items-start"><div><div className="text-emerald-400 uppercase text-[11px] tracking-widest mb-1">{t('ACTIVE EMPLOYEES', 'လက်ရှိ ဝန်ထမ်း')}</div><div className="text-[20px] text-emerald-400">{employees.length}</div></div><Users size={16} className="text-emerald-400"/></div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl flex justify-between items-start"><div><div className="text-[#4ea8de] uppercase text-[11px] tracking-widest mb-1">{t('ACCESS USERS', 'အကောင့်များ')}</div><div className="text-[20px] text-[#f6b84b]">{employees.length}</div></div><ShieldCheck size={16} className="text-[#4ea8de]"/></div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl flex justify-between items-start"><div><div className="text-rose-400 uppercase text-[11px] tracking-widest mb-1">{t('ACTIVE USERS', 'အသုံးပြုနေသော အကောင့်')}</div><div className="text-[20px] text-rose-400">{employees.length}</div></div><ShieldCheck size={16} className="text-rose-400"/></div>
      </div>

      <div className="flex gap-2 border-b border-[#1a3a5c] pb-3 flex-wrap">
        <button className="bg-[#f6b84b] text-[#061524] px-5 py-2.5 rounded-xl text-[13px] uppercase tracking-widest cursor-pointer">{t('Overview', 'အနှစ်ချုပ်')}</button>
        <button className="bg-[#061524] text-[#eef8ff] border border-[#1a3a5c] hover:border-[#4ea8de] px-5 py-2.5 rounded-xl text-[13px] uppercase tracking-widest transition-colors cursor-pointer">{t('Employees', 'ဝန်ထမ်းများ')}</button>
        <button className="bg-[#061524] text-[#eef8ff] border border-[#1a3a5c] hover:border-[#4ea8de] px-5 py-2.5 rounded-xl text-[13px] uppercase tracking-widest transition-colors cursor-pointer">{t('Admin/Access', 'ဝင်ရောက်ခွင့်များ')}</button>
        <button className="bg-[#061524] text-[#eef8ff] border border-[#1a3a5c] hover:border-[#4ea8de] px-5 py-2.5 rounded-xl text-[13px] uppercase tracking-widest transition-colors cursor-pointer">{t('Reports', 'အစီရင်ခံစာများ')}</button>
      </div>

      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl flex flex-col min-h-[400px]">
         <div className="p-4 border-b border-[#1a3a5c] flex justify-between items-center">
           <div><div className="text-[#eef8ff] text-[14px] uppercase tracking-widest">{t('Employee Directory', 'ဝန်ထမ်း စာရင်း')}</div></div>
           <button className="bg-[#f6b84b] text-[#061524] px-4 py-2.5 rounded-xl text-[13px] uppercase tracking-wider flex items-center gap-2 hover:bg-[#e5a93a] transition-colors cursor-pointer"><Plus size={14}/> {t('Add Employee', 'ဝန်ထမ်းသစ် ထည့်မည်')}</button>
         </div>
         <div className="flex-1 overflow-auto custom-scrollbar h-[500px]">
           <table className="w-full text-left text-[13px] whitespace-nowrap">
             <thead className="bg-[#061524] sticky top-0 border-b border-[#1a3a5c] z-10">
               <tr className="text-[#4d7a9b] uppercase text-[11px] tracking-widest">
                 <th className="p-4">{t('CODE', 'ကုဒ်')}</th>
                 <th className="p-4">{t('NAME', 'အမည်')}</th>
                 <th className="p-4">{t('DEPARTMENT', 'ဌာန')}</th>
                 <th className="p-4">{t('ROLE', 'ရာထူး')}</th>
                 <th className="p-4">{t('BRANCH', 'ရုံးခွဲ')}</th>
                 <th className="p-4">{t('EMAIL', 'အီးမေးလ်')}</th>
               </tr>
             </thead>
             <tbody>
               {loading && employees === CSV_EMPLOYEES ? (<tr><td colSpan={6} className="text-center p-8 text-[#4d7a9b]">{t('Loading...', 'ဖတ်နေသည်...')}</td></tr>) : employees.length === 0 ? (<tr><td colSpan={6} className="text-center p-8 text-[#4d7a9b]">{t('No records found.', 'မှတ်တမ်း မရှိပါ။')}</td></tr>) : (
                 employees.map((e, i) => (
                   <tr key={i} className="border-b border-[#1a3a5c]/50 hover:bg-[#061524] text-[#eef8ff] transition-colors">
                     <td className="p-4">{e.employee_code || e.code}</td><td className="p-4">{e.display_name || e.name}</td><td className="p-4 text-[#4ea8de]">{e.department}</td><td className="p-4 text-[#f6b84b]">{e.role_label || e.role}</td>
                     <td className="p-4 text-[#4d7a9b]">{e.branch_code || e.branch}</td><td className="p-4 text-[#4d7a9b]">{e.email}</td>
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