import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useEnterpriseMasterData() {
  const [snapshot, setSnapshot] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch the unified registry data
      const { data, error: dbError } = await supabase
        .from('be_master_data_registry')
        .select('*')
        .eq('is_active', true);

      if (dbError) throw dbError;

      // Group the data by module_key for easy frontend consumption
      const groupedData = (data || []).reduce((acc: any, curr: any) => {
        const key = curr.module_key.toLowerCase();
        if (!acc[key]) acc[key] = [];
        acc[key].push(curr.json_data); // Expose the raw JSON from the CSV
        return acc;
      }, {});

      setSnapshot(groupedData);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to sync master data from registry');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    sync();
    // Listen for the event emitted by MasterDataPage when new CSVs are pasted
    const handleSyncEvent = () => sync();
    window.addEventListener('britium:master-data-synced', handleSyncEvent);
    
    return () => {
      window.removeEventListener('britium:master-data-synced', handleSyncEvent);
    };
  }, [sync]);

  // Helper to extract specific tables (e.g., getRows('rider'))
  const getRows = useCallback((entityKey: string) => {
    return snapshot[entityKey.toLowerCase()] || [];
  }, [snapshot]);

  return { snapshot, loading, error, sync, getRows };
}