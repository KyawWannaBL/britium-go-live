import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SupervisorDispatchProps {
  pickupId: string;
  zoneId: string;
  onAssigned: () => void;
}

export const SupervisorDispatchAction: React.FC<SupervisorDispatchProps> = ({ pickupId, zoneId, onAssigned }) => {
  const [riderId, setRiderId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  // In a full implementation, riders would be fetched via useGoLiveMasterData 
  // filtered by employment_type and assigned_zone

  const handleAssignRider = async () => {
    setIsAssigning(true);
    try {
      const { error } = await supabase.rpc('be_assign_live_dispatch_wayplan', {
        p_pickup_id: pickupId,
        p_assigned_to: riderId,
        p_role_type: 'rider',
        p_zone: zoneId
      });

      if (error) throw error;
      onAssigned();
    } catch (error) {
      console.error('Assignment failed', error);
      alert('Could not assign rider. Ensure workforce records are populated.');
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <div className="flex gap-2 items-end">
      <div className="flex-1">
        <label className="block text-xs font-medium text-gray-500 mb-1">Assign Workforce</label>
        <input 
          type="text" 
          placeholder="Enter Rider ID (e.g. R-YGN-001)"
          value={riderId}
          onChange={(e) => setRiderId(e.target.value)}
          className="w-full text-sm border-gray-300 rounded-md"
        />
      </div>
      <button 
        onClick={handleAssignRider}
        disabled={!riderId || isAssigning}
        className="px-3 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
      >
        Assign
      </button>
    </div>
  );
};