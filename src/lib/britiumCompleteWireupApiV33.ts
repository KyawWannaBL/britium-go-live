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

function hasLiveValue(value: unknown) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

function liveValue(detail: AnyRow, detailKey: string, row: AnyRow, rowKey = detailKey) {
  return hasLiveValue(detail?.[detailKey]) ? detail[detailKey] : row?.[rowKey];
}

async function overlayLiveDataEntryWaybillRows(rows: AnyRow[]) {
  const pickupIds = [...new Set(rows.map((row) => String(row?.pickup_id || "").trim()).filter(Boolean))];
  if (!pickupIds.length) return rows;

  const { data, error } = await (supabase as any)
    .from("be_data_entry_parcel_details")
    .select("*")
    .in("pickup_id", pickupIds)
    .limit(Math.min(Math.max(rows.length * 10, 500), 5000));
  if (error) throw error;

  const details = Array.isArray(data) ? data : [];
  const byWayId = new Map<string, AnyRow>();
  const byPickupSequence = new Map<string, AnyRow>();
  for (const detail of details) {
    const wayId = String(detail?.delivery_way_id || "").trim().toUpperCase();
    const pickupId = String(detail?.pickup_id || "").trim();
    const sequence = Number(detail?.parcel_sequence || 0);
    if (wayId) byWayId.set(wayId, detail);
    if (pickupId && sequence > 0) byPickupSequence.set(`${pickupId}::${sequence}`, detail);
  }

  return rows.map((row) => {
    const wayId = String(row?.waybill_no || row?.delivery_way_id || row?.tracking_no || "").trim().toUpperCase();
    const pickupId = String(row?.pickup_id || "").trim();
    const sequence = Number(row?.parcel_sequence || 0);
    const detail = (wayId ? byWayId.get(wayId) : undefined) ||
      (pickupId && sequence > 0 ? byPickupSequence.get(`${pickupId}::${sequence}`) : undefined);
    if (!detail) return row;

    return {
      ...row,
      recipient_name: liveValue(detail, "recipient_name", row),
      recipient_phone: liveValue(detail, "contact_no_1", row, "recipient_phone"),
      recipient_phone_2: liveValue(detail, "contact_no_2", row, "recipient_phone_2"),
      township: liveValue(detail, "township", row),
      township_key: liveValue(detail, "township_key", row),
      city: liveValue(detail, "city", row),
      region_state: liveValue(detail, "region_state", row),
      recipient_address: liveValue(detail, "recipient_address", row),
      customer_tier: liveValue(detail, "customer_tier", row),
      item_price: liveValue(detail, "item_price", row),
      weight_kg: liveValue(detail, "weight_kg", row),
      surcharge: liveValue(detail, "surcharge", row),
      delivery_fee: liveValue(detail, "delivery_fee", row),
      cod_amount: liveValue(detail, "cod_amount", row),
      actual_collect: liveValue(detail, "actual_collect", row),
      destination: liveValue(detail, "destination", row),
      remarks: liveValue(detail, "remark", row, "remarks"),
      data_entry_saved_at: liveValue(detail, "saved_at", row, "data_entry_saved_at"),
      waybill_data_source: "DATA_ENTRY_LIVE_OVERLAY_V12_5",
    };
  });
}

export async function waybillStudioSnapshotV125(limit = 500) {
  let rows: AnyRow[] = [];
  try {
    const data = await rpcV33("be_waybill_studio_snapshot_v12_5", { p_limit: limit });
    if (!data?.ok) throw new Error(data?.error || "Waybill Studio v12.5 snapshot failed.");
    rows = Array.isArray(data?.rows) ? data.rows : [];
  } catch (primaryError) {
    const data = await rpcV33("be_waybill_studio_snapshot_v12_2", { p_limit: limit });
    if (!data?.ok) throw primaryError instanceof Error ? primaryError : new Error("Waybill Studio snapshot failed.");
    rows = Array.isArray(data?.rows) ? data.rows : [];
  }

  try { return await overlayLiveDataEntryWaybillRows(rows); }
  catch (overlayError) {
    console.warn("Waybill Studio live Data Entry overlay unavailable; using backend snapshot.", overlayError);
    return rows;
  }
}

export async function waybillStudioSnapshotV122(limit = 500) {
  return waybillStudioSnapshotV125(limit);
}

export async function syncWaybillStudioV122(input: {
  pickupId: string;
  merchantCode?: string;
  merchantName?: string;
}) {
  const data = await rpcV33("be_data_entry_waybill_sync_v12_2", {
    p_pickup_id: input.pickupId,
    p_merchant_code: input.merchantCode || null,
    p_merchant_name: input.merchantName || null,
  });
  if (!data?.ok) throw new Error(data?.error || "Waybill Studio synchronization failed.");
  return data;
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
