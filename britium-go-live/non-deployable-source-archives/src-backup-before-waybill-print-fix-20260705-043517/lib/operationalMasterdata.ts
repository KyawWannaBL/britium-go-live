import { supabase } from "../integrations/supabase/client";

export async function fetchOperationalMasterdata(moduleName: string, branchCode = "HQ") {
  const { data, error } = await supabase.rpc("be_get_operational_masterdata", {
    p_payload: { module: moduleName, branch_code: branchCode }
  });
  if (error) throw error;
  return data as any;
}

export async function syncTemplateRow(payload: any) {
  const { data, error } = await supabase.rpc("be_template_sync_row", {
    p_payload: payload
  });
  if (error) throw error;
  return data as any;
}

export async function calculateDeliveryCharge(payload: any) {
  const { data, error } = await supabase.rpc("be_calculate_delivery_charge", {
    p_payload: payload
  });
  if (error) throw error;
  return data as any;
}
