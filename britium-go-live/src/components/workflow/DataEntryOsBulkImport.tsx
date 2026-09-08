import React, { useState } from 'react';

export default function DataEntryOsBulkImport({ onClose, onCancel }) {
  const [status, setStatus] = useState("Awaiting Upload...");

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setStatus("Uploading & Processing...");
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const res = await fetch('/api/bulk-upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setStatus(`Success! Batch ID: ${data.batch_id}`);
        alert(`Successfully processed ${file.name}. The backend has automatically converted the template, mapped the zones, and assigned IDs.`);
        if (onClose) onClose();
        if (onCancel) onCancel();
      } else {
        setStatus(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      setStatus("Network error. Ensure the Vercel API is reachable.");
    }
  };

  const closeFunc = onClose || onCancel || (() => window.location.reload());

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-80 p-4">
      <div className="bg-[#0f172a] border border-gray-700 rounded-xl p-8 w-full max-w-2xl relative shadow-2xl text-white">
        <button onClick={closeFunc} className="absolute top-4 right-4 text-gray-400 hover:text-white text-3xl font-bold">&times;</button>
        <h2 className="text-2xl font-bold mb-2 text-cyan-400">Universal Inbound Engine</h2>
        <p className="text-gray-400 mb-8">This new pipeline bypasses target pickup requirements. Drop your Inbound Manifest directly below.</p>
        
        <div className="border-2 border-dashed border-gray-600 rounded-lg p-12 text-center bg-gray-800 hover:bg-gray-700 transition">
          <input type="file" onChange={handleFileUpload} accept=".xlsx,.csv" className="hidden" id="file-upload" />
          <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center w-full h-full">
            <svg className="w-16 h-16 text-cyan-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
            <span className="text-lg font-semibold text-white">Select Excel Manifest</span>
            <span className="text-sm text-gray-400 mt-2">.xlsx or .csv up to 50MB</span>
          </label>
        </div>
        <div className="mt-6 text-center font-mono text-cyan-300 bg-gray-900 p-3 rounded border border-gray-700">
          Status: {status}
        </div>
      </div>
    </div>
  );
}
