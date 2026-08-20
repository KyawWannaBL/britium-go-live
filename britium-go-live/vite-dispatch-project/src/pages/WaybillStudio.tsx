// @ts-nocheck
import React, { useState, useMemo } from "react";
import {
import { guardedBrowserPrint } from "@/lib/documentPrintGuard";
  Printer, QrCode, Barcode, Package, MapPin, User, Phone,
  DollarSign, FileText, Sparkles, RefreshCw, Layers, CheckCircle2
} from "lucide-react";

export default function WaybillStudio() {
  const [waybillNo, setWaybillNo] = useState("BRV-20260705-8842");
  const [serviceType, setServiceType] = useState("NEXT_DAY_EXPRESS");

  // Sender Details
  const [senderName, setSenderName] = useState("Britium Logistics Hub");
  const [senderPhone, setSenderPhone] = useState("09-450001122");
  const [senderTownship, setSenderTownship] = useState("Hlaing Township, Yangon");

  // Recipient Details
  const [recipientName, setRecipientName] = useState("U Aung Myo Khine");
  const [recipientPhone, setRecipientPhone] = useState("09-790008899");
  const [recipientAddress, setRecipientAddress] = useState("No. 45, Bogyoke Aung San Road, Kyauktada Township, Yangon");

  // Parcel Specifications
  const [parcelCount, setParcelCount] = useState(1);
  const [weightKg, setWeightKg] = useState(2.5);
  const [itemDescription, setItemDescription] = useState("High-grade Electronic Sensors & Documents");

  // Financials
  const [codAmount, setCodAmount] = useState(125000);
  const [deliveryFee, setDeliveryFee] = useState(3500);
  const [paymentType, setPaymentType] = useState("COD");

  function generateNewWaybill() {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    setWaybillNo(`BRV-20260705-${randomNum}`);
  }

  async async function handlePrint() {
    await guardedBrowserPrint({
      documentType: "MANIFEST",
      documentNo: manifestNo || selectedManifest?.manifest_no || selectedManifest?.manifestNo || selectedManifest?.wayplan_id || selectedManifest?.batch_id || "MANIFEST-UNKNOWN",
      actorEmail: user?.email || "operator@britiumexpress.com",
      actorRole: userRole || "operator",
      reason: "Manifest Print Studio batch print",
    });
  }

  return (
    <div className="min-h-screen bg-[#061524] text-[#eef8ff] p-4 md:p-8 font-sans">

      {/* Hide controls when printing */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-waybill, #printable-waybill * { visibility: visible; }
          #printable-waybill {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 20px;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="mx-auto max-w-6xl space-y-6">

        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1a3a5c] pb-5 no-print">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-[0.35em] text-[#f6b84b] uppercase">BRITIUM ENTERPRISE</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#1a3a5c] text-[#4ea8de] font-bold">v2.4 STUDIO</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white mt-1">Waybill & Shipping Label Studio</h1>
            <p className="text-sm text-[#7ea0b8]">Design, configure, and issue standardized high-density barcode thermal shipping labels.</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={generateNewWaybill}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#1a3a5c] bg-[#0b2236] hover:border-[#7ea0b8] text-xs font-bold text-white transition"
            >
              <RefreshCw size={14} className="text-[#4ea8de]" /> New Waybill ID
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#f6b84b] hover:bg-[#d97706] text-[#061524] text-xs font-black shadow-lg transition"
            >
              <Printer size={15} /> Print Thermal Label (A6)
            </button>
          </div>
        </div>

        {/* Main Grid: Form Left, Preview Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Controls Form (7 Cols) */}
          <div className="lg:col-span-7 space-y-6 no-print">

            {/* Waybill Metadata */}
            <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5 space-y-4">
              <h3 className="text-sm font-extrabold text-[#f6b84b] uppercase flex items-center gap-2">
                <FileText size={16} /> Waybill Tracking Parameters
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-[#7ea0b8] block mb-1">Waybill Tracking Number</label>
                  <input
                    value={waybillNo}
                    onChange={(e) => setWaybillNo(e.target.value)}
                    className="w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3.5 py-2 text-sm font-mono font-bold text-white outline-none focus:border-[#f6b84b]"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#7ea0b8] block mb-1">Service Tier</label>
                  <select
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                    className="w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3.5 py-2 text-sm font-bold text-white outline-none focus:border-[#f6b84b]"
                  >
                    <option value="NEXT_DAY_EXPRESS">NEXT DAY EXPRESS</option>
                    <option value="SAME_DAY_PRIORITY">SAME DAY PRIORITY</option>
                    <option value="STANDARD_GROUND">STANDARD GROUND</option>
                    <option value="INTER_CITY_HUB">INTER-CITY HUB</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Sender & Recipient Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Sender */}
              <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5 space-y-3.5">
                <h3 className="text-xs font-extrabold text-[#4ea8de] uppercase flex items-center gap-1.5">
                  <User size={14} /> Origin / Sender
                </h3>
                <input
                  value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Sender Name"
                  className="w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3 py-2 text-xs font-bold text-white outline-none"
                />
                <input
                  value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} placeholder="Phone Number"
                  className="w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3 py-2 text-xs font-mono text-white outline-none"
                />
                <input
                  value={senderTownship} onChange={(e) => setSenderTownship(e.target.value)} placeholder="Township / Hub"
                  className="w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3 py-2 text-xs text-[#7ea0b8] outline-none"
                />
              </div>

              {/* Recipient */}
              <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5 space-y-3.5">
                <h3 className="text-xs font-extrabold text-[#34d399] uppercase flex items-center gap-1.5">
                  <MapPin size={14} /> Destination / Recipient
                </h3>
                <input
                  value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Recipient Name"
                  className="w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3 py-2 text-xs font-bold text-white outline-none"
                />
                <input
                  value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} placeholder="Phone Number"
                  className="w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3 py-2 text-xs font-mono text-white outline-none"
                />
                <textarea
                  rows={2} value={recipientAddress} onChange={(e) => setRecipientAddress(e.target.value)} placeholder="Full Delivery Street Address"
                  className="w-full rounded-xl border border-[#1a3a5c] bg-[#061524] p-2.5 text-xs text-white outline-none resize-none"
                />
              </div>
            </div>

            {/* Cargo Specs & Financials */}
            <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5 space-y-4">
              <h3 className="text-xs font-extrabold text-[#7ea0b8] uppercase flex items-center gap-1.5">
                <Package size={14} /> Cargo Dimensions & Financial Settlement
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[#7ea0b8] block mb-1">Parcels</label>
                  <input type="number" value={parcelCount} onChange={(e) => setParcelCount(Number(e.target.value))} className="w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3 py-2 text-xs font-mono font-bold text-white" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#7ea0b8] block mb-1">Weight (Kg)</label>
                  <input type="number" step="0.1" value={weightKg} onChange={(e) => setWeightKg(Number(e.target.value))} className="w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3 py-2 text-xs font-mono font-bold text-white" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#7ea0b8] block mb-1">Delivery Fee (MMK)</label>
                  <input type="number" value={deliveryFee} onChange={(e) => setDeliveryFee(Number(e.target.value))} className="w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3 py-2 text-xs font-mono font-bold text-[#4ea8de]" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#f6b84b] block mb-1">COD Collection</label>
                  <input type="number" value={codAmount} onChange={(e) => setCodAmount(Number(e.target.value))} className="w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3 py-2 text-xs font-mono font-black text-[#f6b84b]" />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-[#7ea0b8] block mb-1">Manifest Content Description</label>
                <input value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} className="w-full rounded-xl border border-[#1a3a5c] bg-[#061524] px-3 py-2 text-xs text-white" />
              </div>
            </div>

          </div>

          {/* Live Printable Label Preview (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col items-center">

            <div className="w-full flex items-center justify-between mb-2 no-print">
              <span className="text-xs font-extrabold text-[#7ea0b8] uppercase flex items-center gap-1.5">
                <Sparkles size={14} className="text-[#f6b84b]" /> Live Standard A6 Thermal Preview
              </span>
              <span className="text-[11px] text-[#4ea8de]">105mm × 148mm Ready</span>
            </div>

            {/* Printable Container */}
            <div
              id="printable-waybill"
              className="w-full max-w-[420px] rounded-2xl border-2 border-slate-900 bg-white text-slate-950 p-6 shadow-2xl space-y-4 font-sans select-none"
            >

              {/* Header Box */}
              <div className="flex items-start justify-between border-b-2 border-slate-900 pb-3">
                <div>
                  <div className="text-xl font-black tracking-wider text-slate-950 uppercase">BRITIUM EXPRESS</div>
                  <div className="text-[10px] font-extrabold text-slate-600 uppercase tracking-widest">Enterprise Logistics Infrastructure</div>
                </div>
                <div className="text-right">
                  <span className="px-2.5 py-1 bg-slate-900 text-white font-black text-xs rounded uppercase tracking-wider">
                    {serviceType.replace(/_/g, " ")}
                  </span>
                </div>
              </div>

              {/* Waybill Barcode Area */}
              <div className="text-center py-2 border-b-2 border-slate-900">
                <div className="font-mono text-xs font-black tracking-[0.25em] text-slate-800 mb-1">
                  *{waybillNo}*
                </div>
                {/* Simulated Barcode Stripes */}
                <div className="h-14 w-full bg-slate-950 flex items-center justify-center text-white font-mono text-[9px] overflow-hidden tracking-[0.4em] select-none">
                  ||||| | |||| ||| || ||||| | |||| || ||| |||| | |||||
                </div>
                <div className="font-mono text-sm font-black mt-1 text-slate-950">{waybillNo}</div>
              </div>

              {/* Routing Addresses */}
              <div className="grid grid-cols-2 gap-3 border-b-2 border-slate-900 pb-3.5 text-xs">
                <div className="border-r border-slate-300 pr-2">
                  <div className="text-[9px] font-extrabold text-slate-500 uppercase">FROM (SENDER)</div>
                  <div className="font-black text-slate-900 mt-0.5 truncate">{senderName}</div>
                  <div className="font-mono text-[11px] font-bold text-slate-700">{senderPhone}</div>
                  <div className="text-[10px] text-slate-600 line-clamp-2 mt-0.5">{senderTownship}</div>
                </div>
                <div className="pl-1">
                  <div className="text-[9px] font-extrabold text-slate-500 uppercase">TO (DELIVER TO)</div>
                  <div className="font-black text-slate-950 text-sm mt-0.5">{recipientName}</div>
                  <div className="font-mono text-[11px] font-extrabold text-slate-900">{recipientPhone}</div>
                  <div className="text-[11px] font-bold text-slate-800 line-clamp-3 mt-0.5 leading-snug">{recipientAddress}</div>
                </div>
              </div>

              {/* Manifest Specs & QR */}
              <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3">
                <div className="space-y-1 text-xs">
                  <div><span className="text-slate-500 font-bold">Content:</span> <span className="font-extrabold text-slate-900">{itemDescription}</span></div>
                  <div><span className="text-slate-500 font-bold">Parcels:</span> <span className="font-mono font-black">{parcelCount} PCS</span> &nbsp;|&nbsp; <span className="text-slate-500 font-bold">Weight:</span> <span className="font-mono font-black">{weightKg} KG</span></div>
                  <div><span className="text-slate-500 font-bold">Issue Date:</span> <span className="font-mono font-bold">2026-07-05</span></div>
                </div>
                <div className="flex flex-col items-center justify-center border-2 border-slate-900 p-1.5 rounded-lg bg-slate-50">
                  <QrCode size={48} className="text-slate-950" />
                  <span className="text-[8px] font-mono font-bold text-slate-700 mt-0.5">SCAN ePOD</span>
                </div>
              </div>

              {/* Financial Footer Box */}
              <div className="flex items-center justify-between bg-slate-900 text-white p-3.5 rounded-xl">
                <div>
                  <div className="text-[9px] font-extrabold text-slate-400 tracking-wider">CASH ON DELIVERY (COD)</div>
                  <div className="text-xl font-black font-mono text-amber-400">
                    {codAmount.toLocaleString()} <span className="text-xs font-sans font-bold text-white">MMK</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] font-extrabold text-slate-400">DELIVERY CHARGE</div>
                  <div className="text-sm font-mono font-bold text-slate-200">
                    {deliveryFee.toLocaleString()} MMK
                  </div>
                </div>
              </div>

              <div className="text-center text-[9px] font-bold text-slate-400 uppercase tracking-widest pt-1">
                Authorized Britium Enterprise Waybill • Handle With Care
              </div>

            </div>

          </div>

        </div>

      </div>
    </div>
  );
}