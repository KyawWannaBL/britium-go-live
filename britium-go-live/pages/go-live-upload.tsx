import React from 'react';
import BulkUploadDropzone from '../components/BulkUploadDropzone';

export default function GoLiveUploadPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-8 text-center">
          Britium Express - Universal Data Ingestion
        </h1>
        <BulkUploadDropzone />
      </div>
    </div>
  );
}
