import { supabase } from '@/lib/supabaseClient';
export interface WorkerRow { user_id:string; full_name:string; role:string; phone_number:string; branch_code:string; vehicle_type:string; license_plate:string; active_assignments:number; delivered_today:number; availability_status:string; }
export interface UnassignedRow { pickup_id:string; waybill_no:string; merchant_name:string; recipient_name:string; recipient_phone:string; delivery_address:string; delivery_township:string; service_tier:string; priority:string; payment_method:string; cod_amount:number; delivery_fee:number; branch_code:string; created_at:string; }
export interface DispatchSummary { unassigned:number; in_transit:number; delivered_today:number; failed_today:number; active_riders:number; }

export async function fetchWorkforce(branch?:string): Promise<WorkerRow[]> {
  const { data, error } = await supabase.rpc('be_dispatch_workforce', { p_branch:branch??null });
  if (error) throw error;
  return (data as WorkerRow[]) ?? [];
}
export async function fetchUnassigned(branch?:string, limit=100): Promise<UnassignedRow[]> {
  const { data, error } = await supabase.rpc('be_dispatch_unassigned', { p_branch:branch??null, p_limit:limit });
  if (error) throw error;
  return (data as UnassignedRow[]) ?? [];
}
export async function assignShipments(pickupIds:string[], assigneeId:string, assigneeName:string, routeLabel?:string): Promise<{assigned:number}> {
  const { data, error } = await supabase.rpc('be_dispatch_assign', { p_pickup_ids:pickupIds, p_assignee_id:assigneeId, p_assignee_name:assigneeName, p_route_label:routeLabel??null });
  if (error) throw error;
  return data as {assigned:number};
}
export async function fetchDispatchSummary(branch?:string): Promise<DispatchSummary> {
  const { data, error } = await supabase.rpc('be_dispatch_summary', { p_branch:branch??null });
  if (error) throw error;
  return data as DispatchSummary;
}
