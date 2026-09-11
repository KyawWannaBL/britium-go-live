// @ts-nocheck
import React, { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getTemplateSchema,
  normalizeUploadPayload,
  parseCsvText,
  validateTemplateRows,
} from "@/lib/britiumGoLiveTemplateSchemas";

function readFileText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

const scanTypes = ["Inbound Scan", "Sorting Scan", "Bag Scan", "Dispatch Scan", "Exception Scan"];
const statusOptions = ["Received", "In Warehouse", "Sorting", "Bagged", "Dispatched", "Out for Delivery", "Exception"];

export default function WarehouseUATUploadPage() {
  const schema = getTemplateSchema("warehouse");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [message, setMessage] = useState("Warehouse UAT is scan-driven and uses real backend IDs only. Old manifests/storage records are not rendered here.");
  const [submitting, setSubmitting] = useState(false);
  const [lookup, setLookup] = useState<any>(null);
  const [manual, setManual] = useState({
    scan_reference: "",
    scan_type: "Inbound Scan",
    current_status: "Received",
    next_status: "In Warehouse",
    warehouse_branch: "YGN",
    operator: "",
    bag_code: "",
    exception_reason: "",
    damage_note: "",
    missing_parcel_note: "",
  });

  const validation = useMemo(() => validateTemplateRows(schema, headers, rows), [schema, headers, rows]);

  async function handleFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    try {
      const text = await readFileText(file);
      const parsed = parseCsvText(text);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMessage(`Loaded ${parsed.rows.length} warehouse scan rows from ${file.name}.`);
    } catch (error: any) {
      setHeaders([]);
      setRows([]);
      setMessage(error?.message || "Unable to read warehouse file.");
    }
  }

  async function submitRows() {
    if (!rows.length) {
      setMessage("No warehouse rows to submit.");
      return;
    }
    if (!validation.isValid) {
      setMessage("Fix validation errors before submitting warehouse rows.");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await (supabase as any).rpc(schema.rpc, {
        p_rows: normalizeUploadPayload(schema, rows),
        p_source: "UAT_GO_LIVE_WAREHOUSE_UPLOAD",
      });
      if (error) throw error;
      setMessage(`Warehouse upload completed. Result: ${JSON.stringify(data || {})}`);
    } catch (error: any) {
      setMessage(`Warehouse upload RPC failed or is not deployed yet: ${error?.message || "unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function lookupReference() {
    const ref = manual.scan_reference.trim();
    if (!ref) {
      setMessage("Enter a Waybill No, Pickup ID, or Deliver ID.");
      return;
    }

    setLookup(null);
    try {
      const { data, error } = await (supabase as any).rpc("be_warehouse_scan_lookup", {
        p_reference: ref,
      });
      if (error) throw error;
      setLookup(data || {});
      setMessage("Scan reference loaded from backend.");
    } catch (error: any) {
      setMessage(`Lookup failed or RPC is not deployed yet: ${error?.message || "unknown error"}`);
    }
  }

  async function submitManualScan() {
    const ref = manual.scan_reference.trim();
    if (!ref) {
      setMessage("Enter a scan reference before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...manual,
        lookup,
        scanned_at: new Date().toISOString(),
      };
      const { data, error } = await (supabase as any).rpc("be_warehouse_scan_upsert", {
        p_reference: ref,
        p_payload: payload,
      });
      if (error) throw error;
      setMessage(`Manual scan submitted. Result: ${JSON.stringify(data || {})}`);
    } catch (error: any) {
      setMessage(`Manual scan failed or RPC is not deployed yet: ${error?.message || "unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-5 text-slate-950">
      <section className="rounded-[32px] bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-700">Warehouse UAT</p>
            <h1 className="mt-2 text-4xl font-black">Warehouse Scan & Inventory</h1>
            <p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-slate-600">
              Intake, sorting, bagging, dispatch, and exception workflow with backend lookup/auto-fill by Waybill, Pickup ID, or Deliver ID.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={schema.xlsxFile} download className="rounded-2xl bg-blue-700 px-5 py-3 text-xs font-black uppercase text-white">Download XLSX</a>
            <a href={schema.csvFile} download className="rounded-2xl bg-white px-5 py-3 text-xs font-black uppercase text-slate-700 ring-1 ring-slate-200">Download CSV</a>
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900 ring-1 ring-blue-100">{message}</div>
      </section>

      <section className="mt-5 grid gap-4 xl:grid-cols-2">
        <article className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-2xl font-black">Manual Scan</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">Use this for one-off warehouse intake or exception scans.</p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="text-xs font-black uppercase text-slate-400">Waybill / Pickup / Deliver ID</span>
              <div className="mt-1 flex gap-2">
                <input value={manual.scan_reference} onChange={(event) => setManual({ ...manual, scan_reference: event.target.value })} className="w-full rounded-2xl bg-slate-50 px-4 py-3 font-bold outline-none ring-1 ring-slate-200" placeholder="W0525-BBK-001" />
                <button type="button" onClick={lookupReference} className="rounded-2xl bg-slate-950 px-5 py-3 text-xs font-black uppercase text-white">Lookup</button>
              </div>
            </label>

            <label>
              <span className="text-xs font-black uppercase text-slate-400">Scan Type</span>
              <select value={manual.scan_type} onChange={(event) => setManual({ ...manual, scan_type: event.target.value })} className="mt-1 w-full rounded-2xl bg-slate-50 px-4 py-3 font-bold outline-none ring-1 ring-slate-200">
                {scanTypes.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>

            <label>
              <span className="text-xs font-black uppercase text-slate-400">Warehouse Branch</span>
              <input value={manual.warehouse_branch} onChange={(event) => setManual({ ...manual, warehouse_branch: event.target.value })} className="mt-1 w-full rounded-2xl bg-slate-50 px-4 py-3 font-bold outline-none ring-1 ring-slate-200" />
            </label>

            <label>
              <span className="text-xs font-black uppercase text-slate-400">Current Status</span>
              <select value={manual.current_status} onChange={(event) => setManual({ ...manual, current_status: event.target.value })} className="mt-1 w-full rounded-2xl bg-slate-50 px-4 py-3 font-bold outline-none ring-1 ring-slate-200">
                {statusOptions.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>

            <label>
              <span className="text-xs font-black uppercase text-slate-400">Next Status</span>
              <select value={manual.next_status} onChange={(event) => setManual({ ...manual, next_status: event.target.value })} className="mt-1 w-full rounded-2xl bg-slate-50 px-4 py-3 font-bold outline-none ring-1 ring-slate-200">
                {statusOptions.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>

            <label>
              <span className="text-xs font-black uppercase text-slate-400">Operator</span>
              <input value={manual.operator} onChange={(event) => setManual({ ...manual, operator: event.target.value })} className="mt-1 w-full rounded-2xl bg-slate-50 px-4 py-3 font-bold outline-none ring-1 ring-slate-200" />
            </label>

            <label>
              <span className="text-xs font-black uppercase text-slate-400">Bag Code</span>
              <input value={manual.bag_code} onChange={(event) => setManual({ ...manual, bag_code: event.target.value })} className="mt-1 w-full rounded-2xl bg-slate-50 px-4 py-3 font-bold outline-none ring-1 ring-slate-200" />
            </label>

            <label className="md:col-span-2">
              <span className="text-xs font-black uppercase text-slate-400">Exception / Damage / Missing Notes</span>
              <textarea value={`${manual.exception_reason}\n${manual.damage_note}\n${manual.missing_parcel_note}`.trim()} onChange={(event) => setManual({ ...manual, exception_reason: event.target.value })} className="mt-1 min-h-28 w-full rounded-2xl bg-slate-50 px-4 py-3 font-bold outline-none ring-1 ring-slate-200" />
            </label>
          </div>

          <button type="button" onClick={submitManualScan} disabled={submitting} className="mt-4 w-full rounded-2xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase text-white disabled:opacity-50">Submit Manual Scan</button>
        </article>

        <article className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-2xl font-black">Backend Auto-Fill</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">Lookup result should include merchant, expected parcel count, route/zone, payment, COD, and current status.</p>
          {lookup ? (
            <pre className="mt-4 max-h-[520px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(lookup, null, 2)}</pre>
          ) : (
            <div className="mt-4 flex min-h-[300px] items-center justify-center rounded-2xl bg-slate-50 text-sm font-bold text-slate-400 ring-1 ring-slate-200">No lookup loaded.</div>
          )}
        </article>
      </section>

      <section className="mt-5 rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-black">Bulk Warehouse Upload</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">Upload real scan rows only. Mock/sample/demo rows are rejected in validation.</p>
          </div>
          <label className="cursor-pointer rounded-2xl bg-slate-950 px-5 py-3 text-xs font-black uppercase text-white">
            Select CSV
            <input className="hidden" type="file" accept=".csv,text/csv" onChange={(event) => handleFile(event.target.files?.[0])} />
          </label>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <p className="text-xs font-black uppercase text-slate-400">File</p>
            <p className="mt-2 break-all text-sm font-black">{fileName || "-"}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <p className="text-xs font-black uppercase text-slate-400">Rows</p>
            <p className="mt-2 text-3xl font-black">{rows.length}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <p className="text-xs font-black uppercase text-slate-400">Validation</p>
            <p className={`mt-2 text-3xl font-black ${validation.isValid ? "text-emerald-700" : "text-rose-700"}`}>{validation.isValid ? "PASS" : "HOLD"}</p>
          </div>
        </div>

        {validation.missingHeaders.length || validation.rowErrors.length ? (
          <div className="mt-4 rounded-2xl bg-rose-50 p-4 text-xs font-bold text-rose-800 ring-1 ring-rose-100">
            Missing headers: {validation.missingHeaders.join(", ") || "none"}<br />
            Row errors: {validation.rowErrors.slice(0, 10).map((row) => `Row ${row.rowNumber}: ${row.errors.join("; ")}`).join(" | ") || "none"}
          </div>
        ) : null}

        <div className="mt-4 max-h-96 overflow-auto rounded-2xl ring-1 ring-slate-200">
          <table className="min-w-full bg-white">
            <thead className="sticky top-0 bg-slate-100">
              <tr>{(headers.length ? headers : schema.headers).slice(0, 16).map((header) => <th key={header} className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-black uppercase text-slate-500">{header}</th>)}</tr>
            </thead>
            <tbody>
              {rows.length ? rows.slice(0, 50).map((row, index) => (
                <tr key={index}>{(headers.length ? headers : schema.headers).slice(0, 16).map((header) => <td key={header} className="whitespace-nowrap border-t border-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">{row[header] || "-"}</td>)}</tr>
              )) : (
                <tr><td className="px-4 py-12 text-center text-sm font-bold text-slate-400" colSpan={16}>No uploaded warehouse rows.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <button type="button" onClick={submitRows} disabled={submitting || !rows.length || !validation.isValid} className="mt-4 rounded-2xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase text-white disabled:cursor-not-allowed disabled:opacity-50">Submit Bulk Warehouse Rows</button>
      </section>
    </main>
  );
}
