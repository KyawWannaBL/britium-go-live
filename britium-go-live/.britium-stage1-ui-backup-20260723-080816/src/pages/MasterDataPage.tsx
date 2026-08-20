import React, { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database, Upload, Download, Save, ShieldCheck, RefreshCw, Layers, FileSpreadsheet, Activity, Globe2, Plus, Edit, Trash2, Search } from "lucide-react";
import * as XLSX from "xlsx";

const TRANSLATIONS = {
  en: {
    title: "Master Data Center",
    subtitle: "Dynamic entity management driven by backend configuration.",
    refresh: "Sync Data",
    importBtn: "Upload Excel",
    exportBtn: "Export CSV",
    newRecord: "Add Record",
    noRecords: "No active records found for this entity.",
    phase: "Phase 6 • Master Data",
    records: "records",
    actions: "Actions",
    edit: "Edit",
    delete: "Delete",
    search: "Search records..."
  },
  my: {
    title: "အခြေခံဒေတာ ဗဟိုဌာန",
    subtitle: "စနစ်၏ အဓိကအချက်အလက်များကို ဗဟိုမှစီမံခြင်း။",
    refresh: "ဒေတာရယူမည်",
    importBtn: "Excel တင်မည်",
    exportBtn: "CSV ထုတ်မည်",
    newRecord: "အသစ်ထည့်မည်",
    noRecords: "အချက်အလက်များ မရှိသေးပါ။",
    phase: "အဆင့် ၆ • အခြေခံဒေတာ",
    records: "ခု",
    actions: "လုပ်ဆောင်ချက်",
    edit: "ပြင်မည်",
    delete: "ဖျက်မည်",
    search: "ရှာဖွေရန်..."
  }
};

export default function MasterDataPage() {
  const language = "en";
const [activeLang, setActiveLang] = useState<"en" | "my">(
    (language === "my" || language === "mm") ? "my" : "en"
  );

  // AppShell မှ လွှင့်လိုက်သော ဘာသာစကားပြောင်းလဲမှုကို ဖမ်းယူရန်
const t = TRANSLATIONS[activeLang];

  const [snapshot, setSnapshot] = useState<any>({ tabs: [], records_by_dataset: {} });
  const [loading, setLoading] = useState(false);
  const [activeDatasetKey, setActiveDatasetKey] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSnapshot = async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.rpc("be_master_data_page_snapshot");
      if (error) throw error;
      if (res) {
        setSnapshot(res);
        if (res.tabs && res.tabs.length > 0 && !activeDatasetKey) {
          setActiveDatasetKey(res.tabs[0].dataset_key);
        }
      }
    } catch (e: any) {
      console.error("Failed to load snapshot:", e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadSnapshot(); }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const importedRows = XLSX.utils.sheet_to_json(sheet);

      if (importedRows.length > 0) {
        const { error } = await supabase.rpc("be_master_data_bulk_upsert_records", {
          p_dataset_key: activeDatasetKey,
          p_rows: importedRows,
          p_actor_email: "masterdata@britiumexpress.com"
        });

        if (error) throw error;
        alert(activeLang === "en" ? `Successfully imported ${importedRows.length} rows.` : `အချက်အလက် ${importedRows.length} ခုကို အောင်မြင်စွာ ထည့်သွင်းပြီးပါပြီ။`);
        await loadSnapshot();
      }
    } catch (err: any) {
      alert("Excel parse error: " + err.message);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const activeTabConfig = snapshot.tabs?.find((tab: any) => tab.dataset_key === activeDatasetKey) || {};
  const activeData = snapshot.records_by_dataset?.[activeDatasetKey] || [];
  const columns = activeTabConfig.fields || [];

  // ဒေတာများကို ရှာဖွေမှု (Search) ဖြင့် စစ်ထုတ်ရန်
  const filteredData = activeData.filter((row: any) => {
    if (!searchQuery) return true;
    const searchString = JSON.stringify(row.payload).toLowerCase();
    return searchString.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-[#061524] p-6 md:p-8 text-[#eef8ff] font-['Poppins',sans-serif]">
      <div className="max-w-[1600px] mx-auto space-y-6">

        <header className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-3xl flex justify-between items-center shadow-xl">
          <div>
            <div className="text-[#38bdf8] text-[10px] font-black uppercase tracking-[0.2em] mb-2">{t.phase}</div>
            <h1 className="text-2xl font-black flex items-center gap-3"><Database className="text-[#f6b84b]"/> {t.title}</h1>
            <p className="text-[#4d7a9b] text-sm mt-1">{t.subtitle}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={loadSnapshot} disabled={loading} className="px-5 py-2.5 rounded-xl border border-[#1a3a5c] bg-[#061524] text-[#c8dff0] font-bold text-xs uppercase tracking-wider hover:border-[#f6b84b] transition-all flex items-center gap-2">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""}/> {t.refresh}
            </button>
          </div>
        </header>

        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
          {snapshot.tabs?.map((tab: any) => (
            <button
              key={tab.dataset_key}
              onClick={() => setActiveDatasetKey(tab.dataset_key)}
              className={`
                px-5 py-3 rounded-xl text-sm font-black whitespace-nowrap transition-all border-2
                ${activeDatasetKey === tab.dataset_key
                  ? "bg-[#f6b84b] border-[#f6b84b] text-[#061524] shadow-[0_0_15px_rgba(246,184,75,0.4)] scale-105"
                  : "bg-[#0b2236] border-[#1a3a5c] text-[#4ea8de] hover:border-[#f6b84b] hover:text-[#f6b84b]"}
              `}
            >
              {activeLang === "my" ? (tab.display_name_mm || tab.display_name_en) : tab.display_name_en}
            </button>
          ))}
        </div>

        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-6 shadow-xl min-h-[600px] flex flex-col">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <h2 className="text-xl font-black text-white flex items-center gap-3">
              <Layers size={22} className="text-[#38bdf8]"/>
              {activeLang === "my" ? (activeTabConfig.display_name_mm || activeTabConfig.display_name_en) : activeTabConfig.display_name_en}
              <span className="bg-[#1a3a5c] text-[#4ea8de] text-xs font-bold px-3 py-1 rounded-md ml-3 border border-[#254b73]">
                {filteredData.length} {t.records}
              </span>
            </h2>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#061524]"/>
                {/* HIGH CONTRAST SEARCH INPUT (White background, Dark Text) */}
                <input
                  type="text"
                  field={t.search}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white text-[#061524] border-2 border-[#1a3a5c] rounded-xl pl-9 pr-3 py-2 text-sm font-bold outline-none focus:border-[#f6b84b] focus:ring-2 focus:ring-[#f6b84b]/30 field:text-gray-400 transition-all"
                />
              </div>

              <input type="file" accept=".xls,.xlsx,.csv" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-white hover:bg-[#f6b84b] text-[#061524] border-2 border-[#1a3a5c] hover:border-[#f6b84b] px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all duration-200"
              >
                <FileSpreadsheet size={16}/> {t.importBtn}
              </button>

              <button
                className="bg-[#22c55e] hover:bg-[#1ea951] text-white px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all duration-200 shadow-[0_0_15px_rgba(34,197,94,0.3)]"
              >
                <Plus size={16}/> {t.newRecord}
              </button>
            </div>
          </div>

          {/* HIGH CONTRAST TABLE CONTAINER */}
          <div className="flex-1 border-2 border-[#1a3a5c] rounded-2xl overflow-hidden bg-white">
            {filteredData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 p-10 bg-white">
                <Database size={64} className="opacity-20 mb-4 text-[#061524]"/>
                <p className="font-bold text-lg text-[#061524]">{t.noRecords}</p>
              </div>
            ) : (
              <div className="overflow-x-auto overflow-y-auto h-full max-h-[600px] custom-scrollbar bg-white">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-[#f0f4f8] text-[#061524] font-black uppercase tracking-wider text-[11px] sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="p-4 border-b-2 border-gray-300">{t.actions}</th>
                      {columns.map((col: any) => (
                        <th key={col.field_key} className="p-4 border-b-2 border-gray-300">
                          {activeLang === "my" ? (col.label_mm || col.label_en) : col.label_en}
                          {col.required && <span className="text-rose-600 ml-1">*</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((row: any, i: number) => (
                      <tr
                        key={row.record_key || i}
                        className="border-b border-gray-200 text-[#061524] font-bold transition-colors duration-150 hover:bg-[#fff9e6]"
                      >
                        <td className="p-4 border-r border-gray-200 bg-white group-hover:bg-[#fff9e6]">
                          <div className="flex gap-2">
                            <button className="text-[#4ea8de] hover:text-[#061524] hover:bg-[#f6b84b] p-1.5 rounded transition-colors" title={t.edit}>
                              <Edit size={16} />
                            </button>
                            <button className="text-rose-500 hover:text-white hover:bg-rose-500 p-1.5 rounded transition-colors" title={t.delete}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>

                        {columns.map((col: any) => {
                          const val = row.payload?.[col.field_key];
                          const isStatus = col.field_key.toLowerCase().includes('status');
                          const isActive = String(val).toLowerCase() === 'active' || String(val).toLowerCase() === 'yes' || String(val) === 'true';

                          return (
                            <td key={col.field_key} className="p-4">
                              {isStatus ? (
                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                                  isActive ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-rose-100 text-rose-800 border-rose-300'
                                }`}>
                                  {String(val || "N/A")}
                                </span>
                              ) : (
                                String(val ?? "-")
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
        </div>
      </div>
    </div>
  );
}
