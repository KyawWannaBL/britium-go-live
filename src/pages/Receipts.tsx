import { FileText, Download, Search } from "lucide-react";
import { useState } from "react";

type ReceiptRow = {
  id: string;
  receiptNumber: string;
  merchantName: string;
  amount: string;
  period: string;
  status: "Pending" | "Paid" | "Overdue";
};

const mockReceipts: ReceiptRow[] = [
  {
    id: "1",
    receiptNumber: "RCPT-2026-001",
    merchantName: "Britium Merchant One",
    amount: "45,000 MMK",
    period: "2026-04-01 to 2026-04-07",
    status: "Paid",
  },
  {
    id: "2",
    receiptNumber: "RCPT-2026-002",
    merchantName: "Britium Merchant Two",
    amount: "72,500 MMK",
    period: "2026-04-08 to 2026-04-14",
    status: "Pending",
  },
  {
    id: "3",
    receiptNumber: "RCPT-2026-003",
    merchantName: "Britium Merchant Three",
    amount: "19,200 MMK",
    period: "2026-04-01 to 2026-04-10",
    status: "Overdue",
  },
];

function statusClass(status: ReceiptRow["status"]) {
  switch (status) {
    case "Paid":
      return "bg-emerald-100 text-emerald-700";
    case "Pending":
      return "bg-amber-100 text-amber-700";
    case "Overdue":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default function Receipts() {
  const [search, setSearch] = useState("");

  const filtered = mockReceipts.filter((item) =>
    [item.receiptNumber, item.merchantName, item.period, item.status]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <div className="min-h-full space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              <FileText className="h-4 w-4" />
              Finance
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
              Receipts
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              View merchant receipts, payment periods, and current settlement status.
            </p>
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search receipt number, merchant, period, or status"
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm outline-none ring-0 placeholder:text-slate-400 focus:border-primary"
          />
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead>
              <tr className="text-left text-sm font-semibold text-slate-500">
                <th className="px-4 py-3">Receipt No.</th>
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item) => (
                <tr key={item.id} className="text-sm text-slate-700">
                  <td className="px-4 py-4 font-medium">{item.receiptNumber}</td>
                  <td className="px-4 py-4">{item.merchantName}</td>
                  <td className="px-4 py-4">{item.amount}</td>
                  <td className="px-4 py-4">{item.period}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No receipts found.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
