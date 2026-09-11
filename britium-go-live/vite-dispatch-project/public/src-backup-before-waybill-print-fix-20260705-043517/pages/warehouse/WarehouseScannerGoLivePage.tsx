// pages/warehouse/WarehouseScannerGoLivePage.tsx
import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Scan, PackageCheck, History } from 'lucide-react';

export default function WarehouseScannerGoLivePage() {
  const [scanInput, setScanInput] = useState('');
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep focus on the input field for continuous scanner use
  useEffect(() => {
    inputRef.current?.focus();
  }, [recentScans, isProcessing]);

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pickupId = scanInput.trim().toUpperCase();
    if (!pickupId) return;

    setIsProcessing(true);
    
    try {
      // 1. Verify pickup exists and is eligible for warehouse intake
      const { data: pickup, error: fetchErr } = await supabase
        .from('be_portal_pickup_requests')
        .select('*')
        .eq('pickup_id', pickupId)
        .single();

      if (fetchErr || !pickup) throw new Error("Invalid or unassigned Pickup ID.");

      // 2. Update master status to Warehouse Received
      await supabase
        .from('be_portal_pickup_requests')
        .update({ status: 'RECEIVED_AT_ORIGIN' })
        .eq('pickup_id', pickupId);

      // 3. Log Cargo Event
      await supabase.from('be_portal_cargo_events').insert([{
        pickup_id: pickupId,
        event_status: 'RECEIVED_AT_ORIGIN',
        updated_by_role: 'Warehouse'
      }]);

      // 4. Update local UI state
      setRecentScans(prev => [{
        id: pickupId,
        time: new Date().toLocaleTimeString(),
        status: 'Success'
      }, ...prev].slice(0, 10)); // Keep last 10 scans

      toast({ title: 'Scan Successful', description: `${pickupId} received at origin warehouse.` });
    } catch (error: any) {
      toast({ title: 'Scan Failed', description: error.message, variant: 'destructive' });
      setRecentScans(prev => [{
        id: pickupId,
        time: new Date().toLocaleTimeString(),
        status: 'Failed'
      }, ...prev].slice(0, 10));
    } finally {
      setScanInput('');
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Scan className="w-8 h-8 text-blue-800" />
        <h1 className="text-2xl font-bold">Warehouse Intake Terminal</h1>
      </div>

      <div className="bg-white p-8 border rounded-lg shadow-sm text-center">
        <form onSubmit={handleScanSubmit} className="max-w-md mx-auto space-y-4">
          <label className="block text-sm font-semibold text-gray-700">Scan Barcode or Enter ID</label>
          <input 
            ref={inputRef}
            type="text"
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            disabled={isProcessing}
            placeholder="e.g. P0627-BBG-015"
            className="w-full text-center text-2xl p-4 border-2 border-blue-200 rounded-md focus:border-blue-600 focus:outline-none"
            autoComplete="off"
          />
          <Button type="submit" disabled={isProcessing || !scanInput} className="w-full py-6 text-lg">
            {isProcessing ? 'Processing...' : 'Process Intake'}
          </Button>
        </form>
      </div>

      <div className="bg-white border rounded-lg shadow-sm p-4">
        <h2 className="font-semibold text-lg flex items-center gap-2 mb-4">
          <History className="w-5 h-5"/> Recent Scans (Go-Live Session)
        </h2>
        {recentScans.length === 0 ? (
          <div className="text-center text-gray-500 py-8">Counters zeroed. Awaiting first scan...</div>
        ) : (
          <div className="divide-y">
            {recentScans.map((scan, idx) => (
              <div key={idx} className="py-3 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <PackageCheck className={`w-5 h-5 ${scan.status === 'Success' ? 'text-green-600' : 'text-red-500'}`} />
                  <span className="font-bold font-mono text-lg">{scan.id}</span>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant={scan.status === 'Success' ? 'default' : 'destructive'}>{scan.status}</Badge>
                  <span className="text-sm text-gray-500">{scan.time}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}