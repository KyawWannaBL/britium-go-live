import { supabase } from "@/integrations/supabase/client";

export type WaybillPrintRow = {
  waybill_no: string;
  delivery_way_id: string;
  pickup_id: string;
  pickup_way_id: string;
  merchant_code: string;
  merchant_name: string;
  merchant_phone: string;
  merchant_address: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  township: string;
  city: string;
  cod_amount: number;
  delivery_fee: number;
  item_price: number;
  prepaid_amount: number;
  status: string;
  print_count?: number;
  print_status?: string;
  can_print?: boolean;
  payload?: any;
};

export type InvoiceGroup = {
  invoice_key: string;
  merchant_code: string;
  merchant_name: string;
  merchant_phone: string;
  merchant_address: string;
  pickup_id: string;
  pickup_way_id: string;
  parcel_count: number;
  total_cod: number;
  total_fee: number;
  waybills: WaybillPrintRow[];
};

function first(row: any, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value);
  }
  return fallback;
}

function money(row: any, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const raw = row?.[key];
    if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
      const n = Number(String(raw).replace(/,/g, ""));
      return Number.isFinite(n) ? n : fallback;
    }
  }
  return fallback;
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
  const cleanMerchant = merchantCode || "MER";
  const cleanPickup = (pickupId || "PICKUP").replace(/[^A-Za-z0-9]/g, "").slice(-10);
  return `INV-${ymd}-${cleanMerchant}-${cleanPickup}`;
}

export function normalizeWaybillRow(row: any): WaybillPrintRow {
  const waybill = first(row, ["waybill_no", "tracking_no", "delivery_way_id", "delivery_way_no", "id"]);
  const pickup = first(row, ["pickup_id", "pickup_way_id", "pickup_request_id", "request_code"]);

  return {
    waybill_no: waybill,
    delivery_way_id: first(row, ["delivery_way_id", "delivery_way_no", "tracking_no", "waybill_no"], waybill),
    pickup_id: pickup,
    pickup_way_id: first(row, ["pickup_way_id", "pickup_id", "pickup_request_id"], pickup),
    merchant_code: first(row, ["merchant_code", "sender_code", "merchant_id"], ""),
    merchant_name: first(row, ["merchant_name", "sender_name", "business_name"], "Unknown Merchant"),
    merchant_phone: first(row, ["merchant_phone", "sender_phone", "merchant_contact_phone"], ""),
    merchant_address: first(row, ["merchant_address", "sender_address", "pickup_address"], ""),
    recipient_name: first(row, ["recipient_name", "receiver_name", "customer_name", "consignee_name"], ""),
    recipient_phone: first(row, ["recipient_phone", "receiver_phone", "customer_phone", "phone"], ""),
    recipient_address: first(row, ["recipient_address", "receiver_address", "delivery_address", "address"], ""),
    township: first(row, ["township", "receiver_township", "delivery_township"], ""),
    city: first(row, ["city", "receiver_city", "delivery_city"], "Yangon"),
    cod_amount: money(row, ["cod_amount", "cod", "total_cod"], 0),
    delivery_fee: money(row, ["delivery_fee", "fee", "tariff", "delivery_charges"], 0),
    item_price: money(row, ["item_price", "declared_value", "product_value", "cod_amount"], 0),
    prepaid_amount: money(row, ["prepaid_amount", "prepaid", "advance_paid"], 0),
    status: first(row, ["status", "delivery_status", "waybill_status"], "WAYBILL_CREATED"),
    print_count: money(row, ["print_count"], 0),
    print_status: first(row, ["print_status"], "READY_TO_PRINT"),
    can_print: row?.can_print !== false,
    payload: row,
  };
}

async function tryRpcSnapshot(search: string, merchantCode: string, pickupId: string): Promise<WaybillPrintRow[] | null> {
  try {
    const { data, error } = await (supabase as any).rpc("be_waybill_print_studio_snapshot", {
      p_search: search || null,
      p_merchant_code: merchantCode || null,
      p_pickup_id: pickupId || null,
    });
    if (error) throw error;
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    return rows.map(normalizeWaybillRow).filter((r: WaybillPrintRow) => r.waybill_no);
  } catch (error) {
    console.warn("be_waybill_print_studio_snapshot unavailable; using fallback table/view", error);
    return null;
  }
}

async function querySource(source: string, search: string, merchantCode: string, pickupId: string) {
  let q = (supabase as any).from(source).select("*").limit(300);
  if (pickupId) q = q.or(`pickup_id.eq.${pickupId},pickup_way_id.eq.${pickupId},pickup_request_id.eq.${pickupId}`);
  if (merchantCode) q = q.eq("merchant_code", merchantCode);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : []).map(normalizeWaybillRow).filter((r: WaybillPrintRow) => r.waybill_no);
  if (!search) return rows;
  const s = search.toLowerCase();
  return rows.filter((r: WaybillPrintRow) =>
    [r.waybill_no, r.delivery_way_id, r.pickup_id, r.merchant_code, r.merchant_name, r.recipient_name, r.recipient_phone, r.township]
      .join(" ")
      .toLowerCase()
      .includes(s)
  );
}

export async function loadWaybillPrintRows(input?: { search?: string; merchantCode?: string; pickupId?: string }) {
  const search = input?.search || "";
  const merchantCode = input?.merchantCode || "";
  const pickupId = input?.pickupId || "";

  const rpcRows = await tryRpcSnapshot(search, merchantCode, pickupId);
  if (rpcRows) return rpcRows;

  const sources = ["be_v_data_entry_parcel_template", "be_portal_pickup_request_items"];
  let lastError: any = null;
  for (const source of sources) {
    try {
      const rows = await querySource(source, search, merchantCode, pickupId);
      if (rows.length || source === sources[sources.length - 1]) return rows;
    } catch (error) {
      lastError = error;
      console.warn(`Fallback source ${source} failed`, error);
    }
  }
  throw lastError || new Error("Unable to load waybill print data.");
}

export async function loadInvoiceGroups(input?: { search?: string; merchantCode?: string; pickupId?: string }) {
  const rows = await loadWaybillPrintRows(input);
  const map = new Map<string, InvoiceGroup>();

  rows.forEach((row) => {
    const key = `${row.merchant_code || "MER"}::${row.pickup_id || row.pickup_way_id || "PICKUP"}`;
    const current = map.get(key) || {
      invoice_key: makeInvoiceNo(row.merchant_code, row.pickup_id || row.pickup_way_id),
      merchant_code: row.merchant_code,
      merchant_name: row.merchant_name,
      merchant_phone: row.merchant_phone,
      merchant_address: row.merchant_address,
      pickup_id: row.pickup_id,
      pickup_way_id: row.pickup_way_id,
      parcel_count: 0,
      total_cod: 0,
      total_fee: 0,
      waybills: [],
    };

    current.waybills.push(row);
    current.parcel_count = current.waybills.length;
    current.total_cod += Number(row.cod_amount || 0);
    current.total_fee += Number(row.delivery_fee || 0);
    map.set(key, current);
  });

  return Array.from(map.values());
}

async function actorEmail() {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.email || "";
  } catch {
    return "";
  }
}

export async function auditWaybillPrint(row: WaybillPrintRow) {
  try {
    await (supabase as any).rpc("be_print_waybill", {
      p_waybill_no: row.waybill_no,
      p_batch_key: row.pickup_id || row.pickup_way_id || null,
      p_actor_email: await actorEmail(),
      p_user_agent: navigator.userAgent,
    });
  } catch (error) {
    console.warn("Waybill print audit RPC unavailable or blocked; printing continues", error);
  }
}

export async function auditInvoicePrint(group: InvoiceGroup) {
  try {
    await (supabase as any).rpc("be_print_invoice", {
      p_invoice_key: group.invoice_key,
      p_merchant_code: group.merchant_code || null,
      p_pickup_id: group.pickup_id || group.pickup_way_id || null,
      p_actor_email: await actorEmail(),
      p_user_agent: navigator.userAgent,
      p_payload: {
        total_cod: group.total_cod,
        total_fee: group.total_fee,
        net_settlement: group.total_cod - group.total_fee,
        waybill_count: group.waybills.length,
      },
    });
  } catch (error) {
    console.warn("Invoice print audit RPC unavailable; printing continues", error);
  }
}
