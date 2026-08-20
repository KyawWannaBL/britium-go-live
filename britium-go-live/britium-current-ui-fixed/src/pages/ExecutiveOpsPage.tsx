import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Gauge, Activity, Globe2 } from "lucide-react";

type Lang = "EN" | "MM";

const T = {
  EN: { access: "C-Suite Level Access", title: "Executive Operations Center", subtitle: "High-level visualization of enterprise performance.", kpis: ['Gross Revenue', 'Total Orders', 'Delivery Success Rate', 'Pending COD'] },
  MM: { access: "အမှုဆောင်အရာရှိ အဆင့် ဝင်ခွင့်", title: "အမှုဆောင်အရာရှိ စီမံခန့်ခွဲမှုဌာန", subtitle: "လုပ်ငန်းတစ်ခုလုံး၏ စွမ်းဆောင်ရည်ကို ခြုံငုံကြည့်ရှုရန်။", kpis: ['စုစုပေါင်း ဝင်ငွေ', 'အော်ဒါစုစုပေါင်း', 'အောင်မြင်စွာပို့ဆောင်မှု ရာခိုင်နှုန်း', 'ကောက်ခံရန်ကျန်ရှိသော COD'] }
};

export default function ExecutiveOpsPage() {
  const [lang, setLang] = useState<Lang>("EN");
  const t = T[lang];
  const [data, setData] = useState<any>({});

  const loadData = async () => {
    try {
      const { data: res } = await supabase.rpc("be_executive_dashboard");
      if (res) setData(res);
    } catch (e) {}
  };

  useEffect(() => { void loadData(); }, []);

  return (
    <div className="min-h-screen bg-[#061524] p-6 md:p-8 text-[#eef8ff] font-['Poppins',sans-serif]">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <header className="bg-gradient-to-r from-[#0b2236] to-[#0a1628] border border-[#1a3a5c] p-8 rounded-3xl shadow-2xl relative overflow-hidden flex justify-between items-start">
          <div className="absolute top-0 right-0 p-10 opacity-10"><Activity size={120} className="text-[#f6b84b]"/></div>
          <div className="relative z-10">
            <div className="text-[#f6b84b] text-[10px] font-black uppercase tracking-[0.3em] mb-2">{t.access}</div>
            <h1 className="text-3xl font-black flex items-center gap-3 text-white"><Gauge className="text-[#f6b84b]"/> {t.title}</h1>
            <p className="text-[#4d7a9b] text-sm mt-2 max-w-xl">{t.subtitle}</p>
          </div>
          <button onClick={() => setLang(lang === "EN" ? "MM" : "EN")} className="relative z-10 px-4 py-2 rounded-xl bg-[#123456] text-[#f6b84b] font-bold flex items-center gap-2"><Globe2 size={16}/> {lang}</button>
        </header>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {t.kpis.map((m, i) => (
             <div key={i} className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl shadow-lg">
               <div className="text-[10px] font-bold uppercase tracking-wider text-[#4d7a9b] mb-2">{m}</div>
               <div className="text-2xl font-black text-white">---</div>
             </div>
          ))}
        </div>
      </div>
    </div>
  );
}
