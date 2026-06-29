import React, { useState, useEffect } from 'react';
import { LogisticsAPI } from '@/services/LogisticsAPI';

export default function DispatchCenter({ userBranch }: { userBranch: string }) {
  const [boardData, setBoardData] = useState({ unassigned: [], workforce: [] });
  const [selectedParcels, setSelectedParcels] = useState<string[]>([]);
  const [selectedRider, setSelectedRider] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const fetchBoard = async () => {
    try {
      const data = await LogisticsAPI.getDispatchBoard(userBranch === 'YGN' ? undefined : userBranch);
      setBoardData(data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchBoard(); }, [userBranch]);

  const handleAssign = async () => {
    if (!selectedRider || selectedParcels.length === 0) return alert("Select a rider and parcels!");
    setLoading(true);
    try {
      const data = await LogisticsAPI.assignRoute(selectedParcels, selectedRider, `Route-${new Date().getTime()}`);
      alert(`Success! ${data.assigned_count} parcels assigned.`);
      setSelectedParcels([]); // clear selection
      fetchBoard(); // Refresh board
    } catch (error: any) {
      alert(`Assignment failed: ${error.message}`);
    }
    setLoading(false);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Live Dispatch Center</h2>
      
      <div className="flex gap-4 mb-6 p-4 bg-gray-50 rounded shadow-sm items-center">
        <select onChange={e => setSelectedRider(e.target.value)} className="border p-2 rounded flex-1">
          <option value="">-- Select Rider / Driver --</option>
          {boardData.workforce?.map((w: any) => (
             <option key={w.user_id} value={w.user_id}>{w.full_name} ({w.role})</option>
          ))}
        </select>
        <button onClick={handleAssign} disabled={loading} className="bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700">
          Assign Selected ({selectedParcels.length})
        </button>
      </div>
      
      {/* TODO: Map over boardData.unassigned to render your table rows and attach checkboxes to the selectedParcels state array */}
    </div>
  );
}