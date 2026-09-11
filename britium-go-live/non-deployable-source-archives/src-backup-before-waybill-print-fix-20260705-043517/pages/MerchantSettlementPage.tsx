import { Download, FileText, WalletCards } from "lucide-react";

const rows = [
  { merchant: "Aung Pyae Sone", pickup_id: "P0625-APS-001", delivered: 10, cod: 0, delivery_fee: 75000, status: "Ready" },
];

function money(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export default function MerchantSettlementPage() {
  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <section className="rounded-3xl border border-sky-900/60 bg-slate-900/80 p-6 shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-300">Finance / Merchant</p>
            <h1 className="mt-2 flex items-center gap-3 text-3xl font-black"><WalletCards className="text-amber-300" /> Merchant Settlement</h1>
            <p className="mt-2 max-w-3xl text-slate-300">Build-safe merchant COD, invoice and delivery-fee settlement page.</p>
          </div>
          <button className="inline-flex items-center gap-2 rounded-xl border border-amber-400 bg-amber-400 px-4 py-2 font-black text-slate-950"><Download size={16} /> Export</button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5"><p className="text-xs font-black uppercase tracking-widest text-slate-400">Total COD</p><p className="mt-2 text-3xl font-black text-amber-300">0 MMK</p></div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5"><p className="text-xs font-black uppercase tracking-widest text-slate-400">Delivery Fees</p><p className="mt-2 text-3xl font-black text-sky-300">75,000 MMK</p></div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5"><p className="text-xs font-black uppercase tracking-widest text-slate-400">Invoices</p><p className="mt-2 text-3xl font-black text-emerald-300">1 Ready</p></div>
        </div>

        <div className="mt-6 overflow-auto rounded-2xl border border-slate-800">
          <table className="w-full min-w-[850px] border-collapse text-sm">
            <thead className="bg-amber-400 text-slate-950">
              <tr>{["Merchant", "Pickup ID", "Delivered", "COD", "Delivery Fee", "Status", "Print"].map((h) => <th key={h} className="px-4 py-3 text-left font-black uppercase tracking-wider">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.pickup_id} className="border-t border-slate-800">
                  <td className="px-4 py-3 font-bold">{row.merchant}</td>
                  <td className="px-4 py-3 font-black text-amber-300">{row.pickup_id}</td>
                  <td className="px-4 py-3">{row.delivered}</td>
                  <td className="px-4 py-3">{money(row.cod)}</td>
                  <td className="px-4 py-3">{money(row.delivery_fee)}</td>
                  <td className="px-4 py-3">{row.status}</td>
                  <td className="px-4 py-3"><button className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 font-bold"><FileText size={14} /> Invoice</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
