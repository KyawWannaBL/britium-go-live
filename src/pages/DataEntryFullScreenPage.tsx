import React, { useRef } from 'react';

export default function DataEntryScreen({ riderPhotoUrl }: { riderPhotoUrl?: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    alert("Excel Uploaded! Syncing data...");
  };

  const handleExitFullScreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
  };

  return (
    <div className="bg-gray-50 min-h-screen p-4 text-gray-900">
      {/* ACTION BAR */}
      <div className="bg-white p-4 rounded shadow-md mb-4 flex flex-wrap justify-between items-center sticky top-0 z-50">
        <div className="flex gap-3">
          <input type="file" accept=".xlsx, .csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
          
          <button onClick={() => fileInputRef.current?.click()} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-bold shadow transition">
            📄 Upload Excel (Bulk)
          </button>
          
          <button onClick={() => alert('Data Saved!')} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-bold shadow transition">
            💾 Save Data
          </button>
          
          <button onClick={() => window.open('/print/waybill', '_blank')} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded font-bold shadow transition">
            🖨️ Generate Waybills
          </button>
        </div>

        <button onClick={handleExitFullScreen} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded font-bold shadow transition">
          ⛶ Exit Full Screen
        </button>
      </div>

      {/* Sync Photo from Rider Verification */}
      {riderPhotoUrl && (
         <div className="mb-4 bg-white p-4 rounded shadow-md border-l-4 border-blue-500">
             <h3 className="font-bold text-lg mb-2">📸 Rider Pickup Verification Photo</h3>
             <img src={riderPhotoUrl} alt="Rider Verification" className="h-48 rounded border object-contain" />
         </div>
      )}

      {/* Your Data Entry Table Components Go Here */}
      <div className="bg-white rounded shadow-md h-full p-4">
         <p className="text-gray-600">Data Entry Workspace / Table Grid...</p>
      </div>
    </div>
  );
}