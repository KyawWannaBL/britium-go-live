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

async function getOrCreateLocation(zone: string, rack: string, bin: string, isStaging = false) {
  const code = `${zone}-${rack}-${bin}`.toUpperCase();

  const existingRes = await supabaseAdmin
    .from("warehouse_storage_locations")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (existingRes.error) {
    throw new Error(existingRes.error.message);
  }

  if (existingRes.data) return existingRes.data;

  const insertRes = await supabaseAdmin
    .from("warehouse_storage_locations")
    .insert({
      code,
      zone,
      rack,
      bin,
      is_staging: isStaging,
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (insertRes.error) {
    throw new Error(insertRes.error.message);
  }

  return insertRes.data;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      const recordsRes = await supabaseAdmin
        .from("warehouse_storage_records")
        .select("*")
        .order("updated_at", { ascending: false });

      if (recordsRes.error) {
        return send(res, 500, { error: recordsRes.error.message });
      }

      const records = recordsRes.data || [];
      const locationIds = Array.from(new Set(records.map((r: any) => r.location_id).filter(Boolean)));

      let locations: any[] = [];
      if (locationIds.length) {
        const locationsRes = await supabaseAdmin
          .from("warehouse_storage_locations")
          .select("*")
          .in("id", locationIds);

        if (locationsRes.error) {
          return send(res, 500, { error: locationsRes.error.message });
        }

        locations = locationsRes.data || [];
      }

      const locationMap = new Map(locations.map((row: any) => [row.id, row]));

      const items = records.map((row: any) => {
        const loc = locationMap.get(row.location_id);
        return {
          id: row.id,
          trackingNo: row.tracking_no,
          zone: loc?.zone || "",
          rack: loc?.rack || "",
          bin: loc?.bin || "",
          phase: row.phase,
          status: row.status,
          updatedAt: row.updated_at,
          notes: row.notes || "",
        };
      });

      return send(res, 200, items);
    }

    if (req.method === "POST") {
      const body = parseBody(req);

      const action = String(body?.action || "");
      const trackingNo = String(body?.tracking_no || "").trim();
      const zone = String(body?.zone || "").trim();
      const rack = String(body?.rack || "").trim();
      const bin = String(body?.bin || "").trim();
      const note = String(body?.note || "").trim();

      if (!trackingNo) {
        return send(res, 400, { error: "tracking_no is required" });
      }

      const existingRes = await supabaseAdmin
        .from("warehouse_storage_records")
        .select("*")
        .eq("tracking_no", trackingNo)
        .maybeSingle();

      if (existingRes.error) {
        return send(res, 500, { error: existingRes.error.message });
      }

      const existing = existingRes.data;
      const fromLocationId = existing?.location_id || null;

      let nextPhase = existing?.phase || "inbound";
      let nextStatus = existing?.status || "received";
      let locationId: string | null = existing?.location_id || null;

      if (action === "move_to_staging") {
        if (!zone || !rack || !bin) {
          return send(res, 400, { error: "zone, rack, and bin are required" });
        }
        const loc = await getOrCreateLocation(zone, rack, bin, true);
        locationId = loc.id;
        nextPhase = "staging";
        nextStatus = "staging";
      } else if (action === "move_to_storage") {
        if (!zone || !rack || !bin) {
          return send(res, 400, { error: "zone, rack, and bin are required" });
        }
        const loc = await getOrCreateLocation(zone, rack, bin, false);
        locationId = loc.id;
        nextPhase = "storage";
        nextStatus = "stored";
      } else if (action === "mark_ready_for_dispatch") {
        nextPhase = "outbound";
        nextStatus = "ready_for_dispatch";
      } else if (action === "relocate") {
        if (!zone || !rack || !bin) {
          return send(res, 400, { error: "zone, rack, and bin are required" });
        }
        const loc = await getOrCreateLocation(zone, rack, bin, false);
        locationId = loc.id;
        nextPhase = existing?.phase || "storage";
        nextStatus = "stored";
      } else {
        return send(res, 400, { error: "Unsupported action" });
      }

      let saved: any = null;

      if (existing) {
        const updateRes = await supabaseAdmin
          .from("warehouse_storage_records")
          .update({
            location_id: locationId,
            phase: nextPhase,
            status: nextStatus,
            notes: note || existing.notes,
            last_scan_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select("*")
          .single();

        if (updateRes.error) {
          return send(res, 500, { error: updateRes.error.message });
        }

        saved = updateRes.data;
      } else {
        const insertRes = await supabaseAdmin
          .from("warehouse_storage_records")
          .insert({
            tracking_no: trackingNo,
            location_id: locationId,
            phase: nextPhase,
            status: nextStatus,
            notes: note || null,
            last_scan_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select("*")
          .single();

        if (insertRes.error) {
          return send(res, 500, { error: insertRes.error.message });
        }

        saved = insertRes.data;
      }

      const eventRes = await supabaseAdmin.from("warehouse_storage_events").insert({
        record_id: saved.id,
        tracking_no: trackingNo,
        from_location_id: fromLocationId,
        to_location_id: saved.location_id,
        event_type: action,
        note: note || null,
        actor_id: "system",
        created_at: new Date().toISOString(),
      });

      if (eventRes.error) {
        return send(res, 500, { error: eventRes.error.message });
      }

      return send(res, 200, {
        id: saved.id,
        tracking_no: saved.tracking_no,
        phase: saved.phase,
        status: saved.status,
        location_id: saved.location_id,
      });
    }

    return send(res, 405, { error: "Method not allowed" });
  } catch (error: any) {
    console.error("[warehouse/storage]", error);
    return send(res, 500, { error: error?.message || "Storage API failed" });
  }
}
