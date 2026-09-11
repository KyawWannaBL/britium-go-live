import type { VercelRequest, VercelResponse } from "../../_lib/vercelTypes";
import { supabaseAdmin } from "../../_lib/supabaseAdmin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const code = String(req.query.code || "");

    if (!code) {
      return res.status(400).json({ ok: false, error: "QR code is required." });
    }

    const { data, error } = await supabaseAdmin
      .from("shipment")
      .select("id, awb, sender_name, receiver_name, status, current_location")
      .eq("awb", code)
      .maybeSingle();

    if (error) throw error;

    return res.status(200).json({ ok: true, data });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message || "Failed to scan QR code." });
  }
}
