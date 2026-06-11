// @ts-nocheck
import { supabase } from '@/integrations/supabase/client';
export const financePortalApi = {
  getCodSummary: async (date: string) => { const { data } = await supabase.rpc('get_cod_summary', { p_date: date }); return data ?? {}; },
  createSettlementBatch: async (riderId: string, date: string, note: string) => { const { data } = await supabase.rpc('create_settlement_batch', { p_rider_id: riderId, p_date: date, p_note: note }); return data; },
  approveSettlement: async (batchId: string) => { const { data } = await supabase.rpc('approve_settlement_batch', { p_batch_id: batchId }); return data; },
};
