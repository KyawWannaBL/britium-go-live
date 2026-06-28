import { Download, Plus, ReceiptText } from "lucide-react";

const rows = [
  { date: new Date().toISOString().slice(0, 10), category: "Operations", description: "Rider fuel / route expense", amount: 0, status: "Draft" },
];

function money(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export default function ExpenseManagementPage() {
  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <section className="rounded-3xl border border-sky-900/60 bg-slate-900/80 p-6 shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-300">Finance Control</p>
            <h1 className="mt-2 flex items-center gap-3 text-3xl font-black"><ReceiptText className="text-amber-300" /> Expense Management</h1>
            <p className="mt-2 max-w-3xl text-slate-300">Build-safe expense entry and approval page for branch, operations, rider, driver, marketing and admin costs.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="inline-flex items-center gap-2 rounded-xl border border-sky-700 bg-sky-950 px-4 py-2 font-bold"><Plus size={16} /> New Expense</button>
            <button className="inline-flex items-center gap-2 rounded-xl border border-amber-400 bg-amber-400 px-4 py-2 font-black text-slate-950"><Download size={16} /> Export</button>
          </div>
        </div>

        <div className="mt-6 overflow-auto rounded-2xl border border-slate-800">
          <table className="w-full min-w-[850px] border-collapse text-sm">
            <thead className="bg-amber-400 text-slate-950">
              <tr>{["Date", "Category", "Description", "Amount", "Status"].map((h) => <th key={h} className="px-4 py-3 text-left font-black uppercase tracking-wider">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-t border-slate-800">
                  <td className="px-4 py-3">{row.date}</td>
                  <td className="px-4 py-3">{row.category}</td>
                  <td className="px-4 py-3">{row.description}</td>
                  <td className="px-4 py-3 font-black text-amber-300">{money(row.amount)} MMK</td>
                  <td className="px-4 py-3">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
