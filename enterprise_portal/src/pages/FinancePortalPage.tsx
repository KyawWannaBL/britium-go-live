import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Banknote, DollarSign, Wallet, RefreshCw, Search, CheckCircle2, ShieldCheck } from 'lucide-react';

export default function FinancePortalPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [finances, setFinances] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('be_portal_pickup_request_items')
        .select('*')
        .in('item_status', ['DELIVERED', 'COMPLETED'])
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setFinances(data || []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = finances.filter(f => 
    !search || 
    f.waybill_no?.toLowerCase().includes(search.toLowerCase()) || 
    f.merchant_name?.toLowerCase().includes(search.toLowerCase())
  );

  const kpis = {
    deliveredCount: finances.filter(f => f.item_status === 'DELIVERED').length,
    totalCodToCollect: finances.filter(f => f.item_status === 'DELIVERED').reduce((acc, curr) => acc + (Number(curr.cod_amount) || 0), 0),
    totalSettled: finances.filter(f => f.item_status === 'COMPLETED').reduce((acc, curr) => acc + (Number(curr.cod_amount) || 0), 0)
  };

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6 notranslate" translate="no">
      {/* HEADER */}
      <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-3xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="text-[#22c55e] text-[11px] font-bold uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            <ShieldCheck size={14}/> <span>{t('Finance & Accounting', 'ငွေစာရင်းနှင့် စာရင်းကိုင်ဌာန')}</span>
          </div>
          <h1 className="text-2xl font-bold text-white m-0"><span>{t('Financial Settlement Center', 'ဘဏ္ဍာရေး ရှင်းလင်းမှု ဗဟိုဌာန')}</span></h1>
          <p className="text-[#4d7a9b] text-[14px] mt-1 m-0 max-w-2xl">
            <span>{t('Monitor COD collection, delivery fees, and finalize merchant settlements.', 'ကောက်ခံရရှိငွေများ၊ ပို့ဆောင်ခများကို စောင့်ကြည့်၍ ကုန်သည်များနှင့် ငွေစာရင်းရှင်းလင်းမှုများကို အတည်ပြုပါ။')}</span>
          </p>
        </div>
        <button onClick={loadData} disabled={loading} className="bg-[#1a3a5c]/50 border border-[#1a3a5c] text-[#c8dff0] px-4 py-2 rounded-xl flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider hover:bg-[#1a3a5c] transition-colors cursor-pointer">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> <span>{t('Sync Finance Data', 'ငွေစာရင်း အချက်အလက်ရယူမည်')}</span>
        </button>
      </div>

      {/* FINANCE KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-3xl shadow-lg border-t-2 border-t-[#38bdf8]">
          <div className="text-[11px] font-bold text-[#4d7a9b] uppercase tracking-wider mb-2 flex items-center gap-2"><Banknote size={14} className="text-[#38bdf8]"/> <span>{t('Pending COD Settlements', 'ကောက်ခံရန်ကျန်ရှိသော ငွေများ')}</span></div>
          <div className="text-3xl font-black text-white font-mono"><span>{kpis.totalCodToCollect.toLocaleString()} Ks</span></div>
          <div className="text-[11px] text-[#4d7a9b] mt-1"><span>{kpis.deliveredCount} {t('Delivered Shipments', 'ပို့ဆောင်ပြီးစီးသော စာရင်းများ')}</span></div>
        </div>
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-5 rounded-3xl shadow-lg border-t-2 border-t-[#22c55e]">
          <div className="text-[11px] font-bold text-[#4d7a9b] uppercase tracking-wider mb-2 flex items-center gap-2"><CheckCircle2 size={14} className="text-[#22c55e]"/> <span>{t('Total Settled Amount', 'ရှင်းလင်းပြီးစီးသော ငွေများ')}</span></div>
          <div className="text-3xl font-black text-[#22c55e] font-mono"><span>{kpis.totalSettled.toLocaleString()} Ks</span></div>
        </div>
      </div>

      {/* DATA GRID */}
      <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl flex flex-col min-h-[500px] shadow-xl overflow-hidden">
        <div className="p-6 border-b border-[#1a3a5c] bg-[#081b2e] flex flex-col md:flex-row gap-4 justify-between items-center">
          <h2 className="text-[16px] font-bold text-white m-0 flex items-center gap-2">
            <Wallet className="text-[#f6b84b]" size={18} /> 
            <span>{t('Settlement Ledger', 'ငွေစာရင်း ရှင်းလင်းမှု မှတ်တမ်း')}</span>
          </h2>
          <div className="relative w-full md:w-[300px]">
            <Search size={16} className="absolute left-4 top-3.5 text-[#4d7a9b]" />
            <input 
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('Search Waybill or Merchant...', 'လမ်းညွှန်စာရွက် (သို့) ကုန်သည် ရှာဖွေရန်...')}
              className="w-full bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-3 pl-11 pr-4 text-[13px] outline-none focus:border-[#f6b84b]"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-x-auto bg-[#061524]">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead className="bg-[#081b2e] sticky top-0 shadow-sm z-10">
              <tr>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Waybill', 'စာရွက်အမှတ်')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Merchant', 'ကုန်သည်')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c] text-right"><span>{t('Item Value', 'ပစ္စည်းတန်ဖိုး')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c] text-right"><span>{t('Deli Fee', 'ပို့ဆောင်ခ')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c] text-right"><span>{t('Total COD', 'ကောက်ခံငွေ')}</span></th>
                <th className="p-4 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c]"><span>{t('Status', 'အခြေအနေ')}</span></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="p-16 text-center text-[#4d7a9b]"><RefreshCw className="animate-spin mx-auto" size={24}/></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="p-16 text-center text-[#4d7a9b] font-medium"><span>{t('No financial records found.', 'ငွေစာရင်း မှတ်တမ်းများ မရှိပါ။')}</span></td></tr>
              ) : filtered.map((f, i) => (
                <tr key={i} className="hover:bg-[#1a3a5c]/30 transition-colors border-b border-[#1a3a5c]/50">
                  <td className="p-4 font-mono font-black text-[#f6b84b] text-[13px]"><span>{f.waybill_no}</span></td>
                  <td className="p-4 font-bold text-white text-[13px]"><span>{f.merchant_name}</span></td>
                  <td className="p-4 text-[#c8dff0] font-mono text-right text-[13px]"><span>{Number(f.item_price || 0).toLocaleString()} Ks</span></td>
                  <td className="p-4 text-[#c8dff0] font-mono text-right text-[13px]"><span>{Number(f.delivery_fee || 0).toLocaleString()} Ks</span></td>
                  <td className="p-4 text-[#22c55e] font-mono font-bold text-right text-[13px]"><span>{Number(f.cod_amount || 0).toLocaleString()} Ks</span></td>
                  <td className="p-4">
                    <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded border ${f.item_status === 'COMPLETED' ? 'bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/30' : 'bg-[#38bdf8]/10 text-[#38bdf8] border-[#38bdf8]/30'}`}>
                      <span>{String(f.item_status).replace(/_/g, ' ')}</span>
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