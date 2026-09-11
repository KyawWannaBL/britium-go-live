

import { useMemo, useState } from "react";
import {
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  Globe2,
  Search,
  ShieldCheck,
  Table2,
} from "lucide-react";

type Language = "en" | "my" | "both";
type ExportFormat = "csv" | "xlsx" | "pdf";
type ReportFamily = "operations" | "overdue" | "town" | "merchant";

type ReportPreset = {
  id: string;
  family: ReportFamily;
  enTitle: string;
  myTitle: string;
  enDescription: string;
  myDescription: string;
  suggestedFormats: ExportFormat[];
  defaultFileName: string;
};

const EXPORT_BASE = "/api/v1/reports/export"; // Change this if your export route differs.

const reportPresets: ReportPreset[] = [
  {
    id: "ways-count-report",
    family: "operations",
    enTitle: "Ways Count Report",
    myTitle: "ပို့ဆောင်မှုအရေအတွက်အစီရင်ခံစာ",
    enDescription: "Daily and range-based way-count reporting for deliverymen and merchants.",
    myDescription: "Deliveryman နှင့် merchant များအလိုက် နေ့စဉ် / ရက်အပိုင်းအခြား ပို့ဆောင်မှုအရေအတွက်အစီရင်ခံစာ။",
    suggestedFormats: ["xlsx", "pdf", "csv"],
    defaultFileName: "ways-count-report",
  },
  {
    id: "active-ways-count-by-town",
    family: "town",
    enTitle: "Active Ways Count by Town",
    myTitle: "မြို့နယ်အလိုက် လက်ရှိပို့ဆောင်မှုအရေအတွက်",
    enDescription: "Active pickup and delivery ways grouped by town.",
    myDescription: "မြို့နယ်အလိုက် active pickup နှင့် delivery ways ကိုစုစည်းဖော်ပြသည်။",
    suggestedFormats: ["xlsx", "csv", "pdf"],
    defaultFileName: "active-ways-count-by-town",
  },
  {
    id: "ways-by-deliverymen",
    family: "operations",
    enTitle: "Ways by Deliverymen",
    myTitle: "Deliveryman အလိုက် ပို့ဆောင်မှုစာရင်း",
    enDescription: "Delivery assignments and to-collect amounts by deliveryman.",
    myDescription: "Deliveryman အလိုက် ပို့ဆောင်မှုတာဝန်များနှင့် ကောက်ခံရမည့်ငွေပမာဏစာရင်း။",
    suggestedFormats: ["xlsx", "csv", "pdf"],
    defaultFileName: "ways-by-deliverymen",
  },
  {
    id: "ways-by-merchants",
    family: "merchant",
    enTitle: "Ways by Merchants",
    myTitle: "Merchant အလိုက် ပို့ဆောင်မှုစာရင်း",
    enDescription: "Merchant-based ways to be delivered within the selected date range.",
    myDescription: "ရွေးချယ်ထားသောရက်အပိုင်းအခြားအတွင်း merchant အလိုက် ပို့ဆောင်ရမည့်စာရင်း။",
    suggestedFormats: ["xlsx", "csv", "pdf"],
    defaultFileName: "ways-by-merchants",
  },
  {
    id: "overdue-ways-count",
    family: "overdue",
    enTitle: "Overdue Ways Count",
    myTitle: "အချိန်လွန်ပို့ဆောင်မှုအရေအတွက်",
    enDescription: "Weekly overdue pickup and delivery counts.",
    myDescription: "အပတ်စဉ် pickup overdue နှင့် delivery overdue အရေအတွက်။",
    suggestedFormats: ["xlsx", "pdf", "csv"],
    defaultFileName: "overdue-ways-count",
  },
  {
    id: "overdue-ways-by-deliveryman",
    family: "overdue",
    enTitle: "Overdue Ways by Deliveryman",
    myTitle: "Deliveryman အလိုက် အချိန်လွန်ပို့ဆောင်မှု",
    enDescription: "Overdue pickup and delivery performance by deliveryman.",
    myDescription: "Deliveryman အလိုက် overdue pickup / delivery အခြေအနေ။",
    suggestedFormats: ["xlsx", "csv", "pdf"],
    defaultFileName: "overdue-ways-by-deliveryman",
  },
  {
    id: "overdue-ways-by-merchant",
    family: "overdue",
    enTitle: "Overdue Ways by Merchant",
    myTitle: "Merchant အလိုက် အချိန်လွန်ပို့ဆောင်မှု",
    enDescription: "Overdue delivery and pickup counts grouped by merchant.",
    myDescription: "Merchant အလိုက် overdue delivery နှင့် pickup အရေအတွက်စာရင်း။",
    suggestedFormats: ["xlsx", "csv", "pdf"],
    defaultFileName: "overdue-ways-by-merchant",
  },
  {
    id: "total-ways-by-town",
    family: "town",
    enTitle: "Total Ways by Town",
    myTitle: "မြို့နယ်အလိုက် စုစုပေါင်းပို့ဆောင်မှု",
    enDescription: "Town-level totals, max charge, average charge, and minimum charge.",
    myDescription: "မြို့နယ်အလိုက် စုစုပေါင်းပို့ဆောင်မှု၊ အများဆုံးကြေး၊ ပျမ်းမျှကြေးနှင့် အနည်းဆုံးကြေး။",
    suggestedFormats: ["xlsx", "csv", "pdf"],
    defaultFileName: "total-ways-by-town",
  },
  {
    id: "merchants-order-compare",
    family: "merchant",
    enTitle: "Merchants Order Compare",
    myTitle: "Merchant order နှိုင်းယှဉ်ချက်",
    enDescription: "Monthly merchant order comparison by name, ID, town, and price profile.",
    myDescription: "Merchant အမည်၊ ID၊ town နှင့် price profile အလိုက် လစဉ် order နှိုင်းယှဉ်ချက်။",
    suggestedFormats: ["xlsx", "csv", "pdf"],
    defaultFileName: "merchants-order-compare",
  },
];

function bi(language: Language, en: string, my: string) {
  if (language === "en") return en;
  if (language === "my") return my;
  return `${en} / ${my}`;
}

function formatLabel(format: ExportFormat) {
  return format.toUpperCase();
}

function familyLabel(language: Language, family: ReportFamily) {
  const map: Record<ReportFamily, { en: string; my: string }> = {
    operations: { en: "Operations", my: "လုပ်ငန်းလည်ပတ်မှု" },
    overdue: { en: "Overdue", my: "အချိန်လွန်" },
    town: { en: "Town", my: "မြို့နယ်" },
    merchant: { en: "Merchant", my: "Merchant" },
  };
  return bi(language, map[family].en, map[family].my);
}

function LanguageToggle({
  value,
  onChange,
}: {
  value: Language;
  onChange: (value: Language) => void;
}) {
  const items: Array<{ value: Language; label: string }> = [
    { value: "en", label: "EN" },
    { value: "my", label: "မြန်မာ" },
    { value: "both", label: "EN + မြန်မာ" },
  ];

  return (
    <div className="inline-flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">
        <Globe2 size={14} />
        <span>Language</span>
      </div>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={[
              "rounded-xl px-3 py-2 text-sm font-semibold transition",
              active
                ? "bg-[#0d2c54] text-white shadow"
                : "bg-slate-50 text-slate-600 hover:bg-slate-100",
            ].join(" ")}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function StatCard({
  icon: Icon,
  title,
  value,
  subtitle,
}: {
  icon: React.ComponentType<{ size?: string | number; className?: string }>;
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <Icon size={24} className="text-[#0d2c54]" />
      <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-slate-400">{title}</p>
      <p className="mt-4 text-3xl font-black text-[#0d2c54]">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

function ExportBadge({ text }: { text: string }) {
  return (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-600">
      {text}
    </span>
  );
}

function buildExportUrl(options: {
  reportId: string;
  format: ExportFormat;
  startDate: string;
  endDate: string;
  branch: string;
  zone: string;
  search: string;
}) {
  const params = new URLSearchParams();
  params.set("report", options.reportId);
  params.set("format", options.format);
  if (options.startDate) params.set("start_date", options.startDate);
  if (options.endDate) params.set("end_date", options.endDate);
  if (options.branch && options.branch !== "all") params.set("branch", options.branch);
  if (options.zone && options.zone !== "all") params.set("zone", options.zone);
  if (options.search.trim()) params.set("q", options.search.trim());
  return `${EXPORT_BASE}?${params.toString()}`;
}

export default function ReportsExportPage() {
  const [language, setLanguage] = useState<Language>("both");
  const [family, setFamily] = useState<ReportFamily | "all">("all");
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [startDate, setStartDate] = useState("2026-01-01");
  const [endDate, setEndDate] = useState("2026-01-31");
  const [branch, setBranch] = useState("all");
  const [zone, setZone] = useState("all");
  const [search, setSearch] = useState("");

  const families: Array<ReportFamily | "all"> = ["all", "operations", "overdue", "town", "merchant"];

  const filteredReports = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return reportPresets.filter((item) => {
      if (family !== "all" && item.family !== family) return false;
      if (!needle) return true;
      return `${item.enTitle} ${item.myTitle} ${item.enDescription} ${item.myDescription}`
        .toLowerCase()
        .includes(needle);
    });
  }, [family, search]);

  const stats = useMemo(() => {
    return {
      totalReports: reportPresets.length,
      filteredReports: filteredReports.length,
      overdueReports: reportPresets.filter((item) => item.family === "overdue").length,
      townReports: reportPresets.filter((item) => item.family === "town").length,
    };
  }, [filteredReports.length]);

  return (
    <div className="min-h-screen bg-[#f7f9fc] p-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">
            {bi(language, "Reporting", "အစီရင်ခံစာများ")}
          </p>
          <h1 className="text-4xl font-black text-[#0d2c54]">
            {bi(language, "Reports Export Center", "အစီရင်ခံစာထုတ်ယူရန်စင်တာ")}
          </h1>
          <p className="max-w-4xl text-slate-500">
            {bi(
              language,
              "Generate and download operational reporting exports for way counts, overdue activity, town summaries, merchant summaries, and monthly comparisons.",
              "Way count, overdue activity, town summary, merchant summary နှင့် လစဉ်နှိုင်းယှဉ်အစီရင်ခံစာများကို ထုတ်ယူဒေါင်းလုဒ်လုပ်နိုင်ရန် စီမံထားသောစင်တာဖြစ်သည်။",
            )}
          </p>
        </div>

        <LanguageToggle value={language} onChange={setLanguage} />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={FileSpreadsheet}
          title={bi(language, "Total Report Templates", "အစီရင်ခံစာပုံစံစုစုပေါင်း")}
          value={`${stats.totalReports}`}
          subtitle={bi(language, "Configured export presets", "ပြင်ဆင်ထားသော export preset များ")}
        />
        <StatCard
          icon={Table2}
          title={bi(language, "Current Results", "လက်ရှိရလဒ်များ")}
          value={`${stats.filteredReports}`}
          subtitle={bi(language, "Reports matching current filters", "လက်ရှိ filter နှင့် ကိုက်ညီသော report များ")}
        />
        <StatCard
          icon={ShieldCheck}
          title={bi(language, "Overdue Reports", "အချိန်လွန် report များ")}
          value={`${stats.overdueReports}`}
          subtitle={bi(language, "Weekly and owner-based overdue views", "အပတ်စဉ်နှင့် တာဝန်ရှိသူအလိုက် overdue view များ")}
        />
        <StatCard
          icon={FileText}
          title={bi(language, "Town Reports", "မြို့နယ် report များ")}
          value={`${stats.townReports}`}
          subtitle={bi(language, "Town activity and charge summaries", "မြို့နယ်အလိုက် လုပ်ဆောင်မှုနှင့်ကြေးနှုန်းအနှစ်ချုပ်များ")}
        />
      </div>

      <div className="mt-8 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              {bi(language, "Report Family", "Report အမျိုးအစား")}
            </span>
            <select
              value={family}
              onChange={(e) => setFamily(e.target.value as ReportFamily | "all")}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none"
            >
              {families.map((item) => (
                <option key={item} value={item}>
                  {item === "all"
                    ? bi(language, "All families", "အမျိုးအစားအားလုံး")
                    : familyLabel(language, item)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              {bi(language, "Export Format", "Export format")}
            </span>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none"
            >
              <option value="xlsx">XLSX</option>
              <option value="csv">CSV</option>
              <option value="pdf">PDF</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              {bi(language, "Start Date", "စတင်ရက်")}
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              {bi(language, "End Date", "ပြီးဆုံးရက်")}
            </span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              {bi(language, "Branch", "ဘဏ်ခွဲ")}
            </span>
            <input
              value={branch === "all" ? "" : branch}
              onChange={(e) => setBranch(e.target.value || "all")}
              placeholder={bi(language, "Optional branch filter", "လိုအပ်ပါက branch filter")}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              {bi(language, "Zone", "ဇုန်")}
            </span>
            <input
              value={zone === "all" ? "" : zone}
              onChange={(e) => setZone(e.target.value || "all")}
              placeholder={bi(language, "Optional zone filter", "လိုအပ်ပါက zone filter")}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400"
            />
          </label>
        </div>

        <div className="mt-4">
          <label className="relative block">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={bi(language, "Search report by title or description", "ခေါင်းစဉ် သို့မဟုတ် ဖော်ပြချက်အလိုက်ရှာရန်")}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400"
            />
          </label>
        </div>
      </div>

      <div className="mt-8 grid gap-4 xl:grid-cols-2">
        {filteredReports.map((report) => {
          const exportUrl = buildExportUrl({
            reportId: report.id,
            format,
            startDate,
            endDate,
            branch,
            zone,
            search,
          });

          return (
            <div key={report.id} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                    {familyLabel(language, report.family)}
                  </p>
                  <h2 className="mt-2 text-xl font-black text-[#0d2c54]">
                    {bi(language, report.enTitle, report.myTitle)}
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {bi(language, report.enDescription, report.myDescription)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {report.suggestedFormats.map((item) => (
                    <ExportBadge key={item} text={formatLabel(item)} />
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                      {bi(language, "File Name", "ဖိုင်အမည်")}
                    </p>
                    <p className="mt-2 font-semibold text-slate-700">
                      {report.defaultFileName}-{startDate || "start"}-to-{endDate || "end"}.{format}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                      {bi(language, "Export Route", "Export route")}
                    </p>
                    <p className="mt-2 break-all font-mono text-xs text-slate-600">{exportUrl}</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  href={exportUrl}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#0d2c54] px-4 py-3 text-sm font-black text-white hover:opacity-95"
                >
                  <Download size={16} />
                  {bi(language, "Download Now", "ယခုပင်ဒေါင်းလုဒ်လုပ်မည်")}
                </a>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(exportUrl)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700"
                >
                  <FileDown size={16} />
                  {bi(language, "Copy Export Link", "Export link ကိုကူးမည်")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredReports.length === 0 ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          <p className="text-lg font-bold text-slate-600">
            {bi(language, "No report templates match the current filters.", "လက်ရှိ filter များနှင့် ကိုက်ညီသော report template မရှိပါ။")}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {bi(language, "Adjust the family, keyword, or date range and try again.", "Family၊ keyword သို့မဟုတ် ရက်အပိုင်းအခြားကို ပြင်ပြီး ထပ်ကြိုးစားပါ။")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
