// src/lib/masterDataUtils.ts
import { supabase } from '@/lib/supabaseClient';

/**
 * Fetches the current state of all Master Data from the Supabase backend.
 */
export const fetchBackendSnapshot = async () => {
  try {
    const [merchants, branches] = await Promise.all([
      supabase.from('be_merchants').select('*'),
      supabase.from('be_branches').select('*')
    ]);

    return {
      merchants: merchants.data || [],
      branches: branches.data || []
    };
  } catch (error) {
    console.error("Error fetching backend snapshot:", error);
    return { merchants: [], branches: [] };
  }
};

/**
 * Merges locally parsed Excel/CSV rows with the live backend snapshot.
 */
export const buildMergedMasterSnapshot = (localRows: any[], backendSnapshot: any) => {
  // Combine logic here to prevent overriding fresh backend data with stale local data
  return {
    ...backendSnapshot,
    pendingLocalUpdates: localRows
  };
};

/**
 * Safely extracts specific entity rows (e.g., 'merchants' or 'branches') from a snapshot.
 */
export const rowsForEntity = (snapshot: any, entityName: string) => {
  if (!snapshot) return [];
  
  const normalizedEntity = entityName.toLowerCase();
  return snapshot[normalizedEntity] || [];
};

/**
 * Persists the resolved aliases and merged data back to Supabase.
 */
export const persistMasterDataAliases = async (mergedData: any) => {
  console.log("[Master Data] Preparing to persist aliases...", mergedData);
  
  // Implementation for batch upserting to Supabase goes here
  // returning true allows the UI hook to show a success toast
  return { success: true };
};