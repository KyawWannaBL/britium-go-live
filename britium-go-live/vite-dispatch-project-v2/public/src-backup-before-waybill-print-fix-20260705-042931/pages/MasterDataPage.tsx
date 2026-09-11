import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Database, Upload, Save, CheckCircle2, AlertTriangle, Loader2, Table2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const MODULES = [
  { key: 'RIDER', label: 'Rider Master' },
  { key: 'DRIVER', label: 'Driver Master' },
  { key: 'HELPER', label: 'Helper Master' },
  { key: 'EMPLOYEE', label: 'Employee Master' },
  { key: 'FLEET', label: 'Fleet Master' },
  { key: 'MERCHANT', label: 'Merchant Master' }
];

export default function MasterDataPage() {
  const { lang, setLang } = useLanguage();
  const [selectedModule, setSelectedModule] = useState('RIDER');
  const [pasteData, setPasteData] = useState('');
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);

  // Automatically parse Excel paste (Tab Separated) or CSV
  useEffect(() => {
    if (!pasteData.trim()) {
      setParsedRows([]);
      setHeaders([]);
      return;
    }
    
    // Auto-detect Tab (Excel paste) or Comma (CSV)
    const separator = pasteData.includes('\t') ? '\t' : ',';
    const lines = pasteData.split('\n').map(l => l.trim()).filter(l => l);
    
    if (lines.length > 0) {
      const hdrs = lines[0].split(separator).map(h => h.trim());
      setHeaders(hdrs);
      
      const rows = lines.slice(1).map(line => {
        const values = line.split(separator);
        const obj: any = {};
        hdrs.forEach((h, i) => { if (h) obj[h] = values[i] || ''; });
        return obj;
      });
      setParsedRows(rows.filter(r => Object.keys(r).length > 0));
    }
  }, [pasteData]);

  const handleSync = async () => {
    if (parsedRows.length === 0) return setMessage({ type: 'error', text: 'No valid data to sync.' });
    setLoading(true); setMessage(null);

    try {
      const payload = parsedRows.map(row => {
        // Intelligent ID/Name mapping based on your Britium templates
        const code = row.rider_id || row.driver_id || row.helper_id || row.employee_id || row.fleet_id || row.merchant_code || 'NEW';
        const name = row.rider_name || row.driver_name || row.helper_name || row.employee_name || row.vehicle_no || row.merchant_name || 'Unknown';
        
        return {
          module_key: selectedModule,
          record_code: code,
          display_name: name,
          json_data: row,
          branch_code: row.assigned_zone || row.city || row.branch_code || 'YGN',
          is_active: (row.status || row.contract_status || 'Active').toLowerCase().includes('active')
        };
      });

      const { error } = await supabase.from('be_master_data_registry').insert(payload);
      if (error) throw error;

      setMessage({ type: 'success', text: `Successfully synchronized ${parsedRows.length} records to backend.` });
      setPasteData('');
      
      // Dispatch global event to tell other hooks to refresh
      window.dispatchEvent(new Event('britium:master-data-synced'));
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Sync failed.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-6 bg-[#061524] min-h-screen text-[#eef8ff] font-['Poppins']">
      
      {/* Header */}
      <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl shadow-xl flex justify-between items-center">
        <div>
          <div className="text-[#f6b84b] text-[11px] font-bold uppercase tracking-widest mb-1">Central Registry</div>
          <h1 className="text-2xl font-black flex items-center gap-3"><Database className="text-[#38bdf8]"/> Master Data Entry</h1>
          <p className="text-[#a8c4da] text-sm mt-1">Paste directly from Excel to synchronize operational tables instantly.</p>
        </div>
        <button onClick={() => setLang(lang === 'en' ? 'mm' : 'en')} className="px-4 py-2 bg-[#1a3a5c] rounded-lg text-xs font-bold uppercase">
          {lang === 'en' ? 'မြန်မာဘာသာ' : 'English'}
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 font-bold ${message.type === 'error' ? 'bg-[#ff4f86]/10 text-[#ff4f86] border-[#ff4f86]/30' : 'bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/30'}`}>
          {message.type === 'error' ? <AlertTriangle size={18}/> : <CheckCircle2 size={18}/>}
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Input Controls */}
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl shadow-xl space-y-6 h-fit">
          <div>
            <label className="text-[11px] font-bold text-[#4d7a9b] uppercase tracking-wider mb-2 block">1. Select Target Template</label>
            <select 
              value={selectedModule} 
              onChange={e => setSelectedModule(e.target.value)}
              className="w-full h-12 bg-[#061524] border border-[#1a3a5c] text-white rounded-xl px-4 outline-none focus:border-[#f6b84b]"
            >
              {MODULES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-[#4d7a9b] uppercase tracking-wider mb-2 block">2. Paste Data (Excel / CSV)</label>
            <textarea 
              value={pasteData}
              onChange={e => setPasteData(e.target.value)}
              placeholder="Copy rows from Excel including headers and paste here..."
              className="w-full h-64 bg-[#061524] border border-[#1a3a5c] text-[#c8dff0] rounded-xl p-4 outline-none focus:border-[#f6b84b] font-mono text-[12px] whitespace-pre"
            />
          </div>

          <button 
            onClick={handleSync} 
            disabled={loading || parsedRows.length === 0}
            className="flex items-center justify-center gap-2 w-full h-12 bg-gradient-to-r from-[#f6b84b] to-[#d49a36] hover:brightness-110 text-[#061524] rounded-xl font-black uppercase tracking-wider transition-all disabled:opacity-50 disabled:grayscale"
          >
            {loading ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
            {loading ? 'Syncing...' : 'Sync Data to Backend'}
          </button>
        </div>

        {/* Right: Interactive Table Preview */}
        <div className="lg:col-span-2 bg-[#0b2236] border border-[#1a3a5c] rounded-2xl shadow-xl overflow-hidden flex flex-col">
          <div className="p-5 border-b border-[#1a3a5c] flex justify-between items-center bg-[#081b2e]">
            <h2 className="text-lg font-bold flex items-center gap-2 m-0"><Table2 size={18} className="text-[#38bdf8]"/> Data Preview</h2>
            <span className="text-xs font-bold px-3 py-1 bg-[#1a3a5c] rounded-full">{parsedRows.length} Rows Detected</span>
          </div>
          
          <div className="flex-1 overflow-auto p-0 max-h-[600px]">
            {parsedRows.length === 0 ? (
              <div className="flex items-center justify-center h-full min-h-[400px] text-[#4d7a9b] font-medium text-sm">
                Paste data to see interactive preview
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-[#061524] sticky top-0 shadow-md">
                  <tr>
                    {headers.map((h, i) => (
                      <th key={i} className="p-3 text-[#4d7a9b] text-[11px] font-bold uppercase tracking-wider border-b border-[#1a3a5c] whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((row, idx) => (
                    <tr key={idx} className="border-b border-[#1a3a5c]/50 hover:bg-[#1a3a5c]/20 transition-colors">
                      {headers.map((h, i) => (
                        <td key={i} className="p-3 text-[#eef8ff] whitespace-nowrap">{row[h] || '-'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}