import { supabase } from '@/lib/supabaseClient';

// 1. Rider နေ့စဉ်ကော်မရှင် တွက်ချက်မှု (Rider App အတွက်)
export async function loadRiderCommissionSettlement(riderEmail?: string | null) {
  const workDate = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc("be_rider_settlement_snapshot", {
    p_rider_email: riderEmail ?? null,
    p_work_date: workDate,
  });
  if (error) throw error;
  return data;
}

// 2. Driver နှင့် Helper ကော်မရှင် တွက်ချက်မှု (Finance/Admin အတွက်)
export async function loadDriverHelperCommissionSettlement(currentUserEmail?: string | null) {
  const workDate = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc("be_driver_helper_settlement_snapshot", {
    p_work_date: workDate,
    p_actor_email: currentUserEmail ?? "system",
  });
  if (error) throw error;
  return data;
}

// 3. အဝေးပြေးဂိတ်ချ (Highway Drop-off) အိတ်အရေအတွက် မှတ်တမ်းတင်ခြင်း
export async function recordHighwayDropoffBags(args: {
  wayplanCode: string;
  bagCount: number;
  assetCode?: string | null;
  riderEmail?: string | null;
  driverEmail?: string | null;
  helperEmail?: string | null;
  actorEmail?: string | null;
}) {
  const { data, error } = await supabase.rpc("be_record_highway_dropoff_bags", {
    p_wayplan_code: args.wayplanCode,
    p_bag_count: args.bagCount,
    p_asset_code: args.assetCode ?? null,
    p_rider_email: args.riderEmail ?? null,
    p_driver_email: args.driverEmail ?? null,
    p_helper_email: args.helperEmail ?? null,
    p_actor_email: args.actorEmail ?? "system",
    p_work_date: new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
  return data;
}