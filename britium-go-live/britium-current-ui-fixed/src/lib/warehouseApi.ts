import { supabase } from '@/lib/supabaseClient';
export interface WarehouseSummary { in_warehouse:number; pending_sort:number; pending_dispatch:number; zones:{zone:string;count:number}[]; }
export interface WarehouseItem { pickup_id:string; merchant_name:string; recipient_name:string; recipient_phone:string; delivery_township:string; delivery_address:string; warehouse_location:string; weight_kg:number; service_tier:string; status:string; updated_at:string; }

export async function warehouseSummary(): Promise<WarehouseSummary> {
  const { data, error } = await supabase.rpc('be_warehouse_summary');
  if (error) throw error;
  return data as WarehouseSummary;
}
export async function warehouseList(zone?:string, limit=50): Promise<WarehouseItem[]> {
  const { data, error } = await supabase.rpc('be_warehouse_list', { p_zone:zone??null, p_limit:limit });
  if (error) throw error;
  return (data as WarehouseItem[]) ?? [];
}
export async function intakeScan(pickupId:string, location='INTAKE'): Promise<void> {
  const { error } = await supabase.rpc('be_warehouse_intake_scan', { p_pickup_id:pickupId, p_location:location });
  if (error) throw error;
}
export async function sortScan(pickupId:string, sortZone:string): Promise<void> {
  const { error } = await supabase.rpc('be_warehouse_sort_scan', { p_pickup_id:pickupId, p_sort_zone:sortZone });
  if (error) throw error;
}
export async function dispatchBatch(pickupIds:string[], riderId:string): Promise<{dispatched:number}> {
  const { data, error } = await supabase.rpc('be_warehouse_dispatch', { p_pickup_ids:pickupIds, p_rider_id:riderId });
  if (error) throw error;
  return data as {dispatched:number};
}
