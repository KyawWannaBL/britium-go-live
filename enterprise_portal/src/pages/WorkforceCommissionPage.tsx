import React, { useState, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Wallet, DollarSign, Download, RefreshCw, CheckCircle2 } from "lucide-react";

export default function WorkforceCommissionPage() {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  // In production, wire to your rider_earnings_ledger table
  const ledger = [
    { id: "R-001", rider: "Ko Aung", shift: "2026-06-18", trips: 42, base: 21000, bonus: 5000, deduction: 0, net: 26000, status: "LOCKED" },
    { id: "R-002", rider: "U Min", shift: "2026-06-18", trips: 38, base: 19000, bonus: 3000, deduction: 1000, net: 21000, status: "PENDING" },
  ];

  const filtered = ledger.filter(l => !search || l.rider.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen bg-[#061524] p-6 md:p-8 text-[#eef8ff] font-['Inter','Pyidaungsu'] notranslate" translate="no">
      <div className="mx-auto max-w-[1600px] space-y-6">
        
        {/* HEADER */}
        <header className="rounded-[2rem] border border-[#1a3a5c] bg-[#0b2236] p-8 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#22c55e]/30 bg-[#22c55e]/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#22c55e] mb-3">
              <Wallet className="h-3.5 w-3.5" />
              <span>{t('Finance', 'ငွေစာရင်း')}</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white m-0"><span>{t('Workforce Commission', 'ဝန်ထမ်း လစာနှင့် ခံစားခွင့်')}</span></h1>
            <p className="mt-2 max-w-3xl text-[14px] font-semibold text-[#4d7a9b] leading-relaxed">
              <span>{t('Rider Earnings Ledger: Base Trip Pay + Bonus - Deductions. Locked when COD handover is verified.', 'ပို့ဆောင်သူများ၏ ရပိုင်ခွင့်များ (အခြေခံ + ဆုကြေး - ဖြတ်တောက်ငွေ)။ COD အပ်နှံပြီးမှသာ အတည်ပြုမည်။')}</span>
            </p>
          </div>
          <div className="flex gap-3">
            <button className="flex h-12 items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#081b2e] hover:bg-[#1a3a5c] px-5 text-[12px] font-black uppercase tracking-wider text-[#c8dff0] transition-colors cursor-pointer">
              <Download size={16} /> <span>{t('Export Ledger', 'စာရင်း ထုတ်ယူမည်')}</span>
            </button>
            <button onClick={() => setLoading(true)} className="flex h-12 items-center gap-2 rounded-xl bg-[#f6b84b] hover:bg-[#e5a93a] px-6 text-[12px] font-black uppercase tracking-wider text-[#061524] transition-colors shadow-lg shadow-[#f6b84b]/10 cursor-pointer">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> <span>{t('Sync Payouts', 'အချက်အလက် ရယူမည်')}</span>
            </button>
          </div>
        </header>

        {/* DATA TABLE */}
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl shadow-xl overflow-hidden min-h-[500px] flex flex-col">
          <div className="p-6 border-b border-[#1a3a5c] bg-[#081b2e] flex flex-col md:flex-row gap-4 justify-between items-center">
            <h2 className="text-[16px] font-bold text-white m-0"><span>{t('Rider Earnings Ledger', 'ပို့ဆောင်သူများ၏ ရပိုင်ခွင့် စာရင်း')}</span></h2>
            <input 
              value={search} onChange={(e) => setSearch(e.target.value)} 
              placeholder={t('Search Rider...', 'ရှာဖွေရန်...')}
              className="w-full md:w-[350px] bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-3 px-4 text-[13px] outline-none focus:border-[#f6b84b]"
            />
          </div>
          
          <div className="flex-1 overflow-x-auto bg-[#061524]">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead className="bg-[#081b2e] sticky top-0 shadow-sm z-10">
                <tr>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Rider', 'အမည်')}</span></th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Shift Date', 'ရက်စွဲ')}</span></th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Trips', 'ပို့ဆောင်မှု')}</span></th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c] text-right"><span>{t('Base Pay', 'အခြေခံရငွေ')}</span></th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c] text-right text-[#38bdf8]"><span>{t('Bonus', 'ဆုကြေး')}</span></th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c] text-right text-[#ff4f86]"><span>{t('Deduction', 'ဖြတ်တောက်ငွေ')}</span></th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c] text-right text-[#22c55e]"><span>{t('Net Payout', 'ထုတ်ပေးရန်ငွေ')}</span></th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Status', 'အခြေအနေ')}</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={row.id} className="hover:bg-[#1a3a5c]/30 transition-colors border-b border-[#1a3a5c]/50">
                    <td className="p-4 font-bold text-white text-[13px]"><span>{row.rider}</span> <span className="text-[#4d7a9b] text-[10px] ml-1">({row.id})</span></td>
                    <td className="p-4 text-[#c8dff0] text-[12px] font-mono"><span>{row.shift}</span></td>
                    <td className="p-4 font-bold text-white text-[13px]"><span>{row.trips}</span></td>
                    <td className="p-4 text-[#c8dff0] text-[13px] font-mono text-right"><span>{row.base.toLocaleString()} Ks</span></td>
                    <td className="p-4 text-[#38bdf8] font-bold text-[13px] font-mono text-right"><span>+{row.bonus.toLocaleString()} Ks</span></td>
                    <td className="p-4 text-[#ff4f86] font-bold text-[13px] font-mono text-right"><span>-{row.deduction.toLocaleString()} Ks</span></td>
                    <td className="p-4 text-[#22c55e] font-black text-[14px] font-mono text-right"><span>{row.net.toLocaleString()} Ks</span></td>
                    <td className="p-4">
                      <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded border ${row.status === 'LOCKED' ? 'bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/30' : 'bg-[#f6b84b]/10 text-[#f6b84b] border-[#f6b84b]/30'}`}>
                        <span>{row.status}</span>
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="p-16 text-center text-[#4d7a9b] font-medium"><span>{t('No ledger records found.', 'မှတ်တမ်းများ မရှိပါ။')}</span></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}