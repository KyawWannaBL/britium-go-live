import React, { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Megaphone, Users, Store, Target, TrendingUp, Search, Download, ClipboardList, Phone, MapPin, CheckCircle2 } from "lucide-react";

export default function MarketingPortalPage() {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  // In production, wire this to your backend
  const leads = [
    { id: "L-001", type: "Merchant", name: "Shwe Mart", phone: "09 77111222", township: "Kamayut", source: "FIELD_VISIT", status: "Qualified" },
    { id: "L-002", type: "Customer", name: "Daw Mya", phone: "09 88222333", township: "Hlaing", source: "FACEBOOK", status: "New" },
  ];

  const filtered = leads.filter(l => !search || l.name.toLowerCase().includes(search.toLowerCase()) || l.phone.includes(search));

  return (
    <div className="min-h-screen bg-[#061524] p-6 md:p-8 text-[#eef8ff] font-['Inter','Pyidaungsu'] notranslate" translate="no">
      <div className="mx-auto max-w-[1600px] space-y-6">
        
        {/* HEADER */}
        <header className="rounded-[2rem] border border-[#1a3a5c] bg-[#0b2236] p-8 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#ff4f86]/30 bg-[#ff4f86]/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#ff4f86] mb-3">
              <Megaphone className="h-3.5 w-3.5" />
              <span>{t('Marketing & Growth', 'စျေးကွက်နှင့် စီးပွားရေး တိုးတက်မှု')}</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white m-0"><span>{t('Marketing Portal', 'စျေးကွက်ရှာဖွေရေး စင်တာ')}</span></h1>
            <p className="mt-2 max-w-3xl text-[14px] font-semibold text-[#4d7a9b] leading-relaxed">
              <span>{t('Lead generation, merchant onboarding, KPI tracking, and campaign planning.', 'Lead ရှာဖွေခြင်း၊ စျေးကွက် ရည်မှန်းချက်များနှင့် လုပ်ငန်းအစီအစဉ်များ စီမံခြင်း။')}</span>
            </p>
          </div>
          <button className="flex h-12 items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#081b2e] hover:bg-[#1a3a5c] px-5 text-[12px] font-black uppercase tracking-wider text-[#c8dff0] transition-colors cursor-pointer">
            <Download size={16} /> <span>{t('Export Data', 'အချက်အလက် ထုတ်ယူမည်')}</span>
          </button>
        </header>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard title={t('Total Leads', 'စုစုပေါင်း Lead များ')} value="45" icon={Users} color="#38bdf8" />
          <KpiCard title={t('Merchant Leads', 'ကုန်သည် Lead များ')} value="28" icon={Store} color="#f6b84b" />
          <KpiCard title={t('Customer Leads', 'ဖောက်သည် Lead များ')} value="17" icon={Megaphone} color="#a855f7" />
          <KpiCard title={t('Conversions', 'အောင်မြင်မှုများ')} value="12" icon={TrendingUp} color="#22c55e" />
        </div>

        {/* TABS */}
        <div className="flex flex-wrap gap-3 border-b border-[#1a3a5c] pb-4">
          <button onClick={() => setActiveTab("overview")} className={`px-6 py-3 rounded-2xl text-[13px] font-black transition-colors ${activeTab === "overview" ? "bg-[#38bdf8] text-[#061524]" : "bg-[#0b2236] text-[#c8dff0] border border-[#1a3a5c] hover:bg-[#1a3a5c]"}`}>
            <span>{t('Overview', 'အကျဉ်းချုပ်')}</span>
          </button>
          <button onClick={() => setActiveTab("registry")} className={`px-6 py-3 rounded-2xl text-[13px] font-black transition-colors ${activeTab === "registry" ? "bg-[#38bdf8] text-[#061524]" : "bg-[#0b2236] text-[#c8dff0] border border-[#1a3a5c] hover:bg-[#1a3a5c]"}`}>
            <span>{t('Lead Registry', 'Lead မှတ်တမ်း')}</span>
          </button>
        </div>

        {/* OVERVIEW CONTENT */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-in fade-in duration-300">
            <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-6 shadow-xl">
              <h2 className="text-[16px] font-bold text-white border-b border-[#1a3a5c] pb-4 mb-4"><span>{t('Lead Pipeline Overview', 'Lead လုပ်ငန်းစဉ် အကျဉ်းချုပ်')}</span></h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#061524] border border-[#1a3a5c] rounded-2xl p-5">
                  <div className="text-[10px] font-black uppercase text-[#4d7a9b] mb-2"><span>{t('Qualified Leads', 'အရည်အချင်းပြည့်မီသော')}</span></div>
                  <div className="text-3xl font-black text-white"><span>9</span></div>
                </div>
                <div className="bg-[#061524] border border-[#1a3a5c] rounded-2xl p-5">
                  <div className="text-[10px] font-black uppercase text-[#4d7a9b] mb-2"><span>{t('Follow Ups', 'ဆက်လက်လုပ်ဆောင်ရန်')}</span></div>
                  <div className="text-3xl font-black text-[#f6b84b]"><span>6</span></div>
                </div>
                <div className="bg-[#061524] border border-[#1a3a5c] rounded-2xl p-5">
                  <div className="text-[10px] font-black uppercase text-[#4d7a9b] mb-2"><span>{t('Target Parcels', 'ပစ်မှတ် (ပါဆယ်)')}</span></div>
                  <div className="text-3xl font-black text-[#38bdf8] font-mono"><span>1,250</span></div>
                </div>
                <div className="bg-[#061524] border border-[#1a3a5c] rounded-2xl p-5">
                  <div className="text-[10px] font-black uppercase text-[#4d7a9b] mb-2"><span>{t('Actual Parcels', 'ရရှိသော (ပါဆယ်)')}</span></div>
                  <div className="text-3xl font-black text-[#22c55e] font-mono"><span>894</span></div>
                </div>
              </div>
            </div>

            <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-6 shadow-xl">
              <h2 className="text-[16px] font-bold text-white border-b border-[#1a3a5c] pb-4 mb-4"><span>{t('Today’s Focus', 'ယနေ့ အဓိကလုပ်ဆောင်ရန်')}</span></h2>
              <div className="space-y-3">
                <div className="bg-[#061524] border border-[#1a3a5c] rounded-2xl p-4 flex gap-3 text-[13px] font-medium text-[#c8dff0]">
                  <Target className="shrink-0 text-[#f6b84b]" size={18} />
                  <span>{t('Visit 8 priority merchants in Kamayut and Hlaing.', 'ကမာရွတ်နှင့် လှိုင်ရှိ ကုန်သည် ၈ ဦးထံ သွားရောက်ရန်။')}</span>
                </div>
                <div className="bg-[#061524] border border-[#1a3a5c] rounded-2xl p-4 flex gap-3 text-[13px] font-medium text-[#c8dff0]">
                  <ClipboardList className="shrink-0 text-[#38bdf8]" size={18} />
                  <span>{t('Submit end-of-day report with lead sources and blockers.', 'နေ့စဉ် လုပ်ငန်းအစီရင်ခံစာ တင်ပြရန်။')}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* REGISTRY CONTENT */}
        {activeTab === "registry" && (
          <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl shadow-xl overflow-hidden min-h-[500px] flex flex-col animate-in fade-in duration-300">
            <div className="p-6 border-b border-[#1a3a5c] bg-[#081b2e] flex flex-col md:flex-row gap-4 justify-between items-center">
              <h2 className="text-[16px] font-bold text-white m-0"><span>{t('Current Leads', 'လက်ရှိ Lead များ')}</span></h2>
              <div className="relative w-full md:w-[350px]">
                <Search size={16} className="absolute left-4 top-3.5 text-[#4d7a9b]" />
                <input 
                  value={search} onChange={(e) => setSearch(e.target.value)} 
                  placeholder={t('Search Leads...', 'ရှာဖွေရန်...')}
                  className="w-full bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-3 pl-11 pr-4 text-[13px] outline-none focus:border-[#f6b84b]"
                />
              </div>
            </div>
            <div className="flex-1 overflow-x-auto bg-[#061524] p-6 space-y-4">
              {filtered.map(row => (
                <div key={row.id} className="bg-[#081b2e] border border-[#1a3a5c] rounded-2xl p-5 hover:border-[#4d7a9b] transition-colors">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="font-black text-[16px] text-white"><span>{row.name}</span></div>
                    <span className="bg-[#38bdf8]/10 border border-[#38bdf8]/30 text-[#38bdf8] px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                      <span>{row.status}</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-[13px] text-[#c8dff0] font-medium">
                    <span className="flex items-center gap-1.5"><Phone size={14} className="text-[#4d7a9b]" /> <span>{row.phone}</span></span>
                    <span className="flex items-center gap-1.5"><MapPin size={14} className="text-[#4d7a9b]" /> <span>{row.township}</span></span>
                    <span className="flex items-center gap-1.5 text-[#f6b84b]"><span>{row.source}</span></span>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="text-center p-10 text-[#4d7a9b] font-bold"><span>{t('No leads found.', 'ရှာဖွေမှု မတွေ့ရှိပါ။')}</span></div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ title, value, icon: Icon, color }: any) {
  return (
    <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-3xl shadow-lg relative overflow-hidden group">
      <div className="absolute -right-4 -top-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
        <Icon size={100} color={color} />
      </div>
      <div className="flex items-center justify-between mb-3 relative z-10">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#4d7a9b]"><span>{title}</span></span>
        <Icon size={16} color={color} />
      </div>
      <div className="text-3xl font-black relative z-10 text-white"><span>{value}</span></div>
    </div>
  );
}