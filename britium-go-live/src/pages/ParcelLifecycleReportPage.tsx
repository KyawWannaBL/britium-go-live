import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronDown, ChevronRight, FileSpreadsheet, Printer, Search } from "lucide-react";
import BirdsEyeReportingHub, { WayFinanceDetail } from "@/components/BirdsEyeReportingHub";
import { type ReportPeriod } from "@/lib/birdsEyeReports";
import { supabase } from "@/integrations/supabase/client";
import {
  downloadLifecycleExcel, elapsedHours, eventLabel, lastPhaseEvents, merchantLabel,
  phases, printLifecyclePdf, reportDateBasis, reportTime, type LifecycleReport, type LifecycleRow,
} from "@/lib/parcelLifecycleReport";

const toolbarButton = "inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 font-semibold text-sm hover:bg-slate-800 disabled:opacity-40";
const inputClass = "mt-1 block h-10 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 text-sm font-normal text-white";
const rowsPerPage = 25;

type ReportPage = { as_of: string; rows: LifecycleRow[]; has_more: boolean };

export default function ParcelLifecycleReportPage() {
  return <BirdsEyeReportingHub timeline={(period, setPeriod) =>
    <ParcelJourney period={period} setPeriod={setPeriod} />} />;
}

function ParcelJourney({ period, setPeriod }: {
  period: ReportPeriod;
  setPeriod: (period: ReportPeriod) => void;
}) {
  const [search, setSearch] = useState("");
  const filters = { ...period, search };
  const [report, setReport] = useState<LifecycleReport>();
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string>();
  const request = useRef<AbortController>();
  useEffect(() => () => request.current?.abort(), []);

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!filters.from || !filters.to || filters.from > filters.to) {
      setError("Choose a valid start and end date.");
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const selection = { ...filters, search: filters.search.trim() };
    const rows: LifecycleRow[] = [];
    let asOf: string | null = null;
    let after: LifecycleRow | undefined;
    setError("");
    setReport(undefined);
    setPage(0);
    setExpanded(undefined);
    setLoaded(0);
    setLoading(true);
    try {
      while (true) {
        const { data, error: failure } = await (supabase as any).rpc("be_parcel_lifecycle_report", {
          p_from: selection.from,
          p_to: selection.to,
          p_search: selection.search || null,
          p_as_of: asOf,
          p_after_at: after?.started_at ?? null,
          p_after_key: after?.row_key ?? null,
          p_limit: 100,
        }).abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        if (failure) throw new Error(failure.message);
        const result: ReportPage = data;
        if (!result || !Array.isArray(result.rows) || !result.as_of || (asOf && asOf !== result.as_of)) {
          throw new Error("The report returned an invalid page.");
        }
        asOf = result.as_of;
        rows.push(...result.rows);
        setLoaded(rows.length);
        if (!result.has_more) break;
        const last = result.rows[result.rows.length - 1];
        if (!last || last.row_key === after?.row_key) throw new Error("The report could not advance to the next page.");
        after = last;
      }
      setReport({ ...selection, asOf: asOf!, rows });
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The report could not be generated.");
    } finally {
      if (request.current === controller && !controller.signal.aborted) {
        request.current = undefined;
        setLoading(false);
      }
    }
  }

  function stop() {
    request.current?.abort();
    request.current = undefined;
    setLoading(false);
  }

  async function download(format: "pdf" | "excel") {
    if (!report?.rows.length || exporting) return;
    setExporting(true);
    setError("");
    try {
      if (format === "pdf") printLifecyclePdf(report);
      else await downloadLifecycleExcel(report);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The export failed.");
    } finally {
      setExporting(false);
    }
  }

  const rows = report?.rows || [];
  const parcelCount = rows.filter(row => row.way_id).length;
  const pageCount = Math.ceil(rows.length / rowsPerPage);
  const visible = rows.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
  const eventCount = rows.reduce((count, row) => count + row.events.length, 0);

  return (
    <section className="space-y-5" aria-label="Parcel journey">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-700 pb-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-50">Parcel journey</h2>
          <p className="mt-1 text-sm text-slate-300">Parcel histories from pickup request through delivery, settlement and follow-up.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={toolbarButton} disabled={!rows.length || exporting} onClick={() => void download("pdf")}>
            <Printer size={16} aria-hidden="true" /> PDF
          </button>
          <button className={toolbarButton} disabled={!rows.length || exporting} onClick={() => void download("excel")}>
            <FileSpreadsheet size={16} aria-hidden="true" /> Excel
          </button>
        </div>
      </header>

      <section className="rounded-xl border border-slate-700 bg-[#0b1b2b] p-4" aria-label="Report filters">
        <form onSubmit={generate} className="flex flex-wrap items-end gap-3">
          <label className="min-w-36 flex-1 text-xs font-semibold">From date
            <input className={inputClass} type="date" required value={filters.from} max={filters.to || undefined}
              onChange={e => setPeriod({ ...period, from: e.target.value })} disabled={loading} />
          </label>
          <label className="min-w-36 flex-1 text-xs font-semibold">Through date
            <input className={inputClass} type="date" required value={filters.to} min={filters.from || undefined}
              onChange={e => setPeriod({ ...period, to: e.target.value })} disabled={loading} />
          </label>
          <label className="min-w-52 flex-[2] text-xs font-semibold">Way ID, pickup ID or merchant
            <input className={inputClass} value={filters.search} maxLength={100}
              onChange={e => setSearch(e.target.value)} disabled={loading} />
          </label>
          <button type="submit" disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-amber-400 px-4 text-sm font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-50">
            <Search size={16} aria-hidden="true" /> Generate report
          </button>
          {loading && <button type="button" className={toolbarButton} onClick={stop}>Cancel</button>}
        </form>
        <p className="mt-3 text-xs text-slate-300">{reportDateBasis}. Dates are inclusive in Myanmar time. Histories include later events through report generation.</p>
      </section>

      {error && <p role="alert" className="rounded-lg border border-rose-700 bg-rose-950 p-3 text-sm text-rose-100">{error}</p>}
      {loading && <p role="status" className="text-sm text-cyan-100">Loading lifecycle records · {loaded.toLocaleString()} loaded</p>}
      {report && (
        <section aria-label="Lifecycle report results" className="overflow-hidden rounded-xl border border-slate-700 bg-[#0b1b2b]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 px-4 py-3">
            <div>
              <p className="font-semibold">{report.from} to {report.to}{report.search && <span className="ml-2 text-slate-300">· {report.search}</span>}</p>
              <p className="text-xs text-slate-300">Evidence through {reportTime(report.asOf)} Myanmar time</p>
            </div>
            <p className="text-sm text-cyan-100">{parcelCount.toLocaleString()} parcels · {(rows.length - parcelCount).toLocaleString()} pickups awaiting Way ID · {eventCount.toLocaleString()} event entries</p>
          </div>
          {visible.length ? <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1280px] text-left text-xs">
                <thead className="bg-slate-900 text-slate-300">
                  <tr>
                    <th scope="col" className="px-4 py-3">Parcel / pickup</th>
                    {phases.map(([phase, label]) => <th scope="col" key={phase} className="px-3 py-3">{label}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {visible.map(row => {
                    const latest = lastPhaseEvents(row.events);
                    const open = expanded === row.row_key;
                    return (
                      <Fragment key={row.row_key}>
                        <tr className="align-top hover:bg-slate-800/70">
                          <td className="min-w-40 px-4 py-3 font-normal">
                            <button className="inline-flex items-center gap-1 text-left font-bold text-cyan-200 hover:underline"
                              aria-expanded={open} onClick={() => setExpanded(open ? undefined : row.row_key)}>
                              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              {row.way_id || row.pickup_id}
                            </button>
                            <p className="mt-1 text-slate-300">{row.way_id ? merchantLabel(row) : "Way ID pending"}</p>
                            {row.branch_code && <p className="text-slate-400">{row.branch_code}</p>}
                          </td>
                          {phases.map(([phase]) => {
                            const event = latest.get(phase);
                            return (
                              <td className="px-3 py-3" key={phase}>
                                {event ? <><p className="font-medium">{eventLabel(event)}</p><time className="mt-1 block text-slate-300" dateTime={event.at}>{reportTime(event.at)}</time></>
                                  : <span className="text-slate-400" aria-label="No event recorded">—</span>}
                              </td>
                            );
                          })}
                        </tr>
                        {open && <tr><td colSpan={phases.length + 1} className="bg-slate-950/70 px-6 py-4"><Timeline row={row} />{row.way_id && <WayFinanceDetail way={row.way_id} period={{ from: report.from, to: report.to }} />}</td></tr>}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-700 px-4 py-3 text-sm">
              <span>{page * rowsPerPage + 1}–{Math.min((page + 1) * rowsPerPage, rows.length)} of {rows.length.toLocaleString()} records</span>
              <nav className="flex gap-2" aria-label="Report pages">
                <button className={toolbarButton} disabled={page === 0} onClick={() => { setPage(page - 1); setExpanded(undefined); }}>Previous</button>
                <button className={toolbarButton} disabled={page + 1 >= pageCount} onClick={() => { setPage(page + 1); setExpanded(undefined); }}>Next</button>
              </nav>
            </footer>
          </> : <p className="px-4 py-8 text-center text-sm text-slate-300">No parcels or pickup requests match this timeframe.</p>}
        </section>
      )}
    </section>
  );
}

function Timeline({ row }: { row: LifecycleRow }) {
  const last = row.events[row.events.length - 1];
  return (
    <section aria-label={`Timeline for ${row.way_id || row.pickup_id}`}>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
        {row.pickup_id && <span>Pickup {row.pickup_id}</span>}
        {row.township && <span>{row.township}</span>}
        <span>Lifecycle start {reportTime(row.started_at)}</span>
        {last && elapsedHours(row.started_at, last.at) >= 0 &&
          <span>{elapsedHours(row.started_at, last.at).toLocaleString()} hours to latest evidence</span>}
      </div>
      <p className="mb-3 text-xs text-slate-300">Pickup and batch entries are shared across linked parcels.</p>
      {row.events.length ? (
        <ol className="divide-y divide-slate-800">
          {row.events.map((event, index) => (
            <li key={`${event.at}-${index}`} className="grid gap-1 py-2 sm:grid-cols-[180px_1fr_1fr]">
              <time className="text-cyan-200" dateTime={event.at}>{reportTime(event.at)}</time>
              <div><p className="font-semibold">{eventLabel(event)}</p><p className="text-slate-300">{event.detail}</p></div>
              <p className="text-slate-300">{event.scope} · {event.source}{event.reference ? ` · ${event.reference}` : ""}</p>
            </li>
          ))}
        </ol>
      ) : <p className="text-slate-300">No timestamped evidence was found for this record.</p>}
    </section>
  );
}
