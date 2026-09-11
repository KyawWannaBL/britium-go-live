import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, Truck, Database, Settings, Headset, ShieldAlert } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { t, toggleLang } = useLanguage();
  const loc = useLocation();
  
  const nav = [
    { path: '/dashboard', label: t('Dashboard', 'ပင်မစာမျက်နှာ'), icon: LayoutDashboard },
    { path: '/cs-portal', label: t('Customer Service', 'ဖောက်သည်ဝန်ဆောင်မှု'), icon: Headset },
    { path: '/data-entry', label: t('Data Entry', 'စာရင်းသွင်းဌာန'), icon: Database },
    { path: '/supervisor', label: t('Supervisor', 'ကြီးကြပ်ရေးမှူး'), icon: ShieldAlert },
    { path: '/dispatch', label: t('Dispatch', 'ပို့ဆောင်ရေး'), icon: Truck }
  ];

  return (
    <div className="flex h-screen bg-[#061524]">
      <aside className="w-64 bg-[#0b2236] border-r border-[#1a3a5c] p-6 flex flex-col">
        <h1 className="text-[#f6b84b] font-black text-xl mb-8">BRITIUM EXPRESS</h1>
        <nav className="flex-1 space-y-2">
          {nav.map(item => (
            <Link key={item.path} to={item.path} className={`flex items-center gap-3 p-3 rounded-xl font-bold ${loc.pathname === item.path ? 'bg-[#1a3a5c] text-white' : 'text-[#4d7a9b]'}`}>
              <item.icon size={18} /> {item.label}
            </Link>
          ))}
        </nav>
        <button onClick={toggleLang} className="bg-[#1a3a5c] text-white p-3 rounded-xl font-bold">Switch Language</button>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}