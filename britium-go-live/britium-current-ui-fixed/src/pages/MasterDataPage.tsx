// @ts-nocheck
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Database,
  Edit,
  FileSpreadsheet,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import * as XLSX from "xlsx";

const TRANSLATIONS = {
  en: {
    title: "Master Data Center",
    subtitle: "Dynamic entity management driven by backend configuration.",
    refresh: "Sync Data",
    importBtn: "Upload Excel",
    newRecord: "Add Record",
    noRecords: "No active records found for this entity.",
    noEntities: "No master-data entities were returned by the backend.",
    phase: "Phase 6 • Master Data",
    records: "records",
    actions: "Actions",
    edit: "Edit",
    delete: "Delete",
    search: "Search records...",
    loading: "Synchronizing master data...",
    source: "Backend source",
  },
  my: {
    title: "အခြေခံဒေတာ ဗဟိုဌာန",
    subtitle: "စနစ်၏ အဓိကအချက်အလက်များကို ဗဟိုမှစီမံခြင်း။",
    refresh: "ဒေတာရယူမည်",
    importBtn: "Excel တင်မည်",
    newRecord: "အသစ်ထည့်မည်",
    noRecords: "အချက်အလက်များ မရှိသေးပါ။",
    noEntities: "Backend မှ အခြေခံဒေတာ အမျိုးအစား မရရှိသေးပါ။",
    phase: "အဆင့် ၆ • အခြေခံဒေတာ",
    records: "ခု",
    actions: "လုပ်ဆောင်ချက်",
    edit: "ပြင်မည်",
    delete: "ဖျက်မည်",
    search: "ရှာဖွေရန်...",
    loading: "ဒေတာများ ပြန်လည်ရယူနေသည်...",
    source: "Backend အရင်းအမြစ်",
  },
};

function asArray(value: any): any[] {
  return Array.isArray(value) ? value : [];
}

function normalizeSnapshot(value: any) {
  const root = value && typeof value === "object" ? value : {};
  const tabs = asArray(root.tabs).length
    ? asArray(root.tabs)
    : asArray(root.entities).length
      ? asArray(root.entities)
      : asArray(root.datasets);

  const normalizedTabs = tabs
    .map((tab: any, index: number) => {
      const datasetKey = String(
        tab?.dataset_key || tab?.entity_key || tab?.master_type || tab?.key || tab?.id || `entity_${index + 1}`,
      ).trim();
      if (!datasetKey) return null;
      return {
        ...tab,
        dataset_key: datasetKey,
        display_name_en: tab?.display_name_en || tab?.display_name || tab?.label || datasetKey,
        display_name_mm: tab?.display_name_mm || tab?.label_mm || "",
        fields: asArray(tab?.fields).length ? asArray(tab.fields) : asArray(tab?.columns),
      };
    })
    .filter(Boolean);

  const recordsByDataset =
    root.records_by_dataset && typeof root.records_by_dataset === "object"
      ? root.records_by_dataset
      : root.recordsByDataset && typeof root.recordsByDataset === "object"
        ? root.recordsByDataset
        : {};

  if (!Object.keys(recordsByDataset).length && Array.isArray(root.rows)) {
    const firstKey = normalizedTabs[0]?.dataset_key || "rows";
    recordsByDataset[firstKey] = root.rows;
  }

  return {
    ...root,
    tabs: normalizedTabs,
    records_by_dataset: recordsByDataset,
    source: root.source || root.backend_source || "RPC be_master_data_page_snapshot",
  };
}

function normalizeRecord(row: any) {
  if (!row || typeof row !== "object") return { payload: {} };
  const payload = row.payload && typeof row.payload === "object" ? row.payload : row;
  return { ...row, payload };
}

export default function MasterDataPage() {
  const activeLang: "en" | "my" = "en";
  const t = TRANSLATIONS[activeLang];

  const [snapshot, setSnapshot] = useState<any>({ tabs: [], records_by_dataset: {}, source: "" });
  const [loading, setLoading] = useState(false);
  const [activeDatasetKey, setActiveDatasetKey] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [lastSynced, setLastSynced] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSnapshot = async () => {
    setLoading(true);
    setErrorMessage("");
    setMessage(t.loading);

    try {
      const { data, error } = await supabase.rpc("be_master_data_page_snapshot");
      if (error) throw error;

      const next = normalizeSnapshot(data);
      setSnapshot(next);
      setLastSynced(new Date().toLocaleString());

      setActiveDatasetKey((current) => {
        const keys = next.tabs.map((tab: any) => tab.dataset_key);
        if (current && keys.includes(current)) return current;
        return keys[0] || "";
      });

      const totalRows = Object.values(next.records_by_dataset || {}).reduce(
        (sum: number, rows: any) => sum + asArray(rows).length,
        0,
      );
      setMessage(
        next.tabs.length
          ? `${next.tabs.length} entities and ${totalRows.toLocaleString()} records synchronized.`
          : t.noEntities,
      );
    } catch (error: any) {
      setSnapshot({ tabs: [], records_by_dataset: {}, source: "RPC be_master_data_page_snapshot" });
      setActiveDatasetKey("");
      setMessage("");
      setErrorMessage(error?.message || "Master Data synchronization failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSnapshot();
  }, []);

  const activeTabConfig = useMemo(
    () => snapshot.tabs?.find((tab: any) => tab.dataset_key === activeDatasetKey) || snapshot.tabs?.[0] || {},
    [snapshot.tabs, activeDatasetKey],
  );

  const activeData = useMemo(() => {
    const key = activeTabConfig.dataset_key || activeDatasetKey;
    return asArray(snapshot.records_by_dataset?.[key]).map(normalizeRecord);
  }, [snapshot.records_by_dataset, activeDatasetKey, activeTabConfig.dataset_key]);

  const columns = useMemo(() => {
    const configured = asArray(activeTabConfig.fields);
    if (configured.length) return configured;
    const firstPayload = activeData[0]?.payload || {};
    return Object.keys(firstPayload).slice(0, 18).map((key) => ({
      field_key: key,
      label_en: key.replace(/_/g, " "),
      label_mm: "",
      required: false,
    }));
  }, [activeTabConfig.fields, activeData]);

  const filteredData = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return activeData;
    return activeData.filter((row: any) => JSON.stringify(row.payload || row).toLowerCase().includes(query));
  }, [activeData, searchQuery]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !activeDatasetKey) return;

    setLoading(true);
    setErrorMessage("");
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const importedRows = XLSX.utils.sheet_to_json(sheet);

      if (!importedRows.length) throw new Error("The selected worksheet contains no records.");

      const { error } = await supabase.rpc("be_master_data_bulk_upsert_records", {
        p_dataset_key: activeDatasetKey,
        p_rows: importedRows,
        p_actor_email: "masterdata@britiumexpress.com",
      });
      if (error) throw error;

      setMessage(`Successfully imported ${importedRows.length} records.`);
      await loadSnapshot();
    } catch (error: any) {
      setErrorMessage(error?.message || "Excel import failed.");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#061524] p-3 text-[#c8dff0] sm:p-4 lg:p-6">
      <div className="mx-auto w-full max-w-[1800px] space-y-4">
        <header className="flex w-full flex-col gap-4 rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-4 shadow-xl lg:flex-row lg:items-center lg:justify-between lg:p-5">
          <div className="min-w-0">
            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#38bdf8]">{t.phase}</div>
            <h1 className="flex flex-wrap items-center gap-3 text-2xl font-black text-[#c8dff0]">
              <Database className="shrink-0 text-[#f6b84b]" /> {t.title}
            </h1>
            <p className="mt-1 max-w-4xl text-sm font-semibold leading-6 text-[#9cc2d9]">{t.subtitle}</p>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
            <div className="min-w-0 rounded-xl border border-[#1a3a5c] bg-[#061524] px-3 py-2 text-xs font-bold text-[#9cc2d9]">
              <span className="text-[#f6b84b]">{t.source}:</span> {snapshot.source || "RPC be_master_data_page_snapshot"}
              {lastSynced ? <span className="ml-2">• {lastSynced}</span> : null}
            </div>
            <button
              type="button"
              onClick={() => void loadSnapshot()}
              disabled={loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border-2 border-[#f6b84b] bg-[#f6b84b] px-4 text-xs font-black uppercase tracking-wider text-[#061524] hover:bg-[#ffd77a] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> {t.refresh}
            </button>
          </div>
        </header>

        {errorMessage ? (
          <div className="rounded-xl border border-rose-500 bg-rose-950/30 px-4 py-3 text-sm font-bold text-rose-300">{errorMessage}</div>
        ) : message ? (
          <div className="rounded-xl border border-[#1a3a5c] bg-[#0b2236] px-4 py-3 text-sm font-bold text-[#9cc2d9]">{message}</div>
        ) : null}

        <nav className="flex w-full flex-wrap gap-2" aria-label="Master-data entities">
          {snapshot.tabs?.map((tab: any) => (
            <button
              type="button"
              key={tab.dataset_key}
              onClick={() => {
                setActiveDatasetKey(tab.dataset_key);
                setSearchQuery("");
              }}
              className={`rounded-xl border-2 px-4 py-2.5 text-sm font-black transition-all ${
                activeTabConfig.dataset_key === tab.dataset_key
                  ? "border-[#f6b84b] bg-[#f6b84b] text-[#061524]"
                  : "border-[#1a3a5c] bg-[#0b2236] text-[#9cc2d9] hover:border-[#f6b84b] hover:text-[#f6b84b]"
              }`}
            >
              {activeLang === "my" ? tab.display_name_mm || tab.display_name_en : tab.display_name_en}
            </button>
          ))}
        </nav>

        <section className="flex min-h-[520px] w-full min-w-0 flex-col rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-3 shadow-xl sm:p-4 lg:p-5">
          <div className="mb-4 flex w-full min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <h2 className="flex min-w-0 flex-wrap items-center gap-2 text-lg font-black text-[#c8dff0]">
              <Layers size={21} className="shrink-0 text-[#38bdf8]" />
              <span className="break-words">
                {activeLang === "my"
                  ? activeTabConfig.display_name_mm || activeTabConfig.display_name_en || t.noEntities
                  : activeTabConfig.display_name_en || t.noEntities}
              </span>
              <span className="rounded-md border border-[#254b73] bg-[#061524] px-2.5 py-1 text-xs font-black text-[#f6b84b]">
                {filteredData.length} {t.records}
              </span>
            </h2>

            <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
              <div className="relative min-w-[220px] flex-1 xl:w-72 xl:flex-none">
                <Search className="absolute left-3 top-3 h-4 w-4 text-[#475569]" />
                <input
                  type="search"
                  placeholder={t.search}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-10 w-full rounded-xl border-2 border-[#1a3a5c] bg-white pl-9 pr-3 text-sm font-extrabold text-[#061524] outline-none placeholder:text-[#64748b] focus:border-[#f6b84b]"
                />
              </div>

              <input type="file" accept=".xls,.xlsx,.csv" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!activeDatasetKey || loading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border-2 border-[#1a3a5c] bg-white px-4 text-xs font-black uppercase tracking-wider text-[#061524] hover:border-[#f6b84b] hover:bg-[#fff5d6] disabled:opacity-60"
              >
                <FileSpreadsheet size={16} /> {t.importBtn}
              </button>
              <button
                type="button"
                disabled={!activeDatasetKey}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border-2 border-[#061524] bg-[#22c55e] px-4 text-xs font-black uppercase tracking-wider text-[#061524] hover:bg-[#4ade80] disabled:opacity-60"
              >
                <Plus size={16} /> {t.newRecord}
              </button>
            </div>
          </div>

          <div className="min-h-[420px] w-full min-w-0 overflow-hidden rounded-xl border-2 border-[#1a3a5c] bg-white">
            {!activeDatasetKey || filteredData.length === 0 ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center bg-white p-8 text-center text-[#061524]">
                <Database size={56} className="mb-4 opacity-25" />
                <p className="max-w-xl text-lg font-black">{activeDatasetKey ? t.noRecords : t.noEntities}</p>
              </div>
            ) : (
              <div className="max-h-[620px] w-full overflow-x-auto overflow-y-auto bg-white">
                <table className="min-w-max w-full border-separate border-spacing-0 text-left text-sm text-[#061524]">
                  <thead className="sticky top-0 z-10 bg-[#f6b84b] text-[11px] font-black uppercase tracking-wider text-[#061524]">
                    <tr>
                      <th className="whitespace-nowrap border-b-2 border-r-2 border-[#061524] px-4 py-3">{t.actions}</th>
                      {columns.map((column: any) => (
                        <th
                          key={column.field_key}
                          className="whitespace-nowrap border-b-2 border-r border-[#061524] px-4 py-3 last:border-r-0"
                        >
                          {activeLang === "my" ? column.label_mm || column.label_en : column.label_en}
                          {column.required ? <span className="ml-1 text-rose-800">*</span> : null}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((row: any, index: number) => (
                      <tr key={row.record_key || row.id || index} className="border-b border-slate-200 font-bold hover:bg-[#fff7dc]">
                        <td className="whitespace-nowrap border-b border-r border-slate-300 bg-white px-3 py-3">
                          <div className="flex gap-2">
                            <button type="button" className="rounded p-1.5 text-blue-700 hover:bg-[#f6b84b] hover:text-[#061524]" title={t.edit}>
                              <Edit size={16} />
                            </button>
                            <button type="button" className="rounded p-1.5 text-rose-700 hover:bg-rose-600 hover:text-[#061524]" title={t.delete}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                        {columns.map((column: any) => {
                          const value = row.payload?.[column.field_key];
                          const isStatus = String(column.field_key).toLowerCase().includes("status");
                          const isActive = ["active", "yes", "true", "1"].includes(String(value).toLowerCase());
                          return (
                            <td key={column.field_key} className="max-w-[360px] whitespace-normal break-words border-b border-slate-200 px-4 py-3 align-top">
                              {isStatus ? (
                                <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase ${isActive ? "border-emerald-500 bg-emerald-100 text-emerald-900" : "border-rose-400 bg-rose-100 text-rose-900"}`}>
                                  {String(value ?? "N/A")}
                                </span>
                              ) : (
                                String(value ?? "-")
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
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
