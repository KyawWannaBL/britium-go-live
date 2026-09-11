import { supabase } from '@/integrations/supabase/client';

export async function triggerWorkflowEvent(
  pickupId: string, 
  processType: 'PICKUP' | 'WAREHOUSE' | 'DELIVERY', 
  newStatus: string, 
  actorRole: string, 
  actorId: string, 
  notes?: string
) {
  const { data, error } = await supabase.rpc('be_logistics_apply_workflow_event_strict', {
    p_pickup_id: pickupId,
    p_process_type: processType,
    p_new_status: newStatus,
    p_actor_role: actorRole,
    p_actor_id: actorId,
    p_notes: notes
  });

  if (error) throw error;
  return data;
}