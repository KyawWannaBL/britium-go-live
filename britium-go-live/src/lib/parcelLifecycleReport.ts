import { openParcelPrintWindow, sanitizeExcel } from "@/lib/parcelReportExport";

export const phases = [
  ["pickup", "Pickup"],
  ["registration", "Registration"],
  ["warehouse", "Warehouse"],
  ["dispatch", "Dispatch"],
  ["delivery", "Delivery & returns"],
  ["cod", "Rider COD"],
  ["settlement", "Merchant settlement"],
  ["post", "Follow-up & adjustments"],
] as const;

export type LifecyclePhase = (typeof phases)[number][0];

export type LifecycleEvent = {
  at: string;
  phase: LifecyclePhase;
  event: string;
  scope: "Pickup" | "Parcel" | "Batch";
  source: string;
  reference: string | null;
  detail: string | null;
};

export type LifecycleRow = {
  row_key: string;
  way_id: string | null;
  pickup_id: string | null;
  started_at: string;
  branch_code: string | null;
  merchant_code: string | null;
  merchant_name: string | null;
  township: string | null;
  status: string | null;
  events: LifecycleEvent[];
};

export type LifecycleReport = {
  from: string;
  to: string;
  search: string;
  asOf: string;
  rows: LifecycleRow[];
};

export const reportDateBasis = "Pickup request date, then registration or the first available parcel record";

const timezone = "Asia/Yangon";
const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
});
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: timezone, year: "numeric", month: "short", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export function myanmarDay(date = new Date()) {
  const parts = dayFormat.formatToParts(date);
  return ["year", "month", "day"].map(part => parts.find(p => p.type === part)?.value).join("-");
}

export function reportTime(value: string | null | undefined) {
  return value ? dateTimeFormat.format(new Date(value)) : "";
}

export function eventLabel(event: LifecycleEvent) {
  if (!/^[A-Z][A-Z_]+$/.test(event.event)) return event.event;
  const label = event.event.replace(/_/g, " ").toLowerCase();
  return label[0].toUpperCase() + label.slice(1);
}

export function phaseLabel(phase: LifecyclePhase) {
  return phases.find(([key]) => key === phase)?.[1] || phase;
}

export function lastPhaseEvents(events: LifecycleEvent[]) {
  const latest = new Map<LifecyclePhase, LifecycleEvent>();
  for (const event of events) latest.set(event.phase, event);
  return latest;
}

export function merchantLabel(row: LifecycleRow) {
  return [row.merchant_name, row.merchant_code]
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .join(" · ");
}

export function elapsedHours(from: string, through: string) {
  return Math.round((new Date(through).valueOf() - new Date(from).valueOf()) / 36000) / 100;
}

export async function downloadLifecycleExcel(report: LifecycleReport) {
  const xlsx = await import("xlsx");
  const workbook = xlsx.utils.book_new();
  const addSheet = (name: string, columns: string[], rows: Array<Array<string | number | null>>) => {
    // Excel supports 1,048,576 rows including the header. Preserve the entire range.
    const pageSize = 1_000_000;
    for (let offset = 0; offset < Math.max(1, rows.length); offset += pageSize) {
      const sheet = xlsx.utils.aoa_to_sheet([columns, ...rows.slice(offset, offset + pageSize)
        .map(row => row.map(cell => typeof cell === "number" ? cell : sanitizeExcel(cell)))]);
      sheet["!cols"] = columns.map(column => ({ wch: Math.min(46, Math.max(19, column.length + 3)) }));
      if (sheet["!ref"]) sheet["!autofilter"] = { ref: sheet["!ref"] };
      xlsx.utils.book_append_sheet(workbook, sheet, offset ? `${name} ${Math.floor(offset / pageSize) + 1}` : name);
    }
  };

  addSheet("Parcel overview",
    ["Record type", "Way ID", "Pickup ID", "Merchant", "Branch", "Township", "Lifecycle start (Myanmar)", "Latest evidence (Myanmar)", "Elapsed hours", ...phases.map(([, label]) => label)],
    report.rows.map(row => {
      const latest = row.events[row.events.length - 1];
      const checkpoints = lastPhaseEvents(row.events);
      return [
        row.way_id ? "Parcel" : "Pickup request · Way ID pending", row.way_id, row.pickup_id,
        merchantLabel(row), row.branch_code, row.township, reportTime(row.started_at),
        reportTime(latest?.at), latest && latest.at >= row.started_at ? elapsedHours(row.started_at, latest.at) : null,
        ...phases.map(([key]) => reportTime(checkpoints.get(key)?.at)),
      ];
    }),
  );
  addSheet("Event history",
    ["Way ID", "Pickup ID", "Merchant", "Event time (Myanmar)", "Event time (UTC)", "Phase", "Event", "Scope", "Source", "Reference", "Recorded detail"],
    report.rows.flatMap(row => row.events.map(event => [
      row.way_id, row.pickup_id, merchantLabel(row), reportTime(event.at), new Date(event.at).toISOString(),
      phaseLabel(event.phase),
      eventLabel(event), event.scope, event.source, event.reference, event.detail,
    ])),
  );
  addSheet("Report details", ["Field", "Value"], [
    ["Report", "Britium Express · Bird’s Eye Parcel Report"],
    ["Date selection", reportDateBasis],
    ["From (inclusive, Myanmar)", report.from],
    ["Through (inclusive, Myanmar)", report.to],
    ["Evidence cutoff (Myanmar)", reportTime(report.asOf)],
    ["Search", report.search || "All"],
    ["Parcels", report.rows.filter(row => row.way_id).length],
    ["Pickup requests awaiting Way ID", report.rows.filter(row => !row.way_id).length],
    ["Pickup and batch events", "Shared evidence shown on related parcel histories. Batch amounts apply to the whole batch."],
    ["Missing event", "No timestamped evidence was found in the connected sources."],
  ]);
  xlsx.writeFile(workbook, `britium-parcel-lifecycle-${report.from}-to-${report.to}.xlsx`, { compression: true });
}

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, character => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character
));

export function printLifecyclePdf(report: LifecycleReport) {
  const page = openParcelPrintWindow();
  if (!page) throw new Error("Allow pop-ups for this portal, then select PDF again.");
  page.opener = null;
  const h = escapeHtml;
  const sections = report.rows.map(row => {
    const heading = row.way_id || `${row.pickup_id} · Way ID pending`;
    const context = [row.way_id && row.pickup_id, merchantLabel(row), row.branch_code, row.township].filter(Boolean).join(" · ");
    const events = row.events.map(event => [
      reportTime(event.at), phaseLabel(event.phase), eventLabel(event), event.scope, event.source, event.reference, event.detail,
    ]);
    return `<section><h2>${h(heading)}</h2><p class="meta">${h(context)}<br>Lifecycle start ${h(reportTime(row.started_at))}</p>
      ${events.length ? `<table><thead><tr>${["Time (Myanmar)", "Phase", "Event", "Scope", "Source", "Reference", "Detail"]
        .map(value => `<th>${h(value)}</th>`).join("")}</tr></thead><tbody>${events.map(event =>
          `<tr>${event.map(value => `<td>${h(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
      : "<p>No timestamped events found.</p>"}</section>`;
  });
  page.document.open();
  page.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Britium Parcel Lifecycle ${h(report.from)} to ${h(report.to)}</title>
    <style>@page{size:A4 landscape;margin:13mm}body{font:11px system-ui,"Noto Sans Myanmar",sans-serif;color:#102235;padding:6px}h1{font-size:22px;margin-bottom:6px}h2{font-size:15px;margin-bottom:3px;break-after:avoid}
    .meta{color:#40546a;margin:4px 0 7px;break-after:avoid}section{margin-top:19px}table{width:100%;border-collapse:collapse;text-align:left}
    th,td{padding:5px 7px;border-bottom:1px solid #cbd5e1;overflow-wrap:anywhere;vertical-align:top}th{background:#e8eef5}th:first-child,td:first-child{white-space:nowrap}
    thead{display:table-header-group}tr{break-inside:avoid}@media print{button{display:none}}</style></head>
    <body><button type="button" onclick="window.print()">Print / Save as PDF</button>
    <h1>Britium Express · Bird’s Eye Parcel Report</h1><p>${h(reportDateBasis)}<br>
    ${h(report.from)} to ${h(report.to)} (inclusive) · Evidence through ${h(reportTime(report.asOf))} Myanmar time<br>
    ${report.rows.filter(row => row.way_id).length} parcels · ${report.rows.filter(row => !row.way_id).length} pickups awaiting a Way ID
    ${report.search ? ` · Search ${h(report.search)}` : ""}</p>
    <p>Pickup and batch events are shared across linked parcels. Any batch amount shown applies to the whole batch.</p>${sections.join("")}</body></html>`);
  page.document.close();
  page.focus();
}
