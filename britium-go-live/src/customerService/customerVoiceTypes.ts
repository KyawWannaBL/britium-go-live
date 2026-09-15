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
  | 'PHONE'
  | 'VIBER'
  | 'MESSENGER'
  | 'WALK_IN'
  | 'EMAIL'
  | 'OTHER';

export type CustomerVoicePriority = 'low' | 'medium' | 'high' | 'urgent';

export interface CustomerServiceParcelRow {
  delivery_way_id: string;
  waybill_no?: string | null;
  pickup_id?: string | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  delivery_address?: string | null;
  township?: string | null;
  ward?: string | null;
  postal_code?: string | null;
  branch_code?: string | null;
  merchant_name?: string | null;
  parcel_status?: string | null;
  warehouse_status?: string | null;
  operation_status?: string | null;
  finance_status?: string | null;
  assigned_rider_code?: string | null;
  assigned_rider_name?: string | null;
  vehicle_plate?: string | null;
  wayplan_id?: string | null;
  cod_amount?: string | number | null;
  latest_warehouse_event?: string | null;
  latest_warehouse_note?: string | null;
  latest_warehouse_event_at?: string | null;
  latest_operation_event?: string | null;
  latest_operation_note?: string | null;
  latest_operation_event_at?: string | null;
  latest_status_event_code?: string | null;
  latest_status_event_name?: string | null;
  latest_status_source?: string | null;
  latest_status_event_at?: string | null;
  open_voice_count: number;
  current_owner_department?: CustomerVoiceDepartment | null;
  latest_customer_voice?: string | null;
  latest_internal_action?: string | null;
  escalation_flag: boolean;
  sla_due_at?: string | null;
  latest_voice_priority?: CustomerVoicePriority | null;
  latest_voice_status?: CustomerVoiceWorkflowStatus | null;
  updated_at?: string | null;
}

export interface CustomerServiceParcelQueue {
  ok: boolean;
  summary: {
    total_records: number;
    open_voices: number;
    escalated: number;
    urgent: number;
  };
  rows: CustomerServiceParcelRow[];
}

export interface CreateCustomerVoiceInput {
  deliveryWayId: string;
  pickupId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  sourceChannel: CustomerVoiceSourceChannel;
  issueType: CustomerVoiceIssueType;
  priority: CustomerVoicePriority;
  customerVoiceText: string;
  dueAt?: string | null;
  idempotencyKey?: string | null;
}

export interface CustomerVoiceCreateResult {
  ok: boolean;
  voice_id: string;
  route: CustomerVoiceDepartment;
  workflow_status: CustomerVoiceWorkflowStatus;
  notification_status: string;
  idempotent_replay?: boolean;
}

export interface CustomerVoiceAction {
  id: string;
  action_type: string;
  action_note?: string | null;
  department?: CustomerVoiceDepartment | null;
  actor_role?: string | null;
  resulting_status?: CustomerVoiceWorkflowStatus | null;
  created_at: string;
}

export interface CustomerVoiceEscalation {
  id: string;
  escalation_reason: string;
  requested_department?: CustomerVoiceDepartment | null;
  status: string;
  raised_at: string;
  review_note?: string | null;
}

export interface CustomerVoiceNotification {
  id: string;
  destination_department: CustomerVoiceDepartment;
  status: string;
  transport_status?: string | null;
  transport_error?: string | null;
  created_at: string;
  sent_at?: string | null;
  seen_at?: string | null;
  acknowledged_at?: string | null;
  actioned_at?: string | null;
  resolved_at?: string | null;
}

export interface CustomerVoiceRecord {
  id: string;
  delivery_way_id: string;
  pickup_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  source_channel: CustomerVoiceSourceChannel;
  issue_type: CustomerVoiceIssueType;
  priority: CustomerVoicePriority;
  customer_voice_text: string;
  auto_routed_department: CustomerVoiceDepartment;
  current_department: CustomerVoiceDepartment;
  workflow_status: CustomerVoiceWorkflowStatus;
  resolution_status?: string | null;
  due_at?: string | null;
  created_at: string;
  updated_at?: string | null;
  closed_at?: string | null;
  actions?: CustomerVoiceAction[];
  escalations?: CustomerVoiceEscalation[];
  notifications?: CustomerVoiceNotification[];
}

export interface CustomerVoiceHistory {
  ok: boolean;
  delivery_way_id: string;
  voices: CustomerVoiceRecord[];
}

export interface CustomerVoiceTransitionResult {
  ok: boolean;
  voice_id: string;
  workflow_status: CustomerVoiceWorkflowStatus;
  current_department?: CustomerVoiceDepartment;
  original_department?: CustomerVoiceDepartment;
  override_reason?: string;
}
