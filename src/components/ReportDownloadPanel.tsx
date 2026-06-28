import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";

type ReportItem = {
  report_name: string;
  report_label_en: string;
  report_label_mm?: string;
  module_code: string;
};

const moduleByPath: Record<string, string> = {
  "dashboard": "dashboard",
  "create-delivery": "create_delivery",
  "cs-portal": "customer_service",
  "customer-service": "customer_service",
  "way-management": "way_management",
  "supervisor": "supervisor",
  "data-entry": "data_entry",
  "warehouse": "warehouse",
  "dispatch": "dispatch",
  "branch-office": "branch_office",
  "finance": "finance",
  "cod-settlement": "cod_settlement",
  "waybill-invoice": "waybill_invoice",
  "merchant-portal": "merchant",
  "customer-portal": "customer",
  "marketing": "marketing",
  "business-development": "business_development",
  "ops-manager": "ops_manager",
  "rider-ops": "rider_ops",
  "master-data": "master_data",
  "exceptions": "exceptions",
  "reporting": "reporting",
  "settings": "settings"
};

function getModuleFromPath(pathname: string) {
  const key = pathname.split("/").filter(Boolean)[0] || "dashboard";
  return moduleByPath[key] || key || "dashboard";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthNow() {
  return new Date().toISOString().slice(0, 7);
}

function yearNow() {
  return String(new Date().getFullYear());
}

function safeCell(value: any) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function flatten(input: any, prefix = "", output: Record<string, any> = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    output[prefix || "value"] = input;
    return output;
  }

  Object.keys(input).forEach((key) => {
    const value = input[key];
    const next = prefix ? prefix + "." + key : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flatten(value, next, output);
    } else {
      output[next] = Array.isArray(value) ? JSON.stringify(value) : value;
    }
  });

  return output;
}

function toCsv(rows: any[]) {
  const flatRows = rows.map((row) => flatten(row));
  const keys: string[] = [];

  flatRows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (keys.indexOf(key) === -1) keys.push(key);
    });
  });

  const esc = (value: any) => '"' + safeCell(value).replace(/"/g, '""') + '"';
  return [keys.map(esc).join(",")]
    .concat(flatRows.map((row) => keys.map((key) => esc(row[key])).join(",")))
    .join("\n");
}

function downloadFile(filename: string, body: string, mime: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ReportDownloadPanel() {
  const location = useLocation();
  const moduleCode = useMemo(() => getModuleFromPath(location.pathname), [location.pathname]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [reportName, setReportName] = useState("all");
  const [mode, setMode] = useState("date");
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());
  const [month, setMonth] = useState(monthNow());
  const [year, setYear] = useState(yearNow());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const lang = localStorage.getItem("be_language") || localStorage.getItem("be_lang") || "en";
  const isMm = lang === "mm" || lang === "my";

  useEffect(() => {
    let active = true;

    async function load() {
      const { data } = await (supabase as any).rpc("be_get_report_catalog", {
        p_payload: { module_code: moduleCode }
      });

      if (!active) return;
      const rows = data?.reports || [];
      setReports(rows);
      setReportName("all");
    }

    load();

    return () => {
      active = false;
    };
  }, [moduleCode]);

  if (location.pathname.toLowerCase().indexOf("login") >= 0) return null;

  async function runDownload(format: "csv" | "json") {
    setBusy(true);
    setMessage("");

    const payload: any = {
      module_code: moduleCode,
      report_name: reportName,
      actor_email: localStorage.getItem("be_user_email") || "",
      limit: 50000
    };

    if (mode === "date") {
      payload.date_from = dateFrom;
      payload.date_to = dateFrom;
    } else if (mode === "range") {
      payload.date_from = dateFrom;
      payload.date_to = dateTo;
    } else if (mode === "month") {
      payload.month = month;
    } else if (mode === "year") {
      payload.year = year;
    }

    const { data, error } = await (supabase as any).rpc("be_get_report_download_data", {
      p_payload: payload
    });

    setBusy(false);

    if (error || !data?.ok) {
      setMessage(error?.message || data?.error || "Report download failed");
      return;
    }

    const rows = data.rows || [];
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
    const cleanReport = reportName === "all" ? "all_reports" : reportName;
    const filenameBase = moduleCode + "_" + cleanReport + "_" + stamp;

    if (format === "json") {
      downloadFile(filenameBase + ".json", JSON.stringify(data, null, 2), "application/json;charset=utf-8");
    } else {
      downloadFile(filenameBase + ".csv", toCsv(rows), "text/csv;charset=utf-8");
    }

    setMessage("Downloaded " + rows.length + " rows");
  }

  const label = (item: ReportItem) => isMm ? (item.report_label_mm || item.report_label_en) : item.report_label_en;

  const controlStyle: React.CSSProperties = {
    height: 44,
    minHeight: 44,
    borderRadius: 12,
    border: "1px solid rgba(228,183,46,.35)",
    background: "rgba(15,29,51,.82)",
    color: "#fff",
    padding: "0 12px",
    fontWeight: 800,
    outline: "none",
    width: "100%"
  };

  const buttonStyle: React.CSSProperties = {
    height: 44,
    minHeight: 44,
    borderRadius: 12,
    border: "1px solid rgba(228,183,46,.45)",
    background: "rgba(228,183,46,.92)",
    color: "#07111f",
    padding: "0 16px",
    fontWeight: 950,
    cursor: "pointer",
    whiteSpace: "nowrap"
  };

  return (
    <section style={{
      margin: "0 0 24px",
      padding: 18,
      border: "1px solid rgba(255,255,255,.10)",
      borderRadius: 18,
      background: "rgba(18,34,58,.72)",
      boxShadow: "0 16px 40px rgba(0,0,0,.14)"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <p style={{ margin: "0 0 4px", color: "#facc15", letterSpacing: ".14em", textTransform: "uppercase", fontSize: 11, fontWeight: 950 }}>
            {isMm ? "အစီရင်ခံစာ Download" : "Report Download"}
          </p>
          <h3 style={{ margin: 0, color: "#fff", fontSize: 20 }}>
            {isMm ? "Submitted Data / Timeline Report" : "Submitted Data / Timeline Report"}
          </h3>
        </div>
        {message && <div style={{ color: message.indexOf("failed") >= 0 ? "#fb7185" : "#86efac", fontWeight: 900 }}>{message}</div>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(150px, 1fr))", gap: 12, alignItems: "end" }}>
        <label style={{ color: "#dbeafe", fontWeight: 900, fontSize: 12 }}>
          {isMm ? "Report Name" : "Report Name"}
          <select value={reportName} onChange={(e) => setReportName(e.target.value)} style={controlStyle}>
            <option value="all">{isMm ? "အားလုံး" : "All reports for this screen"}</option>
            {reports.map((item) => (
              <option key={item.module_code + item.report_name} value={item.report_name}>{label(item)}</option>
            ))}
          </select>
        </label>

        <label style={{ color: "#dbeafe", fontWeight: 900, fontSize: 12 }}>
          {isMm ? "Timeline" : "Timeline"}
          <select value={mode} onChange={(e) => setMode(e.target.value)} style={controlStyle}>
            <option value="date">Date</option>
            <option value="range">Date Range</option>
            <option value="month">Month</option>
            <option value="year">Year</option>
          </select>
        </label>

        {mode === "month" ? (
          <label style={{ color: "#dbeafe", fontWeight: 900, fontSize: 12 }}>Month<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={controlStyle} /></label>
        ) : mode === "year" ? (
          <label style={{ color: "#dbeafe", fontWeight: 900, fontSize: 12 }}>Year<input type="number" value={year} onChange={(e) => setYear(e.target.value)} style={controlStyle} /></label>
        ) : (
          <label style={{ color: "#dbeafe", fontWeight: 900, fontSize: 12 }}>Date From<input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={controlStyle} /></label>
        )}

        {mode === "range" ? (
          <label style={{ color: "#dbeafe", fontWeight: 900, fontSize: 12 }}>Date To<input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={controlStyle} /></label>
        ) : <div />}

        <button disabled={busy} onClick={() => runDownload("csv")} style={buttonStyle}>{busy ? "Preparing..." : "Download CSV"}</button>
        <button disabled={busy} onClick={() => runDownload("json")} style={{ ...buttonStyle, background: "rgba(228,183,46,.18)", color: "#facc15" }}>{busy ? "Preparing..." : "Download JSON"}</button>
      </div>
    </section>
  );
}
