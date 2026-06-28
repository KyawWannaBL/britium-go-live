// src/hooks/useRealtimeSync.ts
import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function useRealtimeSync(tableName: string, refreshCallback: () => void) {
  useEffect(() => {
    // Subscribe to all changes (INSERT, UPDATE, DELETE) for the specific table
    const channel = supabase
      .channel(`sync_${tableName}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tableName },
        (payload) => {
          console.log(`[Realtime Sync] Update detected on ${tableName}:`, payload);
          // Trigger the component to re-fetch its data
          refreshCallback();
        }
      )
      .subscribe();

    // Cleanup subscription when the user navigates away from the page
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableName, refreshCallback]);
}