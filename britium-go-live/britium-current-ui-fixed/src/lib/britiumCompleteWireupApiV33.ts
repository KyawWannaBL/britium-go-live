import { supabase } from "@/integrations/supabase/client";

export type AnyRow = Record<string, any>;

export async function beActorEmailV33() {
  try {
    const { data } = await supabase.auth.getUser();
    if (data?.user?.email) return data.user.email;
  } catch {}

  try {
    return (
      localStorage.getItem("email") ||
      localStorage.getItem("user_email") ||
      localStorage.getItem("be_operator_email") ||
      "unknown_operator"
    );
  } catch {
    return "unknown_operator";
  }
}

export async function rpcV33(name: string, args: AnyRow = {}) {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw error;
  return data;
}

export async function tableV33(name: string, limit = 200) {
  const { data, error } = await (supabase as any).from(name).select("*").limit(limit);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function snapshotV33() {
  return rpcV33("be_v32_snapshot", {});
}

export async function saveDataEntryV33(pickupId: string, rows: AnyRow[], submit = true) {
  const actor = await beActorEmailV33();
  return rpcV33("be_v32_register_parcels", {
    p_rows: rows,
    p_pickup_id: pickupId,
    p_actor_email: actor,
    p_submit: submit,
  });
}

export async function generateWayplanV33(args: {
  branchCode?: string;
  vehicleType?: string;
  supervisorEmail?: string;
  riderEmail?: string;
  waybillNos?: string[];
}) {
  const actor = await beActorEmailV33();
  return rpcV33("be_v32_generate_wayplan", {
    p_branch_code: args.branchCode || "YGN",
    p_vehicle_type: args.vehicleType || "Bike",
    p_supervisor_email: args.supervisorEmail || actor,
    p_rider_email: args.riderEmail || null,
    p_waybill_nos: args.waybillNos || [],
    p_actor_email: actor,
  });
}

export async function submitProofV33(args: {
  waybillNo: string;
  pickupId?: string;
  wayplanId?: string;
  parcelIndex?: number;
  proofType?: string;
  status?: string;
  photoUrl?: string;
  photoPath?: string;
  photoData?: string;
  signatureData?: string;
  failureReason?: string;
  codCollected?: number;
  lat?: number | null;
  lng?: number | null;
}) {
  const actor = await beActorEmailV33();
  return rpcV33("be_v32_submit_proof", {
    p_waybill_no: args.waybillNo,
    p_pickup_id: args.pickupId || null,
    p_wayplan_id: args.wayplanId || null,
    p_parcel_index: args.parcelIndex || null,
    p_proof_type: args.proofType || "DELIVERY",
    p_status: args.status || "DELIVERED",
    p_actor_email: actor,
    p_photo_url: args.photoUrl || null,
    p_photo_path: args.photoPath || null,
    p_photo_data: args.photoData || null,
    p_signature_data: args.signatureData || null,
    p_failure_reason: args.failureReason || null,
    p_cod_collected: args.codCollected || 0,
    p_lat: args.lat ?? null,
    p_lng: args.lng ?? null,
    p_payload: {},
  });
}

export async function warehouseScanV33(args: {
  waybillNo: string;
  scanType?: string;
  warehouseCode?: string;
  photoUrl?: string;
}) {
  const actor = await beActorEmailV33();
  return rpcV33("be_v32_warehouse_scan", {
    p_waybill_no: args.waybillNo,
    p_scan_type: args.scanType || "RECEIVED",
    p_warehouse_code: args.warehouseCode || "YGN-HUB",
    p_actor_email: actor,
    p_photo_url: args.photoUrl || null,
    p_payload: {},
  });
}

export async function submitCodSettlementV33(args: {
  riderEmail?: string;
  wayplanId?: string;
  countedAmount: number;
}) {
  const actor = await beActorEmailV33();
  return rpcV33("be_v32_submit_cod_settlement", {
    p_rider_email: args.riderEmail || null,
    p_wayplan_id: args.wayplanId || null,
    p_counted_amount: args.countedAmount || 0,
    p_actor_email: actor,
  });
}

export async function approveCodSettlementV33(settlementId: string, note = "") {
  const actor = await beActorEmailV33();
  return rpcV33("be_v32_approve_cod_settlement", {
    p_settlement_id: settlementId,
    p_actor_email: actor,
    p_note: note || null,
  });
}

export async function createCsCaseV33(args: {
  waybillNo?: string;
  pickupId?: string;
  customerName?: string;
  phone?: string;
  issueType?: string;
  issueDetail?: string;
  targetRole?: string;
}) {
  const actor = await beActorEmailV33();
  return rpcV33("be_v32_cs_case", {
    p_waybill_no: args.waybillNo || null,
    p_pickup_id: args.pickupId || null,
    p_customer_name: args.customerName || null,
    p_phone: args.phone || null,
    p_issue_type: args.issueType || "GENERAL",
    p_issue_detail: args.issueDetail || null,
    p_target_role: args.targetRole || "supervisor",
    p_actor_email: actor,
    p_payload: {},
  });
}

export async function bdmActivityV33(args: {
  companyName: string;
  phone?: string;
  stage?: string;
  expectedVolume?: number;
  expectedRevenue?: number;
  note?: string;
}) {
  const actor = await beActorEmailV33();
  return rpcV33("be_v32_bdm_activity", {
    p_company_name: args.companyName,
    p_phone: args.phone || null,
    p_stage: args.stage || "NEW",
    p_expected_volume: args.expectedVolume || 0,
    p_expected_revenue: args.expectedRevenue || 0,
    p_note: args.note || null,
    p_actor_email: actor,
  });
}

export async function marketingActivityV33(args: {
  campaignName: string;
  channel?: string;
  leadsGenerated?: number;
  spend?: number;
  note?: string;
}) {
  const actor = await beActorEmailV33();
  return rpcV33("be_v32_marketing_activity", {
    p_campaign_name: args.campaignName,
    p_channel: args.channel || "SOCIAL",
    p_leads_generated: args.leadsGenerated || 0,
    p_spend: args.spend || 0,
    p_actor_email: actor,
    p_note: args.note || null,
  });
}

export async function authorizePrintV33(args: {
  documentType: "WAYBILL" | "INVOICE" | "DOCUMENT";
  documentNo: string;
  reason?: string;
  paperSize?: string;
  labelSize?: string;
}) {
  const actor = await beActorEmailV33();
  return rpcV33("be_v32_authorize_print", {
    p_document_type: args.documentType,
    p_document_no: args.documentNo,
    p_actor_email: actor,
    p_reason: args.reason || "",
    p_context: {
      paperSize: args.paperSize,
      labelSize: args.labelSize,
    },
  });
}

export async function approveReprintV33(requestId: string, decision: "APPROVED" | "REJECTED", note = "") {
  const actor = await beActorEmailV33();
  return rpcV33("be_v32_approve_reprint", {
    p_request_id: requestId,
    p_superadmin_email: actor,
    p_decision: decision,
    p_note: note,
  });
}
