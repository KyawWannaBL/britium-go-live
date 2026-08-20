import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Target, Globe2 } from "lucide-react";

type Lang = "EN" | "MM";

const T = {
  EN: { title: "BDM Command Center", subtitle: "Merchant pipelines, territory performance, and revenue forecasting.", newLead: "Add Lead", pipeline: "Merchant Pipeline", forecast: "Revenue Forecast", pipelineWait: "Pipeline connected via", forecastWait: "Awaiting contract data." },
  MM: { title: "စီးပွားရေးဖွံ့ဖြိုးမှု ဌာနချုပ်", subtitle: "ကုန်သည်အသစ်ရှာဖွေခြင်း၊ နယ်မြေအလိုက်စွမ်းဆောင်ရည်နှင့် ဝင်ငွေခန့်မှန်းချက်။", newLead: "အလားအလာရှိသူ ထည့်မည်", pipeline: "ကုန်သည်အသစ် ရှာဖွေမှုအခြေအနေ", forecast: "ဝင်ငွေခန့်မှန်းချက်", pipelineWait: "စနစ်နှင့်ချိတ်ဆက်ထားသည် -", forecastWait: "စာချုပ်အချက်အလက်များကို စောင့်ဆိုင်းနေပါသည်" }
};

export default function BusinessDevelopmentPortalPage() {
  const [lang, setLang] = useState<Lang>("EN");
  const t = T[lang];
  const [data, setData] = useState<any>({});

  const loadData = async () => {
    try {
      const { data: res } = await supabase.rpc("be_get_business_development_dashboard");
      if (res) setData(res);
    } catch (e) {}
  };

  useEffect(() => { void loadData(); }, []);

  return (
    <div className="min-h-screen bg-[#061524] p-6 md:p-8 text-[#eef8ff] font-['Poppins',sans-serif]">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <header className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-3xl flex justify-between items-center shadow-xl">
          <div><h1 className="text-2xl font-black flex items-center gap-3"><Target className="text-[#f6b84b]"/> {t.title}</h1><p className="text-[#4d7a9b] text-sm mt-1">{t.subtitle}</p></div>
          <div className="flex gap-3">
            <button onClick={() => setLang(lang === "EN" ? "MM" : "EN")} className="px-4 py-2 rounded-xl bg-[#123456] text-[#f6b84b] font-bold flex items-center gap-2"><Globe2 size={16}/> {lang}</button>
            <button className="bg-[#f6b84b] text-[#061524] px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2"><Target size={14}/> {t.newLead}</button>
          </div>
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-6 min-h-[300px] shadow-xl">
            <h2 className="text-[#38bdf8] font-black uppercase tracking-widest text-[13px] mb-4">{t.pipeline}</h2>
            <div className="text-center py-10 text-[#4d7a9b]">{t.pipelineWait} <code className="text-[#f6b84b]">be_bdm_action()</code></div>
          </div>
          <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-6 min-h-[300px] shadow-xl">
            <h2 className="text-[#22c55e] font-black uppercase tracking-widest text-[13px] mb-4">{t.forecast}</h2>
            <div className="text-center py-10 text-[#4d7a9b]">{t.forecastWait}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
