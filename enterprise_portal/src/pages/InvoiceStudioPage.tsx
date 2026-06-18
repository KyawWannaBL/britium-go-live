import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { ReceiptText, Search, RefreshCw, FileSpreadsheet, CheckCircle2, ChevronRight, Download } from "lucide-react";

export default function InvoiceStudioPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      // Mocking fetch logic for the generated UI. 
      // Replace with your actual invoice RPC
      const { data, error } = await supabase
        .from('be_portal_pickup_request_items')
        .select('*')
        .in('item_status', ['DELIVERED', 'COMPLETED'])
        .order('created_at', { ascending: false })
        .limit(50);
        
      if (error) throw error;
      setInvoices(data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = invoices.filter(i => !search || i.merchant_name?.toLowerCase().includes(search.toLowerCase()));

  const PIPELINE = [
    { label: 'Draft', color: '#9ca3af' },
    { label: 'Under Review', color: '#facc15' },
    { label: 'Issued', color: '#60a5fa' },
    { label: 'Paid', color: '#4ade80' },
    { label: 'Closed', color: '#34d399' },
  ];

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6 notranslate" translate="no">
      
      {/* ── HEADER ── */}
      <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="text-[#f6b84b] text-[11px] font-bold uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            <ReceiptText size={14}/> <span>{t('Finance & Accounting', 'ငွေစာရင်း')}</span>
          </div>
          <h1 className="text-2xl font-bold text-white m-0"><span>{t('Invoice Studio', 'ငွေတောင်းခံလွှာ စင်တာ')}</span></h1>
          <p className="text-[#4d7a9b] text-[14px] mt-1 m-0 max-w-2xl">
            <span>{t('Manage invoice lifecycle — from draft generation to closed reconciliation.', 'ငွေတောင်းခံလွှာများကို မူကြမ်းမှစ၍ ရှင်းလင်းမှု ပြီးဆုံးသည်အထိ စီမံခန့်ခွဲပါ။')}</span>
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={loadData} disabled={loading} className="bg-[#1a3a5c]/50 border border-[#1a3a5c] text-[#c8dff0] px-4 py-2 rounded-xl flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider hover:bg-[#1a3a5c] transition-colors cursor-pointer">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> <span>{t('Sync Finance', 'အချက်အလက် ရယူမည်')}</span>
          </button>
          <button className="bg-[#22c55e] hover:bg-[#1ea34d] text-[#061524] px-6 py-2 rounded-xl flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-lg shadow-[#22c55e]/10">
            <FileSpreadsheet size={16}/> <span>{t('Issue Invoice', 'ထုတ်ဝေမည်')}</span>
          </button>
        </div>
      </div>

      {/* ── STATUS PIPELINE ── */}
      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-6 shadow-xl">
        <p className="text-[10px] font-mono tracking-widest uppercase text-[#4d7a9b] mb-4"><span>INVOICE STATUS PIPELINE</span></p>
        <div className="flex flex-wrap items-center gap-2">
          {PIPELINE.map((step, i) => (
            <div key={step.label} className="flex items-center gap-2">
              <span className="text-[11px] px-3 py-1.5 rounded-full font-bold uppercase tracking-wider" style={{ background: `${step.color}18`, color: step.color, border: `1px solid ${step.color}40` }}>
                <span>{step.label}</span>
              </span>
              {i < PIPELINE.length - 1 && <ChevronRight size={14} className="text-[#4d7a9b]" />}
            </div>
          ))}
        </div>
      </div>

      {/* ── INVOICE TABLE ── */}
      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl flex flex-col min-h-[500px] shadow-xl overflow-hidden">
        <div className="p-6 border-b border-[#1a3a5c] bg-[#081b2e] flex flex-col md:flex-row gap-4 justify-between items-center">
          <h2 className="text-[16px] font-bold text-white m-0"><span>{t('Invoice Registry', 'မှတ်တမ်းများ')}</span></h2>
          <div className="relative w-full md:w-[350px]">
            <Search size={16} className="absolute left-4 top-3.5 text-[#4d7a9b]" />
            <input 
              value={search} onChange={(e) => setSearch(e.target.value)} 
              placeholder={t('Search Merchant or Invoice No...', 'ရှာဖွေရန်...')}
              className="w-full bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-3 pl-11 pr-4 text-[13px] outline-none focus:border-[#f6b84b]"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-x-auto bg-[#061524]">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead className="bg-[#081b2e] sticky top-0 shadow-sm z-10">
              <tr>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Invoice No', 'ဘေလ်အမှတ်')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Merchant', 'ကုန်သည်')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Billing Period', 'ကာလ')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c] text-right text-[#f6b84b]"><span>{t('COD Collected', 'ကောက်ခံရရှိငွေ')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c] text-right text-[#22c55e]"><span>{t('Net Payable', 'ပေးချေရန်ငွေ')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Status', 'အခြေအနေ')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>Action</span></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="p-16 text-center text-[#4d7a9b]"><RefreshCw className="animate-spin mx-auto" size={24}/></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-16 text-center text-[#4d7a9b] font-medium"><span>{t('No invoices found.', 'မှတ်တမ်းများ မရှိပါ။')}</span></td></tr>
              ) : filtered.map((row, i) => {
                const invoiceNo = `I${new Date(row.created_at).toISOString().slice(5,10).replace('-','')}-BEX-0${i+1}`;
                return (
                  <tr key={i} className="hover:bg-[#1a3a5c]/30 transition-colors border-b border-[#1a3a5c]/50">
                    <td className="p-4 font-mono font-black text-[#38bdf8] text-[13px]"><span>{invoiceNo}</span></td>
                    <td className="p-4 font-bold text-white text-[13px]"><span>{row.merchant_name || "-"}</span></td>
                    <td className="p-4 font-medium text-[#c8dff0] text-[13px]"><span>{new Date(row.created_at).toLocaleDateString()}</span></td>
                    <td className="p-4 font-mono font-black text-[#f6b84b] text-[13px] text-right"><span>{Number(row.cod_amount || 0).toLocaleString()} Ks</span></td>
                    <td className="p-4 font-mono font-black text-[#22c55e] text-[13px] text-right"><span>{Number((row.cod_amount || 0) * 0.9).toLocaleString()} Ks</span></td>
                    <td className="p-4">
                      <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded border border-[#1a3a5c] bg-[#061524] ${row.item_status === 'COMPLETED' ? 'text-[#22c55e]' : 'text-[#f6b84b]'}`}>
                        <span>{row.item_status === 'COMPLETED' ? 'PAID' : 'DRAFT'}</span>
                      </span>
                    </td>
                    <td className="p-4">
                      <button className="text-[#38bdf8] hover:text-white transition-colors bg-[#1a3a5c]/50 p-2 rounded-lg border border-[#1a3a5c]">
                        <Download size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}