// src/lib/masterDataUtils.ts
// Re-importing the core logic we used in your MasterDataPortal component

export function buildMergedMasterSnapshot(backendSnapshot: Record<string, any>): MasterSnapshot {
  const localSnapshot = JSON.parse(localStorage.getItem('britium.master.snapshot') || '{}');
  return { ...localSnapshot, ...backendSnapshot, generatedAt: new Date().toISOString() };
}

export function persistMasterDataAliases(snapshot: MasterSnapshot): DropdownSnapshot {
  localStorage.setItem('britium.master.snapshot', JSON.stringify(snapshot));
  // Add specific entity persistence logic here
  return buildDropdownSnapshot(snapshot);
}

export async function fetchBackendSnapshot(): Promise<Record<string, unknown>> {
  try {
    const { data, error } = await supabase.rpc('be_masterdata_snapshot_v2');
    if (error) throw error;
    return data as Record<string, unknown>;
  } catch {
    return {}; // Fallback for offline/development
  }
}

export function rowsForEntity(snapshot: MasterSnapshot, entityKey: string): MasterRecord[] {
  return (snapshot[entityKey] as MasterRecord[]) || [];
}

export function entityCounts(snapshot: MasterSnapshot) {
  // Logic to return array of { key, count } for all entities
  return []; 
}