import { supabase } from "@/integrations/supabase/client";

export async function currentEmailV27() {
  try {
    const { data } = await supabase.auth.getUser();
    if (data?.user?.email) return data.user.email;
  } catch {}
  try {
    return localStorage.getItem("email") || localStorage.getItem("user_email") || "unknown_operator";
  } catch {
    return "unknown_operator";
  }
}

export async function rpcV27(name: string, args: Record<string, any>) {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw error;
  return data;
}

export async function listTableV27(table: string, limit = 100) {
  const { data, error } = await (supabase as any).from(table).select("*").limit(limit);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function integratedSnapshotV27() {
  return rpcV27("be_integrated_department_snapshot_v27", {});
}

export async function createCrossRoleTaskV27(args: {
  processArea: string;
  sourceRole: string;
  targetRole: string;
  title: string;
  description?: string;
  refType?: string;
  refId?: string;
  waybillNo?: string;
  customerKey?: string;
  priority?: string;
}) {
  const actor = await currentEmailV27();
  return rpcV27("be_create_cross_role_work_item_v27", {
    p_process_area: args.processArea,
    p_source_role: args.sourceRole,
    p_target_role: args.targetRole,
    p_title: args.title,
    p_description: args.description || null,
    p_ref_type: args.refType || null,
    p_ref_id: args.refId || null,
    p_waybill_no: args.waybillNo || null,
    p_customer_key: args.customerKey || null,
    p_priority: args.priority || "NORMAL",
    p_actor_email: actor,
    p_payload: {},
  });
}

export async function createCustomerServiceCaseV27(args: {
  waybillNo?: string;
  customerName?: string;
  phone?: string;
  issueType: string;
  issueDetail?: string;
  targetRole?: string;
}) {
  const actor = await currentEmailV27();
  return rpcV27("be_customer_service_case_v27", {
    p_waybill_no: args.waybillNo || null,
    p_customer_name: args.customerName || null,
    p_phone: args.phone || null,
    p_issue_type: args.issueType || "GENERAL",
    p_issue_detail: args.issueDetail || null,
    p_source_channel: "ENTERPRISE_PORTAL",
    p_actor_email: actor,
    p_target_role: args.targetRole || "operations_manager",
    p_payload: {},
  });
}

export async function recordBdActivityV27(args: {
  companyName: string;
  contactPerson?: string;
  phone?: string;
  activityType?: string;
  stage?: string;
  expectedVolume?: number;
  expectedRevenue?: number;
  note?: string;
}) {
  const actor = await currentEmailV27();
  return rpcV27("be_business_development_activity_v27", {
    p_company_name: args.companyName,
    p_contact_person: args.contactPerson || null,
    p_phone: args.phone || null,
    p_activity_type: args.activityType || "LEAD",
    p_stage: args.stage || "NEW",
    p_expected_volume: args.expectedVolume || 0,
    p_expected_revenue: args.expectedRevenue || 0,
    p_note: args.note || null,
    p_actor_email: actor,
    p_payload: {},
  });
}

export async function recordMarketingActivityV27(args: {
  campaignName: string;
  channel?: string;
  targetSegment?: string;
  status?: string;
  leadsGenerated?: number;
  conversionCount?: number;
  budget?: number;
  spend?: number;
  note?: string;
}) {
  const actor = await currentEmailV27();
  return rpcV27("be_marketing_activity_v27", {
    p_campaign_name: args.campaignName,
    p_channel: args.channel || "SOCIAL",
    p_target_segment: args.targetSegment || null,
    p_status: args.status || "ACTIVE",
    p_leads_generated: args.leadsGenerated || 0,
    p_conversion_count: args.conversionCount || 0,
    p_budget: args.budget || 0,
    p_spend: args.spend || 0,
    p_owner_email: actor,
    p_note: args.note || null,
    p_actor_email: actor,
    p_payload: {},
  });
}

export async function submitVerificationProofV27(args: {
  waybillNo: string;
  processType?: string;
  status?: string;
  photoUrl?: string;
  photoData?: string;
  signatureData?: string;
  failureReason?: string;
  codCollected?: number;
  lat?: number | null;
  lng?: number | null;
  recipientName?: string;
}) {
  const actor = await currentEmailV27();
  return rpcV27("be_submit_verification_or_proof_v27", {
    p_waybill_no: args.waybillNo,
    p_process_type: args.processType || "DELIVERY_PROOF",
    p_status: args.status || "DELIVERED",
    p_actor_email: actor,
    p_photo_url: args.photoUrl || null,
    p_photo_data: args.photoData || null,
    p_signature_data: args.signatureData || null,
    p_failure_reason: args.failureReason || null,
    p_cod_collected: args.codCollected || 0,
    p_lat: args.lat ?? null,
    p_lng: args.lng ?? null,
    p_recipient_name: args.recipientName || null,
    p_payload: {},
  });
}

export async function updateWorkItemStatusV27(id: string, status: string, note = "") {
  const actor = await currentEmailV27();
  return rpcV27("be_update_work_item_status_v27", {
    p_work_item_id: id,
    p_status: status,
    p_actor_email: actor,
    p_resolution_note: note || null,
  });
}
