import { supabase } from "@/integrations/supabase/client";

export type JsonRow = Record<string, any>;

export async function beCurrentUserEmailV25() {
  try {
    const { data } = await supabase.auth.getUser();
    if (data?.user?.email) return data.user.email;
  } catch {}

  try {
    return (
      localStorage.getItem("be_operator_email") ||
      localStorage.getItem("operator_email") ||
      localStorage.getItem("email") ||
      localStorage.getItem("user_email") ||
      "unknown_operator"
    );
  } catch {
    return "unknown_operator";
  }
}

export async function beWorkflowSnapshotV25() {
  const { data, error } = await (supabase as any).rpc("be_go_live_workflow_snapshot_v25");
  if (error) throw error;
  return data || {};
}

export async function beRegisterDeliveryItemsV25(rows: JsonRow[]) {
  const actor = await beCurrentUserEmailV25();
  const { data, error } = await (supabase as any).rpc("be_register_delivery_items_v25", {
    p_rows: rows,
    p_actor_email: actor,
  });
  if (error) throw error;
  return data;
}

export async function beGenerateWayplanV25(args: {
  branchCode?: string;
  vehicleType?: string;
  riderEmail?: string;
  waybillNos?: string[];
}) {
  const actor = await beCurrentUserEmailV25();
  const { data, error } = await (supabase as any).rpc("be_generate_wayplan_v25", {
    p_branch_code: args.branchCode || "YGN",
    p_vehicle_type: args.vehicleType || "Bike",
    p_rider_email: args.riderEmail || null,
    p_actor_email: actor,
    p_waybill_nos: args.waybillNos || [],
  });
  if (error) throw error;
  return data;
}

export async function beUpdateDeliveryStatusV25(args: {
  waybillNo: string;
  status: string;
  lat?: number | null;
  lng?: number | null;
  failureReason?: string | null;
  proofPhotoUrl?: string | null;
  signatureData?: string | null;
  codCollected?: number | null;
}) {
  const actor = await beCurrentUserEmailV25();
  const { data, error } = await (supabase as any).rpc("be_update_delivery_status_v25", {
    p_waybill_no: args.waybillNo,
    p_status: args.status,
    p_actor_email: actor,
    p_lat: args.lat ?? null,
    p_lng: args.lng ?? null,
    p_failure_reason: args.failureReason || null,
    p_proof_photo_url: args.proofPhotoUrl || null,
    p_signature_data: args.signatureData || null,
    p_cod_collected: args.codCollected ?? null,
    p_payload: {},
  });
  if (error) throw error;
  return data;
}

export async function beSubmitCodSettlementV25(args: {
  riderEmail?: string;
  wayplanId?: string;
  waybillNos?: string[];
  countedAmount: number;
}) {
  const actor = await beCurrentUserEmailV25();
  const { data, error } = await (supabase as any).rpc("be_submit_cod_settlement_v25", {
    p_rider_email: args.riderEmail || "",
    p_wayplan_id: args.wayplanId || null,
    p_waybill_nos: args.waybillNos || [],
    p_counted_amount: args.countedAmount || 0,
    p_actor_email: actor,
  });
  if (error) throw error;
  return data;
}

export async function beApproveCodSettlementV25(settlementId: string, note = "") {
  const actor = await beCurrentUserEmailV25();
  const { data, error } = await (supabase as any).rpc("be_approve_cod_settlement_v25", {
    p_settlement_id: settlementId,
    p_actor_email: actor,
    p_finance_note: note,
  });
  if (error) throw error;
  return data;
}

export async function bePostFinanceEntryV25(args: {
  entryType: string;
  refType?: string;
  refId?: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  note?: string;
}) {
  const actor = await beCurrentUserEmailV25();
  const { data, error } = await (supabase as any).rpc("be_finance_post_entry_v25", {
    p_entry_type: args.entryType,
    p_ref_type: args.refType || null,
    p_ref_id: args.refId || null,
    p_debit_account: args.debitAccount,
    p_credit_account: args.creditAccount,
    p_amount: args.amount,
    p_actor_email: actor,
    p_note: args.note || null,
    p_payload: {},
  });
  if (error) throw error;
  return data;
}

export async function beRequestWaybillPrintV25(waybillNo: string, reason = "", context: JsonRow = {}) {
  const actor = await beCurrentUserEmailV25();
  const { data, error } = await (supabase as any).rpc("be_waybill_request_print_v25", {
    p_waybill_no: waybillNo,
    p_actor_email: actor,
    p_reason: reason,
    p_print_context: context,
  });
  if (error) throw error;
  return data;
}

export async function beApproveReprintV25(requestId: string, decision: "APPROVED" | "REJECTED", note = "") {
  const actor = await beCurrentUserEmailV25();
  const { data, error } = await (supabase as any).rpc("be_waybill_approve_reprint_v25", {
    p_request_id: requestId,
    p_superadmin_email: actor,
    p_decision: decision,
    p_approval_note: note,
  });
  if (error) throw error;
  return data;
}

export async function beListTableV25(table: string, limit = 100) {
  const { data, error } = await (supabase as any).from(table).select("*").limit(limit);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
