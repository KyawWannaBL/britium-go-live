import { supabase } from "@/integrations/supabase/client";

export type JsonRow = Record<string, any>;

export async function beV32CurrentEmail() {
  try {
    const { data } = await supabase.auth.getUser();
    if (data?.user?.email) return data.user.email;
  } catch {}
  try {
    return localStorage.getItem("email") || localStorage.getItem("user_email") || localStorage.getItem("be_operator_email") || "unknown_operator";
  } catch {
    return "unknown_operator";
  }
}

export async function beV32Rpc(name: string, args: JsonRow = {}) {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw error;
  return data;
}

export async function beV32List(table: string, limit = 200) {
  const { data, error } = await (supabase as any).from(table).select("*").limit(limit);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function beV32Snapshot() {
  return beV32Rpc("be_v32_snapshot", {});
}

export async function beV32RegisterParcels(rows: JsonRow[], pickupId = "", submit = true) {
  return beV32Rpc("be_v32_register_parcels", {
    p_rows: rows,
    p_pickup_id: pickupId || null,
    p_actor_email: await beV32CurrentEmail(),
    p_submit: submit,
  });
}

export async function beV32GenerateWayplan(args: {
  branchCode?: string;
  vehicleType?: string;
  supervisorEmail?: string;
  riderEmail?: string;
  waybillNos?: string[];
}) {
  return beV32Rpc("be_v32_generate_wayplan", {
    p_branch_code: args.branchCode || "YGN",
    p_vehicle_type: args.vehicleType || "Bike",
    p_supervisor_email: args.supervisorEmail || null,
    p_rider_email: args.riderEmail || null,
    p_waybill_nos: args.waybillNos || [],
    p_actor_email: await beV32CurrentEmail(),
  });
}

export async function beV32SubmitProof(args: {
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
  return beV32Rpc("be_v32_submit_proof", {
    p_waybill_no: args.waybillNo,
    p_pickup_id: args.pickupId || null,
    p_wayplan_id: args.wayplanId || null,
    p_parcel_index: args.parcelIndex || null,
    p_proof_type: args.proofType || "DELIVERY",
    p_status: args.status || "DELIVERED",
    p_actor_email: await beV32CurrentEmail(),
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

export async function beV32WarehouseScan(args: { waybillNo: string; scanType?: string; warehouseCode?: string; photoUrl?: string }) {
  return beV32Rpc("be_v32_warehouse_scan", {
    p_waybill_no: args.waybillNo,
    p_scan_type: args.scanType || "RECEIVED",
    p_warehouse_code: args.warehouseCode || "YGN-HUB",
    p_actor_email: await beV32CurrentEmail(),
    p_photo_url: args.photoUrl || null,
    p_payload: {},
  });
}

export async function beV32SubmitCodSettlement(args: { riderEmail?: string; wayplanId?: string; countedAmount: number }) {
  return beV32Rpc("be_v32_submit_cod_settlement", {
    p_rider_email: args.riderEmail || null,
    p_wayplan_id: args.wayplanId || null,
    p_counted_amount: args.countedAmount || 0,
    p_actor_email: await beV32CurrentEmail(),
  });
}

export async function beV32ApproveCodSettlement(settlementId: string, note = "") {
  return beV32Rpc("be_v32_approve_cod_settlement", {
    p_settlement_id: settlementId,
    p_actor_email: await beV32CurrentEmail(),
    p_note: note || null,
  });
}

export async function beV32AuthorizePrint(documentType: "WAYBILL" | "INVOICE" | "DOCUMENT", documentNo: string, reason = "", context: JsonRow = {}) {
  return beV32Rpc("be_v32_authorize_print", {
    p_document_type: documentType,
    p_document_no: documentNo,
    p_actor_email: await beV32CurrentEmail(),
    p_reason: reason,
    p_context: context,
  });
}

export async function beV32ApproveReprint(requestId: string, decision: "APPROVED" | "REJECTED", note = "") {
  return beV32Rpc("be_v32_approve_reprint", {
    p_request_id: requestId,
    p_superadmin_email: await beV32CurrentEmail(),
    p_decision: decision,
    p_note: note || null,
  });
}

export async function beV32CreateCsCase(args: { waybillNo?: string; pickupId?: string; customerName?: string; phone?: string; issueType?: string; issueDetail?: string; targetRole?: string }) {
  return beV32Rpc("be_v32_cs_case", {
    p_waybill_no: args.waybillNo || null,
    p_pickup_id: args.pickupId || null,
    p_customer_name: args.customerName || null,
    p_phone: args.phone || null,
    p_issue_type: args.issueType || "GENERAL",
    p_issue_detail: args.issueDetail || null,
    p_target_role: args.targetRole || "supervisor",
    p_actor_email: await beV32CurrentEmail(),
    p_payload: {},
  });
}

export async function beV32RecordBdmActivity(args: { companyName: string; phone?: string; stage?: string; expectedVolume?: number; expectedRevenue?: number; note?: string }) {
  return beV32Rpc("be_v32_bdm_activity", {
    p_company_name: args.companyName,
    p_phone: args.phone || null,
    p_stage: args.stage || "NEW",
    p_expected_volume: args.expectedVolume || 0,
    p_expected_revenue: args.expectedRevenue || 0,
    p_note: args.note || null,
    p_actor_email: await beV32CurrentEmail(),
  });
}

export async function beV32RecordMarketing(args: { campaignName: string; channel?: string; leadsGenerated?: number; spend?: number; note?: string }) {
  return beV32Rpc("be_v32_marketing_activity", {
    p_campaign_name: args.campaignName,
    p_channel: args.channel || "SOCIAL",
    p_leads_generated: args.leadsGenerated || 0,
    p_spend: args.spend || 0,
    p_actor_email: await beV32CurrentEmail(),
    p_note: args.note || null,
  });
}
