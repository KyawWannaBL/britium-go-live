import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Download, FileSpreadsheet, Calendar, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function UniversalExportModule({ moduleName }: { moduleName: string }) {
  const { t } = useLanguage();
  const [timeFilter, setTimeFilter] = useState('daily');
  const [reportType, setReportType] = useState('financial');
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      // In production, this would call a dedicated Supabase Edge Function to aggregate the data.
      // For now, we simulate pulling the relevant data table based on the module.
      let tableName = 'be_portal_pickup_request_items';
      
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(500);

      if (error) throw error;

      // Generate CSV
      const headers = "Date,Waybill No,Merchant,Recipient,Township,Item Price,Delivery Fee,COD Amount,Status\\n";
      const rows = data.map((r: any) => 
        `"${new Date(r.created_at).toLocaleDateString()}","${r.waybill_no}","${r.merchant_name}","${r.recipient_name}","${r.delivery_township}","${r.item_price}","${r.delivery_fee}","${r.cod_amount}","${r.item_status}"`
      ).join("\\n");

      const blob = new Blob(["\\uFEFF" + headers + rows], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Britium_${moduleName}_${reportType}_${timeFilter}_Report.csv`;
      link.click();

    } catch (err) {
      console.error(err);
      alert(t("Export failed. Please check permissions.", "မှတ်တမ်းထုတ်ယူခြင်း မအောင်မြင်ပါ။"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-5 shadow-lg notranslate" translate="no">
      <h3 className="text-[14px] font-bold text-white mb-4 flex items-center gap-2">
        <FileSpreadsheet className="text-[#38bdf8]" size={18} />
        <span>{t('Generate Module Reports', 'လုပ်ငန်းမှတ်တမ်းများ ထုတ်ယူရန်')}</span>
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#4d7a9b] mb-1"><span>{t('Time Filter', 'အချိန်ကာလ')}</span></label>
          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-3 text-[#4d7a9b]" />
            <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} className="w-full bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-2.5 pl-9 pr-3 text-[13px] outline-none focus:border-[#f6b84b]">
              <option value="daily"><span>{t('Daily Report', 'နေ့စဉ် မှတ်တမ်း')}</span></option>
              <option value="weekly"><span>{t('Weekly Report', 'အပတ်စဉ် မှတ်တမ်း')}</span></option>
              <option value="monthly"><span>{t('Monthly Report', 'လစဉ် မှတ်တမ်း')}</span></option>
              <option value="yearly"><span>{t('Yearly Report', 'နှစ်စဉ် မှတ်တမ်း')}</span></option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#4d7a9b] mb-1"><span>{t('Report Type', 'မှတ်တမ်း အမျိုးအစား')}</span></label>
          <div className="relative">
            <Filter size={14} className="absolute left-3 top-3 text-[#4d7a9b]" />
            <select value={reportType} onChange={(e) => setReportType(e.target.value)} className="w-full bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-2.5 pl-9 pr-3 text-[13px] outline-none focus:border-[#f6b84b]">
              <option value="financial"><span>{t('Financial & COD', 'ငွေစာရင်းနှင့် ကောက်ခံငွေ')}</span></option>
              <option value="operational"><span>{t('Operational Volume', 'လုပ်ငန်းလည်ပတ်မှု ပမာဏ')}</span></option>
              <option value="exceptions"><span>{t('Exception Logs', 'ချွင်းချက်ဖြစ်စဉ်များ')}</span></option>
            </select>
          </div>
        </div>
      </div>

      <button onClick={handleExport} disabled={loading} className="w-full flex items-center justify-center gap-2 bg-[#f6b84b] hover:bg-[#e5a93a] text-[#061524] py-3 rounded-xl text-[13px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50">
        <Download size={16} /> <span>{loading ? t('Generating...', 'မှတ်တမ်းထုတ်နေပါသည်...') : t('Download Excel CSV', 'Excel ဖိုင် ရယူမည်')}</span>
      </button>
    </div>
  );
}