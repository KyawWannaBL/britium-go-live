import { supabase } from '@/lib/supabaseClient';
export interface BranchDay { new_shipments:number; delivered:number; failed:number; in_transit:number; revenue:number; }
export interface BranchMonth { new_shipments:number; delivered:number; revenue:number; }
export interface BranchStaff { user_id:string; full_name:string; role:string; phone_number:string; status:string; }
export interface BranchShipment { pickup_id:string; merchant_name:string; recipient_name:string; delivery_township:string; status:string; created_at:string; }
export interface BranchSnapshot { branch:string; today:BranchDay; this_month:BranchMonth; staff:BranchStaff[]; recent_shipments:BranchShipment[]; }
export interface BranchSummary { branch_code:string; total_shipments:number; delivered:number; in_transit:number; today:number; }

export async function fetchBranchSnapshot(branch:string): Promise<BranchSnapshot> {
  const { data, error } = await supabase.rpc('be_branch_snapshot', { p_branch: branch });
  if (error) throw error;
  return data as BranchSnapshot;
}
export async function fetchBranchList(): Promise<BranchSummary[]> {
  const { data, error } = await supabase.rpc('be_branch_list');
  if (error) throw error;
  return (data as BranchSummary[]) ?? [];
}
