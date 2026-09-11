import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

export const WarehouseScannerPage: React.FC = () => {
  const [scannedCode, setScannedCode] = useState<string>('');
  const [scanHistory, setScanHistory] = useState<{code: string, status: string}[]>([]);
  const [scanMode, setScanMode] = useState<'NORMAL' | 'DAMAGED'>('NORMAL');
  const buffer = useRef<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Allow Tab key to toggle modes quickly without a mouse
      if (e.key === 'Tab') {
        e.preventDefault();
        setScanMode(prev => prev === 'NORMAL' ? 'DAMAGED' : 'NORMAL');
        return;
      }

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || isProcessing) {
        return;
      }

      if (e.key === 'Enter') {
        if (buffer.current.length > 5) {
          const code = buffer.current;
          setScannedCode(code);
          setIsProcessing(true);
          
          try {
            const statusParams = scanMode === 'NORMAL' 
              ? { tracking_no: code } 
              : { tracking_no: code, override_status: 'damaged', reason_code: 'flagged_at_intake' };

            const { data, error } = await supabase.rpc('be_warehouse_intake_action', statusParams);

            if (error) throw error;

            const displayStatus = data?.success ? (scanMode === 'NORMAL' ? 'RECEIVED' : 'FLAGGED DAMAGED') : (data?.message || 'FAILED');
            setScanHistory((prev) => [{ code, status: displayStatus }, ...prev]);
            
          } catch (err: any) {
            console.error("Scan Failed:", err.message);
            setScanHistory((prev) => [{ code, status: 'ERROR' }, ...prev]);
          } finally {
            setIsProcessing(false);
            // Reset to normal mode after a damaged scan to prevent accidental mass-flagging
            if (scanMode === 'DAMAGED') setScanMode('NORMAL');
          }
        }
        buffer.current = ''; 
      } else if (e.key.length === 1) { 
        buffer.current += e.key; 
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isProcessing, scanMode]);

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-2xl mx-auto bg-white p-6 rounded-lg shadow">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Warehouse Intake</h1>
          <button 
            onClick={() => setScanMode(prev => prev === 'NORMAL' ? 'DAMAGED' : 'NORMAL')}
            className={`px-4 py-2 font-bold rounded shadow transition-colors ${scanMode === 'NORMAL' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-red-600 text-white hover:bg-red-700'}`}
          >
            Mode: {scanMode} (Press Tab)
          </button>
        </div>

        <div className={`p-4 rounded mb-6 text-center text-xl font-mono shadow-inner ${scanMode === 'NORMAL' ? 'bg-blue-100 text-blue-900' : 'bg-red-100 text-red-900'}`}>
          Last Scanned: {scannedCode || 'Waiting for hardware input...'}
        </div>

        <h3 className="font-bold text-lg mb-2">Active Session History</h3>
        <ul className="border border-gray-200 rounded divide-y max-h-64 overflow-y-auto">
          {scanHistory.map((item, idx) => (
            <li key={idx} className="p-3 text-gray-700 font-mono flex justify-between bg-white hover:bg-gray-50">
              <span>{item.code}</span>
              <span className={`text-sm font-bold tracking-wide ${item.status.includes('DAMAGED') ? 'text-red-600' : item.status === 'RECEIVED' ? 'text-green-600' : 'text-orange-500'}`}>
                {item.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
