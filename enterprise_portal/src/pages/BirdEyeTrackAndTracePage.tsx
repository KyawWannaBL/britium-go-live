import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Search, Eye, Truck, CheckCircle2, Warehouse, AlertTriangle, Clock } from "lucide-react";

export default function BirdEyeTrackAndTracePage() {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [itemData, setItemData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState("");

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim()) return;
    setLoading(true); setError(""); setItemData(null); setHistory([]);

    try {
      // Fetch Main Item
      const { data: item, error: fetchErr } = await supabase
        .from('be_portal_pickup_request_items')
        .select('*')
        .eq('waybill_no', search.trim())
        .single();

      if (fetchErr || !item) {
        setError(t('Waybill not found in the system.', 'ရှာဖွေသော လမ်းညွှန်စာရွက် မတွေ့ရှိပါ။'));
        return;
      }
      setItemData(item);

      // Fetch History (Assuming logs table exists, generating visual timeline based on status)
      const { data: logs } = await supabase
        .from('be_delivery_attempts_log')
        .select('*')
        .eq('waybill_no', item.waybill_no)
        .order('created_at', { ascending: false });

      setHistory(logs || []);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-[1200px] mx-auto space-y-6 notranslate" translate="no">
      <div className="bg-[#0b2236] border border-[#1a3a5c] p-8 rounded-3xl shadow-xl text-center">
        <div className="mx-auto w-16 h-16 bg-[#38bdf8]/10 border border-[#38bdf8]/30 rounded-2xl flex items-center justify-center mb-4">
          <Eye className="text-[#38bdf8]" size={32} />
        </div>
        <h1 className="text-3xl font-black text-white m-0 mb-2"><span>{t('Bird-Eye Track & Trace', 'ပို့ဆောင်မှု ခြေရာခံ စောင့်ကြည့်ရေး')}</span></h1>
        <p className="text-[#4d7a9b] text-[14px] max-w-2xl mx-auto">
          <span>{t('Real-time visibility across Customer Service, Warehouse, Dispatch, and Field Delivery.', 'ဌာနအသီးသီးမှ ကုန်ပစ္စည်း၏ အခြေအနေများကို အချိန်နှင့်တပြေးညီ ခြေရာခံ စောင့်ကြည့်နိုင်ပါသည်။')}</span>
        </p>

        <form onSubmit={handleSearch} className="mt-8 max-w-xl mx-auto relative">
          <Search className="absolute left-5 top-4 text-[#4d7a9b]" size={20} />
          <input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder={t('Enter Waybill Number (e.g., W240618-...)', 'လမ်းညွှန်စာရွက် အမှတ် ရိုက်ထည့်ပါ...')}
            className="w-full bg-[#061524] border-2 border-[#1a3a5c] text-white text-[16px] font-mono font-bold rounded-2xl py-4 pl-14 pr-32 outline-none focus:border-[#38bdf8] transition-colors"
          />
          <button type="submit" disabled={loading} className="absolute right-2 top-2 bottom-2 bg-[#38bdf8] text-[#061524] px-6 rounded-xl font-black uppercase tracking-wider hover:bg-[#0284c7] transition-colors disabled:opacity-50 cursor-pointer">
            {loading ? <RefreshCw className="animate-spin" size={18} /> : <span>{t('Track', 'ရှာမည်')}</span>}
          </button>
        </form>
        
        {error && <div className="mt-4 text-[#ff4f86] font-bold text-[14px]"><span>{error}</span></div>}
      </div>

      {itemData && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in zoom-in-95 duration-300">
          
          {/* Details Card */}
          <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-6 shadow-xl h-fit">
            <h2 className="text-[16px] font-black text-white border-b border-[#1a3a5c] pb-3 mb-4"><span>{t('Shipment Details', 'ကုန်ပစ္စည်း အချက်အလက်')}</span></h2>
            <div className="space-y-4">
              <DetailRow label={t('Waybill No', 'စာရွက်အမှတ်')} value={itemData.waybill_no} isMono />
              <DetailRow label={t('Merchant', 'ကုန်သည်')} value={itemData.merchant_name} />
              <DetailRow label={t('Recipient', 'လက်ခံမည့်သူ')} value={itemData.recipient_name} />
              <DetailRow label={t('Township', 'မြို့နယ်')} value={itemData.delivery_township} />
              <DetailRow label={t('Address', 'လိပ်စာ')} value={itemData.delivery_address} />
              <DetailRow label={t('COD Amount', 'ကောက်ခံငွေ')} value={`${Number(itemData.cod_amount).toLocaleString()} Ks`} isGreen />
              <DetailRow label={t('Current Status', 'အခြေအနေ')} value={String(itemData.item_status).replace(/_/g, ' ')} />
            </div>
          </div>

          {/* Timeline Card */}
          <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-6 shadow-xl">
            <h2 className="text-[16px] font-black text-white border-b border-[#1a3a5c] pb-3 mb-4 flex items-center gap-2">
              <Clock className="text-[#f6b84b]" size={18} /> <span>{t('Operational Timeline', 'လုပ်ငန်းစဉ် မှတ်တမ်း')}</span>
            </h2>
            
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[19px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-[#1a3a5c]">
              
              {/* Current Status Node */}
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-[#0b2236] bg-[#22c55e] text-[#061524] shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-lg z-10">
                  <CheckCircle2 size={20} />
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-[#081b2e] border border-[#1a3a5c] p-4 rounded-xl shadow-md">
                  <div className="font-bold text-white text-[13px] uppercase tracking-wider mb-1"><span>{String(itemData.item_status).replace(/_/g, ' ')}</span></div>
                  <div className="text-[#4d7a9b] text-[11px]"><span>{t('Latest Update', 'နောက်ဆုံးအခြေအနေ')}</span></div>
                </div>
              </div>

              {/* Historical Nodes */}
              {history.map((log: any, index: number) => (
                <div key={log.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-[#0b2236] bg-[#1a3a5c] text-[#c8dff0] shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                    <AlertTriangle size={16} />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-[#061524] border border-[#1a3a5c] p-4 rounded-xl opacity-80">
                    <div className="font-bold text-[#f6b84b] text-[12px] mb-1">Attempt {log.attempt_number} Failed</div>
                    <div className="text-[#c8dff0] text-[12px] mb-1"><span>{log.failed_reason}</span></div>
                    <div className="text-[#4d7a9b] text-[10px] font-mono">{new Date(log.created_at).toLocaleString()}</div>
                  </div>
                </div>
              ))}

              {/* Origin Node */}
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-[#0b2236] bg-[#38bdf8] text-[#061524] shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                  <Warehouse size={18} />
                </div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-[#061524] border border-[#1a3a5c] p-4 rounded-xl opacity-60">
                  <div className="font-bold text-white text-[12px] mb-1"><span>{t('Order Created', 'အမှာစာ စတင်လက်ခံသည်')}</span></div>
                  <div className="text-[#4d7a9b] text-[10px] font-mono">{new Date(itemData.created_at).toLocaleString()}</div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, isMono, isGreen }: any) {
  return (
    <div className="flex justify-between items-center border-b border-[#1a3a5c]/50 pb-2 last:border-0 last:pb-0">
      <span className="text-[12px] font-bold text-[#4d7a9b]"><span>{label}</span></span>
      <span className={`text-[13px] font-bold ${isMono ? 'font-mono text-[#38bdf8]' : isGreen ? 'text-[#22c55e]' : 'text-white'} text-right max-w-[60%] truncate`}>
        <span>{value || '-'}</span>
      </span>
    </div>
  );
}