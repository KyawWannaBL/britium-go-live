import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

async function getOrCreateLocation(zone: string, rack: string, bin: string, isStaging = false) {
  const code = `${zone}-${rack}-${bin}`.toUpperCase();

  const { data: existing } = await supabase
    .from("warehouse_storage_locations")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabase
    .from("warehouse_storage_locations")
    .insert({
      code,
      zone,
      rack,
      bin,
      is_staging: isStaging,
      active: true,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function GET() {
  const { data: records, error } = await supabase
    .from("warehouse_storage_records")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const locationIds = Array.from(
    new Set((records || []).map((r: any) => r.location_id).filter(Boolean))
  );

  let locations: any[] = [];
  if (locationIds.length) {
    const { data } = await supabase
      .from("warehouse_storage_locations")
      .select("*")
      .in("id", locationIds);
    locations = data || [];
  }

  const locationMap = new Map(locations.map((row) => [row.id, row]));

  const items = (records || []).map((row: any) => {
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

  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const action = String(body?.action || "");
    const trackingNo = String(body?.tracking_no || "").trim();
    const zone = String(body?.zone || "").trim();
    const rack = String(body?.rack || "").trim();
    const bin = String(body?.bin || "").trim();
    const note = String(body?.note || "").trim();

    if (!trackingNo) {
      return NextResponse.json({ error: "tracking_no is required" }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("warehouse_storage_records")
      .select("*")
      .eq("tracking_no", trackingNo)
      .maybeSingle();

    const fromLocationId = existing?.location_id || null;

    let nextPhase = existing?.phase || "inbound";
    let nextStatus = existing?.status || "received";
    let locationId: string | null = existing?.location_id || null;

    if (action === "move_to_staging") {
      if (!zone || !rack || !bin) {
        return NextResponse.json({ error: "zone, rack, and bin are required" }, { status: 400 });
      }
      const loc = await getOrCreateLocation(zone, rack, bin, true);
      locationId = loc.id;
      nextPhase = "staging";
      nextStatus = "staging";
    } else if (action === "move_to_storage") {
      if (!zone || !rack || !bin) {
        return NextResponse.json({ error: "zone, rack, and bin are required" }, { status: 400 });
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
        return NextResponse.json({ error: "zone, rack, and bin are required" }, { status: 400 });
      }
      const loc = await getOrCreateLocation(zone, rack, bin, false);
      locationId = loc.id;
      nextPhase = existing?.phase || "storage";
      nextStatus = "stored";
    } else {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    let saved: any = null;

    if (existing) {
      const { data, error } = await supabase
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

      if (error) throw error;
      saved = data;
    } else {
      const { data, error } = await supabase
        .from("warehouse_storage_records")
        .insert({
          tracking_no: trackingNo,
          location_id: locationId,
          phase: nextPhase,
          status: nextStatus,
          notes: note || null,
          last_scan_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (error) throw error;
      saved = data;
    }

    await supabase.from("warehouse_storage_events").insert({
      record_id: saved.id,
      tracking_no: trackingNo,
      from_location_id: fromLocationId,
      to_location_id: saved.location_id,
      event_type: action,
      note: note || null,
      actor_id: "system",
    });

    return NextResponse.json({
      id: saved.id,
      tracking_no: saved.tracking_no,
      phase: saved.phase,
      status: saved.status,
      location_id: saved.location_id,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Storage update failed" }, { status: 500 });
  }
}