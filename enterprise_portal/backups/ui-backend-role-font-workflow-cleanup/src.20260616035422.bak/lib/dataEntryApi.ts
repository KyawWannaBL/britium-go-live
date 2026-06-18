import { supabase } from '@/lib/supabaseClient';
export interface RowValidation { valid: boolean; errors: string[]; }
export interface BulkBatch { batch_id:string; original_filename:string; total_rows:number; valid_rows:number; invalid_rows:number; status:string; uploaded_at:string; }
export interface BulkSubmitResult { success:boolean; batch_id:string; total:number; valid:number; invalid:number; }
export type BulkRow = Record<string,string|number|boolean>;

export async function validateBulkRow(row: BulkRow): Promise<RowValidation> {
  const { data, error } = await supabase.rpc('be_validate_bulk_row', { p_row: row });
  if (error) throw error;
  return data as RowValidation;
}
export async function fetchBulkHistory(limit=20): Promise<BulkBatch[]> {
  const { data, error } = await supabase.rpc('be_bulk_upload_history', { p_limit: limit });
  if (error) throw error;
  return (data as BulkBatch[]) ?? [];
}
export async function submitBulkBatch(rows: BulkRow[], filename: string): Promise<BulkSubmitResult> {
  const { data, error } = await supabase.rpc('be_bulk_submit_batch', { p_rows: rows, p_filename: filename });
  if (error) throw error;
  return data as BulkSubmitResult;
}
