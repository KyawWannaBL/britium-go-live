'use client';

import { useState } from 'react';

export default function BulkUploadDropzone() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: '' });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setUploadStatus({ type: null, message: '' }); // Clear old messages
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setUploadStatus({ type: 'error', message: "Please select an Excel file first." });
      return;
    }

    setIsUploading(true);
    setUploadStatus({ type: null, message: '' });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/bulk-upload', {
        method: 'POST',
        body: formData, // Notice: Do NOT set 'Content-Type' manually when using FormData
      });

      const data = await response.json();

      if (response.ok) {
        setUploadStatus({ 
          type: 'success', 
          message: `Success! Batch ID: ${data.batch_id} - ${data.message}` 
        });
        setFile(null); // Clear the input after success
        // Optional: Trigger a data refresh for your dispatch board here
      } else {
        setUploadStatus({ type: 'error', message: data.error || 'Upload failed.' });
      }
    } catch (error) {
      console.error("Upload error:", error);
      setUploadStatus({ type: 'error', message: "A network error occurred during upload." });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 bg-white rounded-lg shadow-md border border-gray-200">
      <h2 className="text-xl font-bold mb-4">Consolidated Bulk Upload</h2>
      <p className="text-sm text-gray-600 mb-6">
        Upload a master Excel file containing parcels from multiple merchants. The system will automatically detect the merchant code per row and route them accordingly.
      </p>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <p className="mb-2 text-sm text-gray-500 font-semibold">Click to browse or drag and drop</p>
            <p className="text-xs text-gray-500">XLSX or CSV files only</p>
          </div>
          <input 
            type="file" 
            className="hidden" 
            accept=".xlsx, .xls, .csv" 
            onChange={handleFileChange} 
          />
        </label>

        {file && (
          <div className="text-sm text-gray-700 bg-blue-50 p-2 rounded border border-blue-100">
            Selected File: <strong>{file.name}</strong>
          </div>
        )}

        <button 
          onClick={handleUpload}
          disabled={!file || isUploading}
          className={`w-full py-2 px-4 rounded text-white font-semibold transition-colors
            ${!file || isUploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}
          `}
        >
          {isUploading ? 'Processing...' : 'Upload & Route Parcels'}
        </button>

        {uploadStatus.type === 'success' && (
          <div className="p-3 mt-2 text-sm text-green-800 bg-green-100 rounded border border-green-200">
            {uploadStatus.message}
          </div>
        )}
        
        {uploadStatus.type === 'error' && (
          <div className="p-3 mt-2 text-sm text-red-800 bg-red-100 rounded border border-red-200">
            {uploadStatus.message}
          </div>
        )}
      </div>
    </div>
  );
}
