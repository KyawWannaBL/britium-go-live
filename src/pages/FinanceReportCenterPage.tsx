import { useState } from "react";
import { Download, FileText, Printer } from "lucide-react";

const reports = [
  "Profit & Loss",
  "General Ledger",
  "Balance Sheet",
  "COD Settlement",
  "Branch Settlement",
  "Rider Commission",
  "Merchant Wallet",
  "Aging Receivable",
];

export default function FinanceReportCenterPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState("Profit & Loss");

  function exportCsv() {
    const csv = `report,from,to\n${report},${from},${to}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.toLowerCase().replaceAll(" ", "-")}-${from || "all"}-${to || "today"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 text-[#eef8ff]">
      <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6">
        <div className="text-[#f6b84b] text-sm font-black tracking-[0.22em] uppercase">Finance Report Center</div>
        <h1 className="text-2xl font-black mt-2">Financial Reports</h1>
        <p className="text-[#9fc3dc] mt-2">Generate Profit & Loss, Ledger, Balance Sheet, COD Settlement and other finance reports with date and report filters.</p>
      </section>

      <section className="rounded-2xl border border-[#1a3a5c] bg-[#071a2b] p-5 flex flex-wrap items-end gap-3">
        <label className="text-xs text-[#9fc3dc]">Report
          <select value={report} onChange={(e) => setReport(e.target.value)} className="block mt-1 bg-[#061524] border border-[#1a3a5c] rounded-lg p-3 min-w-[220px] text-[#eef8ff]">
            {reports.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label className="text-xs text-[#9fc3dc]">From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block mt-1 bg-[#061524] border border-[#1a3a5c] rounded-lg p-3 text-[#eef8ff]" />
        </label>
        <label className="text-xs text-[#9fc3dc]">To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block mt-1 bg-[#061524] border border-[#1a3a5c] rounded-lg p-3 text-[#eef8ff]" />
        </label>
        <button onClick={exportCsv} className="rounded-xl bg-[#1a3a5c] px-4 py-3 font-black flex items-center gap-2"><Download size={16} /> Excel</button>
        <button onClick={() => window.print()} className="rounded-xl bg-[#f6b84b] text-[#061524] px-4 py-3 font-black flex items-center gap-2"><Printer size={16} /> PDF / Print</button>
      </section>

      <section className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5">
        <h2 className="font-black flex items-center gap-2"><FileText size={18} /> {report}</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[#9fc3dc] uppercase text-xs"><tr><th className="p-3 text-left">Metric</th><th className="p-3 text-right">Amount</th><th className="p-3">Status</th></tr></thead>
            <tbody>
              {["Revenue", "Delivery Fee", "COD Collected", "Commission", "Settlement Pending", "Net Position"].map((m) => (
                <tr key={m} className="border-t border-[#1a3a5c]"><td className="p-3">{m}</td><td className="p-3 text-right">0 Ks</td><td className="p-3 text-center text-[#f6b84b]">Backend-ready</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
