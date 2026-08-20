import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut, Package, Truck, Route, Printer, Warehouse, MapPin, BriefcaseBusiness, FileText, Settings, Wallet, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/lib/supabase";

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/pickup-request', label: 'Pickup Request', icon: Package },
    { path: '/supervisor-portal', label: 'Supervisor Portal', icon: BriefcaseBusiness },
    { path: '/supervisor-gps', label: 'Live GPS', icon: MapPin },
    { path: '/wayplan-command', label: 'Wayplan Command', icon: Route },
    { path: '/warehouse-lifecycle', label: 'Warehouse', icon: Warehouse },
    { path: '/dispatch', label: 'Dispatch', icon: Truck },
    { path: '/waybill-studio', label: 'Print Studio', icon: Printer },
    { path: '/finance-portal', label: 'Finance Portal', icon: Wallet },
    { path: '/finance-reports', label: 'Finance Reports', icon: FileSpreadsheet },
    { path: '/document-studio', label: 'Document Room', icon: FileText },
  ];

  return (
    <aside className="w-64 bg-[#0a1628] border-r border-[#1a3a5c] flex flex-col h-screen">
      <div className="p-6 border-b border-[#1a3a5c]">
        <h1 className="!text-[20px] !text-[#f6b84b] !mb-0 font-black tracking-widest uppercase">BRITIUM OPS</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
        {navItems.map(item => (
          <Link key={item.path} to={item.path} className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${location.pathname.startsWith(item.path) ? 'bg-[#1a3a5c] text-[#f6b84b]' : 'text-[#c8dff0] hover:bg-[#0f253e]'}`}>
            <item.icon size={18}/> <span className="text-sm font-semibold">{item.label}</span>
          </Link>
        ))}
      </div>
      <div className="p-4 border-t border-[#1a3a5c]">
        <button onClick={async () => { await supabase.auth.signOut(); navigate("/"); }} className="w-full flex items-center gap-3 p-3 text-[#ff4f86] hover:bg-[#ff4f86]/10 rounded-xl transition-colors cursor-pointer">
          <LogOut size={20}/> <span className="text-sm font-bold">Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
