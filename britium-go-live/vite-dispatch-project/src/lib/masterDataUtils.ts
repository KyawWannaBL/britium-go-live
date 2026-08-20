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

// Compatibility exports for enterprise master data hook

export async function fetchBackendSnapshot(): Promise<any> {
  try {
    const { data, error } = await supabase.rpc("be_master_data_page_snapshot");
    if (error) {
      console.warn("be_master_data_page_snapshot failed", error.message);
      return null;
    }
    return data ?? null;
  } catch (err) {
    console.warn("fetchBackendSnapshot failed", err);
    return null;
  }
}


export function rowsForEntity(snapshot: any, entityType: string): any[] {
  const key = String(entityType || "").trim();
  const lower = key.toLowerCase();
  const upper = key.toUpperCase();

  if (!snapshot) return [];

  const candidates = [
    key,
    lower,
    upper,
    `${lower}s`,
    `${upper}S`,
    `${lower}_master`,
    `${lower}_records`,
  ];

  for (const c of candidates) {
    const direct = snapshot?.[c];
    if (Array.isArray(direct)) return direct;

    const data = snapshot?.data?.[c];
    if (Array.isArray(data)) return data;

    const entities = snapshot?.entities?.[c];
    if (Array.isArray(entities)) return entities;

    const records = snapshot?.records?.[c];
    if (Array.isArray(records)) return records;
  }

  if (Array.isArray(snapshot?.records)) {
    return snapshot.records.filter((r: any) =>
      String(r?.entity_type || r?.type || "").toUpperCase() === upper
    );
  }

  if (Array.isArray(snapshot?.data)) {
    return snapshot.data.filter((r: any) =>
      String(r?.entity_type || r?.type || "").toUpperCase() === upper
    );
  }

  return [];
}


export function buildMergedMasterSnapshot(localOptions: any = {}, backendSnapshot: any = null): any {
  const backend = backendSnapshot || {};
  const local = localOptions || {};

  return {
    ok: true,
    source: "buildMergedMasterSnapshot",
    generated_at: new Date().toISOString(),
    backend,
    local,
    entities: {
      ...(local?.entities || {}),
      ...(backend?.entities || {}),
    },
    records: Array.isArray(backend?.records)
      ? backend.records
      : Array.isArray(local?.records)
        ? local.records
        : [],
  };
}


export async function persistMasterDataAliases(snapshot: any): Promise<any> {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "britium_master_data_aliases",
        JSON.stringify(snapshot || {})
      );
    }

    return {
      ok: true,
      source: "persistMasterDataAliases",
      persisted: true,
    };
  } catch (err: any) {
    return {
      ok: false,
      source: "persistMasterDataAliases",
      persisted: false,
      error: err?.message || String(err),
    };
  }
}
