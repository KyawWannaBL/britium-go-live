import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useRealtimeSync(table: string, callback: () => void) {
  useEffect(() => {
    const channel = supabase
      .channel(`sync-${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: table }, () => {
        callback();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, callback]);
}
