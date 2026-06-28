import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function useDispatchCounters(branchCode) {
  const [counters, setCounters] = useState({
    activeRoutes: 0,
    totalStops: 0,
    pendingReassignments: 0
  });

  useEffect(() => {
    async function fetchCounters() {
      // 1. Fetch strictly Active Routes (No mock data)
      const { count: routes } = await supabase
        .from('be_dispatch_routes')
        .select('*', { count: 'exact', head: true })
        .eq('branch_code', branchCode)
        .eq('status', 'ACTIVE');

      // 2. Fetch pending Reassignments from Exception Rules
      const { count: exceptions } = await supabase
        .from('be_exception_audit')
        .select('*', { count: 'exact', head: true })
        .eq('branch_id', branchCode)
        .in('next_action', ['REASSIGN_RIDER', 'REASSIGN_VEHICLE'])
        .is('resolved_at', null);

      setCounters({
        activeRoutes: routes || 0,
        totalStops: 0, // Calculate dynamically based on route details
        pendingReassignments: exceptions || 0
      });
    }

    fetchCounters();
  }, [branchCode]);

  return counters;
}
