import { supabase } from '@/lib/supabaseClient';

export interface TariffResult { tier:string; weight:number; ceiling_weight:number; allowance:number; extra_kg:number; base_fee:number; surcharge:number; highway_fee:number; total:number; }
export interface MerchantOption { merchant_id:string; merchant_code:string; merchant_name:string; contact_phone:string; pickup_address:string; pickup_township:string; pickup_city:string; payment_profile:string; service_profile:string; tariff_tier:string; }
export interface CreateDeliveryPayload { merchant_id:string; merchant_code:string; merchant_name:string; sender_phone:string; pickup_address:string; pickup_township:string; pickup_city:string; recipient_name:string; recipient_phone:string; delivery_township:string; delivery_address:string; service_tier:string; priority:string; payment_method:string; cod_amount:number; weight_kg:number; highway_dropoff:boolean; rider_remarks?:string; }
export interface CreateDeliveryResult { success:boolean; pickup_id:string; deliver_id:string; invoice_no:string; waybill_no:string; branch:string; tariff:TariffResult; }

export async function fetchMerchantsDropdown(): Promise<MerchantOption[]> {
  const { data, error } = await supabase.rpc('be_get_merchants_dropdown');
  if (error) throw error;
  return (data as MerchantOption[]) ?? [];
}
export async function calculateTariff(tier:string, weight:number, highway:boolean): Promise<TariffResult> {
  const { data, error } = await supabase.rpc('be_calculate_tariff', { p_tier: tier, p_weight: weight, p_highway: highway });
  if (error) throw error;
  return data as TariffResult;
}
export async function createDelivery(payload: CreateDeliveryPayload): Promise<CreateDeliveryResult> {
  const { data, error } = await supabase.rpc('be_create_delivery', { p_payload: payload });
  if (error) throw error;
  return data as CreateDeliveryResult;
}
