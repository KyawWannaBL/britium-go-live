import React, { useState, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Wallet, Download, RefreshCw, CheckCircle2 } from "lucide-react";
import { loadRiderCommissionSettlement, loadDriverHelperCommissionSettlement } from "@/lib/commissionApi";

export default function WorkforceCommissionPage() {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [ledger, setLedger] = useState([]);
  const [stats, setStats] = useState(null);

  const fetchPayouts = async () => {
    setLoading(true);
    try {
      // Fetch both Rider and Driver/Helper Settlements
      const [riderData, driverData] = await Promise.all([
        loadRiderCommissionSettlement(null),
        loadDriverHelperCommissionSettlement("finance@britiumexpress.com")
      ]);

      if (riderData?.ok) {
        // Combine rows from the unified snapshot
        setLedger([...(riderData.rows || []), ...(driverData?.rows || [])]);
        setStats({
           total_commission: (riderData.stats?.total_commission || 0) + (driverData.stats?.total_commission || 0),
           total_jobs: riderData.stats?.jobs || 0
        });
      }
    } catch (error) {
      console.error(error);
      alert("Failed to sync payouts from backend.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayouts();
  }, []);

  const filtered = ledger.filter(l => !search || l.assignee_name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen bg-[#061524] p-6 md:p-8 text-[#eef8ff]">
      <div className="mx-auto max-w-[1600px] space-y-6">
        
        <header className="rounded-[2rem] border border-[#1a3a5c] bg-[#0b2236] p-8 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#22c55e]/30 bg-[#22c55e]/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#22c55e] mb-3">
              <Wallet className="h-3.5 w-3.5" />
              <span>{t('Finance', 'ငွေစာရင်း')}</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white m-0"><span>{t('Workforce Commission', 'ဝန်ထမ်း လစာနှင့် ခံစားခွင့်')}</span></h1>
            <p className="mt-2 max-w-3xl text-[14px] font-semibold text-[#4d7a9b] leading-relaxed">
              Total Commission: <span className="text-[#f6b84b]">{stats?.total_commission?.toLocaleString() || 0} MMK</span> for today.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={fetchPayouts} className="flex h-12 items-center gap-2 rounded-xl bg-[#f6b84b] hover:bg-[#e5a93a] px-6 text-[12px] font-black uppercase tracking-wider text-[#061524] transition-colors cursor-pointer">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> 
              <span>{t('Sync Payouts', 'အချက်အလက် ရယူမည်')}</span>
            </button>
          </div>
        </header>

        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl shadow-xl overflow-hidden min-h-[500px] flex flex-col">
          <div className="p-6 border-b border-[#1a3a5c] bg-[#081b2e] flex justify-between items-center">
            <h2 className="text-[16px] font-bold text-white m-0">{t('Earnings Ledger', 'ရပိုင်ခွင့် စာရင်း')}</h2>
            <input 
              value={search} onChange={(e) => setSearch(e.target.value)} 
              placeholder="Search Name..."
              className="w-[300px] bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-3 px-4 text-[13px] outline-none focus:border-[#f6b84b]"
            />
          </div>
          
          <div className="flex-1 overflow-x-auto bg-[#061524]">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead className="bg-[#081b2e] sticky top-0 shadow-sm z-10">
                <tr>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase border-b border-[#1a3a5c]">Name / Email</th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase border-b border-[#1a3a5c]">Role</th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase border-b border-[#1a3a5c]">Operation Type</th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase border-b border-[#1a3a5c]">Total Units</th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase border-b border-[#1a3a5c]">Rate (MMK)</th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase border-b border-[#1a3a5c] text-right text-[#22c55e]">Total Commission</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, idx) => (
                  <tr key={idx} className="hover:bg-[#1a3a5c]/30 border-b border-[#1a3a5c]/50">
                    <td className="p-4 font-bold text-white text-[13px]">
                      {row.assignee_name} <br/>
                      <span className="text-xs text-[#4d7a9b]">{row.assignee_email}</span>
                    </td>
                    <td className="p-4 text-[#c8dff0] text-[12px] font-bold">{row.role_code}</td>
                    <td className="p-4 text-[#c8dff0] text-[12px] font-bold">{row.operation_type}</td>
                    <td className="p-4 text-white text-[13px] font-mono">{row.total_units} {row.unit_type}s</td>
                    <td className="p-4 text-[#38bdf8] text-[13px] font-mono">{row.rate_mmk}</td>
                    <td className="p-4 text-[#22c55e] font-black text-[14px] font-mono text-right">
                      {row.commission_mmk.toLocaleString()} Ks
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="p-16 text-center text-[#4d7a9b] font-medium">No ledger records found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}