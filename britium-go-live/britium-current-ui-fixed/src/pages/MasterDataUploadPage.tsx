import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Database, Upload, Save, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

const MODULES = [
  { key: 'RIDER', label: 'Rider Master' },
  { key: 'DRIVER', label: 'Driver Master' },
  { key: 'HELPER', label: 'Helper Master' },
  { key: 'EMPLOYEE', label: 'Employee Master' },
  { key: 'FLEET', label: 'Fleet Master' },
  { key: 'MERCHANT', label: 'Merchant Master' }
];

export default function MasterDataUploadPage() {
  const [selectedModule, setSelectedModule] = useState('RIDER');
  const [csvText, setCsvText] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);

  // Parse CSV text into JSON objects
  const parseCSV = (text: string) => {
    // Ignore the first two instruction lines from your specific Britium templates
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 4) throw new Error("Invalid format. Please include headers and data.");
    
    // Find the header row (usually row 3 in your templates)
    const headerIndex = lines.findIndex(l => l.includes('rider_id') || l.includes('merchant_code') || l.includes('fleet_id') || l.includes('driver_id') || l.includes('employee_id') || l.includes('helper_id'));
    
    if (headerIndex === -1) throw new Error("Could not detect headers. Ensure you copied the header row.");

    const headers = lines[headerIndex].split(',').map(h => h.trim());
    const dataRows = lines.slice(headerIndex + 1);

    return dataRows.map(row => {
      const values = row.split(','); // Simple split (for complex CSVs with commas inside quotes, a robust parser is needed)
      const obj: any = {};
      headers.forEach((h, i) => {
        if (h) obj[h] = values[i] || '';
      });
      return obj;
    }).filter(row => Object.keys(row).length > 0 && Object.values(row).some(v => v !== ''));
  };

  const handleUpload = async () => {
    if (!csvText.trim()) return setMessage({ type: 'error', text: 'Please paste CSV data first.' });
    
    setLoading(true);
    setMessage(null);

    try {
      const parsedData = parseCSV(csvText);
      if (parsedData.length === 0) throw new Error("No valid data rows found.");

      // Format payload for the unified registry we created earlier
      const payload = parsedData.map(row => {
        // Find the unique identifier column based on the module
        const code = row.rider_id || row.driver_id || row.helper_id || row.employee_id || row.fleet_id || row.merchant_code || 'NEW';
        const name = row.rider_name || row.driver_name || row.helper_name || row.employee_name || row.vehicle_no || row.merchant_name || 'Unknown';
        
        return {
          module_key: selectedModule,
          record_code: code,
          display_name: name,
          json_data: row,
          branch_code: row.assigned_zone || row.city || 'YGN',
          is_active: (row.status || '').toLowerCase() === 'active'
        };
      });

      // Bulk insert into registry
      const { error } = await supabase.from('be_master_data_registry').insert(payload);
      
      if (error) throw error;

      setMessage({ type: 'success', text: `Successfully synced ${parsedData.length} records to ${selectedModule} Master.` });
      setCsvText('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Upload failed.' });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvText(event.target?.result as string);
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 bg-[#061524] min-h-screen text-[#eef8ff] font-['Poppins']">
      
      <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl shadow-xl flex justify-between items-center">
        <div>
          <div className="text-[#f6b84b] text-[11px] font-bold uppercase tracking-widest mb-1">Admin & Rules</div>
          <h1 className="text-2xl font-black flex items-center gap-3"><Database className="text-[#38bdf8]"/> Master Data Sync</h1>
          <p className="text-[#a8c4da] text-sm mt-1">Upload your standard CSV templates to synchronize backend systems.</p>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 font-bold ${message.type === 'error' ? 'bg-[#ff4f86]/10 text-[#ff4f86] border-[#ff4f86]/30' : 'bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/30'}`}>
          {message.type === 'error' ? <AlertTriangle size={18}/> : <CheckCircle2 size={18}/>}
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column - Controls */}
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl shadow-xl space-y-6 h-fit">
          <div>
            <label className="text-[11px] font-bold text-[#4d7a9b] uppercase tracking-wider mb-2 block">Target Module</label>
            <select 
              value={selectedModule} 
              onChange={e => setSelectedModule(e.target.value)}
              className="w-full h-12 bg-[#061524] border border-[#1a3a5c] text-white rounded-xl px-4 outline-none focus:border-[#f6b84b]"
            >
              {MODULES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>

          <div className="bg-[#061524] border border-[#1a3a5c] p-4 rounded-xl text-sm text-[#a8c4da]">
            <p className="font-bold text-[#f6b84b] mb-2">Instructions:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Select your target module.</li>
              <li>Click <strong>Upload CSV File</strong> or copy-paste directly from Excel/Sheets.</li>
              <li>Ensure the header row is included.</li>
              <li>Click <strong>Sync to Backend</strong>.</li>
            </ul>
          </div>

          <label className="flex items-center justify-center gap-2 w-full h-12 bg-[#102b45] hover:bg-[#1a3a5c] border border-[#38bdf8] text-[#38bdf8] rounded-xl font-bold cursor-pointer transition-colors">
            <Upload size={18}/> Upload CSV File
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>

          <button 
            onClick={handleUpload} 
            disabled={loading || !csvText.trim()}
            className="flex items-center justify-center gap-2 w-full h-12 bg-gradient-to-r from-[#f6b84b] to-[#d49a36] hover:brightness-110 text-[#061524] rounded-xl font-black uppercase tracking-wider transition-all disabled:opacity-50 disabled:grayscale"
          >
            {loading ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
            {loading ? 'Syncing...' : 'Sync to Backend'}
          </button>
        </div>

        {/* Right Column - Data Input */}
        <div className="lg:col-span-2 bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl shadow-xl flex flex-col">
          <label className="text-[11px] font-bold text-[#4d7a9b] uppercase tracking-wider mb-2 block flex justify-between">
            <span>Raw CSV Data Input</span>
            <span className="text-[#f6b84b]">{csvText ? `${csvText.split('\n').length} lines detected` : ''}</span>
          </label>
          <textarea 
            value={csvText}
            onChange={e => setCsvText(e.target.value)}
            placeholder={`Paste your ${selectedModule} CSV data here...\nExample:\nrider_id,rider_name,phone_primary,assigned_zone,status\nRID001,Ko Kyaw Zin,09-1234567,Yangon Central,Active`}
            className="w-full flex-1 min-h-[500px] bg-[#061524] border border-[#1a3a5c] text-[#c8dff0] rounded-xl p-4 outline-none focus:border-[#f6b84b] font-mono text-[13px] whitespace-pre"
          />
        </div>
        
      </div>
    </div>
  );
}