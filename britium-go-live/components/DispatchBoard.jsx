'use client';
import { useState } from 'react';

export default function DispatchBoard({ parcels = [] }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSelectRow = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(parcels.map(p => p.parcel_id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleBatchAction = async (actionType) => {
    if (selectedIds.length === 0) {
      alert("Please select at least one parcel.");
      return;
    }

    setIsProcessing(true);
    
    try {
      // Specialized handler for PDF Binary Data
      if (actionType === 'WAYBILL') {
        const response = await fetch('/api/generate-waybills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parcel_ids: selectedIds })
        });

        if (!response.ok) throw new Error("Failed to generate PDF");

        // Convert the binary stream to a browser URL
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank'); // Opens the PDF in a new tab
        setIsProcessing(false);
        return;
      }

      // Standard handler for JSON Data (Approve, Skip, Calculate)
      const response = await fetch('/api/batch-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionType, parcel_ids: selectedIds })
      });

      const data = await response.json();

      if (response.ok) {
        alert(`Success: ${data.message}`);
        setSelectedIds([]); 
      } else {
        alert(`Error: ${data.message}`);
      }
    } catch (error) {
      console.error("Batch action failed:", error);
      alert("Network error occurred.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex gap-4 mb-4">
        <button 
          onClick={() => handleBatchAction('APPROVE')}
          disabled={selectedIds.length === 0 || isProcessing}
          className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
        >
          Approve Selected ({selectedIds.length})
        </button>
        
        <button 
          onClick={() => handleBatchAction('SKIP')}
          disabled={selectedIds.length === 0 || isProcessing}
          className="px-4 py-2 bg-yellow-500 text-white rounded disabled:opacity-50"
        >
          Skip Review
        </button>

        <button 
          onClick={() => handleBatchAction('CALCULATE')}
          disabled={selectedIds.length === 0 || isProcessing}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          Calculate Distance
        </button>

        <button 
          onClick={() => handleBatchAction('WAYBILL')}
          disabled={selectedIds.length === 0 || isProcessing}
          className="px-4 py-2 bg-gray-800 text-white rounded disabled:opacity-50"
        >
          Generate Waybills
        </button>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 border">
              <input 
                type="checkbox" 
                onChange={handleSelectAll} 
                checked={selectedIds.length === parcels.length && parcels.length > 0}
              />
            </th>
            <th className="p-2 border">Merchant</th>
            <th className="p-2 border">Recipient</th>
            <th className="p-2 border">Status</th>
          </tr>
        </thead>
        <tbody>
          {parcels.map((parcel) => (
            <tr key={parcel.parcel_id} className="hover:bg-gray-50">
              <td className="p-2 border text-center">
                <input 
                  type="checkbox" 
                  onChange={() => handleSelectRow(parcel.parcel_id)}
                  checked={selectedIds.includes(parcel.parcel_id)}
                />
              </td>
              <td className="p-2 border">{parcel.merchant_code}</td>
              <td className="p-2 border">{parcel.recipient_name}</td>
              <td className="p-2 border">{parcel.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
