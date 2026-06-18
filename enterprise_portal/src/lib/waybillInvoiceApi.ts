import { supabase } from '@/lib/supabaseClient';
export interface LabelRow { pickup_id:string; deliver_id:string; waybill_no:string; invoice_no:string; merchant_name:string; merchant_code:string; recipient_name:string; recipient_phone:string; delivery_address:string; delivery_township:string; service_tier:string; weight_kg:number; delivery_fee:number; payment_method:string; cod_amount:number; status:string; waybill_printed_at:string|null; created_at:string; }
export interface InvoiceRow extends LabelRow { invoice_approved:boolean|null; invoice_approved_at:string|null; }

export async function fetchLabelQueue(status?:string, merchantCode?:string, limit=50): Promise<LabelRow[]> {
  const { data, error } = await supabase.rpc('be_label_queue', { p_status:status??null, p_merchant_code:merchantCode??null, p_limit:limit });
  if (error) throw error;
  return (data as LabelRow[]) ?? [];
}
export async function markWaybillPrinted(pickupIds:string[]): Promise<void> {
  const { error } = await supabase.rpc('be_mark_waybill_printed', { p_pickup_ids:pickupIds });
  if (error) throw error;
}
export async function fetchInvoiceList(status?:string, merchantCode?:string, limit=50): Promise<InvoiceRow[]> {
  const { data, error } = await supabase.rpc('be_invoice_list', { p_status:status??null, p_merchant_code:merchantCode??null, p_limit:limit });
  if (error) throw error;
  return (data as InvoiceRow[]) ?? [];
}
export async function approveInvoice(pickupId:string, approved:boolean, notes?:string): Promise<void> {
  const { error } = await supabase.rpc('be_invoice_approve', { p_pickup_id:pickupId, p_approved:approved, p_notes:notes??'' });
  if (error) throw error;
}
