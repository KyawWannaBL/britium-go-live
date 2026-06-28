import { useMemo, useState } from "react";
import { Bell, Download, FileSpreadsheet, MessageCircle, PackagePlus, Search, Wallet } from "lucide-react";

const cards = [
  ["Pickup Requests", "0", "Create or upload order picking requests"],
  ["Live Tracking", "0", "Track active pickup / delivery status"],
  ["Settlement", "0 Ks", "COD, prepaid, fees, and wallet balance"],
  ["Notifications", "0", "Operational and customer service alerts"],
];

export default function MerchantPortalProfessionalPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const reportName = useMemo(() => `merchant-report-${from || "all"}-${to || "today"}`, [from, to]);

  function printReport() { window.print(); }

  function downloadCsv() {
    const csv = "report,from,to\nMerchant Report," + from + "," + to + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 text-[#eef8ff]">
      <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="text-[#f6b84b] text-sm font-black tracking-[0.22em] uppercase">Merchant Portal</div>
          <h1 className="text-2xl font-black mt-2">Merchant Dashboard & Order Picking</h1>
          <p className="text-[#9fc3dc] mt-2 max-w-3xl">
            Submit pickup requests, upload Excel order picking files, track live shipments, communicate with customer service,
            review notifications, and print merchant-only reports.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-xl bg-[#f6b84b] text-[#061524] px-4 py-3 font-black flex items-center gap-2">
            <PackagePlus size={16} /> New Pickup Request
          </button>
          <button onClick={downloadCsv} className="rounded-xl bg-[#071a2b] border border-[#1a3a5c] px-4 py-3 font-black flex items-center gap-2">
            <Download size={16} /> Export CSV
          </button>
          <button onClick={printReport} className="rounded-xl bg-[#071a2b] border border-[#1a3a5c] px-4 py-3 font-black">
            Print / PDF
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {cards.map(([title, value, note]) => (
          <div key={title} className="rounded-2xl border border-[#1a3a5c] bg-[#071a2b] p-5">
            <div className="text-[#9fc3dc] text-xs uppercase tracking-widest">{title}</div>
            <div className="text-[#f6b84b] text-2xl font-black mt-2">{value}</div>
            <div className="text-[#4d7a9b] text-xs mt-2">{note}</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5">
        <div className="flex flex-col xl:flex-row gap-3 xl:items-end justify-between">
          <div>
            <h2 className="font-black text-lg">Merchant Reports</h2>
            <p className="text-[#9fc3dc] text-sm">Generate merchant-only historical, settlement, wallet, tracking, and pickup request reports.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="text-xs text-[#9fc3dc]">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block mt-1 bg-[#061524] border border-[#1a3a5c] rounded-lg p-2 text-[#eef8ff]" /></label>
            <label className="text-xs text-[#9fc3dc]">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block mt-1 bg-[#061524] border border-[#1a3a5c] rounded-lg p-2 text-[#eef8ff]" /></label>
            <button onClick={downloadCsv} className="rounded-xl bg-[#1a3a5c] px-4 py-3 font-black flex items-center gap-2"><FileSpreadsheet size={16} /> Excel</button>
            <button onClick={printReport} className="rounded-xl bg-[#f6b84b] text-[#061524] px-4 py-3 font-black">PDF / Print</button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-[#1a3a5c] bg-[#071a2b] p-5">
          <h3 className="font-black flex items-center gap-2"><FileSpreadsheet size={16} /> Order Picking Excel</h3>
          <p className="text-[#9fc3dc] text-sm mt-2">Download template, upload merchant order picking file, and create pickup requests.</p>
          <div className="flex gap-2 mt-4"><button className="rounded-lg border border-[#1a3a5c] px-3 py-2">Download Template</button><button className="rounded-lg bg-[#22c55e] text-[#061524] px-3 py-2 font-black">Upload Excel</button></div>
        </div>
        <div className="rounded-2xl border border-[#1a3a5c] bg-[#071a2b] p-5">
          <h3 className="font-black flex items-center gap-2"><MessageCircle size={16} /> Customer Service</h3>
          <p className="text-[#9fc3dc] text-sm mt-2">Create service thread linked to Pickup ID / Waybill ID.</p>
          <button className="rounded-lg bg-[#1a3a5c] px-3 py-2 mt-4">Open Message Center</button>
        </div>
        <div className="rounded-2xl border border-[#1a3a5c] bg-[#071a2b] p-5">
          <h3 className="font-black flex items-center gap-2"><Wallet size={16} /> Merchant Wallet</h3>
          <p className="text-[#9fc3dc] text-sm mt-2">Wallet balance, COD settlement, receivable/payable, and ledger.</p>
          <button className="rounded-lg bg-[#1a3a5c] px-3 py-2 mt-4">View Wallet</button>
        </div>
      </section>

      <section className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5">
        <div className="flex items-center gap-3">
          <Search size={18} className="text-[#4ea8de]" />
          <input placeholder="Search merchant historical records, pickup IDs, waybills, settlement refs..." className="w-full bg-[#061524] border border-[#1a3a5c] rounded-xl px-4 py-3 outline-none" />
          <Bell size={18} className="text-[#f6b84b]" />
        </div>
      </section>
    </div>
  );
}
