import { supabase } from '@/integrations/supabase/client';

export async function recordQrWorkflowStep(params: {
  actorStaffId: string | null;
  nextStaffId?: string | null;
  shipmentId?: string | null;
  manifestId?: string | null;
  deliveryId?: string | null;
  processStep: string;
  territoryCode?: string | null;
  scanChannel?: 'qr_scanner' | 'mobile_scanner' | 'manual_override';
  notes?: string | null;
  eventPayload?: Record<string, unknown>;
  locationPayload?: Record<string, unknown>;
}) {
  const {
    actorStaffId,
    nextStaffId = null,
    shipmentId = null,
    manifestId = null,
    deliveryId = null,
    processStep,
    territoryCode = null,
    scanChannel = 'qr_scanner',
    notes = null,
    eventPayload = {},
    locationPayload = {},
  } = params;

  const { data, error } = await supabase.rpc('log_qr_scan_event', {
    p_actor_staff_id: actorStaffId,
    p_next_staff_id: nextStaffId,
    p_process_step: processStep,
    p_shipment_id: shipmentId,
    p_manifest_id: manifestId,
    p_delivery_id: deliveryId,
    p_territory_code: territoryCode,
    p_scan_channel: scanChannel,
    p_notes: notes,
    p_event_payload: eventPayload,
    p_location_payload: locationPayload,
  });

  if (error) throw error;
  return data as string;
}

export async function acknowledgeWorkflow(
  id: string,
  status: 'accepted' | 'completed' | 'rejected',
  notes?: string
) {
  const { data, error } = await supabase.rpc(
    'be_update_workflow_acknowledgement',
    {
      p_acknowledgement_id: id,
      p_status: status,
      p_notes: notes || null
    }
  );

  if (error) throw error;

  return data;
}

export async function bumpReminder(id: string) {
  const { data, error } = await supabase.rpc(
    'be_bump_workflow_acknowledgement_reminder',
    {
      p_acknowledgement_id: id
    }
  );

  if (error) throw error;

  return data;
}
