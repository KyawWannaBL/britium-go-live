import React from "react";

function entries(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((v) => v !== null && typeof v === "object") : [];
}

export function reportedDateMatches(row: any, from: string, to: string) {
  return entries(row?.reported_source_history).some((event) => {
    const date = String(event.work_date || "");
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && (!from || date >= from) && (!to || date <= to);
  });
}

export function WarehouseReportedHistory({ history }: { history: unknown }) {
  const rows = entries(history);
  if (!rows.length) return <span className="text-slate-500">-</span>;
  return <div className="space-y-3 text-xs">
    <div className="text-amber-200">Reported · MD completion assumption<br />Scan evidence is separate</div>
    {rows.map((event, index) => <div key={`${event.wayplan_id}-${index}`} className="border-t border-slate-700 pt-2">
      <div className="font-semibold text-slate-200">{String(event.work_date || "")} · {String(event.wayplan_id || "")}</div>
      <div>{String(event.reported_outcome || "Recorded source assignment").replaceAll("_", " ")}</div>
      <div className="text-slate-300">{[event.rider_name, event.driver_name, event.helper_name, event.vehicle_code].filter(Boolean).map(String).join(" · ")}</div>
      {event.reason ? <div className="mt-1 whitespace-normal text-slate-100">
        <span className="font-semibold">{String(event.verification || "Unclassified")}: </span>{String(event.reason)}
      </div> : null}
    </div>)}
  </div>;
}
