import React, { useEffect, useState } from "react";
import { ExternalLink, Globe2, MapPin, RefreshCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Lang = "EN" | "MM";

const T = {
  EN: {
    title: "Supervisor Live GPS Monitor",
    subtitle: "Monitor rider GPS capture, assigned pickup progress, and field movement.",
    refresh: "Refresh GPS",
    open: "Open Full Map",
    waiting: "Waiting for rider GPS",
    noRows: "No rider GPS rows yet",
  },
  MM: {
    title: "Supervisor Live GPS စောင့်ကြည့်မှု",
    subtitle: "Rider GPS၊ pickup progress နှင့် field movement များကို စောင့်ကြည့်ရန်။",
    refresh: "GPS ပြန်ဖတ်ရန်",
    open: "မြေပုံအပြည့်ဖွင့်ရန်",
    waiting: "Rider GPS စောင့်ဆိုင်းနေသည်",
    noRows: "Rider GPS မရှိသေးပါ",
  },
};

export default function SupervisorLiveGpsPage() {
  const [lang, setLang] = useState<Lang>("EN");
  const t = T[lang];
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc("be_get_supervisor_live_gps", { p_payload: {} });
    setLoading(false);
    if (error) {
      alert(error.message);
      return;
    }
    setData(data || {});
  }

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30000);
    return () => clearInterval(id);
  }, []);

  const stats = data?.stats || {};
  const rows = data?.gps_rows || [];

  return (
    <div className="min-h-screen bg-[#061524] text-[#eef8ff] font-['Poppins',sans-serif] p-8">
      <div className="flex justify-end mb-6">
        <button onClick={() => setLang(lang === "EN" ? "MM" : "EN")} className="px-4 py-2 rounded-xl bg-[#123456] border border-[#254b73] text-[#f6b84b] font-bold flex gap-2 items-center">
          <Globe2 size={16} /> {lang === "EN" ? "MM" : "EN"}
        </button>
      </div>

      <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-black text-white flex gap-2 items-center"><MapPin className="text-[#4ea8de]" /> {t.title}</h1>
            <p className="text-[#9fc4df] mt-2">{t.subtitle}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={load} className="px-4 py-3 rounded-xl bg-[#071a2b] border border-[#254b73] text-white font-bold flex gap-2 items-center">
              <RefreshCcw size={16} /> {loading ? "..." : t.refresh}
            </button>
            <button onClick={() => window.open("https://www.google.com/maps", "_blank")} className="px-4 py-3 rounded-xl bg-[#2477a6] text-white font-bold flex gap-2 items-center">
              <ExternalLink size={16} /> {t.open}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {[
            ["Monitor Jobs", stats.monitor_jobs || 0],
            ["GPS Available", stats.gps_available || 0],
            ["Live Now", stats.live_now || 0],
            ["Waiting GPS", stats.waiting_gps || 0],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-[#254b73] bg-[#071a2b] p-5">
              <div className="text-[#9fc4df] uppercase text-xs">{label}</div>
              <div className="text-[#f6b84b] text-2xl font-black mt-2">{String(value)}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">
          <div className="min-h-[360px] rounded-3xl border border-[#254b73] bg-[linear-gradient(#123456_1px,transparent_1px),linear-gradient(90deg,#123456_1px,transparent_1px)] bg-[size:36px_36px] flex items-center justify-center">
            {rows.length ? (
              <div className="grid grid-cols-2 gap-4">
                {rows.map((r: any) => (
                  <div key={r.rider_id} className="rounded-xl bg-[#061524] border border-[#4ea8de] p-4">
                    <div className="font-black text-[#f6b84b]">{r.rider_name || r.rider_id}</div>
                    <div className="text-[#9fc4df] text-sm">{r.latitude}, {r.longitude}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center">
                <MapPin className="mx-auto text-[#9fc4df] mb-4" size={42} />
                <div className="font-black text-white">{t.waiting}</div>
                <p className="text-[#9fc4df] mt-2">{t.noRows}</p>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-[#254b73] bg-[#071a2b] p-4">
            {rows.length === 0 ? (
              <div className="border border-dashed border-[#254b73] rounded-2xl p-10 text-center text-[#9fc4df]">{t.noRows}</div>
            ) : (
              rows.map((r: any) => (
                <div key={r.rider_id} className="rounded-xl border border-[#254b73] bg-[#061524] p-4 mb-3">
                  <div className="font-black text-[#f6b84b]">{r.rider_name || r.rider_id}</div>
                  <div className="text-[#9fc4df] text-sm">Pickup: {r.pickup_id || "-"}</div>
                  <div className="text-[#9fc4df] text-sm">Waybill: {r.delivery_way_id || "-"}</div>
                  <div className="text-[#9fc4df] text-sm">Captured: {r.captured_at}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}