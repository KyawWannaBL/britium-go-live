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
      const { data: manifests, error } = await supabaseAdmin
        .from("warehouse_manifests")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) {
        return send(res, 500, { error: error.message });
      }

      const manifestIds = (manifests || []).map((m: any) => m.id);
      let items: any[] = [];

      if (manifestIds.length) {
        const itemsRes = await supabaseAdmin
          .from("warehouse_manifest_items")
          .select("*")
          .in("manifest_id", manifestIds);

        if (itemsRes.error) {
          return send(res, 500, { error: itemsRes.error.message });
        }

        items = itemsRes.data || [];
      }

      const countMap = new Map<string, number>();
      items.forEach((item) => {
        countMap.set(item.manifest_id, (countMap.get(item.manifest_id) || 0) + 1);
      });

      return send(
        res,
        200,
        (manifests || []).map((row: any) => ({
          ...row,
          item_count: countMap.get(row.id) || 0,
        }))
      );
    }

    if (req.method === "POST") {
      const body = parseBody(req);
      const action = String(body?.action || "");

      if (action === "create_manifest") {
        const { manifest_no, destination_name, vehicle_no, driver_name } = body;

        const { data, error } = await supabaseAdmin
          .from("warehouse_manifests")
          .insert({
            manifest_no,
            destination_name,
            vehicle_no: vehicle_no || null,
            driver_name: driver_name || null,
            status: "open",
            total_parcels: 0,
            updated_at: new Date().toISOString(),
          })
          .select("*")
          .single();

        if (error) {
          return send(res, 500, { error: error.message });
        }

        return send(res, 200, data);
      }

      if (action === "add_items") {
        const manifestId = String(body?.manifest_id || "");
        const trackingNos: string[] = Array.isArray(body?.tracking_nos) ? body.tracking_nos : [];

        if (!manifestId || !trackingNos.length) {
          return send(res, 400, { error: "manifest_id and tracking_nos are required" });
        }

        const storageRes = await supabaseAdmin
          .from("warehouse_storage_records")
          .select("*")
          .in("tracking_no", trackingNos);

        if (storageRes.error) {
          return send(res, 500, { error: storageRes.error.message });
        }

        const storageMap = new Map<string, any>(
          (storageRes.data || []).map((row: any) => [String(row.tracking_no), row])
        );

        const payload = trackingNos.map((trackingNo) => ({
          manifest_id: manifestId,
          tracking_no: trackingNo,
          storage_record_id: storageMap.get(trackingNo)?.id || null,
          status: "manifested",
        }));

        const insertRes = await supabaseAdmin.from("warehouse_manifest_items").insert(payload);
        if (insertRes.error) {
          return send(res, 500, { error: insertRes.error.message });
        }

        const updateStorageRes = await supabaseAdmin
          .from("warehouse_storage_records")
          .update({
            phase: "outbound",
            status: "manifested",
            updated_at: new Date().toISOString(),
          })
          .in("tracking_no", trackingNos);

        if (updateStorageRes.error) {
          return send(res, 500, { error: updateStorageRes.error.message });
        }

        const countRes = await supabaseAdmin
          .from("warehouse_manifest_items")
          .select("*", { count: "exact", head: true })
          .eq("manifest_id", manifestId);

        if (countRes.error) {
          return send(res, 500, { error: countRes.error.message });
        }

        const updateManifestRes = await supabaseAdmin
          .from("warehouse_manifests")
          .update({
            total_parcels: Number(countRes.count || 0),
            updated_at: new Date().toISOString(),
          })
          .eq("id", manifestId);

        if (updateManifestRes.error) {
          return send(res, 500, { error: updateManifestRes.error.message });
        }

        return send(res, 200, { manifest_id: manifestId, added: trackingNos.length });
      }

      if (action === "close_manifest") {
        const manifestId = String(body?.manifest_id || "");
        if (!manifestId) return send(res, 400, { error: "manifest_id is required" });

        const { data, error } = await supabaseAdmin
          .from("warehouse_manifests")
          .update({
            status: "closed",
            closed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", manifestId)
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
    console.error("[warehouse/manifests]", error);
    return send(res, 500, { error: error?.message || "Manifest API failed" });
  }
}
