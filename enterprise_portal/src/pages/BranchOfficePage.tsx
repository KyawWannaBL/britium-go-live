import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Building2, MapPin, ShieldAlert, Users, Truck, DollarSign, RefreshCw, Lock } from "lucide-react";

export default function BranchOfficePage() {
  const { t } = useLanguage();
  const [activeBranch, setActiveBranch] = useState("YGN");
  const [loading, setLoading] = useState(false);
  const [shipments, setShipments] = useState<any[]>([]);

  async function loadData(branchCode: string) {
    setLoading(true);
    try {
      // Simulate branch filtering based on standard DB structure
      const { data } = await supabase
        .from('be_portal_pickup_request_items')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (data) {
        // Simple client side filtering for demo purposes of the branch view
        if (branchCode === 'MDY') setShipments(data.filter(d => String(d.pickup_city).includes('Mandalay')));
        else if (branchCode === 'NPT') setShipments(data.filter(d => String(d.pickup_city).includes('Naypyitaw')));
        else setShipments(data); // YGN sees all/own
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(activeBranch); }, [activeBranch]);

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6 notranslate" translate="no">
      
      {/* HEADER */}
      <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="text-[#f6b84b] text-[11px] font-bold uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            <Building2 size={14}/> <span>{t('Regional Operations', 'ဒေသတွင်း လုပ်ငန်းစဉ်များ')}</span>
          </div>
          <h1 className="text-2xl font-bold text-white m-0"><span>{t('Branch Office Management', 'ရုံးခွဲ စီမံခန့်ခွဲမှု')}</span></h1>
          <p className="text-[#4d7a9b] text-[14px] mt-1 m-0 max-w-2xl">
            <span>{t('Self-contained branch operations under Yangon Head Office authority. Master data and finance are locked for HO approval.', 'ရန်ကုန် ရုံးချုပ်၏ ကွပ်ကဲမှုအောက်ရှိ ရုံးခွဲများ၏ လုပ်ငန်းစဉ်များ။ ဘဏ္ဍာရေးနှင့် အခြေခံအချက်အလက်များကို ရုံးချုပ်မှသာ ပြင်ဆင်ခွင့်ရှိသည်။')}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select 
            value={activeBranch} 
            onChange={(e) => setActiveBranch(e.target.value)}
            className="bg-[#061524] border border-[#1a3a5c] text-white px-4 py-3 rounded-xl text-[14px] font-bold outline-none focus:border-[#f6b84b] cursor-pointer"
          >
            <option value="YGN">YGN - Yangon (HQ)</option>
            <option value="MDY">MDY - Mandalay Branch</option>
            <option value="NPT">NPT - Naypyitaw Branch</option>
          </select>
          <button onClick={() => loadData(activeBranch)} disabled={loading} className="bg-[#1a3a5c] hover:bg-[#0f2a42] border border-[#1a3a5c] text-[#c8dff0] px-4 py-3 rounded-xl flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider transition-colors cursor-pointer">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''}/>
          </button>
        </div>
      </div>

      {/* AUTHORITY LOCK BANNER */}
      <div className="flex items-center gap-3 bg-[#f59e0b]/10 border border-[#f59e0b]/30 p-4 rounded-2xl text-[#f59e0b]">
        <ShieldAlert size={24} className="shrink-0" />
        <div className="text-[13px] leading-relaxed">
          <strong className="font-black uppercase tracking-wider"><span>{t('Head Office Authority Lock Active', 'ရုံးချုပ် ကွပ်ကဲမှုစနစ် အသက်ဝင်နေပါသည်')}</span></strong><br/>
          <span className="text-[#f59e0b]/80 font-medium">
            <span>{t('Branch managers can view local shipments and assign local riders. All tariff, finance, and master data changes must be requested through YGN HQ.', 'ရုံးခွဲမန်နေဂျာများသည် ကုန်ပစ္စည်းများနှင့် ပို့ဆောင်သူများကိုသာ စီမံနိုင်ပြီး၊ ဘဏ္ဍာရေးနှင့် စျေးနှုန်းပြောင်းလဲမှုများကို ရုံးချုပ်သို့ တောင်းဆိုရမည်။')}</span>
          </span>
        </div>
      </div>

      {/* BRANCH KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title={t('Active Shipments', 'ပို့ဆောင်ဆဲ')} value={shipments.length} icon={Truck} color="#38bdf8" />
        <KpiCard title={t('Local Workforce', 'ဝန်ထမ်းအင်အား')} value="24" icon={Users} color="#22c55e" />
        <KpiCard title={t('Pending HO Approval', 'ရုံးချုပ် အတည်ပြုရန်')} value="3" icon={Lock} color="#f59e0b" />
        <KpiCard title={t('Branch Revenue (MMK)', 'ရုံးခွဲ ဝင်ငွေ')} value="Locked" icon={DollarSign} color="#ff4f86" />
      </div>

      {/* SHIPMENTS LIST */}
      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl flex flex-col h-[500px] shadow-xl overflow-hidden">
        <div className="p-6 border-b border-[#1a3a5c] bg-[#081b2e] flex justify-between items-center">
          <h2 className="text-[16px] font-bold text-white m-0 flex items-center gap-2">
            <MapPin className="text-[#f6b84b]" size={18} /> 
            <span>{t(`${activeBranch} Branch Operations`, `${activeBranch} ရုံးခွဲ လုပ်ငန်းစဉ်များ`)}</span>
          </h2>
          <span className="bg-[#061524] text-[#4d7a9b] border border-[#1a3a5c] px-3 py-1 rounded-md text-[11px] font-bold">
            Read Only
          </span>
        </div>
        <div className="flex-1 overflow-x-auto bg-[#061524]">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="bg-[#081b2e] sticky top-0 shadow-sm">
              <tr>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Tracking', 'ခြေရာခံအမှတ်')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Merchant', 'ကုန်သည်')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Destination', 'ပို့ဆောင်မည့်နေရာ')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c] text-right"><span>{t('COD', 'ကောက်ခံငွေ')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Status', 'အခြေအနေ')}</span></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="p-16 text-center text-[#4d7a9b]"><RefreshCw className="animate-spin mx-auto" size={24}/></td></tr>
              ) : shipments.length === 0 ? (
                <tr><td colSpan={5} className="p-16 text-center text-[#4d7a9b] font-medium"><span>{t('No local shipments found.', 'ပို့ဆောင်မည့် စာရင်းမရှိပါ။')}</span></td></tr>
              ) : shipments.map((s, i) => (
                <tr key={i} className="hover:bg-[#1a3a5c]/30 transition-colors border-b border-[#1a3a5c]/50">
                  <td className="p-4 font-mono font-black text-[#f6b84b] text-[13px]"><span>{s.waybill_no}</span></td>
                  <td className="p-4 font-bold text-white text-[13px]"><span>{s.merchant_name}</span></td>
                  <td className="p-4 text-[#c8dff0] text-[13px] font-medium"><span>{s.delivery_township}</span></td>
                  <td className="p-4 text-[#22c55e] font-bold text-[13px] text-right"><span>{Number(s.cod_amount).toLocaleString()}</span></td>
                  <td className="p-4">
                    <span className="text-[10px] uppercase font-bold text-[#4d7a9b] bg-[#061524] px-2 py-1 rounded border border-[#1a3a5c]">
                      <span>{String(s.item_status).replace(/_/g, ' ')}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, value, icon: Icon, color }: any) {
  return (
    <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-3xl shadow-lg relative overflow-hidden group">
      <div className="absolute -right-4 -top-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
        <Icon size={100} color={color} />
      </div>
      <div className="text-[11px] font-bold text-[#4d7a9b] uppercase tracking-wider mb-2"><span>{title}</span></div>
      <div className="text-3xl font-black" style={{ color: color }}><span>{value}</span></div>
    </div>
  );
}