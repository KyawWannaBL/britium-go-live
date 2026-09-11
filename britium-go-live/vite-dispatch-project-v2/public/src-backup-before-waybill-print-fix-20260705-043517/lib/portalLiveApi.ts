// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";

export async function loadEnterprisePortalHealthcheck() {
  return supabase.rpc("be_enterprise_portal_healthcheck");
}

export async function loadSupervisorPortal() {
  return supabase.rpc("be_supervisor_portal_snapshot");
}

export async function loadSupervisorPickup() {
  return supabase.rpc("be_supervisor_pickup_snapshot");
}

export async function loadSupervisorWayplan() {
  return supabase.rpc("be_supervisor_wayplan_snapshot");
}

export async function loadFinancePortal() {
  return supabase.rpc("be_finance_portal_snapshot");
}

export async function loadInvoiceStudio() {
  return supabase.rpc("be_invoice_studio_snapshot");
}

export async function loadCodSettlement() {
  return supabase.rpc("be_cod_settlement_snapshot");
}

export async function loadRiderSettlement(riderEmail?: string, workDate?: string) {
  return supabase.rpc("be_rider_settlement_snapshot", {
    p_rider_email: riderEmail || null,
    p_work_date: workDate || new Date().toISOString().slice(0, 10),
  });
}

export async function loadCustomerPortal(trackingNo?: string, phone?: string, actorEmail?: string) {
  return supabase.rpc("be_customer_portal_snapshot", {
    p_tracking_no: trackingNo || null,
    p_phone: phone || null,
    p_actor_email: actorEmail || null,
  });
}

export async function loadBranchOffice(branchCode = "YGN", actorEmail?: string) {
  return supabase.rpc("be_branch_office_portal_snapshot", {
    p_branch_code: branchCode,
    p_actor_email: actorEmail || null,
  });
}
