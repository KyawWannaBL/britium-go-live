import { supabase } from '@/integrations/supabase/client';
import type {
  CreateCustomerVoiceInput,
  CustomerServiceParcelQueue,
  CustomerServiceParcelQueueSummary,
  CustomerServiceParcelSupportRow,
  CustomerVoiceDepartment,
  CustomerVoiceMutationResult,
  CustomerVoiceWorkflowStatus,
} from './customerVoiceTypes';

const EMPTY_SUMMARY: CustomerServiceParcelQueueSummary = {
  total_records: 0,
  open_voices: 0,
  escalated: 0,
  urgent: 0,
};

function backendError(error: unknown, data: unknown, fallback: string): Error {
  const rpcError = error as { message?: string } | null;
  const payload = data as { error?: string; message?: string; ok?: boolean } | null;
  return new Error(rpcError?.message || payload?.error || payload?.message || fallback);
}

function requireOk<T>(data: unknown, error: unknown, fallback: string): T {
  if (error) throw backendError(error, data, fallback);
  const payload = data as { ok?: boolean } | null;
  if (!payload || payload.ok !== true) throw backendError(error, data, fallback);
  return data as T;
}

export async function loadCustomerServiceParcels(search = ''): Promise<CustomerServiceParcelQueue> {
  const { data, error } = await supabase.rpc('be_cs_parcel_support_queue', {
    p_limit: 300,
    p_search: search.trim() || null,
  });

  const payload = requireOk<Record<string, unknown>>(data, error, 'Could not load Customer Service parcels.');
  const summary = (payload.summary || {}) as Partial<CustomerServiceParcelQueueSummary>;
  const rows = Array.isArray(payload.rows) ? payload.rows as CustomerServiceParcelSupportRow[] : [];

  return {
    ok: true,
    summary: {
      total_records: Number(summary.total_records || 0),
      open_voices: Number(summary.open_voices || 0),
      escalated: Number(summary.escalated || 0),
      urgent: Number(summary.urgent || 0),
    },
    rows,
  };
}

export async function createCustomerVoice(input: CreateCustomerVoiceInput): Promise<CustomerVoiceMutationResult> {
  const payload = {
    delivery_way_id: input.deliveryWayId,
    customer_name: input.customerName || null,
    customer_phone: input.customerPhone || null,
    source_channel: input.sourceChannel,
    issue_type: input.issueType,
    priority: input.priority || 'medium',
    customer_voice_text: input.customerVoiceText,
    due_at: input.dueAt || null,
    callback_at: input.callbackAt || null,
    idempotency_key: input.idempotencyKey || null,
    context: input.context || {},
  };
  const { data, error } = await supabase.rpc('be_cs_create_customer_voice', { p_payload: payload });
  return requireOk<CustomerVoiceMutationResult>(data, error, 'Could not create Customer Voice.');
}

export async function markCustomerVoiceSeen(voiceId: string): Promise<CustomerVoiceMutationResult> {
  const { data, error } = await supabase.rpc('be_cs_mark_customer_voice_seen', { p_voice_id: voiceId });
  return requireOk<CustomerVoiceMutationResult>(data, error, 'Could not mark Customer Voice as seen.');
}

export async function acknowledgeCustomerVoice(voiceId: string, note?: string): Promise<CustomerVoiceMutationResult> {
  const { data, error } = await supabase.rpc('be_cs_acknowledge_customer_voice', {
    p_voice_id: voiceId,
    p_note: note || null,
  });
  return requireOk<CustomerVoiceMutationResult>(data, error, 'Could not acknowledge Customer Voice.');
}

export async function updateCustomerVoiceAction(
  voiceId: string,
  note: string,
  status: CustomerVoiceWorkflowStatus,
): Promise<CustomerVoiceMutationResult> {
  const { data, error } = await supabase.rpc('be_cs_update_customer_voice_action', {
    p_voice_id: voiceId,
    p_action_note: note,
    p_status: status,
  });
  return requireOk<CustomerVoiceMutationResult>(data, error, 'Could not update Customer Voice action.');
}

export async function resolveCustomerVoice(voiceId: string, note: string): Promise<CustomerVoiceMutationResult> {
  const { data, error } = await supabase.rpc('be_cs_resolve_customer_voice', {
    p_voice_id: voiceId,
    p_resolution_note: note,
  });
  return requireOk<CustomerVoiceMutationResult>(data, error, 'Could not resolve Customer Voice.');
}

export async function confirmCustomerVoice(voiceId: string, note?: string): Promise<CustomerVoiceMutationResult> {
  const { data, error } = await supabase.rpc('be_cs_confirm_customer_voice', {
    p_voice_id: voiceId,
    p_note: note || null,
  });
  return requireOk<CustomerVoiceMutationResult>(data, error, 'Could not confirm Customer Voice follow-up.');
}

export async function closeCustomerVoice(voiceId: string, note?: string): Promise<CustomerVoiceMutationResult> {
  const { data, error } = await supabase.rpc('be_cs_close_customer_voice', {
    p_voice_id: voiceId,
    p_note: note || null,
  });
  return requireOk<CustomerVoiceMutationResult>(data, error, 'Could not close Customer Voice.');
}

export async function escalateCustomerVoice(
  voiceId: string,
  reason: string,
  requestedDepartment?: CustomerVoiceDepartment,
): Promise<CustomerVoiceMutationResult> {
  const { data, error } = await supabase.rpc('be_cs_escalate_customer_voice', {
    p_voice_id: voiceId,
    p_reason: reason,
    p_requested_department: requestedDepartment || null,
  });
  return requireOk<CustomerVoiceMutationResult>(data, error, 'Could not escalate Customer Voice.');
}

export async function reopenCustomerVoice(voiceId: string, reason: string): Promise<CustomerVoiceMutationResult> {
  const { data, error } = await supabase.rpc('be_cs_reopen_customer_voice', {
    p_voice_id: voiceId,
    p_reason: reason,
  });
  return requireOk<CustomerVoiceMutationResult>(data, error, 'Could not reopen Customer Voice.');
}

export async function superadminOverrideCustomerVoiceRoute(
  voiceId: string,
  department: CustomerVoiceDepartment,
  reason: string,
): Promise<CustomerVoiceMutationResult> {
  const { data, error } = await supabase.rpc('be_cs_superadmin_override_route', {
    p_voice_id: voiceId,
    p_new_department: department,
    p_reason: reason,
  });
  return requireOk<CustomerVoiceMutationResult>(data, error, 'Could not override Customer Voice route.');
}

export const emptyCustomerServiceParcelQueue: CustomerServiceParcelQueue = {
  ok: true,
  summary: EMPTY_SUMMARY,
  rows: [],
};
