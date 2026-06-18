import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Store, Package, Clock, CheckCircle2, Banknote, Download, Plus, Upload, Printer, Zap, Search, RefreshCw } from "lucide-react";

export default function MerchantPortalPage() {
  const { t } = useLanguage();
  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('be_portal_pickup_request_items')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      setShipments(data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = shipments.filter(r => 
    !search || 
    r.waybill_no?.toLowerCase().includes(search.toLowerCase()) || 
    r.recipient_name?.toLowerCase().includes(search.toLowerCase())
  );

  const kpis = {
    active: shipments.filter(s => !['DELIVERED', 'FAILED', 'RETURNED'].includes(String(s.item_status).toUpperCase())).length,
    pending: shipments.filter(s => String(s.item_status).toUpperCase() === 'PENDING').length,
    delivered: shipments.filter(s => String(s.item_status).toUpperCase() === 'DELIVERED').length,
    codPending: shipments.filter(s => s.item_status === 'DELIVERED').reduce((acc, curr) => acc + (Number(curr.cod_amount) || 0), 0)
  };

  return (
    <div className="min-h-screen bg-[#061524] p-6 md:p-8 text-[#eef8ff] font-['Inter','Pyidaungsu'] notranslate" translate="no">
      <div className="mx-auto max-w-[1600px] space-y-6">
        
        {/* HEADER */}
        <header className="rounded-[2rem] border border-[#1a3a5c] bg-[#0b2236] p-8 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#f6b84b]/30 bg-[#f6b84b]/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#f6b84b] mb-3">
              <Store className="h-3.5 w-3.5" />
              <span>{t('Merchant Portal', 'ကုန်သည် ဝန်ဆောင်မှုစနစ်')}</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white m-0"><span>{t('Welcome, Merchant', 'မင်္ဂလာပါ ကုန်သည်')}</span></h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="flex h-12 items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#081b2e] hover:bg-[#1a3a5c] px-5 text-[12px] font-black uppercase tracking-wider text-[#c8dff0] transition-colors cursor-pointer">
              <Download size={16} /> <span>{t('Download Waybills', 'စာရွက်များ ရယူမည်')}</span>
            </button>
            <button className="flex h-12 items-center gap-2 rounded-xl bg-[#22c55e] hover:bg-[#1ea34d] px-6 text-[12px] font-black uppercase tracking-wider text-[#061524] transition-colors shadow-lg shadow-[#22c55e]/10 cursor-pointer">
              <Plus size={16} /> <span>{t('Create Order', 'အော်ဒါ အသစ်တင်မည်')}</span>
            </button>
          </div>
        </header>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard title={t('Active Shipments', 'ပို့ဆောင်ဆဲ')} value={kpis.active} icon={Package} color="#38bdf8" />
          <KpiCard title={t('Pending Pickups', 'ပစ္စည်းလာယူရန် စောင့်ဆိုင်းဆဲ')} value={kpis.pending} icon={Clock} color="#f6b84b" />
          <KpiCard title={t('Delivered', 'ပို့ဆောင်ပြီး')} value={kpis.delivered} icon={CheckCircle2} color="#22c55e" />
          <KpiCard title={t('COD Pending (MMK)', 'ရရန်ရှိသော ငွေ')} value={kpis.codPending.toLocaleString()} icon={Banknote} color="#a855f7" isMono />
        </div>

        {/* QUICK ACTIONS */}
        <section className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-6 shadow-xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#4d7a9b] mb-4"><span>{t('Quick Actions', 'အမြန်လုပ်ဆောင်မှုများ')}</span></p>
          <div className="flex flex-wrap gap-3">
            <button className="flex items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#061524] px-5 py-3 text-[12px] font-bold text-white hover:border-[#f6b84b] transition-colors cursor-pointer">
              <Upload size={16} className="text-[#38bdf8]" /> <span>{t('Bulk CSV Upload', 'ဖိုင်ဖြင့် အစုလိုက်တင်မည်')}</span>
            </button>
            <button className="flex items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#061524] px-5 py-3 text-[12px] font-bold text-white hover:border-[#f6b84b] transition-colors cursor-pointer">
              <Printer size={16} className="text-[#f6b84b]" /> <span>{t('Print Manifest', 'စာရင်းထုတ်မည်')}</span>
            </button>
            <button className="flex items-center gap-2 rounded-xl bg-[#38bdf8] text-[#061524] px-5 py-3 text-[12px] font-black uppercase hover:bg-[#0284c7] transition-colors cursor-pointer">
              <Zap size={16} /> <span>{t('Request Urgent Pickup', 'အရေးပေါ် လာယူရန် တောင်းဆိုမည်')}</span>
            </button>
          </div>
        </section>

        {/* DATA TABLE */}
        <section className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl shadow-xl overflow-hidden min-h-[500px] flex flex-col">
          <div className="p-6 border-b border-[#1a3a5c] bg-[#081b2e] flex flex-col md:flex-row gap-4 justify-between items-center">
            <h2 className="text-[16px] font-bold text-white m-0"><span>{t('Recent Shipments', 'မကြာသေးမီက အော်ဒါများ')}</span></h2>
            <div className="relative w-full md:w-[350px]">
              <Search size={16} className="absolute left-4 top-3.5 text-[#4d7a9b]" />
              <input 
                value={search} onChange={(e) => setSearch(e.target.value)} 
                placeholder={t('Search Tracking ID or Recipient...', 'ရှာဖွေရန်...')}
                className="w-full bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-3 pl-11 pr-4 text-[13px] outline-none focus:border-[#f6b84b]"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-x-auto bg-[#061524]">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead className="bg-[#081b2e] sticky top-0 shadow-sm z-10">
                <tr>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Tracking ID', 'စာရွက်အမှတ်')}</span></th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Date', 'ရက်စွဲ')}</span></th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Recipient', 'လက်ခံမည့်သူ')}</span></th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Zone', 'မြို့နယ်ဇုန်')}</span></th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c] text-right"><span>{t('COD (MMK)', 'ကောက်ခံငွေ')}</span></th>
                  <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Status', 'အခြေအနေ')}</span></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="p-16 text-center text-[#4d7a9b]"><RefreshCw className="animate-spin mx-auto" size={24}/></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="p-16 text-center text-[#4d7a9b] font-medium"><span>{t('No shipments found.', 'မှတ်တမ်းများ မရှိပါ။')}</span></td></tr>
                ) : filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-[#1a3a5c]/30 transition-colors border-b border-[#1a3a5c]/50">
                    <td className="p-4 font-mono font-black text-[#38bdf8] text-[13px]"><span>{row.waybill_no || '-'}</span></td>
                    <td className="p-4 text-[#c8dff0] text-[12px]"><span>{new Date(row.created_at).toLocaleDateString()}</span></td>
                    <td className="p-4 font-bold text-white text-[13px]"><span>{row.recipient_name || '-'}</span></td>
                    <td className="p-4 font-medium text-[#c8dff0] text-[13px]"><span>{row.delivery_township || '-'}</span></td>
                    <td className="p-4 font-mono font-bold text-[#f6b84b] text-[13px] text-right"><span>{Number(row.cod_amount || 0).toLocaleString()}</span></td>
                    <td className="p-4">
                      <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded border border-[#1a3a5c] bg-[#061524] ${row.item_status === 'DELIVERED' ? 'text-[#22c55e]' : 'text-[#4d7a9b]'}`}>
                        <span>{String(row.item_status || 'PENDING').replace(/_/g, ' ')}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </div>
  );
}

function KpiCard({ title, value, icon: Icon, color, isMono }: any) {
  return (
    <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-3xl shadow-lg relative overflow-hidden group">
      <div className="absolute -right-4 -top-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
        <Icon size={100} color={color} />
      </div>
      <div className="flex items-center justify-between mb-3 relative z-10">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#4d7a9b]"><span>{title}</span></span>
        <Icon size={16} color={color} />
      </div>
      <div className={`text-3xl font-black relative z-10 ${isMono ? 'font-mono' : ''}`} style={{ color }}><span>{value}</span></div>
    </div>
  );
}