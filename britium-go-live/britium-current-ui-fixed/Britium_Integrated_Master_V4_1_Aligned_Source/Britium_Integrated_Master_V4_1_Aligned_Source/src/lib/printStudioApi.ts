import { supabase } from "@/lib/supabaseClient";

export async function getActorEmail() {
  const { data } = await supabase.auth.getUser();
  return (
    data.user?.email ||
    localStorage.getItem("be_user_email") ||
    localStorage.getItem("actor_email") ||
    localStorage.getItem("user_email") ||
    ""
  );
}

export async function loadWaybillPrintSnapshot(input?: {
  search?: string;
  merchantCode?: string;
  pickupId?: string;
}) {
  const { data, error } = await (supabase as any).rpc("be_waybill_print_studio_snapshot", {
    p_search: input?.search || null,
    p_merchant_code: input?.merchantCode || null,
    p_pickup_id: input?.pickupId || null,
  });

  if (error) throw error;
  return {
    rows: Array.isArray(data?.rows) ? data.rows : [],
    stats: data?.stats || {},
  };
}

export async function printWaybillAudit(input: {
  waybillNo: string;
  batchKey?: string;
}) {
  const actor = await getActorEmail();

  const { data, error } = await (supabase as any).rpc("be_print_waybill", {
    p_waybill_no: input.waybillNo,
    p_batch_key: input.batchKey || null,
    p_actor_email: actor,
    p_user_agent: navigator.userAgent,
  });

  if (error) throw error;
  return data;
}

export async function grantWaybillReprintPermission(input: {
  scope: "BATCH" | "WAYBILL";
  batchKey?: string;
  waybillNo?: string;
  reason: string;
  maxPrints?: number;
  expiresHours?: number;
}) {
  const actor = await getActorEmail();

  const { data, error } = await (supabase as any).rpc("be_grant_waybill_reprint_permission", {
    p_permission_scope: input.scope,
    p_batch_key: input.batchKey || null,
    p_waybill_no: input.waybillNo || null,
    p_reason: input.reason || null,
    p_actor_email: actor,
    p_max_prints: input.maxPrints || 1,
    p_expires_hours: input.expiresHours || 24,
  });

  if (error) throw error;
  return data;
}

export async function loadInvoicePrintSnapshot(input?: {
  merchantCode?: string;
  pickupId?: string;
}) {
  const { data, error } = await (supabase as any).rpc("be_invoice_print_studio_snapshot", {
    p_merchant_code: input?.merchantCode || null,
    p_pickup_id: input?.pickupId || null,
  });

  if (error) throw error;
  return {
    merchants: Array.isArray(data?.merchants) ? data.merchants : [],
    pickups: Array.isArray(data?.pickups) ? data.pickups : [],
    waybills: Array.isArray(data?.waybills) ? data.waybills : [],
  };
}

export async function printInvoiceAudit(input: {
  invoiceKey: string;
  merchantCode?: string;
  pickupId?: string;
  payload?: Record<string, any>;
}) {
  const actor = await getActorEmail();

  const { data, error } = await (supabase as any).rpc("be_print_invoice", {
    p_invoice_key: input.invoiceKey,
    p_merchant_code: input.merchantCode || null,
    p_pickup_id: input.pickupId || null,
    p_actor_email: actor,
    p_user_agent: navigator.userAgent,
    p_payload: input.payload || {},
  });

  if (error) throw error;
  return data;
}

export function formatMMK(value: any) {
  const n = Number(value || 0);
  return new Intl.NumberFormat("en-US").format(Number.isFinite(n) ? n : 0);
}

export function todayInvoiceDate() {
  return new Date().toLocaleDateString("en-GB");
}

export function makeInvoiceNo(merchantCode: string, pickupId: string) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `INV-${merchantCode || "MER"}-${pickupId || "PICKUP"}-${ymd}`;
}
