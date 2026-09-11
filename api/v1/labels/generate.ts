import type { VercelRequest, VercelResponse } from "../../_lib/vercelTypes";
import QRCode from "qrcode";
import { supabaseAdmin } from "../../_lib/supabaseAdmin";

function send(res: VercelResponse, status: number, payload: unknown) {
  return res.status(status).json(payload);
}

function parseBody(req: VercelRequest) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return send(res, 405, { error: "Method not allowed" });
    }

    const body = parseBody(req);
    const pickupId = String(body?.pickup_id || "").trim();

    if (!pickupId) {
      return send(res, 400, { error: "pickup_id is required" });
    }

    const pickupRes = await supabaseAdmin
      .from("pickup_batches")
      .select("*")
      .eq("pickup_id", pickupId)
      .maybeSingle();

    if (pickupRes.error) {
      return send(res, 500, { error: pickupRes.error.message });
    }

    if (!pickupRes.data) {
      return send(res, 404, { error: "Pickup not found" });
    }

    const deliveryRes = await supabaseAdmin
      .from("delivery_orders")
      .select("*")
      .eq("pickup_id", pickupId)
      .order("line_no", { ascending: true });

    if (deliveryRes.error) {
      return send(res, 500, { error: deliveryRes.error.message });
    }

    const labels = [];
    for (const row of deliveryRes.data || []) {
      const qrDataUrl = await QRCode.toDataURL(row.delivery_id, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 220,
      });

      await supabaseAdmin
        .from("delivery_orders")
        .update({
          qr_value: row.delivery_id,
          qr_data_url: qrDataUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      labels.push({
        pickup_id: pickupId,
        delivery_id: row.delivery_id,
        merchant_name: pickupRes.data.merchant_name,
        pickup_date: pickupRes.data.pickup_date,
        receiver_name: row.receiver_name,
        receiver_phone: row.receiver_phone,
        township: row.township,
        destination: row.destination,
        delivery_address: row.delivery_address,
        item_price: row.item_price,
        item_payment_status: row.item_payment_status,
        os_delivery_charge: row.os_delivery_charge,
        printed_waybill_delivery_charge: row.printed_waybill_delivery_charge,
        delivery_payment_status: row.delivery_payment_status,
        waybill_total_cod: row.waybill_total_cod,
        receivable: row.receivable,
        qr_data_url: qrDataUrl,
      });
    }

    return send(res, 200, {
      ok: true,
      pickup_id: pickupId,
      generated_count: labels.length,
      labels,
    });
  } catch (error: any) {
    return send(res, 500, { error: error?.message || "Label generation failed" });
  }
}
