import { supabase } from '@/lib/supabaseClient';
export interface ShipmentRow {
  pickup_address?: string | null; pickup_id:string; deliver_id:string; waybill_no:string; merchant_name:string; recipient_name:string; recipient_phone:string; delivery_address:string; delivery_township:string; status:string; payment_method:string; cod_amount:number; delivery_fee:number; branch_code:string; created_at:string; updated_at:string; }
export interface CargoEvent { id:string; event_type:string; description:string; actor_role:string; created_at:string; }
export interface WayDetail { shipment:ShipmentRow; events:CargoEvent[]; }
export async function fetchWayList(params:{status?:string;search?:string;limit?:number;offset?:number}): Promise<{rows:ShipmentRow[];total:number}> {
  const { data, error } = await supabase.rpc('be_way_management_list', { p_status:params.status??null, p_search:params.search??null, p_limit:params.limit??50, p_offset:params.offset??0 });
  if (error) throw error;
  return data as {rows:ShipmentRow[];total:number};
}
export async function fetchWayDetail(pickupId:string): Promise<WayDetail> {
  const { data, error } = await supabase.rpc('be_way_management_detail', { p_pickup_id: pickupId });
  if (error) throw error;
  return data as WayDetail;
}
export async function updateWayStatus(pickupId:string, status:string, reason:string): Promise<void> {
  const { error } = await supabase.rpc('be_way_update_status', { p_pickup_id:pickupId, p_status:status, p_reason:reason });
  if (error) throw error;
}
export async function initiateReturn(pickupId:string, reason:string): Promise<void> {
  const { error } = await supabase.rpc('be_way_initiate_return', { p_pickup_id:pickupId, p_reason:reason });
  if (error) throw error;
}
