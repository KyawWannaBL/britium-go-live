// ─────────────────────────────────────────────────────────────────────────────
// types/index.ts — Britium Express Shared Domain Types
// Mirrors the Supabase schema & API contract used throughout the app.
// ─────────────────────────────────────────────────────────────────────────────

// ── Pagination ────────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ── Shipment ──────────────────────────────────────────────────────────────────
export type ShipmentStatus =
  | "created"
  | "pickup_scheduled"
  | "picked_up"
  | "at_hub"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed_delivery"
  | "reattempt"
  | "return_pending"
  | "returned"
  | "cancelled";

export interface Shipment {
  id: string;
  tracking_no: string;              // AWB
  merchant_id: string;
  merchant_name: string;
  sender_name: string;
  sender_phone: string;
  sender_address: string;
  receiver_name: string;
  receiver_phone: string;
  receiver_address: string;
  receiver_township: string;
  receiver_city: string;
  service_type: "standard" | "express" | "same_day";
  cod_amount: number;
  weight_kg?: number;
  dimensions?: string;
  status: ShipmentStatus;
  rider_id?: string;
  rider_name?: string;
  branch_id?: string;
  branch_name?: string;
  warehouse_location?: string;      // rack-bin
  notes?: string;
  created_at: string;
  updated_at: string;
  expected_delivery_date?: string;
  delivered_at?: string;
  pod_photo_url?: string;
  pod_signature_url?: string;
  failure_reason?: string;
  attempt_count: number;
}

export interface ShipmentTimeline {
  id: string;
  shipment_id: string;
  status: ShipmentStatus;
  location?: string;
  notes?: string;
  actor_name?: string;
  created_at: string;
}

export interface CreateShipmentPayload {
  merchant_id?: string;
  sender_name: string;
  sender_phone: string;
  sender_address: string;
  receiver_name: string;
  receiver_phone: string;
  receiver_address: string;
  receiver_township: string;
  receiver_city: string;
  service_type: "standard" | "express" | "same_day";
  cod_amount: number;
  weight_kg?: number;
  notes?: string;
}

// ── Exception ─────────────────────────────────────────────────────────────────
export type ExceptionType =
  | "failed_delivery"
  | "address_issue"
  | "cod_dispute"
  | "damaged"
  | "lost"
  | "refused"
  | "access_blocked"
  | "other";

export type ExceptionStatus = "open" | "in_progress" | "resolved" | "escalated";

export interface Exception {
  id: string;
  shipment_id: string;
  tracking_no: string;
  type: ExceptionType;
  status: ExceptionStatus;
  description: string;
  assigned_to?: string;
  resolved_by?: string;
  resolved_at?: string;
  escalated_to?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// ── Pickup ────────────────────────────────────────────────────────────────────
export type PickupStatus = "requested" | "confirmed" | "in_progress" | "completed" | "cancelled";

export interface Pickup {
  id: string;
  merchant_id: string;
  merchant_name: string;
  pickup_address: string;
  parcel_count: number;
  scheduled_date: string;
  time_window: string;             // e.g. "09:00-12:00"
  rider_id?: string;
  rider_name?: string;
  status: PickupStatus;
  notes?: string;
  created_at: string;
}

// ── Support Ticket ────────────────────────────────────────────────────────────
export type TicketStatus = "open" | "in_progress" | "pending_customer" | "resolved" | "closed";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type TicketType =
  | "shipment_inquiry"
  | "delivery_failed"
  | "redelivery_request"
  | "cod_dispute"
  | "damaged_parcel"
  | "wrong_item"
  | "billing"
  | "account"
  | "other";

export interface Ticket {
  id: string;
  subject: string;
  type: TicketType;
  status: TicketStatus;
  priority: TicketPriority;
  shipment_id?: string;
  tracking_no?: string;
  customer_name?: string;
  customer_phone?: string;
  merchant_id?: string;
  assigned_to?: string;
  notes: string;
  resolution?: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
}

// ── Manifest ──────────────────────────────────────────────────────────────────
export type ManifestStatus = "draft" | "sealed" | "dispatched" | "received" | "partial";

export interface Manifest {
  id: string;
  manifest_no: string;
  origin_branch_id: string;
  origin_branch_name: string;
  destination_branch_id: string;
  destination_branch_name: string;
  vehicle_plate?: string;
  driver_name?: string;
  parcel_count: number;
  received_count?: number;
  status: ManifestStatus;
  dispatched_at?: string;
  received_at?: string;
  created_at: string;
  shipments: { tracking_no: string; receiver_name: string; receiver_township: string }[];
}

// ── Warehouse ─────────────────────────────────────────────────────────────────
export interface WarehouseOverview {
  inbound_pending: number;
  staging_count: number;
  storage_count: number;
  outbound_ready: number;
  dispatched_today: number;
  exceptions_count: number;
  last_updated: string;
}

export interface InboundItem {
  id: string;
  tracking_no: string;
  receiver_name: string;
  receiver_township: string;
  cod_amount: number;
  status: "expected" | "received" | "exception";
  received_at?: string;
  notes?: string;
}

export interface StorageItem {
  id: string;
  tracking_no: string;
  receiver_name: string;
  receiver_township: string;
  rack: string;
  bin: string;
  stored_at: string;
  days_in_storage: number;
}

// ── Finance / COD ─────────────────────────────────────────────────────────────
export interface FinanceOverview {
  total_cod_collected_today: number;
  total_cod_pending: number;
  settlements_pending_count: number;
  settlements_pending_amount: number;
  mismatches_count: number;
  last_settlement_date: string;
}

export interface CodRecord {
  id: string;
  tracking_no: string;
  merchant_id: string;
  merchant_name: string;
  expected_cod: number;
  collected_cod?: number;
  status: "pending" | "collected" | "mismatch" | "waived";
  rider_id?: string;
  rider_name?: string;
  delivered_at?: string;
  notes?: string;
}

export type SettlementStatus = "draft" | "pending_approval" | "approved" | "transferred" | "failed";

export interface Settlement {
  id: string;
  batch_no: string;
  merchant_id: string;
  merchant_name: string;
  bank_name: string;
  bank_account: string;
  gross_cod: number;
  service_fee: number;
  deductions: number;
  net_payable: number;
  shipment_count: number;
  billing_period_start: string;
  billing_period_end: string;
  status: SettlementStatus;
  approved_by?: string;
  transferred_at?: string;
  notes?: string;
  created_at: string;
}

export interface RiderWallet {
  id: string;
  rider_id: string;
  rider_name: string;
  branch_name: string;
  balance: number;
  pending_cod: number;
  last_transaction_at: string;
  status: "active" | "suspended" | "pending_review";
}

// ── Employee / HR ─────────────────────────────────────────────────────────────
export type EmployeeStatus = "active" | "inactive" | "on_leave" | "probation" | "terminated";
export type EmploymentType = "full_time" | "part_time" | "contract" | "probation";

export interface Employee {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  branch_id?: string;
  branch_name?: string;
  position?: string;
  employment_type: EmploymentType;
  status: EmployeeStatus;
  joined_at: string;
  avatar_url?: string;
  leave_balance: Record<string, number>;   // { annual: 12, medical: 14, ... }
}

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  check_in?: string;
  check_out?: string;
  shift: string;
  status: "present" | "absent" | "late" | "half_day" | "on_leave";
  notes?: string;
}

export type LeaveType = "annual" | "medical" | "emergency" | "maternity" | "paternity" | "unpaid";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface LeaveRequest {
  id: string;
  employee_id: string;
  employee_name: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  approved_by?: string;
  reviewed_at?: string;
  notes?: string;
  created_at: string;
}

export interface Approval {
  id: string;
  type: "leave" | "expense" | "asset" | "role_change" | "other";
  subject: string;
  requested_by: string;
  department: string;
  status: "pending" | "approved" | "rejected";
  priority: "low" | "medium" | "high";
  created_at: string;
}

// ── Marketing ─────────────────────────────────────────────────────────────────
export type CampaignStatus = "draft" | "active" | "paused" | "completed" | "cancelled";
export type CampaignChannel = "meta" | "google" | "crm" | "offline" | "tiktok" | "sms" | "email";

export interface Campaign {
  id: string;
  name: string;
  objective: string;
  channel: CampaignChannel;
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  conversions: number;
  start_date: string;
  end_date: string;
  status: CampaignStatus;
  owner: string;
  notes?: string;
}

export type LeadStatus = "new" | "qualified" | "demo_scheduled" | "proposal_sent" | "activated" | "lost";

export interface MerchantLead {
  id: string;
  business_name: string;
  contact_name: string;
  phone: string;
  email?: string;
  source: string;
  status: LeadStatus;
  assigned_to?: string;
  expected_parcels_per_day?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PromoCode {
  id: string;
  code: string;
  description: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  min_order?: number;
  max_uses?: number;
  used_count: number;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
}

// ── Branch ────────────────────────────────────────────────────────────────────
export interface BranchOverview {
  branch_name: string;
  pending_manifests: number;
  parcels_to_sort: number;
  riders_active: number;
  riders_idle: number;
  deliveries_today: number;
  failed_today: number;
  exceptions_open: number;
}

export interface RiderAssignment {
  rider_id: string;
  rider_name: string;
  phone: string;
  assigned_count: number;
  delivered_count: number;
  failed_count: number;
  status: "available" | "on_route" | "returned" | "off_duty";
  last_updated: string;
}

// ── Rider ─────────────────────────────────────────────────────────────────────
export type RiderTaskStatus =
  | "assigned"
  | "in_progress"
  | "waiting_review"
  | "delivered"
  | "failed";

export type RiderTaskType = "pickup" | "delivery";

export type RiderNextAction =
  | "accept"
  | "arrive"
  | "submit_pickup_verification"
  | "collect"
  | "delivered_to_warehouse"
  | "start_delivery"
  | "deliver";

export interface RiderTask {
  id: string;
  record_id: string;
  pickup_id: string;
  pickup_way_id: string;
  delivery_way_id: string;
  tracking_no: string;

  merchant_name: string;
  sender_name: string;
  sender_phone: string;
  pickup_address: string;
  pickup_township: string;
  pickup_city: string;

  receiver_name: string;
  receiver_phone: string;
  receiver_address: string;
  receiver_township: string;
  receiver_city: string;

  parcel_count: number;
  cod_amount: number;
  service_type: string;
  notes?: string;

  task_type: RiderTaskType;
  next_action: RiderNextAction | null;
  status: RiderTaskStatus;
  sequence: number;

  pickup_status: string;
  rider_status: string;
  rider_app_stage: string;
  assignment_status: string;
  warehouse_status: string;
  workflow_stage: string;
  delivery_status: string;

  assigned_rider_code: string;
  assigned_rider_name: string;
  assigned_at: string;
  created_at: string;
  updated_at: string;
}

export type FailureReason =
  | "recipient_not_available"
  | "address_not_found"
  | "recipient_refused"
  | "cod_dispute"
  | "access_blocked"
  | "damaged"
  | "other";

export interface DeliveryResult {
  task_id: string;
  success: boolean;
  cod_collected?: number;
  failure_reason?: FailureReason;
  notes?: string;
  pod_photo_url?: string;
}

// ── Notifications ─────────────────────────────────────────────────────────────
export type NotifType =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "shipment_update"
  | "exception_alert"
  | "payment_received"
  | "task_assigned";

export interface Notification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  is_read: boolean;
  link?: string;
  created_at: string;
}

// ── Super Admin ───────────────────────────────────────────────────────────────
export interface PlatformOverview {
  total_shipments_today: number;
  delivered_today: number;
  failed_today: number;
  in_transit: number;
  revenue_today: number;
  active_merchants: number;
  active_riders: number;
  active_branches: number;
  open_exceptions: number;
  pending_settlements_amount: number;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: string;
  department?: string;
  branch_id?: string;
  branch_name?: string;
  status: "active" | "inactive" | "suspended";
  must_change_password: boolean;
  created_at: string;
  last_sign_in?: string;
}

// ── Customer ──────────────────────────────────────────────────────────────────
export interface SavedAddress {
  id: string;
  label: string;                   // "Home", "Office", etc.
  full_address: string;
  township: string;
  city: string;
  is_default: boolean;
}
