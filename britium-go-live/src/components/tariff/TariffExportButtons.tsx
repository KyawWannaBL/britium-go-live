import { useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { exportFinanceExcel, printFinancePdf, type FinanceReport } from "@/lib/financeReportExports";

type TariffExportProps = Pick<FinanceReport, "title" | "columns" | "rows" | "filters" | "note"> & {
  disabled?: boolean;
};

export function TariffExportButtons({ disabled, ...table }: TariffExportProps) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const unavailable = disabled || exporting || !table.rows.length;

  async function exportTable(format: "excel" | "pdf") {
    setError("");
    const generatedAt = new Date();
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yangon" }).format(generatedAt);
    const report = { ...table, fileStem: `${table.title}-${date}`, generatedAt };
    try {
      if (format === "pdf") {
        printFinancePdf(report, {
          department: "TARIFF CATALOG",
          footer: "Britium Express · Tariff rates as listed at the time of export.",
        });
        return;
      }
      setExporting(true);
      await exportFinanceExcel(report);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Tariff export failed.");
    } finally {
      setExporting(false);
    }
  }

  return <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Export ${table.title}`}>
    <button type="button" disabled={unavailable} onClick={() => void exportTable("pdf")}
      className="inline-flex items-center gap-1.5 rounded-lg border border-sky-700 px-3 py-2 text-xs font-bold text-sky-100 disabled:opacity-50">
      <Printer size={15} aria-hidden="true" /> Export PDF
    </button>
    <button type="button" disabled={unavailable} onClick={() => void exportTable("excel")}
      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700 px-3 py-2 text-xs font-bold text-emerald-100 disabled:opacity-50">
      <FileSpreadsheet size={15} aria-hidden="true" /> {exporting ? "Exporting…" : "Export Excel"}
    </button>
    <span className="text-xs text-[#9cc2d9]">{table.rows.length.toLocaleString()} rows</span>
    {error && <p role="alert" className="basis-full text-sm text-rose-200">{error}</p>}
  </div>;
}
