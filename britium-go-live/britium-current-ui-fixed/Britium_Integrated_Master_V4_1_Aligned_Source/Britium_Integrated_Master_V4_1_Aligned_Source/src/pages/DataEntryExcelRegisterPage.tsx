import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Plus, RefreshCw, Save, Upload } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  COLUMN_COLORS,
  DATA_ENTRY_COLUMNS,
  calculateRow,
  downloadDataEntryExcelTemplate,
  fetchDataEntryDropdownSnapshot,
  fetchDataEntryRegisterSnapshot,
  parseDataEntryExcelFile,
  saveDataEntryRegisterRows,
} from "@/lib/dataEntryExcelRegisterApi";

const emptyRow = () => ({
  pickup_date: new Date().toISOString().slice(0, 10),
  item_price: "",
  weight_kg: "",
});

function cellClass(type: string) {
  if (type === "system") return "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20";
  if (type === "dropdown") return "bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/20";
  return "bg-[#38bdf8]/10 text-white border-[#38bdf8]/20";
}

export default function DataEntryExcelRegisterPage() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<any[]>(Array.from({ length: 15 }, emptyRow));
  const [dropdowns, setDropdowns] = useState<Record<string, any[]>>({});
  const [recentRows, setRecentRows] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>({});
  const [selectedStatus, setSelectedStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const calculatedRows = useMemo(
    () => rows.map((row, idx) => calculateRow(row, rows, dropdowns, idx)),
    [rows, dropdowns],
  );

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const [dd, snapshot] = await Promise.all([
        fetchDataEntryDropdownSnapshot(),
        fetchDataEntryRegisterSnapshot(selectedStatus || undefined, 200),
      ]);
      setDropdowns(dd);
      setRecentRows(snapshot.rows);
      setKpis(snapshot.kpis);
    } catch (err: any) {
      setMessage(err.message || t("Unable to load Data Entry register.", "အချက်အလက် စာရင်းသွင်းမှု မှတ်တမ်းကို ရယူ၍မရပါ။"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [selectedStatus]);

  function setCell(rowIndex: number, field: string, value: any) {
    setRows((prev) => prev.map((row, idx) => (idx === rowIndex ? { ...row, [field]: value } : row)));
  }

  function addRows(count = 10) { setRows((prev) => [...prev, ...Array.from({ length: count }, emptyRow)]); }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true); setMessage("");
    try {
      const parsed = await parseDataEntryExcelFile(file);
      setRows(parsed.rows.length ? parsed.rows : [emptyRow()]);
      setMessage(t(`Loaded ${parsed.rows.length} rows. Review, then click Save to Backend.`, `မှတ်တမ်း (${parsed.rows.length}) ခုကို ရယူပြီးပါပြီ။ စစ်ဆေးပြီးပါက ဗဟိုစနစ်သို့ သိမ်းဆည်းမည် ကို နှိပ်ပါ။`));
    } catch (err: any) {
      setMessage(err.message || t("Unable to read Excel file.", "Excel ဖိုင်ကို ဖတ်၍မရပါ။"));
    } finally {
      setLoading(false); event.target.value = "";
    }
  }

  async function handleSave() {
    const nonEmpty = calculatedRows.filter((row) => DATA_ENTRY_COLUMNS.some((col) => String(row[col.field] ?? "").trim() !== ""));
    if (!nonEmpty.length) { setMessage(t("No rows to save.", "သိမ်းဆည်းရန် မှတ်တမ်း မရှိပါ။")); return; }
    setSaving(true); setMessage("");
    try {
      const result = await saveDataEntryRegisterRows({ sourceFileName: "data-entry-grid", uploadedByName: "Data Entry", rows: nonEmpty });
      setMessage(t(`Saved ${result.upserted_rows || result.total_rows || nonEmpty.length} rows. Batch: ${result.batch_id}`, `မှတ်တမ်း (${result.upserted_rows || nonEmpty.length}) ခုကို အောင်မြင်စွာ သိမ်းဆည်းပြီးပါပြီ။`));
      await load();
    } catch (err: any) {
      setMessage(err.message || t("Unable to save Data Entry rows.", "မှတ်တမ်းများကို သိမ်းဆည်း၍မရပါ။"));
    } finally { setSaving(false); }
  }

  return (
    <div className="min-h-screen bg-[#061524] p-6 md:p-8 text-[#eef8ff] notranslate" translate="no">
      <div className="mx-auto max-w-[1800px] space-y-6">
        
        <section className="rounded-3xl bg-[#0b2236] border border-[#1a3a5c] p-8 shadow-xl">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#f6b84b]/30 bg-[#1a3a5c] px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#f6b84b]">
                <FileSpreadsheet className="h-4 w-4" /> <span>{t('Excel Style Data Entry', 'Excel ပုံစံ အချက်အလက် စာရင်းသွင်းခြင်း')}</span>
              </div>
              <h1 className="mt-4 text-3xl font-black text-white md:text-4xl"><span>{t('Data Entry Register Form', 'အချက်အလက် စာရင်းသွင်း မှတ်ပုံတင်ဖောင်')}</span></h1>
              <p className="mt-3 max-w-4xl text-[14px] font-medium leading-relaxed text-[#4d7a9b]">
                <span>{t('Same working style as the uploaded Excel register. System columns are locked/calculated, master-data columns use dropdowns, and manual fields are typed directly in the grid.', 'စနစ်မှ အချက်အလက်များကို အလိုအလျောက် တွက်ချက်ပေးမည်ဖြစ်ပြီး၊ အခြေခံအချက်အလက်များကို ရွေးချယ်နိုင်ကာ ကျန်ရှိသောအချက်အလက်များကို ကိုယ်တိုင် ရိုက်ထည့်နိုင်ပါသည်။')}</span>
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button onClick={() => downloadDataEntryExcelTemplate(dropdowns, calculatedRows)} className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#081b2e] hover:bg-[#1a3a5c] transition-colors px-5 text-[13px] font-bold text-[#c8dff0] uppercase tracking-wider cursor-pointer">
                <Download className="h-4 w-4" /> <span>{t('Download Template', 'ပုံစံငယ် ရယူမည်')}</span>
              </button>
              <label className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#081b2e] hover:bg-[#1a3a5c] transition-colors px-5 text-[13px] font-bold text-[#c8dff0] uppercase tracking-wider">
                <Upload className="h-4 w-4" /> <span>{t('Upload Excel', 'Excel တင်ပို့မည်')}</span>
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} className="hidden" />
              </label>
              <button onClick={() => addRows(10)} className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#1a3a5c] bg-[#081b2e] hover:bg-[#1a3a5c] transition-colors px-5 text-[13px] font-bold text-[#c8dff0] uppercase tracking-wider cursor-pointer">
                <Plus className="h-4 w-4" /> <span>{t('Add 10 Rows', 'အတန်း ၁၀ တန်း ထည့်မည်')}</span>
              </button>
              <button onClick={load} disabled={loading} className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#38bdf8]/30 bg-[#38bdf8]/10 hover:bg-[#38bdf8]/20 transition-colors px-5 text-[13px] font-bold text-[#38bdf8] uppercase tracking-wider disabled:opacity-50 cursor-pointer">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} <span>{t('Refresh', 'အချက်အလက် ပြန်လည်ရယူမည်')}</span>
              </button>
              <button onClick={handleSave} disabled={saving} className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#f6b84b] hover:bg-[#e5a93a] transition-colors px-6 text-[13px] font-bold text-[#061524] uppercase tracking-wider disabled:opacity-50 shadow-xl shadow-[#f6b84b]/10 cursor-pointer">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} <span>{t('Save to Backend', 'ဗဟိုစနစ်သို့ သိမ်းဆည်းမည်')}</span>
              </button>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-t border-[#1a3a5c] pt-6">
            <div className="flex flex-wrap gap-3 text-[11px] font-bold uppercase tracking-wider">
              <span className="rounded-lg border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-3 py-1.5 text-[#f59e0b]"><span>{t('Yellow = System Generated', 'အဝါရောင် = စနစ်မှ အလိုအလျောက် သတ်မှတ်သည်')}</span></span>
              <span className="rounded-lg border border-[#22c55e]/30 bg-[#22c55e]/10 px-3 py-1.5 text-[#22c55e]"><span>{t('Green = Master Dropdown', 'အစိမ်းရောင် = အခြေခံအချက်အလက်မှ ရွေးချယ်သည်')}</span></span>
              <span className="rounded-lg border border-[#38bdf8]/30 bg-[#38bdf8]/10 px-3 py-1.5 text-[#38bdf8]"><span>{t('Blue = Manual Input', 'အပြာရောင် = ကိုယ်တိုင် ရိုက်ထည့်သည်')}</span></span>
            </div>
            <div className="flex flex-wrap gap-3 text-center text-[11px] font-bold uppercase tracking-wider">
              <div className="rounded-lg border border-[#1a3a5c] bg-[#061524] px-4 py-2 text-[#c8dff0]"><span>{t('Total', 'စုစုပေါင်း')} {kpis.total || 0}</span></div>
              <div className="rounded-lg border border-[#22c55e]/30 bg-[#22c55e]/10 px-4 py-2 text-[#22c55e]"><span>{t('Valid', 'မှန်ကန်သည်')} {kpis.valid || 0}</span></div>
              <div className="rounded-lg border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-4 py-2 text-[#f59e0b]"><span>{t('Warning', 'သတိပေးချက်')} {kpis.warning || 0}</span></div>
              <div className="rounded-lg border border-[#38bdf8]/30 bg-[#38bdf8]/10 px-4 py-2 text-[#38bdf8]"><span>{t('Finance', 'ငွေစာရင်း')} {kpis.finance_pending || 0}</span></div>
            </div>
          </div>
        </section>

        {message && (
          <div className="flex items-center gap-3 rounded-xl border border-[#38bdf8]/30 bg-[#38bdf8]/10 p-4 font-bold text-[#38bdf8]">
            <AlertCircle className="shrink-0" size={18} /> <span>{message}</span>
          </div>
        )}

        <section className="rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-6 shadow-xl flex flex-col h-[650px] overflow-hidden">
          <div className="mb-4 flex items-center justify-between border-b border-[#1a3a5c] pb-4">
            <h2 className="text-xl font-black text-white"><span>{t('Excel Register Grid', 'Excel ပုံစံ အချက်အလက်ဇယား')}</span></h2>
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#4d7a9b] bg-[#061524] px-3 py-1 rounded-md border border-[#1a3a5c]"><span>{calculatedRows.length} {t('working rows', 'တန်း')}</span></span>
          </div>

          <div className="flex-1 overflow-auto rounded-2xl border border-[#1a3a5c] bg-[#061524]">
            <table className="min-w-max border-collapse text-left w-full">
              <thead className="sticky top-0 z-20 bg-[#081b2e] shadow-md">
                <tr>
                  <th className="sticky left-0 z-30 w-14 border-b border-r border-[#1a3a5c] bg-[#081b2e] px-3 py-4 text-center text-[11px] font-bold text-[#4d7a9b]">#</th>
                  {DATA_ENTRY_COLUMNS.map((col) => (
                    <th key={col.field} className={`border-b border-r border-[#1a3a5c] px-4 py-4 text-[11px] font-bold uppercase tracking-wider ${cellClass(col.type)}`} style={{ minWidth: col.width || 140 }}>
                      <span>{t(col.header, col.header)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calculatedRows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-[#1a3a5c]/30 transition-colors border-b border-[#1a3a5c]/50">
                    <td className="sticky left-0 z-10 border-r border-[#1a3a5c] bg-[#081b2e] px-3 py-2 text-center text-[12px] font-bold text-[#4d7a9b]">
                      {rowIndex + 1}
                    </td>
                    {DATA_ENTRY_COLUMNS.map((col) => {
                      const value = row[col.field] ?? "";
                      const opts = col.dropdownKey ? dropdowns[col.dropdownKey] || [] : [];
                      return (
                        <td key={col.field} className={`border-r border-[#1a3a5c]/50 p-2 ${cellClass(col.type)} bg-transparent`}>
                          {col.type === "system" ? (
                            <div className="min-h-10 rounded-xl bg-[#061524]/50 border border-[#1a3a5c] px-3 py-2.5 text-[12px] font-bold text-[#c8dff0] whitespace-nowrap overflow-hidden text-ellipsis">
                              <span>{value}</span>
                            </div>
                          ) : col.type === "dropdown" ? (
                            <select
                              value={rows[rowIndex]?.[col.field] ?? ""}
                              onChange={(event) => setCell(rowIndex, col.field, event.target.value)}
                              className="h-10 w-full rounded-xl border border-[#22c55e]/30 bg-[#061524] px-3 text-[12px] font-bold text-[#eef8ff] outline-none focus:border-[#22c55e] cursor-pointer transition-colors"
                            >
                              <option value="">{t('Select...', 'ရွေးချယ်ပါ')}</option>
                              {opts.map((o: any) => (
                                <option key={`${col.field}-${o.value}-${o.label}`} value={o.value || o.name || o.label}>
                                  {o.label || o.name || o.value}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={col.type === "manual_number" ? "number" : "text"}
                              value={rows[rowIndex]?.[col.field] ?? ""}
                              onChange={(event) => setCell(rowIndex, col.field, event.target.value)}
                              className="h-10 w-full rounded-xl border border-[#38bdf8]/30 bg-[#061524] px-3 text-[12px] font-bold text-[#eef8ff] outline-none focus:border-[#38bdf8] transition-colors"
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}