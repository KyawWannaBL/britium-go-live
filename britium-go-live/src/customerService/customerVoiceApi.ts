import { supabase } from '@/integrations/supabase/client';
import type {
  CreateCustomerVoiceInput,
  CustomerServiceParcelQueue,
  CustomerVoiceCreateResult,
  CustomerVoiceDepartment,
  CustomerVoiceHistory,
  CustomerVoiceTransitionResult,
  CustomerVoiceWorkflowStatus,
} from './customerVoiceTypes';

function assertOk<T extends { ok?: boolean; error?: string; message?: string }>(data: T | null, fallback: string): T {
  if (!data || data.ok !== true) {
    throw new Error(data?.message || data?.error || fallback);
  }
  return data;
}

export async function loadCustomerServiceParcels(search?: string): Promise<CustomerServiceParcelQueue> {
  const { data, error } = await supabase.rpc('be_cs_parcel_support_queue', {
    p_limit: 300,
    p_search: search?.trim() || null,
  });
  if (error) throw error;
  const out = assertOk(data as CustomerServiceParcelQueue | null, 'Could not load Customer Service parcel queue.');
  return {
    ok: true,
    summary: {
      total_records: Number(out.summary?.total_records || 0),
      open_voices: Number(out.summary?.open_voices || 0),
      escalated: Number(out.summary?.escalated || 0),
      urgent: Number(out.summary?.urgent || 0),
    },
    rows: Array.isArray(out.rows) ? out.rows : [],
  };
}

export async function loadCustomerVoiceHistory(deliveryWayId: string): Promise<CustomerVoiceHistory> {
  const { data, error } = await supabase.rpc('be_cs_customer_voice_history', {
    p_delivery_way_id: deliveryWayId,
  });
  if (error) throw error;
  const out = assertOk(data as CustomerVoiceHistory | null, 'Could not load Customer Voice history.');
  return { ...out, voices: Array.isArray(out.voices) ? out.voices : [] };
}

export async function createCustomerVoice(input: CreateCustomerVoiceInput): Promise<CustomerVoiceCreateResult> {
  const { data, error } = await supabase.rpc('be_cs_create_customer_voice', {
    p_payload: {
      delivery_way_id: input.deliveryWayId,
      pickup_id: input.pickupId || null,
      customer_name: input.customerName || null,
      customer_phone: input.customerPhone || null,
      source_channel: input.sourceChannel,
      issue_type: input.issueType,
      priority: input.priority,
      customer_voice_text: input.customerVoiceText,
      due_at: input.dueAt || null,
      idempotency_key: input.idempotencyKey || null,
    },
  });
  if (error) throw error;
  return assertOk(data as CustomerVoiceCreateResult | null, 'Could not create Customer Voice.');
}

export async function markCustomerVoiceSeen(voiceId: string): Promise<CustomerVoiceTransitionResult> {
  const { data, error } = await supabase.rpc('be_cs_mark_customer_voice_seen', { p_voice_id: voiceId });
  if (error) throw error;
  return assertOk(data as CustomerVoiceTransitionResult | null, 'Could not mark Customer Voice as seen.');
}

export async function acknowledgeCustomerVoice(voiceId: string, note?: string): Promise<CustomerVoiceTransitionResult> {
  const { data, error } = await supabase.rpc('be_cs_acknowledge_customer_voice', { p_voice_id: voiceId, p_note: note || null });
  if (error) throw error;
  return assertOk(data as CustomerVoiceTransitionResult | null, 'Could not acknowledge Customer Voice.');
}

export async function updateCustomerVoiceAction(
  voiceId: string,
  note: string,
  status: CustomerVoiceWorkflowStatus,
): Promise<CustomerVoiceTransitionResult> {
  const { data, error } = await supabase.rpc('be_cs_update_customer_voice_action', {
    p_voice_id: voiceId,
    p_action_note: note,
    p_status: status,
  });
  if (error) throw error;
  return assertOk(data as CustomerVoiceTransitionResult | null, 'Could not update Customer Voice action.');
}

export async function resolveCustomerVoice(voiceId: string, note: string): Promise<CustomerVoiceTransitionResult> {
  const { data, error } = await supabase.rpc('be_cs_resolve_customer_voice', { p_voice_id: voiceId, p_resolution_note: note });
  if (error) throw error;
  return assertOk(data as CustomerVoiceTransitionResult | null, 'Could not resolve Customer Voice.');
}

export async function confirmCustomerVoice(voiceId: string, note?: string): Promise<CustomerVoiceTransitionResult> {
  const { data, error } = await supabase.rpc('be_cs_confirm_customer_voice', { p_voice_id: voiceId, p_note: note || null });
  if (error) throw error;
  return assertOk(data as CustomerVoiceTransitionResult | null, 'Could not confirm Customer Voice.');
}

export async function closeCustomerVoice(voiceId: string, note?: string): Promise<CustomerVoiceTransitionResult> {
  const { data, error } = await supabase.rpc('be_cs_close_customer_voice', { p_voice_id: voiceId, p_note: note || null });
  if (error) throw error;
  return assertOk(data as CustomerVoiceTransitionResult | null, 'Could not close Customer Voice.');
}

export async function escalateCustomerVoice(
  voiceId: string,
  reason: string,
  requestedDepartment?: CustomerVoiceDepartment | null,
): Promise<CustomerVoiceTransitionResult> {
  const { data, error } = await supabase.rpc('be_cs_escalate_customer_voice', {
    p_voice_id: voiceId,
    p_reason: reason,
    p_requested_department: requestedDepartment || null,
  });
  if (error) throw error;
  return assertOk(data as CustomerVoiceTransitionResult | null, 'Could not escalate Customer Voice.');
}

export async function reopenCustomerVoice(voiceId: string, reason: string): Promise<CustomerVoiceTransitionResult> {
  const { data, error } = await supabase.rpc('be_cs_reopen_customer_voice', { p_voice_id: voiceId, p_reason: reason });
  if (error) throw error;
  return assertOk(data as CustomerVoiceTransitionResult | null, 'Could not reopen Customer Voice.');
}

export async function superadminOverrideCustomerVoiceRoute(
  voiceId: string,
  newDepartment: CustomerVoiceDepartment,
  reason: string,
): Promise<CustomerVoiceTransitionResult> {
  const { data, error } = await supabase.rpc('be_cs_superadmin_override_route', {
    p_voice_id: voiceId,
    p_new_department: newDepartment,
    p_reason: reason,
  });
  if (error) throw error;
  return assertOk(data as CustomerVoiceTransitionResult | null, 'Could not override Customer Voice route.');
}
