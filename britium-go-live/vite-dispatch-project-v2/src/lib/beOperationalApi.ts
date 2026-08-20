import { supabase } from "../integrations/supabase/client";

export type ChargePayload = Record<string, any>;

export async function getOperationalMasterdata(payload: Record<string, any> = {}) {
  const { data, error } = await (supabase as any).rpc("be_get_operational_masterdata", { p_payload: payload });
  if (error) throw error;
  return data;
}

export async function calculateDeliveryCharge(payload: ChargePayload) {
  const { data, error } = await (supabase as any).rpc("be_calculate_delivery_charge", { p_payload: payload });
  if (error) throw error;
  return data;
}

export async function applyStrictWorkflowEvent(payload: Record<string, any>) {
  const { data, error } = await (supabase as any).rpc("be_logistics_apply_workflow_event_strict", { p_payload: payload });
  if (error) throw error;
  return data;
}
