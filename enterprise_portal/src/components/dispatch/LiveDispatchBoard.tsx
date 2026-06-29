import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SupervisorDispatchAction } from './SupervisorDispatchAction';

interface DispatchBoardStats {
  pending_pickups: number;
  in_transit: number;
  unassigned_deliveries: number;
  active_riders: number;
}

export const LiveDispatchBoard = () => {
  const [boardData, setBoardData] = useState<any[]>([]);
  const [stats, setStats] = useState<DispatchBoardStats>({
    pending_pickups: 0,
    in_transit: 0,
    unassigned_deliveries: 0,
    active_riders: 0
  });
  const [loading, setLoading] = useState(true);

  const fetchLiveBoard = async () => {
    try {
      setLoading(true);
      // Calls the mandated RPC for real-time dispatch queue
      const { data, error } = await supabase.rpc('be_get_live_dispatch_wayplan_board');
      
      if (error) throw error;

      if (data) {
        setBoardData(data.tasks || []);
        setStats(data.stats || {
          pending_pickups: 0,
          in_transit: 0,
          unassigned_deliveries: 0,
          active_riders: 0
        });
      }
    } catch (err) {
      console.error('Failed to load live dispatch board:', err);
    } finally {
      setLoading(false);
    }
  };

  // Poll every 30 seconds, or ideally use Supabase Realtime here
  useEffect(() => {
    fetchLiveBoard();
    const interval = setInterval(fetchLiveBoard, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Dynamic Counters */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 bg-white border rounded-lg shadow-sm text-center">
          <div className="text-3xl font-bold text-blue-600">{stats.pending_pickups}</div>
          <div className="text-xs text-gray-500 uppercase font-semibold tracking-wider mt-1">Pending Pickups</div>
        </div>
        <div className="p-4 bg-white border rounded-lg shadow-sm text-center">
          <div className="text-3xl font-bold text-amber-500">{stats.in_transit}</div>
          <div className="text-xs text-gray-500 uppercase font-semibold tracking-wider mt-1">In Transit</div>
        </div>
        <div className="p-4 bg-white border rounded-lg shadow-sm text-center">
          <div className="text-3xl font-bold text-red-500">{stats.unassigned_deliveries}</div>
          <div className="text-xs text-gray-500 uppercase font-semibold tracking-wider mt-1">Unassigned Routes</div>
        </div>
        <div className="p-4 bg-white border rounded-lg shadow-sm text-center">
          <div className="text-3xl font-bold text-green-600">{stats.active_riders}</div>
          <div className="text-xs text-gray-500 uppercase font-semibold tracking-wider mt-1">Active Workforce</div>
        </div>
      </div>

      {/* Task Queue mapping */}
      <div className="bg-white border rounded-lg shadow-sm">
        <div className="px-4 py-3 border-b bg-gray-50 font-medium text-gray-700">
          Unassigned Wayplan Queue
        </div>
        <div className="divide-y">
          {loading && boardData.length === 0 ? (
            <div className="p-4 text-center text-gray-500">Syncing live dispatch board...</div>
          ) : boardData.length === 0 ? (
            <div className="p-4 text-center text-gray-500">Queue is clear. Counters are zeroed out.</div>
          ) : (
            boardData.map((task) => (
              <div key={task.id} className="p-4 flex justify-between items-center hover:bg-gray-50">
                <div>
                  <div className="font-semibold text-gray-800">{task.waybill_number}</div>
                  <div className="text-sm text-gray-500">Zone: {task.zone_id} | Type: {task.task_type}</div>
                </div>
                <div className="w-72">
                  <SupervisorDispatchAction 
                    pickupId={task.id} 
                    zoneId={task.zone_id}
                    onAssigned={() => fetchLiveBoard()} 
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};