import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Database,
  FileSpreadsheet,
  Layers3,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import * as XLSX from "xlsx";

import { supabase } from "@/integrations/supabase/client";

type Language = "en" | "my";

type MasterField = {
  field_key: string;
  label_en?: string;
  label_mm?: string;
  required?: boolean;
};

type MasterTab = {
  dataset_key: string;
  display_name_en?: string;
  display_name_mm?: string;
  fields?: MasterField[];
};

type MasterRecord = {
  record_key?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
};

type MasterSnapshot = {
  tabs: MasterTab[];
  records_by_dataset: Record<string, MasterRecord[]>;
};

const COPY = {
  en: {
    eyebrow: "Phase 6 · Master Data",
    title: "Master Data Center",
    subtitle: "Live backend-driven entities, records, search, and Excel import.",
    refresh: "Sync Data",
    import: "Upload Excel",
    add: "Add Record",
    search: "Search records...",
    records: "records",
    noTabs: "No master-data entities were returned by the backend.",
    noRecords: "No active records found for this entity.",
    selectEntity: "Select an entity to view its records.",
  },
  my: {
    eyebrow: "အဆင့် ၆ · အခြေခံဒေတာ",
    title: "အခြေခံဒေတာ ဗဟိုဌာန",
    subtitle: "Backend မှ တိုက်ရိုက်ရယူထားသော entity, record, search နှင့် Excel import.",
    refresh: "ဒေတာရယူမည်",
    import: "Excel တင်မည်",
    add: "အသစ်ထည့်မည်",
    search: "အချက်အလက်ရှာရန်...",
    records: "ခု",
    noTabs: "Backend မှ master-data entity များ မရရှိသေးပါ။",
    noRecords: "ဤ entity အတွက် active record မရှိသေးပါ။",
    selectEntity: "Record များကြည့်ရန် entity တစ်ခုရွေးပါ။",
  },
} as const;

const EMPTY_SNAPSHOT: MasterSnapshot = {
  tabs: [],
  records_by_dataset: {},
};

function rowPayload(row: MasterRecord) {
  return row.payload && typeof row.payload === "object" ? row.payload : row;
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function MasterDataPage() {
  const [language, setLanguage] = useState<Language>("en");
  const [snapshot, setSnapshot] = useState<MasterSnapshot>(EMPTY_SNAPSHOT);
  const [activeDatasetKey, setActiveDatasetKey] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastSynced, setLastSynced] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = COPY[language];

  async function loadSnapshot() {
    setLoading(true);
    setError("");

    try {
      const { data, error: rpcError } = await supabase.rpc("be_master_data_page_snapshot");
      if (rpcError) throw rpcError;

      const next: MasterSnapshot = {
        tabs: Array.isArray(data?.tabs) ? data.tabs : [],
        records_by_dataset:
          data?.records_by_dataset && typeof data.records_by_dataset === "object"
            ? data.records_by_dataset
            : {},
      };

      setSnapshot(next);
      setActiveDatasetKey((current) => {
        if (current && next.tabs.some((tab) => tab.dataset_key === current)) return current;
        return next.tabs[0]?.dataset_key || "";
      });
      setLastSynced(new Date().toLocaleString());
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Master data could not be loaded.";
      setError(message);
      setSnapshot(EMPTY_SNAPSHOT);
      setActiveDatasetKey("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSnapshot();
  }, []);

  const activeTab = useMemo(
    () => snapshot.tabs.find((tab) => tab.dataset_key === activeDatasetKey),
    [activeDatasetKey, snapshot.tabs],
  );

  const columns = activeTab?.fields || [];
  const activeRows = snapshot.records_by_dataset[activeDatasetKey] || [];

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return activeRows;

    return activeRows.filter((row) =>
      JSON.stringify(rowPayload(row)).toLowerCase().includes(query),
    );
  }, [activeRows, searchQuery]);

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !activeDatasetKey) return;

    setLoading(true);
    setError("");

    try {
      const workbook = XLSX.read(await file.arrayBuffer());
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
        defval: "",
      });

      if (!rows.length) throw new Error("The selected spreadsheet contains no data rows.");

      const { error: uploadError } = await supabase.rpc(
        "be_master_data_bulk_upsert_records",
        {
          p_dataset_key: activeDatasetKey,
          p_rows: rows,
          p_actor_email: "masterdata@britiumexpress.com",
        },
      );

      if (uploadError) throw uploadError;
      await loadSnapshot();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Excel import failed.");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const activeTitle = activeTab
    ? language === "my"
      ? activeTab.display_name_mm || activeTab.display_name_en || activeTab.dataset_key
      : activeTab.display_name_en || activeTab.display_name_mm || activeTab.dataset_key
    : t.selectEntity;

  return (
    <main className="min-h-screen min-w-0 overflow-x-hidden bg-[#061524] px-3 py-4 text-[#eef8ff] sm:px-4 md:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1720px] min-w-0 flex-col gap-4">
        <section className="rounded-[24px] border border-[#1a3a5c] bg-[#0b2236] p-4 shadow-2xl sm:p-5 lg:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-[#38bdf8]">
                {t.eyebrow}
              </div>
              <h1 className="mt-2 flex items-center gap-3 text-2xl font-black sm:text-3xl">
                <Database className="shrink-0 text-[#f6b84b]" />
                <span className="truncate">{t.title}</span>
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#9cc2d9]">{t.subtitle}</p>
            </div>

            <div className="grid w-full gap-2 sm:grid-cols-3 xl:w-auto">
              <button
                type="button"
                onClick={() => setLanguage((current) => (current === "en" ? "my" : "en"))}
                className="h-11 rounded-xl border border-[#254b73] bg-[#061524] px-4 text-xs font-black uppercase tracking-wider text-[#c8dff0] transition hover:border-[#f6b84b]"
              >
                {language === "en" ? "မြန်မာ" : "English"}
              </button>
              <button
                type="button"
                onClick={loadSnapshot}
                disabled={loading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#254b73] bg-[#061524] px-4 text-xs font-black uppercase tracking-wider text-[#c8dff0] transition hover:border-[#f6b84b] disabled:opacity-60"
              >
                <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                {t.refresh}
              </button>
              <div className="flex h-11 items-center justify-center rounded-xl border border-[#254b73] bg-[#061524] px-4 text-center text-[11px] font-bold text-[#9cc2d9]">
                {lastSynced || "Not synced"}
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-400/40 bg-red-950/50 p-4 text-sm font-bold text-red-200">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span className="break-words">{error}</span>
          </div>
        )}

        <section className="rounded-[22px] border border-[#1a3a5c] bg-[#0b2236] p-3 shadow-xl sm:p-4">
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
            {snapshot.tabs.map((tab) => {
              const active = activeDatasetKey === tab.dataset_key;
              const label =
                language === "my"
                  ? tab.display_name_mm || tab.display_name_en || tab.dataset_key
                  : tab.display_name_en || tab.display_name_mm || tab.dataset_key;

              return (
                <button
                  key={tab.dataset_key}
                  type="button"
                  onClick={() => {
                    setActiveDatasetKey(tab.dataset_key);
                    setSearchQuery("");
                  }}
                  className={
                    active
                      ? "shrink-0 rounded-xl border-2 border-[#8a5a00] bg-[#f6b84b] px-4 py-2.5 text-sm font-black text-black shadow-lg"
                      : "shrink-0 rounded-xl border border-[#254b73] bg-[#061524] px-4 py-2.5 text-sm font-bold text-[#9cc2d9] transition hover:border-[#f6b84b] hover:text-white"
                  }
                >
                  {label}
                </button>
              );
            })}

            {!snapshot.tabs.length && (
              <div className="w-full rounded-xl border border-dashed border-[#254b73] px-4 py-4 text-sm font-bold text-[#9cc2d9]">
                {loading ? "Loading master-data entities..." : t.noTabs}
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-[560px] min-w-0 flex-col rounded-[24px] border border-[#1a3a5c] bg-[#0b2236] p-3 shadow-2xl sm:p-4 lg:p-5">
          <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <h2 className="flex min-w-0 items-center gap-3 text-lg font-black sm:text-xl">
                <Layers3 className="shrink-0 text-[#38bdf8]" />
                <span className="truncate">{activeTitle}</span>
                <span className="shrink-0 rounded-lg border border-[#254b73] bg-[#061524] px-3 py-1 text-xs text-[#9cc2d9]">
                  {filteredRows.length} {t.records}
                </span>
              </h2>
            </div>

            <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] xl:max-w-[760px]">
              <label className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t.search}
                  className="h-11 w-full min-w-0 rounded-xl border-2 border-[#254b73] bg-white pl-10 pr-3 text-sm font-bold text-[#061524] outline-none placeholder:text-slate-400 focus:border-[#f6b84b] focus:ring-2 focus:ring-[#f6b84b]/30"
                />
              </label>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xls,.xlsx,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!activeDatasetKey || loading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-[#254b73] bg-white px-4 text-xs font-black uppercase tracking-wider text-[#061524] transition hover:border-[#f6b84b] hover:bg-[#fff7dd] disabled:opacity-50"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {t.import}
              </button>

              <button
                type="button"
                disabled
                title="Single-record editor will be connected after the backend write RPC is confirmed."
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#22c55e] px-4 text-xs font-black uppercase tracking-wider text-white opacity-60"
              >
                <Plus className="h-4 w-4" />
                {t.add}
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border-2 border-[#254b73] bg-white">
            {!activeDatasetKey ? (
              <div className="flex min-h-[420px] items-center justify-center p-8 text-center font-bold text-slate-700">
                {snapshot.tabs.length ? t.selectEntity : t.noTabs}
              </div>
            ) : !filteredRows.length ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center text-slate-700">
                <Database className="mb-4 h-14 w-14 text-slate-300" />
                <p className="text-lg font-black">{t.noRecords}</p>
              </div>
            ) : (
              <div className="max-h-[calc(100vh-330px)] min-h-[420px] overflow-auto">
                <table className="w-full min-w-max border-separate border-spacing-0 text-left text-sm text-[#061524]">
                  <thead className="sticky top-0 z-20 bg-[#f6b84b] text-black shadow-[0_2px_0_#8a5a00]">
                    <tr>
                      <th className="border-b-2 border-r border-[#8a5a00] px-4 py-3 text-xs font-black uppercase tracking-wider">
                        #
                      </th>
                      {columns.map((column) => (
                        <th
                          key={column.field_key}
                          className="border-b-2 border-r border-[#8a5a00] px-4 py-3 text-xs font-black uppercase tracking-wider last:border-r-0"
                        >
                          {language === "my"
                            ? column.label_mm || column.label_en || column.field_key
                            : column.label_en || column.label_mm || column.field_key}
                          {column.required && <span className="ml-1 text-red-700">*</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, rowIndex) => {
                      const payload = rowPayload(row);

                      return (
                        <tr
                          key={row.record_key || rowIndex}
                          className="odd:bg-white even:bg-slate-50 hover:bg-[#fff7dd]"
                        >
                          <td className="border-b border-r border-slate-200 px-4 py-3 text-xs font-black text-slate-500">
                            {rowIndex + 1}
                          </td>
                          {columns.map((column) => (
                            <td
                              key={column.field_key}
                              className="max-w-[360px] border-b border-r border-slate-200 px-4 py-3 align-top font-semibold last:border-r-0"
                            >
                              <span className="block whitespace-normal break-words">
                                {displayValue(payload[column.field_key])}
                              </span>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
