import React, { useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { BarChart3, Building2, Boxes, BriefcaseBusiness, Calculator, ClipboardList, FileText, Gauge, Headphones, LayoutDashboard, LogOut, MapPin, Megaphone, Menu, PackageCheck, PenTool, Printer, ReceiptText, Route, Settings, ShieldAlert, Truck, UserCog, Users, Wallet, Warehouse, X, Activity } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useLanguage } from "@/contexts/LanguageContext";

const NAV_GROUPS = [
  {
    title: "OPS WORKFLOW CENTER",
    items: [
      { labelEn: "Dashboard", labelMy: "ပင်မစာမျက်နှာ", path: "/dashboard", icon: LayoutDashboard },
      { labelEn: "Pickup Request Form", labelMy: "Pickup တောင်းဆိုမှုဖောင်", path: "/pickup-request", icon: ClipboardList },
      { labelEn: "Pickup Assignment", labelMy: "Pickup တာဝန်ပေးခြင်း", path: "/supervisor-pickup", icon: Users },
      { labelEn: "Supervisor Portal", labelMy: "ကြီးကြပ်ရေး Portal", path: "/supervisor-pickup", icon: BriefcaseBusiness },
      { labelEn: "Supervisor Live GPS", labelMy: "ကြီးကြပ်ရေး Live GPS", path: "/supervisor-gps", icon: MapPin },
      { labelEn: "Data Entry", labelMy: "စာရင်းသွင်းဌာန", path: "/data-entry", icon: PenTool },
      { labelEn: "Dispatch", labelMy: "ပို့ဆောင်ရေး", path: "/dispatch", icon: Truck },
      { labelEn: "Exceptions", labelMy: "ပြဿနာဖြေရှင်း", path: "/exceptions", icon: ShieldAlert },
      { labelEn: "Enterprise Control Tower", labelMy: "Enterprise Control Tower", path: "/enterprise-control-tower", icon: Activity },
      { labelEn: "Enterprise Operations Hub", labelMy: "Enterprise Operations", path: "/enterprise-operations", icon: Activity },
      { labelEn: "Executive Operations", labelMy: "Executive Operations", path: "/executive-operations", icon: Gauge },
    ],
  },
  {
    title: "DOCUMENT & PRINTING",
    items: [
      { labelEn: "Waybill Print Studio", labelMy: "Waybill ပုံနှိပ်စတူဒီယို", path: "/waybill-studio", icon: Printer },
      { labelEn: "Invoice Print Studio", labelMy: "Invoice ပုံနှိပ်စတူဒီယို", path: "/invoice-studio", icon: ReceiptText },
      { labelEn: "Document Printing", labelMy: "စာရွက်စာတမ်း ပုံနှိပ်ခြင်း", path: "/document-studio", icon: FileText },
      { labelEn: "Manifest Print Studio", labelMy: "Manifest ပုံနှိပ်ခြင်း", path: "/manifest-print", icon: FileText },
    ],
  },
  {
    title: "WAREHOUSE & WAYPLAN",
    items: [
      { labelEn: "Warehouse Lifecycle", labelMy: "သိုလှောင်ရုံ Lifecycle", path: "/warehouse-lifecycle", icon: Warehouse },
      { labelEn: "Wayplan Command Center", labelMy: "လမ်းကြောင်းစီမံ", path: "/wayplan-command", icon: Route },
      { labelEn: "Tariff", labelMy: "နှုန်းထားသတ်မှတ်", path: "/tariff", icon: Calculator },
    ],
  },
  {
    title: "CUSTOMER & FINANCE",
    items: [
      { labelEn: "Finance Portal", labelMy: "ဘဏ္ဍာရေး", path: "/finance-portal", icon: Wallet },
      { labelEn: "COD Settlement Center", labelMy: "COD Settlement", path: "/cod-settlement", icon: PackageCheck },
      { labelEn: "Finance Report Center", labelMy: "ဘဏ္ဍာရေး အစီရင်ခံစာ", path: "/finance-reports", icon: BarChart3 },
      { labelEn: "Workforce Wallets", labelMy: "Rider / Driver Wallets", path: "/workforce-wallets", icon: Wallet },
      { labelEn: "Commission Center", labelMy: "Commission Center", path: "/commission-center", icon: Calculator },
      { labelEn: "Merchant Portal", labelMy: "ကုန်သည်အကောင့်များ", path: "/merchant-portal", icon: BriefcaseBusiness },
      { labelEn: "Customer Service", labelMy: "ဖောက်သည်ဝန်ဆောင်မှု", path: "/cs-portal", icon: Headphones },
    ],
  },
  {
    title: "ADMINISTRATION",
    items: [
      { labelEn: "Master Data", labelMy: "အခြေခံဒေတာ", path: "/master-data", icon: Boxes },
      { labelEn: "Admin / HR", labelMy: "စီမံ/HR", path: "/admin-hr", icon: UserCog },
      { labelEn: "Governance Approval", labelMy: "အတည်ပြုစီမံခန့်ခွဲမှု", path: "/print-approval-center", icon: ShieldAlert },
      { labelEn: "Production Readiness", labelMy: "Production အသင့်ဖြစ်မှု", path: "/production-readiness", icon: Activity },
      { labelEn: "Business Development", labelMy: "စီးပွားရေးဖွံ့ဖြိုးမှု", path: "/business-development", icon: BarChart3 },
      { labelEn: "Branch Office", labelMy: "ရုံးခွဲ စီမံခန့်ခွဲမှု", path: "/branch-office", icon: Building2 },
      { labelEn: "Analytics", labelMy: "အစီရင်ခံစာ", path: "/analytics", icon: BarChart3 },
      { labelEn: "Marketing", labelMy: "မားကတ်တင်း", path: "/marketing", icon: Megaphone },
      { labelEn: "Exception Master Design", labelMy: "Exception Master", path: "/exception-master", icon: ShieldAlert },
      { labelEn: "Settings", labelMy: "ဆက်တင်များ", path: "/settings", icon: Settings },
    ],
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { language, toggleLanguage } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth() as any;

  const activeTitle = useMemo(() => {
    for (const group of NAV_GROUPS) {
      const found = group.items.find(i => i.path === location.pathname);
      if (found) return language === "my" ? found.labelMy : found.labelEn;
    }
    return language === "my" ? "ပင်မစာမျက်နှာ" : "Dashboard";
  }, [location.pathname, language]);

  const logout = async () => {
    try {
      if (auth?.signOut) await auth.signOut();
      if (auth?.logout) await auth.logout();
    } catch {}
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#061524] text-[#eef8ff] font-['Poppins',sans-serif]">
      <header className="fixed top-0 left-0 right-0 z-40 h-14 bg-[#071a2b] border-b border-[#1a3a5c] flex items-center justify-between px-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => setSidebarOpen(v => !v)} className="h-9 w-9 rounded-xl border border-[#254b73] bg-[#0b2236] text-[#9fc4df] grid place-items-center">
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div className="hidden md:block h-6 w-px bg-[#1a3a5c]" />
          <div className="min-w-0">
            <div className="text-[10px] text-[#4ea8de] font-bold truncate">Britium Express · Enterprise Management System</div>
            <div className="text-sm text-white font-black truncate">{activeTitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleLanguage} className="px-3 py-2 rounded-xl border border-[#254b73] bg-[#123456] text-[#f6b84b] text-xs font-black">
            🌐 {language === "my" ? "English" : "မြန်မာ"}
          </button>
          <button onClick={logout} className="px-3 py-2 rounded-xl border border-[#254b73] bg-[#0b2236] text-[#cfe8ff] text-xs font-bold flex items-center gap-2">
            <LogOut size={14} /> {language === "my" ? "ထွက်ရန်" : "Logout"}
          </button>
        </div>
      </header>

      <aside className={`fixed top-14 bottom-0 left-0 z-30 bg-[#071a2b] border-r border-[#1a3a5c] transition-all duration-200 overflow-hidden ${sidebarOpen ? "w-[300px]" : "w-0"}`}>
        <div className="h-full overflow-y-auto px-4 py-5 custom-scrollbar">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="mb-6">
              <div className="text-[#4ea8de] text-[10px] font-black tracking-[0.28em] uppercase mb-3 px-2">{group.title}</div>
              <nav className="space-y-1">
                {group.items.map((item) => (
                  <NavLink key={item.path} to={item.path} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition ${isActive ? "bg-[#214d78] text-[#f6b84b] shadow-[inset_3px_0_0_#f6b84b]" : "text-[#b9d8ee] hover:bg-[#0b2236] hover:text-white"}`}>
                    <item.icon size={17} className="shrink-0" />
                    <span className="truncate">{language === "my" ? item.labelMy : item.labelEn}</span>
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}
        </div>
      </aside>

      <main className={`pt-14 min-h-screen transition-all duration-200 ${sidebarOpen ? "md:pl-[300px]" : "pl-0"}`}>
        {children}
      </main>
    </div>
  );
}
