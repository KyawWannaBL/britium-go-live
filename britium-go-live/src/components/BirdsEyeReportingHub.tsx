import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { BarChart3, ClipboardList, Download, Printer, Search } from "lucide-react";
import { exportFinanceExcel, printFinancePdf, type FinanceReport } from "@/lib/financeReportExports";
import { hubReports, loadHubReport, loadWayFinance, pnlMetrics, reportGroups, type ReportPeriod } from "@/lib/birdsEyeReports";
import { myanmarDay } from "@/lib/parcelLifecycleReport";

const field = "mt-1 h-10 w-full rounded-md border border-slate-600 bg-[#0a1828] px-3 text-sm text-slate-50";
const secondary = "inline-flex items-center gap-2 rounded-md border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-40";
const primary = "inline-flex h-10 items-center gap-2 rounded-md bg-amber-400 px-4 text-sm font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-40";
const money = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
type Mode = (typeof reportGroups)[number]["id"] | "lifecycle";

export default function BirdsEyeReportingHub({ timeline }: {
  timeline: (period: ReportPeriod, setPeriod: (period: ReportPeriod) => void) => ReactNode;
}) {
  const [mode, setMode] = useState<Mode>("performance");
  const [period, setPeriod] = useState<ReportPeriod>(() => {
    const to = myanmarDay();
    return { from: to.slice(0, 7) + "-01", to };
  });

  return (
    <main className="mx-auto min-h-full max-w-[1800px] space-y-5 px-4 py-5 text-slate-100 sm:px-6">
      <header className="border-b border-slate-700 pb-4">
        <h1 className="text-2xl font-extrabold text-slate-50 sm:text-3xl">Bird’s Eye Reporting Hub</h1>
        <p className="mt-1 text-sm text-slate-300">Parcel operations, merchant settlements, workforce commissions, and posted accounts.</p>
        <nav aria-label="Report sections" className="mt-4 flex flex-wrap gap-2">
          {[...reportGroups, { id: "lifecycle", title: "Parcel journey" } as const].map(section => (
            <button key={section.id} type="button" aria-pressed={section.id === mode}
              className={section.id === mode ? primary : secondary} onClick={() => setMode(section.id)}>
              {section.id === "lifecycle" ? <ClipboardList size={16} aria-hidden="true" /> : <BarChart3 size={16} aria-hidden="true" />}
              {section.title}
            </button>
          ))}
        </nav>
      </header>
      {mode === "lifecycle" ? timeline(period, setPeriod) : (
        <ReportWorkspace key={mode} mode={mode} period={period} setPeriod={setPeriod} />
      )}
    </main>
  );
}

function ReportWorkspace({ mode, period, setPeriod }: {
  mode: Exclude<Mode, "lifecycle">;
  period: ReportPeriod;
  setPeriod: (period: ReportPeriod) => void;
}) {
  const options = hubReports.filter(report => report.group === mode);
  const [selected, setSelected] = useState(options[0].id);
  const [way, setWay] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof loadHubReport>>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController>();
  useEffect(() => () => request.current?.abort(), []);
  const definition = options.find(report => report.id === selected) || options[0];

  function clearResult() {
    setResult(undefined);
    setError("");
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!period.from || !period.to || period.from > period.to) {
      setError("Choose a valid start and end date.");
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    clearResult();
    try {
      const value = await loadHubReport(definition, period, way, controller.signal);
      if (!controller.signal.aborted) setResult(value);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The report could not be generated.");
    } finally {
      if (request.current === controller && !controller.signal.aborted) {
        request.current = undefined;
        setBusy(false);
      }
    }
  }

  return (
    <section aria-label="Report generator" className="space-y-4">
      <form onSubmit={generate} className="rounded-xl border border-slate-700 bg-[#0b1b2b] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-56 flex-[2] text-xs font-semibold">Report type
            <select className={field} value={selected} disabled={busy}
              onChange={event => { setSelected(event.target.value); clearResult(); }}>
              {options.map(option => <option key={option.id} value={option.id}>{option.title}</option>)}
            </select>
          </label>
          <label className="min-w-36 flex-1 text-xs font-semibold">From date
            <input type="date" className={field} value={period.from} max={period.to || undefined} required disabled={busy}
              onChange={event => { setPeriod({ ...period, from: event.target.value }); clearResult(); }} />
          </label>
          <label className="min-w-36 flex-1 text-xs font-semibold">Through date
            <input type="date" className={field} value={period.to} min={period.from || undefined} required disabled={busy}
              onChange={event => { setPeriod({ ...period, to: event.target.value }); clearResult(); }} />
          </label>
          {selected === "parcel-finance" && <label className="min-w-36 flex-1 text-xs font-semibold">Exact Way ID
            <input className={field} value={way} maxLength={100} disabled={busy}
              onChange={event => { setWay(event.target.value); clearResult(); }} />
          </label>}
          <button type="submit" className={primary} disabled={busy}><Search size={16} aria-hidden="true" />Generate report</button>
        </div>
        <p className="mt-3 text-xs text-slate-300">{definition.basis}. End dates are inclusive.</p>
      </form>

      {busy && <p role="status" className="text-sm text-cyan-100">Generating report…</p>}
      {error && <p role="alert" className="rounded-lg border border-rose-700 bg-rose-950 p-3 text-sm">{error}</p>}
      {result?.summary && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {pnlMetrics.map(([key, label]) => (
          <div key={key} className="rounded-lg border border-slate-700 bg-[#0b1b2b] p-3">
            <p className="text-sm text-slate-300">{label}</p>
            <p className="mt-1 text-xl font-bold text-slate-50">{numeric(result.summary?.[key])}</p>
          </div>
        ))}
      </div>}
      {result && <ReportResult report={result.report} />}
    </section>
  );
}

export function WayFinanceDetail({ way, period }: { way: string; period: ReportPeriod }) {
  const [report, setReport] = useState<FinanceReport>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController>();
  useEffect(() => () => pending.current?.abort(), []);

  async function load() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      const result = await loadWayFinance(way, period, controller.signal);
      if (!controller.signal.aborted) setReport(result);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Financial history is unavailable.");
    } finally {
      if (pending.current === controller && !controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-2 border-t border-slate-700 pt-4">
      {!report && <button className={secondary} disabled={busy} onClick={() => void load()}>
        {busy ? "Loading financial history…" : "Load linked financial history"}
      </button>}
      {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
      {report && <ReportResult report={report} />}
    </div>
  );
}

function numeric(value: unknown, unit = " MMK") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return money.format(value) + unit;
}

function ReportResult({ report }: { report: FinanceReport }) {
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const count = report.rows.length;
  const pageSize = 25;

  async function download(format: "excel" | "pdf") {
    setBusy(true);
    setError("");
    try {
      if (format === "excel") await exportFinanceExcel(report);
      else printFinancePdf(report);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 overflow-hidden rounded-xl border border-slate-700 bg-[#0b1b2b] p-4" aria-label="Generated report">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold">{report.title}</h2>
          <p className="text-xs text-slate-300">{report.filters.From && `${report.filters.From} to ${report.filters.Through} · `}{count.toLocaleString()} records</p>
        </div>
        <div className="flex gap-2">
          <button className={secondary} disabled={!count || busy} onClick={() => void download("excel")}><Download size={15} aria-hidden="true" /> Excel</button>
          <button className={secondary} disabled={!count || busy} onClick={() => void download("pdf")}><Printer size={15} aria-hidden="true" /> Print / Save as PDF</button>
        </div>
      </div>
      <p className="text-xs text-slate-300">{report.note}</p>
      {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
      {!count ? <p className="rounded-md bg-slate-900 p-4 text-sm text-slate-300">No matching records.</p> : <>
        <div className="overflow-auto rounded-md border border-slate-700">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead><tr>{report.columns.map(column => <th scope="col" key={column.key} className="px-3 py-2">{column.label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-700">
              {report.rows.slice(offset, offset + pageSize).map((row, index) => (
                <tr key={offset + index}>{report.columns.map(column => (
                  <td key={column.key} className="px-3 py-2 align-top">
                    {column.kind === "number" ? numeric(row[column.key], "") : String(row[column.key] ?? "—")}
                  </td>
                ))}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <nav className="flex flex-wrap items-center justify-between gap-2" aria-label="Generated report pages">
          <span className="text-xs text-slate-300">{offset + 1}–{Math.min(offset + pageSize, count)} of {count.toLocaleString()}</span>
          <div className="flex gap-2">
            <button className={secondary} disabled={offset === 0} onClick={() => setOffset(offset - pageSize)}>Previous</button>
            <button className={secondary} disabled={offset + pageSize >= count} onClick={() => setOffset(offset + pageSize)}>Next</button>
          </div>
        </nav>
      </>}
    </section>
  );
}
