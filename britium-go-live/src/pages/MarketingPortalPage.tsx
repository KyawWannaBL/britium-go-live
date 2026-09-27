import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Megaphone, Users, Store, Target, TrendingUp, Search, Download, ClipboardList, Phone, MapPin, CheckCircle2 } from "lucide-react";

export default function MarketingPortalPage() {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [merchantRows, setMerchantRows] = useState<any[]>([]);
  const [merchantSearch, setMerchantSearch] = useState("");
  const [merchantStatus, setMerchantStatus] = useState("");
  const [merchantMessage, setMerchantMessage] = useState("");
  const [merchantBusy, setMerchantBusy] = useState(false);
  const [merchantForm, setMerchantForm] = useState({
    merchant_code: "", merchant_name: "", business_type: "", contact_person: "",
    phone_primary: "", phone_secondary: "", email: "", address_mm: "", address_line_1: "",
    township: "", city: "", region_state: "", customer_tier: "STANDARD",
    payment_profile: "COD", service_profile: "STANDARD", status: "ACTIVE",
  });

  async function loadMerchantAccounts() {
    const { data, error } = await (supabase as any).rpc("be_marketing_merchant_master_center_v1", {
      p_search: merchantSearch.trim() || null,
      p_status: merchantStatus || null,
      p_limit: 1000,
    });
    if (error) return setMerchantMessage(error.message);
    if (data?.ok === false) return setMerchantMessage(data?.code || "Unable to load merchant accounts.");
    setMerchantRows(Array.isArray(data?.rows) ? data.rows : []);
  }

  async function saveMerchant() {
    setMerchantBusy(true);
    setMerchantMessage("");
    try {
      const { data, error } = await (supabase as any).rpc("be_marketing_merchant_master_upsert_v1", { p_payload: merchantForm });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.code || "Merchant update failed.");
      setMerchantMessage(String(data.merchant_code) + ": merchant account synchronized across Britium Express.");
      await loadMerchantAccounts();
    } catch (e: any) {
      setMerchantMessage(e?.message || "Merchant update failed.");
    } finally {
      setMerchantBusy(false);
    }
  }

  useEffect(() => {
    if (activeTab === "merchants") void loadMerchantAccounts();
  }, [activeTab]);

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
          <button onClick={() => setActiveTab("merchants")} className={activeTab === "merchants" ? "px-6 py-3 rounded-2xl text-[13px] font-black bg-[#22c55e] text-[#061524]" : "px-6 py-3 rounded-2xl text-[13px] font-black bg-[#0b2236] text-[#c8dff0] border border-[#1a3a5c] hover:bg-[#1a3a5c]"}>
            <span>{t('Merchant Accounts', 'Merchant Account များ')}</span>
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

        {activeTab === "merchants" && (
          <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-6">
            <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-6 shadow-xl">
              <h2 className="text-lg font-black text-white">Create / Update Merchant Account</h2>
              <p className="text-xs text-[#4d7a9b] mt-1 mb-4">After contract execution. Merchant Code must be exactly 3 alphanumeric characters and becomes the canonical Merchant ID.</p>
              {merchantMessage && <div className="mb-4 rounded-xl border border-[#22c55e]/30 bg-[#22c55e]/10 p-3 text-sm font-bold text-[#86efac]">{merchantMessage}</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  ["merchant_code","Merchant Code (3 chars)"],["merchant_name","Merchant Name"],["business_type","Business Type"],["contact_person","Contact Person"],
                  ["phone_primary","Primary Phone"],["phone_secondary","Secondary Phone"],["email","Email"],["township","Township"],["city","City"],["region_state","Region / State"],
                  ["address_line_1","Pickup Address"],["address_mm","Myanmar Address"]
                ].map(([key,label]) => (
                  <label key={key} className="text-xs font-bold text-[#c8dff0]">
                    <span className="block mb-1">{label}</span>
                    <input value={(merchantForm as any)[key]} maxLength={key==="merchant_code"?3:undefined}
                      onChange={(e)=>setMerchantForm({...merchantForm,[key]:key==="merchant_code"?e.target.value.toUpperCase():e.target.value})}
                      className="w-full h-11 rounded-xl bg-[#061524] border border-[#1a3a5c] px-3 text-white outline-none focus:border-[#22c55e]" />
                  </label>
                ))}
                <label className="text-xs font-bold text-[#c8dff0]"><span className="block mb-1">Tier</span><select value={merchantForm.customer_tier} onChange={(e)=>setMerchantForm({...merchantForm,customer_tier:e.target.value})} className="w-full h-11 rounded-xl bg-[#061524] border border-[#1a3a5c] px-3 text-white"><option>STANDARD</option><option>ROYAL</option><option>COMMITMENT</option></select></label>
                <label className="text-xs font-bold text-[#c8dff0]"><span className="block mb-1">Payment Profile</span><select value={merchantForm.payment_profile} onChange={(e)=>setMerchantForm({...merchantForm,payment_profile:e.target.value})} className="w-full h-11 rounded-xl bg-[#061524] border border-[#1a3a5c] px-3 text-white"><option>COD</option><option>PREPAID</option><option>CREDIT</option></select></label>
                <label className="text-xs font-bold text-[#c8dff0]"><span className="block mb-1">Service Profile</span><select value={merchantForm.service_profile} onChange={(e)=>setMerchantForm({...merchantForm,service_profile:e.target.value})} className="w-full h-11 rounded-xl bg-[#061524] border border-[#1a3a5c] px-3 text-white"><option>STANDARD</option><option>EXPRESS</option><option>DEDICATED</option></select></label>
                <label className="text-xs font-bold text-[#c8dff0]"><span className="block mb-1">Status</span><select value={merchantForm.status} onChange={(e)=>setMerchantForm({...merchantForm,status:e.target.value})} className="w-full h-11 rounded-xl bg-[#061524] border border-[#1a3a5c] px-3 text-white"><option>ACTIVE</option><option>SUSPENDED</option><option>INACTIVE</option></select></label>
              </div>
              <button disabled={merchantBusy || merchantForm.merchant_code.length!==3 || !merchantForm.merchant_name.trim()} onClick={()=>void saveMerchant()} className="mt-5 w-full h-12 rounded-xl bg-[#22c55e] text-[#061524] font-black disabled:opacity-40">{merchantBusy?"Synchronizing...":"Save + Synchronize Merchant"}</button>
            </div>
            <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-6 shadow-xl">
              <div className="flex flex-wrap justify-between gap-3 mb-4">
                <div><h2 className="text-lg font-black text-white">Merchant Master</h2><p className="text-xs text-[#4d7a9b]">Live Supabase master used across the application.</p></div>
                <div className="flex gap-2">
                  <input value={merchantSearch} onChange={(e)=>setMerchantSearch(e.target.value)} placeholder="Search" className="h-10 rounded-xl bg-[#061524] border border-[#1a3a5c] px-3 text-white text-xs" />
                  <select value={merchantStatus} onChange={(e)=>setMerchantStatus(e.target.value)} className="h-10 rounded-xl bg-[#061524] border border-[#1a3a5c] px-3 text-white text-xs"><option value="">All</option><option>ACTIVE</option><option>SUSPENDED</option><option>INACTIVE</option></select>
                  <button onClick={()=>void loadMerchantAccounts()} className="h-10 px-4 rounded-xl bg-[#1a3a5c] text-white text-xs font-black">Refresh</button>
                </div>
              </div>
              <div className="space-y-2 max-h-[760px] overflow-auto">
                {merchantRows.map((m:any)=>(
                  <button key={m.merchant_code} onClick={()=>setMerchantForm({...merchantForm,...m,merchant_code:m.merchant_code||"",merchant_name:m.merchant_name||"",status:m.status||"ACTIVE"})} className="w-full text-left rounded-2xl border border-[#1a3a5c] bg-[#061524] p-4 hover:border-[#22c55e]">
                    <div className="flex justify-between"><div><div className="font-mono font-black text-[#22c55e]">{m.merchant_code}</div><div className="font-bold text-white">{m.merchant_name}</div></div><span className="text-[10px] font-black text-[#c8dff0]">{m.status}</span></div>
                    <div className="mt-2 text-xs text-[#4d7a9b]">{m.contact_person||"—"} · {m.phone_primary||"—"} · {[m.township,m.city,m.region_state].filter(Boolean).join(", ")||"—"}</div>
                  </button>
                ))}
                {merchantRows.length===0 && <div className="p-10 text-center text-[#4d7a9b]">No merchant records.</div>}
              </div>
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