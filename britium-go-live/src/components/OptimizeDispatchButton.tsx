import React from 'react';
import { generateOptimizedRoute } from '../services/wayplanService';

interface OptimizeDispatchButtonProps {
  selectedParcels: any[];
  selectedRider: string;
  onComplete?: () => void;
}

export default function OptimizeDispatchButton({ selectedParcels, selectedRider, onComplete }: OptimizeDispatchButtonProps) {
  const handleOptimizeAndDispatch = async () => {
    if (!selectedRider || !selectedParcels || selectedParcels.length === 0) {
      alert("Please select a rider and at least one waybill.");
      return;
    }

    try {
      const response = await generateOptimizedRoute(selectedParcels, selectedRider);
      if (response.success) {
        alert(`Wayplan locked! ${response.totalStops} stops assigned in optimal order.`);
        if (onComplete) onComplete();
      }
    } catch (error) {
      console.error(error);
      alert("Failed to generate optimized wayplan.");
    }
  };

  return (
    <button 
      onClick={handleOptimizeAndDispatch}
      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
    >
      Generate Optimized Wayplan
    </button>
  );
}