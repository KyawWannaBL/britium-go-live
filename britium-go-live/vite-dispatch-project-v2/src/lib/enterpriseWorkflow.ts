// src/lib/enterpriseWorkflow.ts
import { supabase } from '@/integrations/supabase/client';

export const updateShipmentStatus = async (waybillId: string, status: string, metadata: any = {}) => {
  const { data, error } = await supabase
    .from('shipments')
    .update({ process_status_code: status, updated_at: new Date().toISOString(), ...metadata })
    .eq('waybill_id', waybillId);
    
  if (error) throw error;
  return data;
};
export const generateOperationalIds = (prefix: string) => {
  return `${prefix}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
};