import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MasterOptions, DEFAULT_MASTER_OPTIONS, normalizeMasterOptions } from '@/lib/constants';

export function useGoLiveMasterData() {
  const [masterData, setMasterData] = useState<MasterOptions>(DEFAULT_MASTER_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchMasterData() {
      try {
        setLoading(true);
        // Using the mandated RPC from BRITIUM_REQUIRED_RPC
        const { data, error: rpcError } = await supabase.rpc('be_get_operational_masterdata');
        
        if (rpcError) throw rpcError;
        
        if (data) {
          setMasterData(normalizeMasterOptions(data));
        }
      } catch (err) {
        console.error('Failed to sync master data:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        // Fallback to constants if backend is unreachable during transition
        setMasterData(DEFAULT_MASTER_OPTIONS);
      } finally {
        setLoading(false);
      }
    }

    fetchMasterData();
  }, []);

  return { masterData, loading, error };
}