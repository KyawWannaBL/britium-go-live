import React, { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 
  AlertTriangle, CheckCircle2, Database, Download, Link2, MonitorCheck, 
  RefreshCw, Search, Smartphone, UploadCloud, PackageSearch 
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Helper Components
 */
function WireCard({ icon: Icon, title, count, note, status }: { icon: any, title: string, count: number, note: string, status: string }) {
  return (
    <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="bg-[#061524] p-3 rounded-xl border border-[#1a3a5c]"><Icon size={20} color="#f6b84b" /></div>
        <div>
          <div className="text-[#eef8ff] font-bold text-[14px]">{title}</div>
          <div className="text-[#4d7a9b] text-[12px]">{note}</div>
        </div>
      </div>
      <div className="text-[20px] font-black text-[#f6b84b]">{count}</div>
    </div>
  );
}

export default function MasterDataPortalWired() {
  const { t, lang } = useLanguage();
  
  // Entity State
  const [entity] = useState<string>('merchant'); // Simplified for this view
  const [snapshot, setSnapshot] = useState<any>({}); 
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load Data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const { data } = await supabase.from('merchant_masters').select('*').limit(100);
      setSnapshot({ merchants: data || [] });
      setLoading(false);
    };
    loadData();
  }, []);

  const rows = snapshot.merchants || [];
  const filtered = useMemo(() => rows.filter(r => 
    JSON.stringify(r).toLowerCase().includes(search.toLowerCase())
  ), [rows, search]);

  return (
    <main className="p-8 max-w-[1720px] mx-auto space-y-6 bg-[#061524] text-[#eef8ff] font-sans">
      <section className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-white mb-2">{t('Master Data Control Center', 'အခြေခံအချက်အလက် ဗဟိုထိန်းချုပ်ခန်း')}</h1>
        <div className="flex gap-4 mt-6">
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 bg-[#081b2e] border border-[#1a3a5c] px-5 py-3 rounded-xl font-bold text-[13px] hover:border-[#f6b84b] cursor-pointer">
            <UploadCloud size={16} /> {t('Import Data', 'အချက်အလက်တင်သွင်း')}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <WireCard icon={MonitorCheck} title="Merchant Records" count={rows.length} note="Active entities" status="ok" />
      </section>

      <section className="bg-[#0b2236] border border-[#1a3a5c] rounded-3xl overflow-hidden">
        <div className="p-6 border-b border-[#1a3a5c] flex justify-between items-center">
          <h2 className="text-lg font-bold">Merchant Master Data</h2>
          <input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder={t('Search...', 'ရှာဖွေရန်...')}
            className="bg-[#061524] border border-[#1a3a5c] p-2 rounded-lg text-sm w-64"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#081b2e] text-[#4d7a9b] text-[11px] uppercase">
              <tr>
                <th className="p-4">Code</th>
                <th className="p-4">Name</th>
                <th className="p-4">Phone</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row: any, idx) => (
                <tr key={idx} className="border-b border-[#1a3a5c] hover:bg-[#0f2a42]">
                  <td className="p-4 text-[13px]">{row.merchant_code}</td>
                  <td className="p-4 text-[13px]">{row.merchant_name}</td>
                  <td className="p-4 text-[13px]">{row.phone_primary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}