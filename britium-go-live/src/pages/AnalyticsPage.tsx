import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Globe2,
  Loader2,
} from "lucide-react";

type Lang = "EN" | "MM";

type ReportDefinition = {
  apiName: string;
  en: string;
  mm: string;
};

type ReportResponse = {
  ok?: boolean;
  filename?: string;
  headers?: string[];
  rows?: Record<string, unknown>[];
  record_count?: number;
  error?: string;
  message?: string;
};

const REPORTS: ReportDefinition[] = [
  {
    apiName: "Daily Operation",
    en: "Daily Operation",
    mm: "နေ့စဉ်လုပ်ငန်းစဉ်",
  },
  {
    apiName: "Revenue",
    en: "Revenue",
    mm: "ဝင်ငွေ",
  },
  {
    apiName: "COD",
    en: "COD",
    mm: "COD",
  },
  {
    apiName: "Settlement",
    en: "Settlement",
    mm: "ငွေစာရင်းရှင်းလင်းမှု",
  },
  {
    apiName: "Delivery Performance",
    en: "Delivery Performance",
    mm: "ပို့ဆောင်မှု စွမ်းဆောင်ရည်",
  },
  {
    apiName: "Merchant Performance",
    en: "Merchant Performance",
    mm: "ကုန်သည် စွမ်းဆောင်ရည်",
  },
  {
    apiName: "Rider Performance",
    en: "Rider Performance",
    mm: "Rider စွမ်းဆောင်ရည်",
  },
  {
    apiName: "Warehouse Performance",
    en: "Warehouse Performance",
    mm: "ဂိုထောင် စွမ်းဆောင်ရည်",
  },
];

const COPY = {
  EN: {
    title: "Analytics Center",
    subtitle: "Live operational data exports and comprehensive reporting.",
    export: "Export CSV",
    exporting: "Exporting",
    success: "CSV exported successfully",
    failed: "Export failed",
    records: "records",
  },
  MM: {
    title: "အစီရင်ခံစာနှင့် ခွဲခြမ်းစိတ်ဖြာမှု ဗဟို",
    subtitle: "တိုက်ရိုက်လုပ်ငန်းဒေတာနှင့် အစီရင်ခံစာများ ထုတ်ယူရန်။",
    export: "CSV ထုတ်ယူမည်",
    exporting: "ထုတ်ယူနေသည်",
    success: "CSV အောင်မြင်စွာ ထုတ်ယူပြီးပါပြီ",
    failed: "ထုတ်ယူမှု မအောင်မြင်ပါ",
    records: "မှတ်တမ်း",
  },
} as const;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  const text =
    typeof value === "object"
      ? JSON.stringify(value)
      : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(
  headers: string[],
  rows: Record<string, unknown>[],
): string {
  const firstLine = headers.map(csvCell).join(",");

  const body = rows.map((row) =>
    headers.map((header) => csvCell(row?.[header])).join(","),
  );

  return [firstLine, ...body].join("\r\n");
}

function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(["\uFEFF", content], {
    type: "text/csv;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AnalyticsPage() {
  const [lang, setLang] = useState<Lang>("EN");
  const [loadingReport, setLoadingReport] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const copy = COPY[lang];

  async function handleExport(report: ReportDefinition) {
    setLoadingReport(report.apiName);
    setNotice(null);

    try {
      const { data, error } = await supabase.rpc(
        "be_export_report",
        {
          p_report_type: report.apiName,
        },
      );

      if (error) throw error;

      const response = (data ?? {}) as ReportResponse;

      if (response.ok !== true) {
        throw new Error(
          response.message ||
            response.error ||
            "The report could not be generated.",
        );
      }

      const headers = Array.isArray(response.headers)
        ? response.headers.map(String)
        : [];

      const rows = Array.isArray(response.rows)
        ? response.rows
        : [];

      if (headers.length === 0) {
        throw new Error("The report returned no CSV headers.");
      }

      const fallbackFilename = `britium_${report.apiName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")}_${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;

      downloadCsv(
        response.filename || fallbackFilename,
        buildCsv(headers, rows),
      );

      setNotice({
        type: "success",
        text: `${copy.success}: ${
          lang === "EN" ? report.en : report.mm
        } · ${response.record_count ?? rows.length} ${copy.records}`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: `${copy.failed}: ${
          error instanceof Error
            ? error.message
            : "Unknown export error"
        }`,
      });
    } finally {
      setLoadingReport(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#061524] p-6 text-[#eef8ff] md:p-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <header className="flex flex-col gap-4 rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6 shadow-xl md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-black">
              <BarChart3 className="text-[#4ea8de]" />
              {copy.title}
            </h1>

            <p className="mt-1 text-sm text-[#7ca5c3]">
              {copy.subtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setLang((current) =>
                current === "EN" ? "MM" : "EN",
              )
            }
            className="flex items-center gap-2 rounded-xl bg-[#123456] px-4 py-2 font-bold text-[#f6b84b]"
          >
            <Globe2 size={16} />
            {lang === "EN" ? "မြန်မာ" : "English"}
          </button>
        </header>

        {notice && (
          <div
            className={`flex items-center gap-3 rounded-2xl border px-5 py-4 text-sm font-bold ${
              notice.type === "success"
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : "border-rose-400/30 bg-rose-400/10 text-rose-300"
            }`}
          >
            {notice.type === "success" ? (
              <CheckCircle2 size={18} />
            ) : (
              <AlertTriangle size={18} />
            )}

            {notice.text}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {REPORTS.map((report) => {
            const exporting =
              loadingReport === report.apiName;

            return (
              <section
                key={report.apiName}
                className="flex h-[180px] flex-col justify-between rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-5 shadow-lg"
              >
                <div>
                  <FileSpreadsheet
                    className="mb-3 text-[#f6b84b]"
                    size={22}
                  />

                  <h2 className="text-sm font-bold text-white">
                    {lang === "EN" ? report.en : report.mm}
                  </h2>

                  <p className="mt-2 text-xs text-[#6f96b4]">
                    {report.apiName}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={Boolean(loadingReport)}
                  onClick={() => void handleExport(report)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#1a3a5c] py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#254b73] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {exporting ? (
                    <Loader2
                      className="animate-spin"
                      size={14}
                    />
                  ) : (
                    <Download size={14} />
                  )}

                  {exporting
                    ? copy.exporting
                    : copy.export}
                </button>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}