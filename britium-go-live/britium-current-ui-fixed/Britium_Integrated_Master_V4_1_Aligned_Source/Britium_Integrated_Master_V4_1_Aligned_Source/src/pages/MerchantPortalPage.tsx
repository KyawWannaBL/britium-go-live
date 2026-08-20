import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Briefcase, Package, Search } from "lucide-react";

const translations = {
  en: {
    title: "Merchant Portal",
    subtitle: "Pickup requests, tracking, and COD statements.",
    newRequest: "New Pickup Request",
    metrics: {
      active: "Active Shipments",
      success: "Successful Deliveries",
      cod: "COD Balance Pending"
    },
    recentShipments: "Recent Shipments",
    searchField: "Tracking No...",
    table: {
      tracking: "Tracking No",
      recipient: "Recipient",
      amount: "COD Amount",
      status: "Status"
    },
    noShipments: "No recent shipments."
  },
  my: {
    title: "ကုန်သည် ပေါ်တယ်",
    subtitle: "ပစ္စည်းလာယူရန် တောင်းဆိုမှုများ၊ ခြေရာခံခြင်းနှင့် COD ရှင်းတမ်းများ။",
    newRequest: "ပစ္စည်းလာယူရန် တောင်းဆိုမည်",
    metrics: {
      active: "ပို့ဆောင်ဆဲ ပစ္စည်းများ",
      success: "အောင်မြင်စွာ ပို့ဆောင်ပြီး",
      cod: "ရရန်ကျန်ရှိသော COD"
    },
    recentShipments: "လတ်တလော ပို့ဆောင်မှုများ",
    searchField: "ခြေရာခံအမှတ်...",
    table: {
      tracking: "ခြေရာခံအမှတ်",
      recipient: "လက်ခံမည့်သူ",
      amount: "COD ပမာဏ",
      status: "အခြေအနေ"
    },
    noShipments: "လတ်တလော ပို့ဆောင်မှုများ မရှိပါ။"
  }
};

export default function MerchantPortalPage() {
  const t = translations.en;

  const [data, setData] = useState<any>({ shipments: [], metrics: {} });
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: res } = await supabase.rpc("be_get_merchant_dashboard");
      if (res) setData(res);
    } catch (e) {} finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  return (
    <div className="min-h-screen bg-[#061524] p-6 md:p-8 text-[#eef8ff] font-['Poppins',sans-serif]">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <header className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-3xl flex justify-between items-center shadow-xl">
          <div>
            <h1 className="text-2xl font-black flex items-center gap-3"><Briefcase className="text-[#38bdf8]"/> {t.title}</h1>
            <p className="text-[#4d7a9b] text-sm mt-1">{t.subtitle}</p>
          </div>
          <button className="bg-[#38bdf8] text-[#061524] px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2">
            <Package size={16}/> {t.newRequest}
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl shadow-lg">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#4d7a9b] mb-2">{t.metrics.active}</div>
            <div className="text-3xl font-black text-[#f6b84b]">{data.metrics?.active_shipments || 0}</div>
          </div>
          <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl shadow-lg">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#4d7a9b] mb-2">{t.metrics.success}</div>
            <div className="text-3xl font-black text-[#22c55e]">{data.metrics?.successful_deliveries || 0}</div>
          </div>
          <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-2xl shadow-lg">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#4d7a9b] mb-2">{t.metrics.cod}</div>
            <div className="text-3xl font-black text-[#38bdf8]">{data.metrics?.cod_balance || "0 MMK"}</div>
          </div>
        </div>

        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-6 shadow-xl min-h-[500px]">
          <div className="flex justify-between items-center mb-6 border-b border-[#1a3a5c] pb-4">
            <h2 className="text-lg font-black text-white">{t.recentShipments}</h2>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-[#4ea8de]" size={16}/>
              <input field={t.searchField} className="bg-[#061524] border border-[#1a3a5c] rounded-lg py-2 pl-9 pr-3 text-sm outline-none focus:border-[#f6b84b] text-white"/>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[#4d7a9b] uppercase tracking-wider text-[11px] bg-[#081b2e]">
                <tr>
                  <th className="p-3">{t.table.tracking}</th>
                  <th className="p-3">{t.table.recipient}</th>
                  <th className="p-3">{t.table.amount}</th>
                  <th className="p-3">{t.table.status}</th>
                </tr>
              </thead>
              <tbody>
                {(data.shipments || []).length === 0 ? <tr><td colSpan={4} className="text-center p-10 text-[#4d7a9b]">{t.noShipments}</td></tr> :
                  data.shipments.map((s: any, i: number) => (
                    <tr key={i} className="border-b border-[#1a3a5c] hover:bg-[#061524]">
                      <td className="p-3 font-bold text-[#f6b84b]">{s.tracking_no}</td>
                      <td className="p-3 text-white">{s.recipient_name}</td>
                      <td className="p-3 font-mono">{s.cod_amount} MMK</td>
                      <td className="p-3 text-emerald-400 font-bold">{s.status}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
