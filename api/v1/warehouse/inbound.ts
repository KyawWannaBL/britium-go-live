import type { VercelRequest, VercelResponse } from "../../_lib/vercelTypes";
import { supabaseAdmin } from "../../_lib/supabaseAdmin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("shipment")
        .select("id, awb, sender_name, receiver_name, status, created_at")
        .eq("status", "INBOUND")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return res.status(200).json({ ok: true, data: data ?? [] });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message || "Failed to load inbound queue." });
  }
}
