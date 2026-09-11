import type { VercelRequest, VercelResponse } from "../../_lib/vercelTypes";
import { supabaseAdmin } from "../../_lib/supabaseAdmin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const [{ count: inbound }, { count: staged }, { count: stored }, { count: outbound }] =
      await Promise.all([
        supabaseAdmin.from("shipment").select("*", { count: "exact", head: true }).eq("status", "INBOUND"),
        supabaseAdmin.from("shipment").select("*", { count: "exact", head: true }).eq("status", "STAGED"),
        supabaseAdmin.from("shipment").select("*", { count: "exact", head: true }).eq("status", "STORED"),
        supabaseAdmin.from("shipment").select("*", { count: "exact", head: true }).eq("status", "OUTBOUND"),
      ]);

    return res.status(200).json({
      ok: true,
      data: {
        inbound: inbound ?? 0,
        staged: staged ?? 0,
        stored: stored ?? 0,
        outbound: outbound ?? 0,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message || "Failed to load warehouse overview." });
  }
}
