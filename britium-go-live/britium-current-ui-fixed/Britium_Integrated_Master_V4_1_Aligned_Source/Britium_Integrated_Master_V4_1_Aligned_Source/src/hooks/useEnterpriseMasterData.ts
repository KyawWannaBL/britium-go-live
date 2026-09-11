import { useState, useEffect, useCallback } from 'react';
import { buildMergedMasterSnapshot, persistMasterDataAliases, fetchBackendSnapshot, rowsForEntity } from '@/lib/masterDataUtils'; // Assuming utilities are in this path

export function useEnterpriseMasterData() {
  const [snapshot, setSnapshot] = useState<any>(() => ({}));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(async () => {
    try {
      setLoading(true);
      const backendSnapshot = await fetchBackendSnapshot();
      const merged = buildMergedMasterSnapshot(backendSnapshot);
      persistMasterDataAliases(merged);
      setSnapshot(merged);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to sync master data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial Load
    sync();

    // Listen for cross-module sync events (e.g., after Excel upload)
    const handleSyncEvent = () => sync();
    window.addEventListener('britium:master-data-synced', handleSyncEvent);
    
    return () => {
      window.removeEventListener('britium:master-data-synced', handleSyncEvent);
    };
  }, [sync]);

  // Helper to get rows by entity key
  const getRows = useCallback((entityKey: string) => {
    return rowsForEntity(snapshot, entityKey as any) || [];
  }, [snapshot]);

  return { 
    snapshot, 
    loading, 
    error, 
    sync, 
    getRows 
  };
}