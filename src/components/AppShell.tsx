import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import {
  LayoutDashboard, Database, Warehouse, Truck, Users, Map, ShieldAlert,
  DollarSign, HeadphonesIcon, Settings, LogOut, FileText, UserPlus, PieChart,
  Briefcase, Network, Globe
} from 'lucide-react';

const MENU_GROUPS = [
  {
    label: { en: 'Overview', mm: 'အကျဉ်းချုပ်' },
    items: [
      { path: '/dashboard', icon: LayoutDashboard, en: 'Dashboard', mm: 'ပင်မစာမျက်နှာ' },
      { path: '/analytics', icon: PieChart, en: 'Analytics', mm: 'စိစစ်ချက်များ' },
      { path: '/master-data', icon: Database, en: 'Master Data', mm: 'အခြေခံဒေတာ' },
    ]
  },
  {
    label: { en: 'Operations', mm: 'လုပ်ငန်းလည်ပတ်မှု' },
    items: [
      { path: '/warehouse', icon: Warehouse, en: 'Warehouse', mm: 'ကုန်လှောင်ရုံ' },
      { path: '/dispatch', icon: Truck, en: 'Dispatch Command', mm: 'ပို့ဆောင်ရေးစနစ်' },
      { path: '/delivery-dispatch', icon: Truck, en: 'Delivery Dispatch', mm: 'ပေးပို့မှုစနစ်' },
      { path: '/delivery-workflow', icon: Network, en: 'Delivery Workflow', mm: 'ပို့ဆောင်မှုလုပ်ငန်းစဉ်' },
      { path: '/exceptions', icon: ShieldAlert, en: 'Exceptions', mm: 'ပြဿနာများ' },
      { path: '/wayplan-command', icon: Map, en: 'Wayplan Command', mm: 'လမ်းကြောင်းထိန်းချုပ်' },
      { path: '/wayplan-zone', icon: Map, en: 'Wayplan Zone', mm: 'ဇုန်လမ်းကြောင်း' },
    ]
  },
  {
    label: { en: 'Workforce', mm: 'လုပ်ငန်းခွင်အင်အား' },
    items: [
      { path: '/supervisor-pickup', icon: Users, en: 'Supervisor Pickup', mm: 'ကြီးကြပ်သူ(ကောက်ယူ)' },
      { path: '/supervisor', icon: Users, en: 'Supervisor Portal', mm: 'ကြီးကြပ်သူ(ပေါ်တယ်)' },
      { path: '/rider', icon: Truck, en: 'Riders', mm: 'ပို့ဆောင်သူများ' },
      { path: '/driver', icon: Truck, en: 'Drivers', mm: 'ယာဉ်မောင်းများ' },
      { path: '/workforce-commission', icon: DollarSign, en: 'Commissions', mm: 'ကော်မရှင်' },
    ]
  },
  {
    label: { en: 'Finance & CS', mm: 'ဘဏ္ဍာရေးနှင့် ဝန်ဆောင်မှု' },
    items: [
      { path: '/finance', icon: DollarSign, en: 'Finance Portal', mm: 'ဘဏ္ဍာရေး' },
      { path: '/cod-settlement', icon: DollarSign, en: 'COD Settlement', mm: 'COD ရှင်းလင်းမှု' },
      { path: '/tariff', icon: FileText, en: 'Tariff Master', mm: 'နှုန်းထားများ' },
      { path: '/invoice-studio', icon: FileText, en: 'Invoice Studio', mm: 'ပြေစာထုတ်ယူမှု' },
      { path: '/rider-settlement', icon: DollarSign, en: 'Rider Settlement', mm: 'ပို့ဆောင်သူရှင်းလင်းမှု' },
      { path: '/cs-portal', icon: HeadphonesIcon, en: 'Customer Service', mm: 'ဖောက်သည်ဝန်ဆောင်မှု' },
      { path: '/cs-command', icon: HeadphonesIcon, en: 'CS Command', mm: 'CS ထိန်းချုပ်ရေး' },
    ]
  },
  {
    label: { en: 'Corporate', mm: 'စီမံခန့်ခွဲရေး' },
    items: [
      { path: '/admin-hr', icon: UserPlus, en: 'Admin & HR', mm: 'စီမံနှင့် လူ့စွမ်းအား' },
      { path: '/branch-admin', icon: Briefcase, en: 'Branch Admin', mm: 'ရုံးခွဲစီမံ' },
      { path: '/branch-office', icon: Briefcase, en: 'Branch Office', mm: 'ရုံးခွဲ' },
      { path: '/marketing', icon: Globe, en: 'Marketing', mm: 'ဈေးကွက်ရှာဖွေရေး' },
      { path: '/marketing-portal', icon: Globe, en: 'Marketing Portal', mm: 'ဈေးကွက်ရှာဖွေရေး ပေါ်တယ်' },
      { path: '/biz-dev', icon: Globe, en: 'Biz Dev', mm: 'လုပ်ငန်းချဲ့ထွင်ရေး' },
      { path: '/data-entry', icon: FileText, en: 'Data Entry', mm: 'စာရင်းသွင်းဌာန' },
      { path: '/document-studio', icon: FileText, en: 'Document Studio', mm: 'စာရွက်စာတမ်း' },
      { path: '/waybill-studio', icon: FileText, en: 'Waybill Studio', mm: 'Waybill ထုတ်ယူမှု' },
      { path: '/audit-logs', icon: ShieldAlert, en: 'Audit Logs', mm: 'စစ်ဆေးမှုမှတ်တမ်း' },
      { path: '/settings', icon: Settings, en: 'Settings', mm: 'ဆက်တင်' },
    ]
  }
];

export default function AppShell() {
  const { lang, setLang } = useLanguage();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-[#061524] text-[#eef8ff] font-['Poppins'] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[280px] bg-[#0b2236] border-r border-[#1a3a5c] flex flex-col h-full overflow-hidden shrink-0">
        <div className="p-6 border-b border-[#1a3a5c]">
          <h1 className="text-xl font-black text-[#f6b84b] tracking-wider font-['Poppins']">BRITIUM EXPRESS</h1>
          <p className="text-xs font-bold text-[#4d7a9b] mt-1 tracking-widest uppercase font-['Poppins']">Enterprise Portal</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-[#1a3a5c] scrollbar-track-transparent">
          {MENU_GROUPS.map((group, idx) => (
            <div key={idx}>
              <div className="text-[11px] font-black text-[#4d7a9b] uppercase tracking-widest mb-2 px-3 font-['Poppins']">
                {lang === 'en' ? group.label.en : group.label.mm}
              </div>
              <nav className="space-y-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold transition-all font-['Poppins'] ${
                        isActive
                          ? 'bg-[#1a3a5c] text-[#38bdf8] border border-[#38bdf8]/30'
                          : 'text-[#c8dff0] hover:bg-[#0f2a42] hover:text-white border border-transparent'
                      }`
                    }
                  >
                    <item.icon size={18} />
                    <span className="text-[13px]">{lang === 'en' ? item.en : item.mm}</span>
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-[#1a3a5c] space-y-3 bg-[#081b2e]">
          <button
            onClick={() => setLang(lang === 'en' ? 'mm' : 'en')}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0f2a42] hover:bg-[#1a3a5c] border border-[#1a3a5c] rounded-xl text-sm font-bold text-[#c8dff0] transition-colors font-['Poppins']"
          >
            <Globe size={16} />
            {lang === 'en' ? 'Switch to Myanmar' : 'Switch to English'}
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#4a0521]/30 hover:bg-[#4a0521]/60 border border-[#831843]/50 rounded-xl text-sm font-bold text-[#ff4f86] transition-colors font-['Poppins']"
          >
            <LogOut size={16} />
            {lang === 'en' ? 'Sign Out' : 'ထွက်မည်'}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative h-full bg-[#061524]">
        <Outlet />
      </main>
    </div>
  );
}