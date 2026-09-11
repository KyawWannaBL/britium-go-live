import { supabase } from '@/lib/supabaseClient';
export interface ReportTotals { total_shipments:number; delivered:number; failed:number; on_hold:number; delivery_rate_pct:number; total_delivery_fee:number; total_cod_collected:number; avg_weight_kg:number; }
export interface ByDay { date:string; total:number; delivered:number; revenue:number; }
export interface ByTier { service_tier:string; count:number; revenue:number; }
export interface ByStatus { status:string; count:number; pct:number; }
export interface OperationalReport { period:{from:string;to:string}; branch:string; totals:ReportTotals; by_status:ByStatus[]; by_day:ByDay[]; by_tier:ByTier[]; }
export interface ByPayment { payment_method:string; count:number; total_fee:number; total_cod:number; }
export interface ByMerchant { merchant_code:string; merchant_name:string; shipments:number; total_fee:number; cod_amount:number; }
export interface FinanceReport { period:{from:string;to:string}; by_payment:ByPayment[]; by_merchant:ByMerchant[]; }

export async function fetchOperationalReport(from:string, to:string, branch?:string): Promise<OperationalReport> {
  const { data, error } = await supabase.rpc('be_report_operational', { p_from:from, p_to:to, p_branch:branch??null });
  if (error) throw error;
  return data as OperationalReport;
}
export async function fetchFinanceReport(from:string, to:string): Promise<FinanceReport> {
  const { data, error } = await supabase.rpc('be_report_finance', { p_from:from, p_to:to });
  if (error) throw error;
  return data as FinanceReport;
}
