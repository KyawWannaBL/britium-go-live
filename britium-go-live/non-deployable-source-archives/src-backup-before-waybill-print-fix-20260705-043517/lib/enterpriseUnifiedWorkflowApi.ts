import { supabase } from "@/integrations/supabase/client";

export async function invokeBackend(rpc: string, params: any = {}) {
  const { data, error } = await supabase.rpc(rpc, params);
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export const EMPTY_MASTER = { pickups: [], routes: [], workforce: [] };

export async function fetchOperationalMasterSnapshot() {
  const { data, error } = await supabase.rpc('be_operational_master_snapshot');
  return data || EMPTY_MASTER;
}

export async function assignSupervisorJob(p_pickup_id: string, p_rider_id: string, p_vehicle_id: string) {
  return await supabase.rpc('be_supervisor_assign_job', { p_pickup_id, p_rider_id, p_vehicle_id });
}