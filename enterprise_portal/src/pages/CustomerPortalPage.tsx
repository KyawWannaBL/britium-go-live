import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Search, MapPin, Package, Clock, ShieldCheck, RefreshCw, CheckCircle2 } from "lucide-react";

export default function CustomerPortalPage() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState("track");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [shipment, setShipment] = useState<any>(null);
  const [error, setError] = useState("");

  async function handleTrack(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim()) return;
    setLoading(true);
    setError("");
    setShipment(null);

    try {
      const { data, error: fetchErr } = await supabase
        .from('be_portal_pickup_request_items')
        .select('*')
        .eq('waybill_no', search.trim().toUpperCase())
        .single();

      if (fetchErr || !data) throw new Error("Parcel not found.");
      setShipment(data);
    } catch (err: any) {
      setError(t("Parcel not found for this tracking number.", "ဤခြေရာခံအမှတ်ဖြင့် ကုန်ပစ္စည်း မတွေ့ရှိပါ။"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#061524] p-6 md:p-8 text-[#eef8ff] font-['Inter','Pyidaungsu'] notranslate" translate="no">
      <div className="mx-auto max-w-[1200px] space-y-6">
        
        {/* HEADER */}
        <header className="rounded-[2rem] border border-[#1a3a5c] bg-[#0b2236] p-8 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#38bdf8]/30 bg-[#38bdf8]/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#38bdf8] mb-3">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>{t('Customer Portal', 'ဖောက်သည် ဝန်ဆောင်မှုစနစ်')}</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white m-0"><span>{t('Welcome to Britium Express', 'Britium Express မှ ကြိုဆိုပါသည်')}</span></h1>
            <p className="mt-2 max-w-3xl text-[14px] font-semibold text-[#4d7a9b] leading-relaxed">
              <span>{t('Track your parcels, manage your addresses, and view your shipment history.', 'သင်၏ ကုန်ပစ္စည်းများကို ခြေရာခံပြီး မှတ်တမ်းများကို ကြည့်ရှုပါ။')}</span>
            </p>
          </div>
        </header>

        {/* TABS */}
        <div className="flex flex-wrap gap-3 border-b border-[#1a3a5c] pb-4">
          <button onClick={() => setActiveTab("track")} className={`px-6 py-3 rounded-2xl text-[13px] font-black transition-colors ${activeTab === "track" ? "bg-[#38bdf8] text-[#061524]" : "bg-[#0b2236] text-[#c8dff0] border border-[#1a3a5c] hover:bg-[#1a3a5c]"}`}>
            <span>{t('Track Parcel', 'ကုန်ပစ္စည်း ခြေရာခံမည်')}</span>
          </button>
          <button onClick={() => setActiveTab("history")} className={`px-6 py-3 rounded-2xl text-[13px] font-black transition-colors ${activeTab === "history" ? "bg-[#38bdf8] text-[#061524]" : "bg-[#0b2236] text-[#c8dff0] border border-[#1a3a5c] hover:bg-[#1a3a5c]"}`}>
            <span>{t('My Shipments', 'ကျွန်ုပ်၏ မှတ်တမ်းများ')}</span>
          </button>
        </div>

        {/* TRACKING WORKSPACE */}
        {activeTab === "track" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-8 shadow-xl text-center max-w-2xl mx-auto">
              <Package className="mx-auto h-16 w-16 text-[#38bdf8] mb-4 opacity-80" />
              <h2 className="text-2xl font-black text-white mb-6"><span>{t('Track Your Parcel', 'ကုန်ပစ္စည်း ခြေရာခံမည်')}</span></h2>
              <form onSubmit={handleTrack} className="relative">
                <Search className="absolute left-5 top-4 text-[#4d7a9b]" size={20} />
                <input 
                  value={search} 
                  onChange={(e) => setSearch(e.target.value)} 
                  placeholder={t('Enter AWB / Tracking Number...', 'ခြေရာခံအမှတ် ရိုက်ထည့်ပါ...')}
                  className="w-full bg-[#061524] border-2 border-[#1a3a5c] text-white text-[16px] font-mono font-bold rounded-2xl py-4 pl-14 pr-32 outline-none focus:border-[#38bdf8] transition-colors"
                />
                <button type="submit" disabled={loading} className="absolute right-2 top-2 bottom-2 bg-[#38bdf8] text-[#061524] px-6 rounded-xl font-black uppercase tracking-wider hover:bg-[#0284c7] transition-colors disabled:opacity-50 cursor-pointer">
                  {loading ? <RefreshCw className="animate-spin" size={18} /> : <span>{t('Track', 'ရှာမည်')}</span>}
                </button>
              </form>
              {error && <div className="mt-4 text-[#ff4f86] font-bold text-[13px]"><span>{error}</span></div>}
            </div>

            {shipment && (
              <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-6 shadow-xl max-w-2xl mx-auto animate-in zoom-in-95">
                <div className="flex justify-between items-start border-b border-[#1a3a5c] pb-4 mb-4">
                  <div>
                    <div className="font-mono text-[18px] font-black text-[#f6b84b]"><span>{shipment.waybill_no}</span></div>
                    <div className="text-[12px] text-[#4d7a9b] mt-1"><span>{t('Created', 'စတင်ချိန်')} {new Date(shipment.created_at).toLocaleDateString()}</span></div>
                  </div>
                  <span className="bg-[#22c55e]/20 border border-[#22c55e]/30 text-[#22c55e] px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest">
                    <span>{String(shipment.item_status).replace(/_/g, ' ')}</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-[#061524] border border-[#1a3a5c] p-4 rounded-2xl">
                    <div className="text-[10px] font-black uppercase text-[#4d7a9b] mb-2"><span>{t('Sender', 'ပေးပို့သူ')}</span></div>
                    <div className="font-bold text-white text-[13px]"><span>{shipment.merchant_name || '-'}</span></div>
                  </div>
                  <div className="bg-[#061524] border border-[#1a3a5c] p-4 rounded-2xl">
                    <div className="text-[10px] font-black uppercase text-[#4d7a9b] mb-2"><span>{t('Receiver', 'လက်ခံသူ')}</span></div>
                    <div className="font-bold text-white text-[13px]"><span>{shipment.recipient_name || '-'}</span></div>
                    <div className="text-[#c8dff0] text-[12px] mt-1"><span>{shipment.delivery_address}, {shipment.delivery_township}</span></div>
                  </div>
                </div>

                {Number(shipment.cod_amount) > 0 && (
                  <div className="bg-[#f6b84b]/10 border border-[#f6b84b]/30 rounded-2xl p-4 flex items-center justify-between">
                    <span className="text-[12px] font-black uppercase text-[#f6b84b]"><span>{t('COD Amount', 'ကောက်ခံငွေ')}</span></span>
                    <span className="text-[18px] font-mono font-black text-[#f6b84b]"><span>{Number(shipment.cod_amount).toLocaleString()} Ks</span></span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* MY SHIPMENTS WORKSPACE */}
        {activeTab === "history" && (
          <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-16 text-center shadow-xl animate-in fade-in">
            <Clock className="mx-auto h-16 w-16 text-[#4d7a9b] mb-4 opacity-50" />
            <h2 className="text-xl font-bold text-white mb-2"><span>{t('History Verification Required', 'မှတ်တမ်းများကို ကြည့်ရှုရန် အကောင့်ဝင်ပါ')}</span></h2>
            <p className="text-[#4d7a9b]"><span>{t('Please authenticate your phone number to view your complete delivery history.', 'မှတ်တမ်း အပြည့်အစုံကို ကြည့်ရှုရန် ဖုန်းနံပါတ်ဖြင့် အကောင့်ဝင်ပါ။')}</span></p>
          </div>
        )}
      </div>
    </div>
  );
}