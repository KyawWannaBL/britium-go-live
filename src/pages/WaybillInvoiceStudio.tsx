import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Printer, FileText, QrCode, ArrowLeft } from 'lucide-react';
import Barcode from 'react-barcode';
import QRCode from 'react-qr-code';

export default function WaybillInvoiceStudio({ pickupId, onBack }) {
  const [data, setData] = useState(null);
  const [printMode, setPrintMode] = useState<'WAYBILL' | 'INVOICE'>('WAYBILL');
  const printRef = useRef(null);

  useEffect(() => {
    async function loadPrintData() {
      const { data: result, error } = await supabase.rpc('get_waybill_invoice_data', {
        p_pickup_id: pickupId
      });
      if (!error && result) setData(result);
    }
    loadPrintData();
  }, [pickupId]);

  const handlePrint = () => {
    window.print(); // CSS @media print ဖြင့် ထိန်းချုပ်ပါမည်
  };

  if (!data) return <div className="p-8 text-center text-slate-500">Loading Print Data...</div>;

  return (
    <div className="bg-slate-100 min-h-screen p-6 print:p-0 print:bg-white">
      {/* ---------------- Non-Printable Header (Controls) ---------------- */}
      <div className="max-w-4xl mx-auto mb-6 flex justify-between items-center print:hidden">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-600 font-bold hover:text-slate-900">
          <ArrowLeft size={18}/> Back
        </button>
        
        <div className="flex bg-white p-1 rounded-xl shadow-sm border">
          <button 
            onClick={() => setPrintMode('WAYBILL')}
            className={`px-4 py-2 rounded-lg text-sm font-bold ${printMode === 'WAYBILL' ? 'bg-[#0b2236] text-white' : 'text-slate-600'}`}
          >
            Waybill (Sticker)
          </button>
          <button 
            onClick={() => setPrintMode('INVOICE')}
            className={`px-4 py-2 rounded-lg text-sm font-bold ${printMode === 'INVOICE' ? 'bg-[#0b2236] text-white' : 'text-slate-600'}`}
          >
            Commercial Invoice (A4)
          </button>
        </div>

        <button onClick={handlePrint} className="bg-[#ff4f86] text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-pink-200">
          <Printer size={18}/> Print Now
        </button>
      </div>

      {/* ---------------- Printable Area ---------------- */}
      <div className="max-w-4xl mx-auto flex justify-center">
        <div ref={printRef} className="bg-white shadow-xl print:shadow-none w-full print:w-full">
          
          {/* ========== WAYBILL (STICKER MODE: A6 Size Equivalent) ========== */}
          {printMode === 'WAYBILL' && (
            <div className="p-6 border-2 border-black w-[400px] print:w-full print:border-none mx-auto bg-white font-sans text-black">
              {/* Header */}
              <div className="flex justify-between items-center border-b-2 border-black pb-4 mb-4">
                <div>
                  <h1 className="text-2xl font-black uppercase tracking-tighter">BRITIUM EXPRESS</h1>
                  <p className="text-xs font-bold">{data.branch_code} HUB</p>
                </div>
                <div className="text-right">
                  <div className="bg-black text-white px-3 py-1 font-black text-xl mb-1">{data.destination_hub}</div>
                  <p className="text-xs font-bold">{data.tier} TIER</p>
                </div>
              </div>

              {/* Barcode */}
              <div className="flex justify-center mb-4">
                <Barcode value={data.pickup_id} height={60} fontSize={16} margin={0} font="monospace" />
              </div>

              {/* Routing & Addresses */}
              <div className="grid grid-cols-2 gap-4 border-t-2 border-b-2 border-black py-4 mb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase mb-1">From (Sender):</p>
                  <p className="font-bold text-sm leading-tight">{data.sender_name}</p>
                  <p className="text-xs leading-tight">{data.sender_phone}</p>
                </div>
                <div className="border-l-2 border-black pl-4">
                  <p className="text-[10px] font-bold uppercase mb-1 text-black bg-yellow-300 w-fit px-1">To (Receiver):</p>
                  <p className="font-black text-base leading-tight">{data.receiver_name}</p>
                  <p className="font-bold text-sm leading-tight">{data.receiver_phone}</p>
                  <p className="text-xs leading-tight mt-1">{data.receiver_address}</p>
                </div>
              </div>

              {/* COD & QR Section */}
              <div className="flex justify-between items-center">
                <div className="flex-1">
                  <p className="text-xs font-bold mb-1">Weight: <span className="font-mono text-sm">{data.weight} kg</span></p>
                  {data.payment_terms === 'COD' && (
                    <div className="mt-2 border-2 border-black p-2 inline-block">
                      <p className="text-[10px] font-black uppercase">COD to Collect</p>
                      <p className="text-lg font-black">{data.cod_amount.toLocaleString()} Ks</p>
                    </div>
                  )}
                </div>
                <div>
                   <QRCode value={data.pickup_id} size={80} level="M" />
                </div>
              </div>
              <p className="text-center text-[10px] mt-4 font-bold border-t border-black pt-2">Created: {new Date(data.created_at).toLocaleString()}</p>
            </div>
          )}

          {/* ========== COMMERCIAL INVOICE (A4 MODE) ========== */}
          {printMode === 'INVOICE' && (
            <div className="p-12 w-[800px] print:w-full min-h-[1000px] mx-auto bg-white font-sans text-black print:p-0">
              <div className="flex justify-between items-start mb-12">
                <div>
                  <h1 className="text-4xl font-black uppercase tracking-tighter text-[#0b2236]">BRITIUM EXPRESS</h1>
                  <p className="text-sm font-bold text-slate-500">Tax Invoice / Delivery Receipt</p>
                </div>
                <div className="text-right">
                  <h2 className="text-2xl font-mono font-bold text-slate-800">INVOICE</h2>
                  <p className="font-mono text-sm text-slate-500">{data.pickup_id}</p>
                  <p className="text-sm text-slate-500 mt-2">Date: {new Date(data.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-12 mb-12">
                <div>
                  <h3 className="font-bold text-xs uppercase text-slate-400 mb-2 border-b pb-1">Billed To / Sender</h3>
                  <p className="font-bold text-lg">{data.sender_name}</p>
                  <p className="text-slate-600 text-sm">{data.sender_address}</p>
                  <p className="text-slate-600 text-sm">{data.sender_phone}</p>
                </div>
                <div>
                  <h3 className="font-bold text-xs uppercase text-slate-400 mb-2 border-b pb-1">Ship To / Receiver</h3>
                  <p className="font-bold text-lg">{data.receiver_name}</p>
                  <p className="text-slate-600 text-sm">{data.receiver_address}</p>
                  <p className="text-slate-600 text-sm">{data.receiver_phone}</p>
                </div>
              </div>

              {/* Invoice Table */}
              <table className="w-full text-left border-collapse mb-12">
                <thead>
                  <tr className="bg-[#0b2236] text-white">
                    <th className="p-3 text-sm font-bold">Description</th>
                    <th className="p-3 text-sm font-bold">Details</th>
                    <th className="p-3 text-sm font-bold text-right">Amount (MMK)</th>
                  </tr>
                </thead>
                <tbody className="divide-y border-b-2 border-[#0b2236]">
                  <tr>
                    <td className="p-3 text-sm font-bold">Base Freight Fee</td>
                    <td className="p-3 text-sm text-slate-600">{data.tier} Tier (Up to {data.tier === 'Royal' ? 5 : 3} kg)</td>
                    <td className="p-3 text-sm font-mono text-right">{data.base_fee.toLocaleString()}</td>
                  </tr>
                  {data.weight_surcharge > 0 && (
                    <tr>
                      <td className="p-3 text-sm font-bold">Overweight Surcharge</td>
                      <td className="p-3 text-sm text-slate-600">Total {data.weight} kg</td>
                      <td className="p-3 text-sm font-mono text-right">{data.weight_surcharge.toLocaleString()}</td>
                    </tr>
                  )}
                  {data.highway_fee > 0 && (
                    <tr>
                      <td className="p-3 text-sm font-bold">Highway Station Fee</td>
                      <td className="p-3 text-sm text-slate-600">Drop-off surcharge</td>
                      <td className="p-3 text-sm font-mono text-right">{data.highway_fee.toLocaleString()}</td>
                    </tr>
                  )}
                  {data.payment_terms === 'COD' && (
                    <tr className="bg-orange-50">
                      <td className="p-3 text-sm font-bold text-orange-800">Cash On Delivery (COD)</td>
                      <td className="p-3 text-sm text-orange-600">To be collected from receiver</td>
                      <td className="p-3 text-sm font-mono text-right font-bold text-orange-800">{data.cod_amount.toLocaleString()}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Totals */}
              <div className="flex justify-end mb-16">
                <div className="w-64">
                  <div className="flex justify-between py-2 border-b border-slate-200">
                    <span className="font-bold text-sm text-slate-600">Subtotal Tariff:</span>
                    <span className="font-mono text-sm">{data.total_tariff.toLocaleString()} Ks</span>
                  </div>
                  <div className="flex justify-between py-3 border-b-4 border-[#0b2236]">
                    <span className="font-black text-lg text-[#0b2236]">Grand Total:</span>
                    <span className="font-mono font-black text-lg text-[#0b2236]">
                      {(data.total_tariff + (data.payment_terms === 'COD' ? data.cod_amount : 0)).toLocaleString()} Ks
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="text-center text-xs text-slate-400 mt-auto border-t pt-8">
                <p className="font-bold text-slate-500 mb-1">Thank you for choosing Britium Express.</p>
                <p>For inquiries, contact cs@britiumexpress.com | www.britiumexpress.com</p>
                <p className="mt-2 font-mono">Powered by Britium Enterprise System</p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
