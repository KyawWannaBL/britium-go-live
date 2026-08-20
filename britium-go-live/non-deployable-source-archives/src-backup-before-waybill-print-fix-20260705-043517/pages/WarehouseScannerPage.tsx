import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ScanBarcode, Package, AlertTriangle, CheckCircle } from 'lucide-react';

export default function WarehouseScannerPage({ currentBranch, userId }) {
  const [scanType, setScanType] = useState('INBOUND');
  const [barcode, setBarcode] = useState('');
  const [scanLogs, setScanLogs] = useState([]);
  const [actualWeight, setActualWeight] = useState('');
  const inputRef = useRef(null);

  // Focus the input automatically for physical scanners
  useEffect(() => {
    inputRef.current?.focus();
  }, [scanType]);

  const handleScanSubmit = async (e) => {
    e.preventDefault();
    if (!barcode.trim()) return;

    try {
      const { data, error } = await supabase.rpc('process_warehouse_scan', {
        p_pickup_id: barcode.trim(),
        p_branch_code: currentBranch,
        p_scan_type: scanType,
        p_scanned_by: userId,
        p_actual_weight: actualWeight ? parseFloat(actualWeight) : null
      });

      if (error) throw error;

      setScanLogs(prev => [{
        id: barcode, 
        time: new Date().toLocaleTimeString(), 
        status: data,
        success: !data.includes('EXCEPTION')
      }, ...prev]);

    } catch (err) {
      setScanLogs(prev => [{
        id: barcode, 
        time: new Date().toLocaleTimeString(), 
        status: err.message,
        success: false
      }, ...prev]);
    }

    setBarcode(''); // Reset for next scan
    setActualWeight('');
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-[#0b2236] flex items-center gap-2">
          <ScanBarcode /> Warehouse Operations ({currentBranch})
        </h2>
        
        {/* Scan Type Selector */}
        <div className="flex bg-slate-100 p-1 rounded-lg">
          {['INBOUND', 'SORTING', 'OUTBOUND'].map(type => (
            <button 
              key={type}
              onClick={() => setScanType(type)}
              className={`px-4 py-2 rounded-md text-sm font-bold ${scanType === type ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleScanSubmit} className="bg-white p-6 rounded-xl shadow-sm border mb-6 flex gap-4 items-end">
        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Waybill / Pickup ID</label>
          <input 
            ref={inputRef}
            type="text" 
            value={barcode}
            onChange={e => setBarcode(e.target.value)}
            className="w-full text-lg p-3 border rounded-lg focus:border-blue-500 outline-none"
            placeholder="Scan Barcode here..."
            autoFocus
          />
        </div>
        {scanType === 'INBOUND' && (
          <div className="w-32">
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Weight (Kg)</label>
            <input 
              type="number" 
              step="0.01"
              value={actualWeight}
              onChange={e => setActualWeight(e.target.value)}
              className="w-full text-lg p-3 border rounded-lg outline-none"
              placeholder="Optional"
            />
          </div>
        )}
        <button type="submit" className="bg-blue-600 text-white font-bold px-6 py-3 rounded-lg h-[52px]">
          Enter
        </button>
      </form>

      {/* Scan Result Logs */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="bg-slate-50 p-3 border-b text-sm font-bold text-slate-600">Recent Scans</div>
        <div className="divide-y">
          {scanLogs.map((log, i) => (
            <div key={i} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {log.success ? <CheckCircle className="text-green-500" size={20}/> : <AlertTriangle className="text-red-500" size={20}/>}
                <span className="font-mono font-bold">{log.id}</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className={`px-2 py-1 rounded font-bold ${log.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {log.status}
                </span>
                <span className="text-slate-400">{log.time}</span>
              </div>
            </div>
          ))}
          {scanLogs.length === 0 && <div className="p-8 text-center text-slate-400">No recent scans.</div>}
        </div>
      </div>
    </div>
  );
}
