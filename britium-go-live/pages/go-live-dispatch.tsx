import React, { useEffect, useState } from 'react';
import DispatchBoard from '../components/DispatchBoard';

export default function GoLiveDispatchPage() {
  const [parcels, setParcels] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch the parcels from the new API route
  const loadParcels = () => {
    fetch('/api/parcels')
      .then(res => res.json())
      .then(data => {
        if (data.parcels) setParcels(data.parcels);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load parcels", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadParcels();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900">
            Active Dispatch Command Board
          </h1>
          <button 
            onClick={loadParcels}
            className="px-4 py-2 bg-white border border-gray-300 rounded shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Refresh Data
          </button>
        </div>
        
        {loading ? (
          <div className="text-center py-10 text-gray-500 font-medium">Loading active routing data...</div>
        ) : (
          <DispatchBoard parcels={parcels} />
        )}
      </div>
    </div>
  );
}
