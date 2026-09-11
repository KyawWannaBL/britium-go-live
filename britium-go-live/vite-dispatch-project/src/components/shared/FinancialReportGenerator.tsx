import React, { useState } from 'react';
import { Download, FileSpreadsheet, Calendar, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function FinancialReportGenerator({ moduleName }: { moduleName: string }) {
  const [timeFilter, setTimeFilter] = useState('daily');
  const [reportType, setReportType] = useState('financial');
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      // In production, this targets the specific view/table
      const { data, error } = await supabase
        .from('be_portal_pickup_request_items')
        .select('*')
        .limit(1000);

      if (error) throw error;

      // Dynamic CSV Generation based on selected Report Type
      let headers = "";
      let rows = "";

      if (reportType === 'financial') {
        headers = "Date,Waybill No,Merchant,Recipient,Township,Item Price,Delivery Fee,COD Amount,Status\n";
        rows = data.map((r: any) => `"${new Date(r.created_at).toLocaleDateString()}","${r.waybill_no}","${r.merchant_name}","${r.recipient_name}","${r.delivery_township}","${r.item_price}","${r.delivery_fee}","${r.cod_amount}","${r.item_status}"`).join("\n");
      } else if (reportType === 'operational') {
        headers = "Date,Waybill No,Merchant,Township,Rider Assigned,Vehicle,Status\n";
        rows = data.map((r: any) => `"${new Date(r.created_at).toLocaleDateString()}","${r.waybill_no}","${r.merchant_name}","${r.delivery_township}","${r.rider_name || '-'}","${r.fleet_label || '-'}","${r.item_status}"`).join("\n");
      } else {
        headers = "Date,Waybill No,Merchant,Recipient,Township,Status,Remarks\n";
        rows = data.map((r: any) => `"${new Date(r.created_at).toLocaleDateString()}","${r.waybill_no}","${r.merchant_name}","${r.recipient_name}","${r.delivery_township}","${r.item_status}","${r.remarks || '-'}"`).join("\n");
      }

      const blob = new Blob(["\uFEFF" + headers + rows], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Britium_${moduleName}_${reportType.toUpperCase()}_${timeFilter.toUpperCase()}_Report.csv`;
      link.click();
    } catch (err) {
      alert("Export failed. Please check your data connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-6 shadow-xl notranslate" translate="no">
      <h3 className="text-[14px] font-bold text-white mb-4 flex items-center gap-2">
        <FileSpreadsheet className="text-[#38bdf8]" size={18} />
        <span>Generate Module Reports</span>
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#4d7a9b] mb-1"><span>Time Filter</span></label>
          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-3.5 text-[#4d7a9b]" />
            <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} className="w-full bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-3 pl-9 pr-3 text-[13px] outline-none focus:border-[#f6b84b]">
              <option value="daily">Daily Report</option>
              <option value="weekly">Weekly Report</option>
              <option value="monthly">Monthly Report</option>
              <option value="yearly">Yearly Report</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-[#4d7a9b] mb-1"><span>Report Type</span></label>
          <div className="relative">
            <Filter size={14} className="absolute left-3 top-3.5 text-[#4d7a9b]" />
            <select value={reportType} onChange={(e) => setReportType(e.target.value)} className="w-full bg-[#061524] border border-[#1a3a5c] text-white rounded-xl py-3 pl-9 pr-3 text-[13px] outline-none focus:border-[#f6b84b]">
              <option value="financial">Financial & COD Settlement</option>
              <option value="operational">Operational Volume</option>
              <option value="exceptions">Exception & Return Logs</option>
            </select>
          </div>
        </div>
      </div>

      <button onClick={handleExport} disabled={loading} className="w-full flex items-center justify-center gap-2 bg-[#f6b84b] hover:bg-[#e5a93a] text-[#061524] py-3.5 rounded-xl text-[13px] font-black uppercase tracking-wider transition-colors disabled:opacity-50 shadow-lg shadow-[#f6b84b]/10">
        <Download size={16} /> <span>{loading ? 'Generating...' : 'Export CSV Report'}</span>
      </button>
    </div>
  );
}