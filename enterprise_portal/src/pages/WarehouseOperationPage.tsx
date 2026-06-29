import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { OperationsActionPanel } from '@/components/workflow/OperationsActionPanel';

export const WarehouseOperationPage = () => {
  const [scannedWaybill, setScannedWaybill] = useState('');
  const [activeParcel, setActiveParcel] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedWaybill) return;
    
    setIsSearching(true);
    try {
      // Query the canonical backend record
      const { data, error } = await supabase
        .from('be_portal_cargo_events') // Ensure this points to your active live table
        .select('*')
        .eq('waybill_number', scannedWaybill)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;
      setActiveParcel(data);
    } catch (error) {
      console.error('Scan failed:', error);
      alert('Parcel not found or backend unavailable.');
      setActiveParcel(null);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Warehouse Operations</h1>
      </div>

      {/* Scanner Input */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <form onSubmit={handleScan} className="flex gap-4">
          <input
            type="text"
            value={scannedWaybill}
            onChange={(e) => setScannedWaybill(e.target.value)}
            placeholder="Scan or Enter Waybill / Pickup ID..."
            className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-lg p-3"
            autoFocus
          />
          <button 
            type="submit" 
            disabled={isSearching || !scannedWaybill}
            className="px-6 py-3 bg-slate-800 text-white font-medium rounded-md hover:bg-slate-700 disabled:opacity-50"
          >
            {isSearching ? 'Locating...' : 'Scan'}
          </button>
        </form>
      </div>

      {/* Parcel Details & Actions */}
      {activeParcel && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-slate-50 p-6 rounded-lg border border-slate-200">
            <h2 className="text-lg font-semibold mb-4 text-slate-800">Cargo Details</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500 block">Pickup ID</span> <span className="font-medium">{activeParcel.pickup_id}</span></div>
              <div><span className="text-gray-500 block">Current Status</span> <span className="font-medium text-blue-600">{activeParcel.status}</span></div>
              <div><span className="text-gray-500 block">Destination</span> <span className="font-medium">{activeParcel.delivery_township}</span></div>
              <div><span className="text-gray-500 block">Weight</span> <span className="font-medium">{activeParcel.actual_weight_kg} kg</span></div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <OperationsActionPanel 
              pickupId={activeParcel.pickup_id}
              currentStatus={activeParcel.status}
              processType="warehouse"
              onActionSuccess={() => {
                setScannedWaybill('');
                setActiveParcel(null);
                // Optionally trigger a success toast here
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};