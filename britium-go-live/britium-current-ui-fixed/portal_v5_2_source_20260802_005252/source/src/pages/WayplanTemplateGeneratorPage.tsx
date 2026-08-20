// @ts-nocheck
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, FileSpreadsheet, Info, Plus, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";

type TemplateRow = {
  way_id: string;
  manifest_group: string;
  route_type: string;
  route_date: string;
  highway_drop: string;
  driver_code: string;
  driver_name: string;
  rider_code: string;
  rider_name: string;
  helper_code: string;
  helper_name: string;
  vehicle_plate: string;
  supervisor_note: string;
};

const HEADERS = [
  "Way ID",
  "Manifest Group",
  "Route Type",
  "Route Date",
  "Highway Drop",
  "Driver Code",
  "Driver Name",
  "Rider Code",
  "Rider Name",
  "Helper Code",
  "Helper Name",
  "Vehicle Plate",
  "Supervisor Note",
];

const INSTRUCTIONS = [
  ["Column", "Required", "Notes"],
  ["Way ID", "Yes", "Must match the pickup/way record in the portal."],
  ["Manifest Group", "Yes", "Route group or township cluster, for example YGN-DOWNTOWN-A."],
  ["Route Type", "Yes", "Use Local Delivery, Highway Drop, Other City, Return Route, or Pickup Route."],
  ["Route Date", "Yes", "Use YYYY-MM-DD format."],
  ["Highway Drop", "No", "Use Yes/No."],
  ["Driver/Rider/Helper Code", "No", "Use workforce employee code from Master Data."],
  ["Vehicle Plate", "No", "Vehicle plate or fleet code."],
  ["Supervisor Note", "No", "Free-text instructions for dispatch/warehouse."],
];

function rowToArray(row: TemplateRow) {
  return [
    row.way_id,
    row.manifest_group,
    row.route_type,
    row.route_date,
    row.highway_drop,
    row.driver_code,
    row.driver_name,
    row.rider_code,
    row.rider_name,
    row.helper_code,
    row.helper_name,
    row.vehicle_plate,
    row.supervisor_note,
  ];
}

function emptyRow(): TemplateRow {
  return {
    way_id: "",
    manifest_group: "",
    route_type: "Local Delivery",
    route_date: new Date().toISOString().slice(0, 10),
    highway_drop: "No",
    driver_code: "",
    driver_name: "",
    rider_code: "",
    rider_name: "",
    helper_code: "",
    helper_name: "",
    vehicle_plate: "",
    supervisor_note: "",
  };
}

function downloadWorkbook(rows: TemplateRow[]) {
  const workbook = XLSX.utils.book_new();
  const data = [HEADERS, ...rows.map(rowToArray)];
  const sheet = XLSX.utils.aoa_to_sheet(data);
  sheet["!cols"] = HEADERS.map((header) => ({ wch: Math.max(16, header.length + 4) }));
  XLSX.utils.book_append_sheet(workbook, sheet, "Wayplan Import");

  const instructions = XLSX.utils.aoa_to_sheet(INSTRUCTIONS);
  instructions["!cols"] = [{ wch: 24 }, { wch: 12 }, { wch: 72 }];
  XLSX.utils.book_append_sheet(workbook, instructions, "Instructions");

  const lookups = XLSX.utils.aoa_to_sheet([
    ["Route Type", "Highway Drop"],
    ["Local Delivery", "No"],
    ["Highway Drop", "Yes"],
    ["Other City", "No"],
    ["Return Route", "No"],
    ["Pickup Route", "No"],
  ]);
  lookups["!cols"] = [{ wch: 24 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(workbook, lookups, "Lookups");

  XLSX.writeFile(workbook, "Britium_Wayplan_Generator_Template.xlsx");
}

export default function WayplanTemplateGeneratorPage() {
  const [rows, setRows] = useState<TemplateRow[]>([emptyRow()]);
  const readyCount = useMemo(() => rows.filter((row) => row.way_id.trim() && row.manifest_group.trim()).length, [rows]);

  function updateRow(index: number, key: keyof TemplateRow, value: string) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <Link to="/wayplan-golive" className="mb-3 inline-flex items-center gap-2 text-sm font-black text-amber-700">
              <ArrowLeft className="h-4 w-4" />
              Back to Wayplan Management
            </Link>
            <h1 className="text-3xl font-black text-slate-950">Wayplan Template Generator</h1>
            <p className="mt-1 max-w-3xl text-slate-600">
              Generate the Excel workbook used by dispatch, warehouse, and delivery teams to bulk prepare route manifests.
            </p>
          </div>
          <button
            type="button"
            onClick={() => downloadWorkbook(rows.length ? rows : [emptyRow()])}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 py-4 font-black text-white shadow-lg shadow-slate-900/10"
          >
            <Download className="h-5 w-5" />
            Download XLSX
          </button>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Rows</p>
            <p className="mt-2 text-3xl font-black text-slate-950">{rows.length}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Ready to Import</p>
            <p className="mt-2 text-3xl font-black text-emerald-600">{readyCount}</p>
          </div>
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex gap-3">
              <Info className="mt-1 h-5 w-5 flex-shrink-0 text-amber-600" />
              <p className="text-sm font-semibold leading-6 text-amber-900">
                Required fields are Way ID, Manifest Group, Route Type, and Route Date. Codes must match workforce master data.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-200 p-5 lg:flex-row lg:items-center">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
              <div>
                <h2 className="text-lg font-black text-slate-950">Template Rows</h2>
                <p className="text-sm text-slate-500">Prepare live wayplan rows before downloading, or keep the template blank.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setRows((current) => [...current, emptyRow()])} className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-slate-950">
                <Plus className="h-4 w-4" />
                Add Row
              </button>
              <button type="button" onClick={() => setRows([emptyRow()])} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700">
                Blank Template
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1600px] w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  {HEADERS.map((header) => (
                    <th key={header} className="px-4 py-3">{header}</th>
                  ))}
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} className="border-t border-slate-100 align-top">
                    {(Object.keys(row) as Array<keyof TemplateRow>).map((key) => (
                      <td key={key} className="px-3 py-3">
                        {key === "route_type" ? (
                          <select value={row[key]} onChange={(event) => updateRow(index, key, event.target.value)} className="w-full min-w-[160px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-800">
                            {["Local Delivery", "Highway Drop", "Other City", "Return Route", "Pickup Route"].map((option) => <option key={option}>{option}</option>)}
                          </select>
                        ) : key === "highway_drop" ? (
                          <select value={row[key]} onChange={(event) => updateRow(index, key, event.target.value)} className="w-full min-w-[110px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-800">
                            <option>No</option>
                            <option>Yes</option>
                          </select>
                        ) : (
                          <input
                            value={row[key]}
                            onChange={(event) => updateRow(index, key, event.target.value)}
                            type={key === "route_date" ? "date" : "text"}
                            className="w-full min-w-[160px] rounded-xl border border-slate-200 px-3 py-2 font-semibold text-slate-800 outline-none focus:border-amber-400"
                          />
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-3">
                      <button type="button" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="rounded-xl border border-red-200 bg-red-50 p-2 text-red-600" title="Remove row">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
