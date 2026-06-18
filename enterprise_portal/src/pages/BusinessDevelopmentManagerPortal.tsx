import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { 
  BarChart3, Globe, Store, Users, TrendingUp, ShieldCheck, RefreshCw, Loader2 
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// --- Types ---
type BizDevData = {
  merchants: any[];
  branches: any[];
  kpis: {
    totalMerchants: number;
    activeBranches: number;
    monthlyRevenue: number;
    growthRate: number;
  };
};

export default function BusinessDevelopmentManagerPortal() {
  const [data, setData] = useState<BizDevData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  const loadData = async () => {
    setLoading(true);
    try {
      // In production, replace this with your actual unified RPC call
      const { data: snapshot, error } = await supabase.rpc('be_bizdev_overview_snapshot');
      if (error) throw error;
      
      // Fallback structure if RPC returns null during initial setup
      setData(snapshot || {
        merchants: [], branches: [], 
        kpis: { totalMerchants: 0, activeBranches: 0, monthlyRevenue: 0, growthRate: 0 }
      });
    } catch (err) {
      console.error("Failed to load BizDev data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="min-h-screen bg-[#061524] p-6 text-slate-200 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        
        {/* --- Header --- */}
        <header className="flex flex-col gap-4 rounded-[2rem] border border-slate-800 bg-[#0b2236] p-8 shadow-xl md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-400">
              <Globe className="h-3.5 w-3.5" />
              Corporate Strategy
            </div>
            <h1 className="text-3xl font-black text-white">Business Development</h1>
            <p className="mt-2 text-sm text-slate-400">Monitor regional growth, merchant acquisition, and branch performance.</p>
          </div>
          <button 
            onClick={loadData} 
            disabled={loading}
            className="flex h-12 items-center gap-2 rounded-xl bg-[#f6b84b] px-6 text-sm font-black text-[#061524] transition hover:bg-[#e5a93a] disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync Data
          </button>
        </header>

        {/* --- KPI Grid --- */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Active Merchants" value={data?.kpis.totalMerchants} icon={Store} color="text-emerald-400" bg="bg-emerald-500/10" />
          <KpiCard title="Regional Branches" value={data?.kpis.activeBranches} icon={Globe} color="text-blue-400" bg="bg-blue-500/10" />
          <KpiCard title="Monthly Revenue" value={`${(data?.kpis.monthlyRevenue || 0).toLocaleString()} Ks`} icon={BarChart3} color="text-amber-400" bg="bg-amber-500/10" />
          <KpiCard title="Growth Rate" value={`${data?.kpis.growthRate || 0}%`} icon={TrendingUp} color="text-purple-400" bg="bg-purple-500/10" />
        </div>

        {/* --- Main Content Tabs --- */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
          <TabsList className="flex w-full flex-wrap gap-2 bg-transparent p-0">
            <TabButton id="overview" label="Regional Overview" active={activeTab} />
            <TabButton id="merchants" label="Merchant Registry" active={activeTab} />
          </TabsList>

          <TabsContent value="overview" className="rounded-[2rem] border border-slate-800 bg-[#0b2236] p-6 shadow-xl">
            <h2 className="mb-4 text-xl font-bold text-white">Regional Performance</h2>
            {loading ? (
              <div className="py-10 text-center text-slate-500">Loading regions...</div>
            ) : (
               <div className="overflow-x-auto">
                 <table className="w-full text-left text-sm">
                   <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
                     <tr>
                       <th className="pb-3 pl-4">Branch Code</th>
                       <th className="pb-3">Region</th>
                       <th className="pb-3">Status</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-800/50">
                     {data?.branches?.length ? data.branches.map((b, i) => (
                       <tr key={i} className="hover:bg-white/[0.02]">
                         <td className="py-4 pl-4 font-mono font-bold text-blue-400">{b.branch_code}</td>
                         <td className="py-4 font-medium text-slate-200">{b.region}</td>
                         <td className="py-4">
                           <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-400">Active</span>
                         </td>
                       </tr>
                     )) : (
                       <tr><td colSpan={3} className="py-8 text-center text-slate-500">No branch data available.</td></tr>
                     )}
                   </tbody>
                 </table>
               </div>
            )}
          </TabsContent>

          <TabsContent value="merchants" className="rounded-[2rem] border border-slate-800 bg-[#0b2236] p-6 shadow-xl">
            <h2 className="text-xl font-bold text-white">Key Accounts & Merchants</h2>
            <p className="mt-2 text-sm text-slate-400">Merchant data table will render here...</p>
          </TabsContent>
        </Tabs>

        {/* --- Footer --- */}
        <footer className="flex items-center gap-4 rounded-[2rem] border border-slate-800 bg-[#0b2236] p-6">
          <ShieldCheck className="h-8 w-8 text-blue-500" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Authorized Personnel Only</p>
            <p className="text-xs text-slate-400">Britium Express Corporate Portal • Live Data Mode</p>
          </div>
        </footer>

      </div>
    </div>
  );
}

// --- Reusable UI Components ---

function KpiCard({ title, value, icon: Icon, color, bg }: any) {
  return (
    <div className="flex flex-col justify-between rounded-[2rem] border border-slate-800 bg-[#0b2236] p-6 shadow-xl transition-transform hover:-translate-y-1">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">{title}</p>
        <div className={`rounded-xl p-2 ${bg}`}><Icon className={`h-5 w-5 ${color}`} /></div>
      </div>
      <p className="mt-4 text-3xl font-black text-white">{value ?? "-"}</p>
    </div>
  );
}

function TabButton({ id, label, active }: { id: string; label: string; active: string }) {
  const isActive = id === active;
  return (
    <TabsTrigger 
      value={id}
      className={`rounded-xl px-5 py-2.5 text-sm font-bold transition-all data-[state=active]:bg-[#f6b84b] data-[state=active]:text-[#061524] ${!isActive && 'bg-[#0b2236] border border-slate-800 text-slate-400 hover:text-white'}`}
    >
      {label}
    </TabsTrigger>
  );
}