import React, { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 
  AlertTriangle, CheckCircle2, Database, Download, Link2, MonitorCheck, 
  RefreshCw, Save, Search, Smartphone, UploadCloud, PackageSearch 
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { parseTableData } from '@/lib/tabularBulkLoad'; // Ensure this file exists

export default function MasterDataPortalWired() {
  const { t } = useLanguage();
  const [entity, setEntity] = useState<EntityKey>('merchant');
  const [snapshot, setSnapshot] = useState<MasterSnapshot>(() => buildMergedMasterSnapshot({}));
  const [loading, setLoading] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // --- Logic Helpers ---
  const config = getConfig(entity);
  const rows = rowsForEntity(snapshot, entity);
  const filtered = useMemo(() => rows.filter(r => JSON.stringify(r).toLowerCase().includes(search.toLowerCase())), [rows, search]);
  const summary = useMemo(() => entityCounts(snapshot), [snapshot]);
  const dropdown = useMemo(() => buildDropdownSnapshot(snapshot), [snapshot]);
  const activeWorkers = dropdown.workforce.filter((worker) => worker.is_active).length;

  // --- Synchronization Engine ---
  const refreshMasterData = useCallback(async (reason = 'manual refresh') => {
    setLoading('refresh');
    try {
      const backendSnapshot = await fetchBackendSnapshot();
      const merged = buildMergedMasterSnapshot(backendSnapshot);
      persistMasterDataAliases(merged);
      setSnapshot(merged);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(null);
    }
  }, []);

  // --- Updated File Upload Logic ---
  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading('import');
    try {
      const content = await file.text();
      const isJson = file.name.toLowerCase().endsWith('.json');
      
      // Use the utility to parse tabular data
      const parsedData = parseTableData(content, isJson);
      
      const nextSnapshot = { 
        ...snapshot, 
        [config.canonicalKey]: dedupeRows(parsedData, config.idFields) 
      };
      
      persistMasterDataAliases(nextSnapshot);
      setSnapshot(nextSnapshot);
      alert(t('Synchronized successfully.', 'အောင်မြင်စွာ ချိတ်ဆက်ပြီးပါပြီ။'));
    } catch (error) {
      console.error("Import error:", error);
      alert(t('Import failed. Check file format.', 'တင်ပို့မှု အမှားအယွင်းရှိသည်။'));
    } finally {
      setLoading(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <main className="p-6 md:p-8 max-w-[1720px] mx-auto space-y-6 bg-[#061524] text-[#eef8ff] font-sans">
      {/* Header Section */}
      <section className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-white mb-2">{t('Master Data Control Center', 'အခြေခံအချက်အလက် ဗဟိုထိန်းချုပ်ခန်း')}</h1>
        <div className="flex gap-4 flex-wrap mt-6">
          {/* UI Trigger for File Upload */}
          <button 
            onClick={() => fileRef.current?.click()} 
            className="flex items-center gap-2 bg-[#081b2e] border border-[#1a3a5c] px-5 py-3 rounded-xl font-bold text-[13px] hover:border-[#f6b84b] cursor-pointer"
          >
            <UploadCloud size={16} /> {loading === 'import' ? '...' : t('Import Data', 'အချက်အလက်တင်သွင်း')}
          </button>
          <input 
            ref={fileRef} 
            type="file" 
            accept=".csv,.json" 
            className="hidden" 
            onChange={handleFileUpload} 
          />
          <button onClick={() => refreshMasterData()} className="flex items-center gap-2 bg-[#081b2e] border border-[#1a3a5c] px-5 py-3 rounded-xl font-bold text-[13px] hover:border-[#f6b84b] cursor-pointer">
            <RefreshCw size={16} /> {t('Sync System', 'စနစ်ပြန်လည်ချိတ်ဆက်')}
          </button>
        </div>
      </section>

      {/* KPI Dashboard */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <WireCard icon={MonitorCheck} title="Portal Dropdowns" count={dropdown.merchants.length} note="Active entities" status="ok" />
        <WireCard icon={Smartphone} title="Rider Workforce" count={activeWorkers} note="Active field staff" status="ok" />
        <WireCard icon={Database} title="System Snapshot" count={rows.length} note="Status: Live" status="info" />
        <WireCard icon={PackageSearch} title="Inventory Sync" count={850} note="Warehouse readiness" status="ok" />
      </section>

      {/* Data Table */}
      <section className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl overflow-hidden">
        <div className="p-6 border-b border-[#1a3a5c] flex justify-between items-center">
          <h2 className="text-lg font-bold">{config.label}</h2>
          <input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder={t('Search records...', 'အချက်အလက်ရှာရန်...')}
            className="bg-[#061524] border border-[#1a3a5c] p-2 rounded-lg text-sm w-64"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#081b2e] text-[#4d7a9b] text-[11px] uppercase">
              <tr>
                {config.fields.map(f => <th key={f} className="p-4">{f.replace(/_/g, ' ')}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => (
                <tr key={idx} className="border-b border-[#1a3a5c] hover:bg-[#0f2a42]">
                  {config.fields.map(f => <td key={f} className="p-4 text-[13px]">{String(row[f] ?? '—')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}