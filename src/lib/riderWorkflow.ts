import { supabase } from "./supabaseClient";
import type {
  FailureReason,
  RiderNextAction,
  RiderTask,
  RiderTaskStatus,
  RiderTaskType,
} from "../types";

type JsonRecord = Record<string, unknown>;

interface RiderRpcEnvelope {
  ok?: boolean;
  error?: string;
  detail?: string;
  tasks?: JsonRecord[];
  [key: string]: unknown;
}

export interface RiderActionRequest {
  task_id: string;
  action:
    | "accept"
    | "arrive"
    | "collect"
    | "delivered_to_warehouse"
    | "start_delivery"
    | "deliver"
    | "exception";
  remarks?: string;
  recipient_name?: string;
  recipient_phone?: string;
  proof_url?: string;
  signature_url?: string;
  delivery_way_id?: string;
  cod_collected_amount?: number;
  exception_code?: string;
  mapped_status?: string;
  workflow_area?: "pickup" | "delivery";
  process_type?: "pickup" | "delivery";
}

export interface RiderParcelVerificationInput {
  actual_weight_kg: number;
  proof_url: string;
}

export interface RiderPickupVerificationRequest {
  task_id: string;
  parcels: RiderParcelVerificationInput[];
  proof_url?: string;
  remarks?: string;
}

export interface RiderProofUploadRequest {
  task_id: string;
  file: File;
}

export const RIDER_FAILURE_STATUS_MAP: Record<
  FailureReason,
  { exception_code: string; mapped_status: string }
> = {
  recipient_not_available: {
    exception_code: "RECIPIENT_NOT_AVAILABLE",
    mapped_status: "DELIVERY_ATTEMPTED",
  },
  address_not_found: {
    exception_code: "ADDRESS_NOT_FOUND",
    mapped_status: "ADDRESS_ISSUE",
  },
  recipient_refused: {
    exception_code: "RECIPIENT_REFUSED",
    mapped_status: "CUSTOMER_REFUSED",
  },
  cod_dispute: {
    exception_code: "COD_DISPUTE",
    mapped_status: "DELIVERY_DELAYED",
  },
  access_blocked: {
    exception_code: "ACCESS_BLOCKED",
    mapped_status: "DELIVERY_ATTEMPTED",
  },
  damaged: {
    exception_code: "DAMAGED",
    mapped_status: "DAMAGED",
  },
  other: {
    exception_code: "OTHER_EXCEPTION",
    mapped_status: "EXCEPTION",
  },
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return fallback;
}

function upper(value: unknown): string {
  return asText(value).toUpperCase();
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }

  return "";
}

function rpcError(value: unknown, fallback: string): Error {
  const data = value as RiderRpcEnvelope | null;

  return new Error(
    firstText(data?.detail, data?.error) ||
      fallback
  );
}

function assertRpcSuccess(
  data: unknown,
  fallback: string
): RiderRpcEnvelope {
  const result = data as RiderRpcEnvelope | null;

  if (!result || result.ok === false) {
    throw rpcError(result, fallback);
  }

  return result;
}

function determineNextAction(raw: JsonRecord): RiderNextAction | null {
  const pickupStatus = upper(raw.pickup_status);
  const riderStatus = upper(raw.rider_status);
  const riderStage = upper(raw.rider_app_stage);
  const assignmentStatus = upper(raw.assignment_status);
  const warehouseStatus = upper(raw.warehouse_status);
  const workflowStage = upper(raw.workflow_stage);
  const deliveryStatus = upper(raw.delivery_status);
  const genericStatus = upper(raw.status);

  const values = new Set([
    pickupStatus,
    riderStatus,
    riderStage,
    assignmentStatus,
    warehouseStatus,
    workflowStage,
    deliveryStatus,
    genericStatus,
  ]);

  const has = (...statuses: string[]) =>
    statuses.some((status) => values.has(status));

  if (
    deliveryStatus === "DELIVERED" ||
    has("DELIVERY_COMPLETED")
  ) {
    return null;
  }

  if (
    has(
      "PICKUP_FAILED",
      "PICKUP_REJECTED",
      "PICKUP_CANCELLED",
      "CUSTOMER_REFUSED",
      "ADDRESS_ISSUE",
      "DAMAGED",
      "EXCEPTION"
    )
  ) {
    return null;
  }

  if (deliveryStatus === "OUT_FOR_DELIVERY") {
    return "deliver";
  }

  if (
    ["READY_FOR_DELIVERY", "ASSIGNED_FOR_DELIVERY", "ASSIGNED"].includes(
      deliveryStatus
    ) ||
    pickupStatus === "ASSIGNED_FOR_DELIVERY" ||
    warehouseStatus === "RECEIVED_AT_ORIGIN"
  ) {
    return "start_delivery";
  }

  if (
    pickupStatus === "DELIVERED_TO_WAREHOUSE" ||
    riderStatus === "WAREHOUSE_ACCEPTED"
  ) {
    return null;
  }

  if (
    pickupStatus === "PICKUP_COLLECTED" ||
    riderStatus === "PICKUP_COLLECTED" ||
    riderStage === "PICKUP_COLLECTED"
  ) {
    return "delivered_to_warehouse";
  }

  if (
    pickupStatus === "PICKUP_VERIFIED" ||
    riderStatus === "PICKUP_VERIFIED" ||
    riderStage === "PICKUP_VERIFIED"
  ) {
    return "collect";
  }

  if (
    has(
      "PICKUP_VERIFICATION_PENDING_REVIEW",
      "WAITING_REVIEW",
      "WAITING_DATA_ENTRY"
    )
  ) {
    return null;
  }

  if (
    pickupStatus === "RIDER_ARRIVED" ||
    riderStatus === "ARRIVED_PICKUP" ||
    riderStage === "RIDER_ARRIVED" ||
    genericStatus === "ARRIVED_PICKUP"
  ) {
    return "submit_pickup_verification";
  }

  if (
    has(
      "RIDER_ACCEPTED",
      "ACCEPTED",
      "ACCEPTED_BY_RIDER",
      "PICKUP_ACCEPTED"
    )
  ) {
    return "arrive";
  }

  if (
    has(
      "ASSIGNED",
      "RIDER_ASSIGNED",
      "ASSIGNED_TO_RIDER",
      "PICKUP_ASSIGNED",
      "PENDING",
      "PENDING_ASSIGNMENT",
      "PICKUP_REQUESTED",
      "NOT_ASSIGNED"
    )
  ) {
    return "accept";
  }

  return null;
}

function deriveTaskType(
  raw: JsonRecord,
  nextAction: RiderNextAction | null
): RiderTaskType {
  if (
    asText(raw.task_type).toLowerCase() === "delivery" ||
    asText(raw.delivery_status) ||
    nextAction === "start_delivery" ||
    nextAction === "deliver"
  ) {
    return "delivery";
  }

  return "pickup";
}

function deriveUiStatus(
  raw: JsonRecord,
  nextAction: RiderNextAction | null
): RiderTaskStatus {
  const values = [
    upper(raw.pickup_status),
    upper(raw.rider_status),
    upper(raw.rider_app_stage),
    upper(raw.delivery_status),
    upper(raw.status),
  ];

  if (
    values.some((value) =>
      [
        "PICKUP_FAILED",
        "PICKUP_REJECTED",
        "PICKUP_CANCELLED",
        "CUSTOMER_REFUSED",
        "ADDRESS_ISSUE",
        "DAMAGED",
        "EXCEPTION",
      ].includes(value)
    )
  ) {
    return "failed";
  }

  if (
    values.includes("DELIVERED") ||
    values.includes("DELIVERED_TO_WAREHOUSE")
  ) {
    return "delivered";
  }

  if (
    values.includes("PICKUP_VERIFICATION_PENDING_REVIEW") ||
    values.includes("WAITING_REVIEW")
  ) {
    return "waiting_review";
  }

  if (
    nextAction === "accept" ||
    nextAction === null
  ) {
    return "assigned";
  }

  return "in_progress";
}

function mapTask(raw: JsonRecord, index: number): RiderTask {
  const pickupId = firstText(raw.pickup_id, raw.pickup_way_id, raw.id);
  const nextAction = determineNextAction(raw);
  const taskType = deriveTaskType(raw, nextAction);

  return {
    id: pickupId,
    record_id: asText(raw.id),
    pickup_id: pickupId,
    pickup_way_id: asText(raw.pickup_way_id),
    delivery_way_id: asText(raw.delivery_way_id),
    tracking_no:
      firstText(
        raw.tracking_no,
        raw.delivery_way_id,
        raw.pickup_way_id,
        raw.pickup_id
      ) || pickupId,

    merchant_name: asText(raw.merchant_name),
    sender_name: asText(raw.sender_name),
    sender_phone: asText(raw.sender_phone),
    pickup_address: asText(raw.pickup_address),
    pickup_township: asText(raw.pickup_township),
    pickup_city: asText(raw.pickup_city),

    receiver_name: asText(raw.receiver_name),
    receiver_phone: asText(raw.receiver_phone),
    receiver_address: asText(raw.receiver_address),
    receiver_township: asText(raw.receiver_township),
    receiver_city: asText(raw.receiver_city),

    parcel_count: Math.max(1, asNumber(raw.parcel_count, 1)),
    cod_amount: Math.max(0, asNumber(raw.cod_amount, 0)),
    service_type: firstText(raw.service_type, "Standard"),
    notes: asText(raw.notes),

    task_type: taskType,
    next_action: nextAction,
    status: deriveUiStatus(raw, nextAction),
    sequence: index + 1,

    pickup_status: asText(raw.pickup_status),
    rider_status: asText(raw.rider_status),
    rider_app_stage: asText(raw.rider_app_stage),
    assignment_status: asText(raw.assignment_status),
    warehouse_status: asText(raw.warehouse_status),
    workflow_stage: asText(raw.workflow_stage),
    delivery_status: asText(raw.delivery_status),

    assigned_rider_code: asText(raw.assigned_rider_code),
    assigned_rider_name: asText(raw.assigned_rider_name),
    assigned_at: asText(raw.assigned_at),
    created_at: asText(raw.created_at),
    updated_at: asText(raw.updated_at),
  };
}

export async function listAssignedRiderTasks(
  limit = 100
): Promise<RiderTask[]> {
  const { data, error } = await supabase.rpc(
    "be_rider_list_assigned_tasks",
    { p_limit: limit }
  );

  if (error) throw new Error(error.message);

  const result = assertRpcSuccess(
    data,
    "Unable to load assigned Rider tasks."
  );

  const tasks = Array.isArray(result.tasks)
    ? result.tasks
    : [];

  return tasks.map((task, index) =>
    mapTask(task as JsonRecord, index)
  );
}

export async function performRiderAction(
  request: RiderActionRequest
): Promise<RiderRpcEnvelope> {
  const payload: JsonRecord = {
    pickup_id: request.task_id,
    action: request.action,
  };

  if (request.remarks) payload.remarks = request.remarks;
  if (request.recipient_name) {
    payload.recipient_name = request.recipient_name;
  }
  if (request.recipient_phone) {
    payload.recipient_phone = request.recipient_phone;
  }
  if (request.proof_url) payload.proof_url = request.proof_url;
  if (request.signature_url) {
    payload.signature_url = request.signature_url;
  }
  if (request.delivery_way_id) {
    payload.delivery_way_id = request.delivery_way_id;
  }
  if (request.cod_collected_amount !== undefined) {
    payload.cod_collected_amount =
      request.cod_collected_amount;
  }
  if (request.exception_code) {
    payload.exception_code = request.exception_code;
  }
  if (request.mapped_status) {
    payload.mapped_status = request.mapped_status;
  }
  if (request.workflow_area) {
    payload.workflow_area = request.workflow_area;
  }
  if (request.process_type) {
    payload.process_type = request.process_type;
  }

  const { data, error } = await supabase.rpc(
    "be_rider_pickup_action",
    { p_payload: payload }
  );

  if (error) throw new Error(error.message);

  return assertRpcSuccess(
    data,
    `Rider action "${request.action}" failed.`
  );
}

export async function submitPickupVerification(
  request: RiderPickupVerificationRequest
): Promise<RiderRpcEnvelope> {
  const payload: JsonRecord = {
    pickup_id: request.task_id,
    parcels: request.parcels.map((parcel) => ({
      actual_weight_kg: parcel.actual_weight_kg,
      proof_url: parcel.proof_url,
    })),
  };

  if (request.proof_url) {
    payload.proof_url = request.proof_url;
  }

  if (request.remarks) {
    payload.remarks = request.remarks;
  }

  const { data, error } = await supabase.rpc(
    "be_rider_submit_partial_pickup_verification",
    { p_payload: payload }
  );

  if (error) throw new Error(error.message);

  return assertRpcSuccess(
    data,
    "Unable to submit pickup verification."
  );
}

function safeStorageName(filename: string): string {
  const normalized = filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "proof.jpg";
}

export async function uploadRiderProof(
  taskId: string,
  file: File
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image proof files are allowed.");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw new Error(userError.message);
  if (!user) throw new Error("Authentication is required.");

  const safeTaskId =
    taskId.replace(/[^a-zA-Z0-9_-]+/g, "-") || "task";

  const path = [
    user.id,
    safeTaskId,
    `${Date.now()}-${crypto.randomUUID()}-${safeStorageName(file.name)}`,
  ].join("/");

  const { error } = await supabase.storage
    .from("rider-proofs")
    .upload(path, file, {
      upsert: false,
      contentType: file.type || "image/jpeg",
      cacheControl: "3600",
    });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage
    .from("rider-proofs")
    .getPublicUrl(path);

  if (!data.publicUrl) {
    throw new Error("Unable to generate proof URL.");
  }

  return data.publicUrl;
}
