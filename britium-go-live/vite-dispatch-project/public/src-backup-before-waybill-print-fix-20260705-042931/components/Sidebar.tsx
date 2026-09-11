import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Smartphone, LogOut, Package } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <aside className="w-64 bg-[#0a1628] border-r border-[#1a3a5c] flex flex-col h-screen">
      <div className="p-6 border-b border-[#1a3a5c]">
        <h1 className="!text-[20px] !text-[#f6b84b] !mb-0">Britium Ops</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <Link to="/dashboard" className={`flex items-center gap-3 p-3 rounded-xl ${location.pathname === '/dashboard' ? 'bg-[#1a3a5c] text-[#f6b84b]' : 'text-[#c8dff0]'}`}>
          <LayoutDashboard size={20}/> <span>Dashboard</span>
        </Link>
        <Link to="/mobile-simulator" className={`flex items-center gap-3 p-3 rounded-xl ${location.pathname === '/mobile-simulator' ? 'bg-[#1a3a5c] text-[#f6b84b]' : 'text-[#c8dff0]'}`}>
          <Smartphone size={20}/> <span>Mobile Sandbox</span>
        </Link>
      </div>
      <div className="p-4 border-t border-[#1a3a5c]">
        <button onClick={() => { supabase.auth.signOut(); navigate("/"); }} className="w-full flex items-center gap-3 p-3 text-[#ff4f86] hover:bg-[#ff4f86]/10 rounded-xl">
          <LogOut size={20}/> <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}