import { supabase } from "@/integrations/supabase/client";

export type DeliverySignaturePayload = {
  deliveryWayId: string;
  riderId: string;
  receiverName: string;
  receiverPhone?: string | null;
  codCollected?: number | null;
  paymentMethod?: "CASH" | "KBZPAY" | "WAVEPAY" | "BANK_TRANSFER" | "NO_COD" | "OTHER";
  paymentReference?: string | null;
  signatureUrl?: string | null;
  signaturePayload?: Record<string, unknown> | null;
  photoUrl?: string | null;
  gpsLat: number;
  gpsLng: number;
  remarks?: string | null;
};

function requireText(value: unknown, label: string) {
  if (value === null || value === undefined || String(value).trim() === "") throw new Error(`${label} is required`);
}

function validateUrl(value: string | null | undefined, label: string) {
  if (!value) return;
  try { new URL(value); } catch { throw new Error(`${label} must be a valid URL`); }
}

export function validateDeliverySignaturePayload(payload: DeliverySignaturePayload) {
  requireText(payload.deliveryWayId, "Delivery WayID");
  requireText(payload.riderId, "Rider");
  requireText(payload.receiverName, "Receiver name");
  if (!Number.isFinite(payload.gpsLat) || !Number.isFinite(payload.gpsLng)) throw new Error("GPS latitude and longitude are required");
  if (!payload.signatureUrl && !payload.signaturePayload) throw new Error("Electronic signature is mandatory for drop-off validation");
  if (payload.codCollected !== null && payload.codCollected !== undefined && payload.codCollected < 0) throw new Error("COD collected cannot be negative");
  if ((payload.remarks || "").length > 500) throw new Error("Remarks must be 500 characters or fewer");
  validateUrl(payload.signatureUrl, "Signature URL");
  validateUrl(payload.photoUrl, "Photo URL");
}

export const riderSignatureFinanceApi = {
  async markDeliveredWithSignatureAndCod(payload: DeliverySignaturePayload) {
    validateDeliverySignaturePayload(payload);
    const { data, error } = await (supabase as any).rpc("be_rider_mark_delivered_with_signature_and_cod", {
      p_delivery_way_id: payload.deliveryWayId,
      p_rider_id: payload.riderId,
      p_receiver_name: payload.receiverName,
      p_receiver_phone: payload.receiverPhone || null,
      p_cod_collected: payload.codCollected ?? null,
      p_payment_method: payload.paymentMethod || "CASH",
      p_signature_url: payload.signatureUrl || null,
      p_signature_payload: payload.signaturePayload || null,
      p_photo_url: payload.photoUrl || null,
      p_gps_lat: payload.gpsLat,
      p_gps_lng: payload.gpsLng,
      p_remarks: payload.remarks || null,
      p_payment_reference: payload.paymentReference || null,
    });
    if (error) throw error;
    return data;
  },

  async getRiderFinancialSnapshot(riderId: string, settlementDate?: string) {
    const { data, error } = await (supabase as any).rpc("be_rider_financial_snapshot", {
      p_rider_id: riderId,
      p_settlement_date: settlementDate || null,
    });
    if (error) throw error;
    return data;
  },

  async createSettlementBatch(riderId: string, settlementDate?: string, note?: string) {
    const { data, error } = await (supabase as any).rpc("be_finance_create_rider_settlement_batch", {
      p_rider_id: riderId,
      p_settlement_date: settlementDate || null,
      p_note: note || null,
    });
    if (error) throw error;
    return data;
  },

  async submitSettlementBatch(settlementBatchId: string, actorUserId?: string | null, note?: string) {
    const { data, error } = await (supabase as any).rpc("be_finance_submit_rider_settlement", {
      p_settlement_batch_id: settlementBatchId,
      p_actor_user_id: actorUserId || null,
      p_note: note || null,
    });
    if (error) throw error;
    return data;
  },

  async approveSettlementBatch(settlementBatchId: string, actorUserId?: string | null, note?: string) {
    const { data, error } = await (supabase as any).rpc("be_finance_approve_rider_settlement", {
      p_settlement_batch_id: settlementBatchId,
      p_actor_user_id: actorUserId || null,
      p_note: note || null,
    });
    if (error) throw error;
    return data;
  },

  async verifyGoLive() {
    const { data, error } = await (supabase as any).rpc("be_rider_signature_finance_go_live_verification");
    if (error) throw error;
    return data;
  },
};
