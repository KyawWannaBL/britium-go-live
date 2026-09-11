import { supabase } from '@/lib/supabaseClient';
export interface TariffTier { tier_name:string; free_allowance_kg:number; base_fee_mmk:number; extra_per_kg_mmk:number; highway_fee_mmk:number; is_active:boolean; updated_at:string; }
export interface UserRecord { user_id:string; full_name:string; role:string; email:string; phone_number:string; branch_code:string; status:string; created_at:string; }
export interface SysConfig { config_key:string; config_value:string; description:string; updated_at:string; }

export async function fetchTariff(): Promise<TariffTier[]> {
  const { data, error } = await supabase.rpc('be_settings_get_tariff');
  if (error) throw error;
  return (data as TariffTier[]) ?? [];
}
export async function updateTariff(tier:string, baseFee:number, extraPerKg:number, freeKg:number, highwayFee:number): Promise<void> {
  const { error } = await supabase.rpc('be_settings_update_tariff', { p_tier:tier, p_base_fee:baseFee, p_extra_per_kg:extraPerKg, p_free_kg:freeKg, p_highway_fee:highwayFee });
  if (error) throw error;
}
export async function fetchUsers(role?:string, branch?:string): Promise<UserRecord[]> {
  const { data, error } = await supabase.rpc('be_settings_users', { p_role:role??null, p_branch:branch??null });
  if (error) throw error;
  return (data as UserRecord[]) ?? [];
}
export async function toggleUserStatus(userId:string, status:'active'|'inactive'|'suspended'): Promise<void> {
  const { error } = await supabase.rpc('be_settings_toggle_user', { p_user_id:userId, p_status:status });
  if (error) throw error;
}
export async function fetchSystemConfig(): Promise<SysConfig[]> {
  const { data, error } = await supabase.rpc('be_settings_get_config');
  if (error) throw error;
  return (data as SysConfig[]) ?? [];
}
export async function setSystemConfig(key:string, value:string): Promise<void> {
  const { error } = await supabase.rpc('be_settings_set_config', { p_key:key, p_value:value });
  if (error) throw error;
}
