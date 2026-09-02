import type { VercelRequest, VercelResponse } from "../../_lib/vercelTypes";
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
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("warehouse_outbound_batches")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) {
        return send(res, 500, { error: error.message });
      }

      return send(res, 200, data || []);
    }

    if (req.method === "POST") {
      const body = parseBody(req);
      const action = String(body?.action || "");

      if (action === "queue_batch") {
        const { batch_no, destination_name, vehicle_no, driver_name, total_parcels } = body;

        const { data, error } = await supabaseAdmin
          .from("warehouse_outbound_batches")
          .insert({
            batch_no,
            destination_name,
            vehicle_no: vehicle_no || null,
            driver_name: driver_name || null,
            total_parcels: Number(total_parcels || 0),
            status: "queued",
            updated_at: new Date().toISOString(),
          })
          .select("*")
          .single();

        if (error) {
          return send(res, 500, { error: error.message });
        }

        return send(res, 200, data);
      }

      if (action === "dispatch_batch") {
        const batchId = String(body?.batch_id || "");
        if (!batchId) return send(res, 400, { error: "batch_id is required" });

        const { data, error } = await supabaseAdmin
          .from("warehouse_outbound_batches")
          .update({
            status: "dispatched",
            dispatched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", batchId)
          .select("*")
          .single();

        if (error) {
          return send(res, 500, { error: error.message });
        }

        return send(res, 200, data);
      }

      if (action === "hold_batch") {
        const batchId = String(body?.batch_id || "");
        if (!batchId) return send(res, 400, { error: "batch_id is required" });

        const { data, error } = await supabaseAdmin
          .from("warehouse_outbound_batches")
          .update({
            status: "hold",
            updated_at: new Date().toISOString(),
          })
          .eq("id", batchId)
          .select("*")
          .single();

        if (error) {
          return send(res, 500, { error: error.message });
        }

        return send(res, 200, data);
      }

      if (action === "attach_manifest") {
        const batchId = String(body?.batch_id || "");
        const manifestId = String(body?.manifest_id || "");
        if (!batchId || !manifestId) {
          return send(res, 400, { error: "batch_id and manifest_id are required" });
        }

        const { data, error } = await supabaseAdmin
          .from("warehouse_outbound_batches")
          .update({
            manifest_id: manifestId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", batchId)
          .select("*")
          .single();

        if (error) {
          return send(res, 500, { error: error.message });
        }

        return send(res, 200, data);
      }

      return send(res, 400, { error: "Unsupported action" });
    }

    return send(res, 405, { error: "Method not allowed" });
  } catch (error: any) {
    console.error("[warehouse/outbound]", error);
    return send(res, 500, { error: error?.message || "Outbound API failed" });
  }
}
