export type CustomerVoiceIssueType =
  | 'INQUIRY'
  | 'REQUEST'
  | 'COMPLAINT'
  | 'REDELIVERY'
  | 'ADDRESS_CORRECTION'
  | 'LOCATION_CORRECTION'
  | 'COD_ISSUE'
  | 'PAYMENT_ISSUE'
  | 'PARCEL_MISSING'
  | 'WAREHOUSE_ISSUE'
  | 'RIDER_ISSUE'
  | 'PICKUP_ISSUE'
  | 'OTHER';

export type CustomerVoiceWorkflowStatus =
  | 'OPEN'
  | 'ROUTED'
  | 'SEEN'
  | 'ACKNOWLEDGED'
  | 'IN_PROGRESS'
  | 'ACTION_TAKEN'
  | 'RESOLVED'
  | 'CS_CONFIRMED'
  | 'CLOSED'
  | 'ESCALATED'
  | 'REOPENED';

export type CustomerVoiceDepartment =
  | 'operations'
  | 'data_entry'
  | 'warehouse'
  | 'finance'
  | 'pickup_supervisor';

export type CustomerVoiceSourceChannel =
  | 'phone'
  | 'facebook'
  | 'messenger'
  | 'viber'
  | 'email'
  | 'counter'
  | 'merchant'
  | 'rider'
  | 'internal'
  | 'other';

export type CustomerVoicePriority = 'low' | 'medium' | 'high' | 'urgent';

export interface CustomerServiceParcelSupportRow {
  delivery_way_id: string;
  pickup_id: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  township: string | null;
  city: string | null;
  region_state: string | null;
  recipient_address: string | null;
  parcel_status: string | null;
  warehouse_status: string | null;
  operation_status: string | null;
  finance_status: string | null;
  assigned_rider_id: string | null;
  assigned_rider_name: string | null;
  assigned_driver_name: string | null;
  assigned_helper_name: string | null;
  assigned_vehicle_plate: string | null;
  cod_amount: number | null;
  actual_collect: number | null;
  delivery_fee: number | null;
  item_price: number | null;
  merchant_name: string | null;
  merchant_code: string | null;
  branch_code: string | null;
  latest_warehouse_event: string | null;
  latest_warehouse_note: string | null;
  latest_warehouse_event_at: string | null;
  latest_operation_event: string | null;
  latest_operation_note: string | null;
  latest_operation_event_at: string | null;
  latest_status_event: string | null;
  latest_status_source: string | null;
  latest_status_event_at: string | null;
  open_voice_count: number;
  current_owner_department: CustomerVoiceDepartment | null;
  latest_customer_voice: string | null;
  latest_internal_action: string | null;
  escalation_flag: boolean;
  sla_due_at: string | null;
  latest_priority: CustomerVoicePriority | null;
  updated_at: string | null;
}

export interface CustomerServiceParcelQueueSummary {
  total_records: number;
  open_voices: number;
  escalated: number;
  urgent: number;
}

export interface CustomerServiceParcelQueue {
  ok: true;
  summary: CustomerServiceParcelQueueSummary;
  rows: CustomerServiceParcelSupportRow[];
}

export interface CreateCustomerVoiceInput {
  deliveryWayId: string;
  customerName?: string;
  customerPhone?: string;
  sourceChannel: CustomerVoiceSourceChannel;
  issueType: CustomerVoiceIssueType;
  priority?: CustomerVoicePriority;
  customerVoiceText: string;
  dueAt?: string;
  callbackAt?: string;
  idempotencyKey?: string;
  context?: Record<string, unknown>;
}

export interface CustomerVoiceMutationResult {
  ok: true;
  voice_id: string;
  route?: CustomerVoiceDepartment;
  workflow_status: CustomerVoiceWorkflowStatus;
  notification_status?: string;
  current_department?: CustomerVoiceDepartment;
  previous_department?: CustomerVoiceDepartment;
  requested_department?: CustomerVoiceDepartment | null;
}

export interface CustomerVoiceErrorPayload {
  ok?: false;
  error?: string;
  message?: string;
}
