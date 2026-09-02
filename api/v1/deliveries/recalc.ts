import type { VercelRequest, VercelResponse } from "../../_lib/vercelTypes";
import { calculateDeliveryPricing } from "../../_lib/deliveryPricing";

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
  if (req.method !== "POST") {
    return send(res, 405, { error: "Method not allowed" });
  }

  try {
    const body = parseBody(req);
    const data = await calculateDeliveryPricing({
      township: body?.township || null,
      serviceType: body?.serviceType || "standard",
      weightKg: Number(body?.weightKg || 0),
      itemPrice: Number(body?.itemPrice || 0),
      itemPaymentStatus: body?.itemPaymentStatus === "PAID" ? "PAID" : "UNPAID",
      merchantCustomerDeliveryCharge: Number(body?.merchantCustomerDeliveryCharge || 0),
      deliveryPaymentStatus: body?.deliveryPaymentStatus === "PAID" ? "PAID" : "UNPAID",
    });

    return send(res, 200, { ok: true, data });
  } catch (error: any) {
    console.error("[deliveries/recalc]", error);
    return send(res, 500, { error: error?.message || "Failed to recalculate delivery" });
  }
}
