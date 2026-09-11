import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom"; 

// 1. Dictionary for English & Myanmar Translations
const TRANSLATIONS = {
  en: {
    portal: "Britium Enterprise",
    dashboard: "Dashboard",
    hrAdmin: "HR & Admin",
    finance: "Finance & Accounts",
    marketing: "Marketing",
    businessDev: "Business Development",
    warehouse: "Warehouse",
    dispatch: "Dispatch & Logistics",
    customerService: "Customer Service",
    settings: "Settings",
    logout: "Log Out",
    toggleBtn: "မြန်မာစာသို့ ပြောင်းရန်", // Says "Switch to Myanmar"
  },
  mm: {
    portal: "Britium Express Enterprise Portal",
    dashboard: "Dashboard",
    hrAdmin: "လူ့စွမ်းအားအရင်းအမြစ်",
    finance: "ငွေစာရင်းနှင့် ဘဏ္ဍာရေး",
    marketing: "ဈေးကွက်ရှာဖွေရေး",
    businessDev: "စီးပွားရေး ဖွံ့ဖြိုးတိုးတက်မှု",
    warehouse: "ကုန်လှောင်ရုံ",
    dispatch: "ထောက်ပံ့ပို့ဆောင်ရေး",
    customerService: "ဖောက်သည်ဝန်ဆောင်မှု",
    settings: "အပြင်အဆင်များ",
    logout: "အကောင့်မှ ထွက်ရန်",
    toggleBtn: "Switch to English", 
  },
};

export default function Sidebar() {
  // 2. State to track the current language (Defaults to English)
  const [lang, setLang] = useState<"en" | "mm">("en");
  
  // If you use React Router for active links, uncomment this:
  // const location = useLocation();
  // const isActive = (path: string) => location.pathname.includes(path);
  
  // Dummy isActive function if you aren't using useLocation right now
  const isActive = (path: string) => false; 

  // Helper variable to easily access the translated strings
  const t = TRANSLATIONS[lang];

  // 3. Function to handle the toggle
  const toggleLanguage = () => {
    setLang((prev) => (prev === "en" ? "mm" : "en"));
  };

  return (
    <aside className="w-64 h-screen bg-gray-900 text-white flex flex-col justify-between shadow-xl transition-all duration-300">
      
      {/* Top Section */}
      <div>
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-wider text-blue-400">{t.portal}</h1>
        </div>

        {/* Navigation Links */}
        <nav className="mt-6 flex flex-col gap-1 px-4 overflow-y-auto">
          <Link to="/dashboard" className={`px-4 py-3 rounded-lg transition-colors ${isActive('/dashboard') ? 'bg-blue-600' : 'hover:bg-gray-800'}`}>
            📊 {t.dashboard}
          </Link>
          <Link to="/admin-hr" className={`px-4 py-3 rounded-lg transition-colors ${isActive('/admin-hr') ? 'bg-blue-600' : 'hover:bg-gray-800'}`}>
            👥 {t.hrAdmin}
          </Link>
          <Link to="/accounts" className={`px-4 py-3 rounded-lg transition-colors ${isActive('/accounts') ? 'bg-blue-600' : 'hover:bg-gray-800'}`}>
            💰 {t.finance}
          </Link>
          <Link to="/marketing" className={`px-4 py-3 rounded-lg transition-colors ${isActive('/marketing') ? 'bg-blue-600' : 'hover:bg-gray-800'}`}>
            📈 {t.marketing}
          </Link>
          <Link to="/warehouse" className={`px-4 py-3 rounded-lg transition-colors ${isActive('/warehouse') ? 'bg-blue-600' : 'hover:bg-gray-800'}`}>
            🏢 {t.warehouse}
          </Link>
          <Link to="/dispatch" className={`px-4 py-3 rounded-lg transition-colors ${isActive('/dispatch') ? 'bg-blue-600' : 'hover:bg-gray-800'}`}>
            🚚 {t.dispatch}
          </Link>
          <Link to="/customer-service" className={`px-4 py-3 rounded-lg transition-colors ${isActive('/customer-service') ? 'bg-blue-600' : 'hover:bg-gray-800'}`}>
            🎧 {t.customerService}
          </Link>
        </nav>
      </div>

      {/* Bottom Section */}
      <div className="p-4 border-t border-gray-800 space-y-2">
        {/* Language Toggle Button */}
        <button
          onClick={toggleLanguage}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors border border-gray-700"
        >
          <span>{lang === 'en' ? '🇲🇲' : '🇺🇸'}</span>
          {t.toggleBtn}
        </button>

        <Link to="/settings" className="block px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors text-sm">
          ⚙️ {t.settings}
        </Link>
        
        <button className="w-full text-left px-4 py-2 text-red-400 hover:bg-red-900/30 rounded-lg transition-colors text-sm">
          🚪 {t.logout}
        </button>
      </div>

    </aside>
  );
}