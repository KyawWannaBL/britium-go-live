import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

export async function GET() {
  const { data: manifests, error } = await supabase
    .from("warehouse_manifests")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const manifestIds = (manifests || []).map((m: any) => m.id);
  let items: any[] = [];

  if (manifestIds.length) {
    const { data } = await supabase
      .from("warehouse_manifest_items")
      .select("*")
      .in("manifest_id", manifestIds);
    items = data || [];
  }

  const countMap = new Map<string, number>();
  items.forEach((item) => {
    countMap.set(item.manifest_id, (countMap.get(item.manifest_id) || 0) + 1);
  });

  return NextResponse.json(
    (manifests || []).map((row: any) => ({
      ...row,
      item_count: countMap.get(row.id) || 0,
    }))
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body?.action || "");

    if (action === "create_manifest") {
      const { manifest_no, destination_name, vehicle_no, driver_name } = body;

      const { data, error } = await supabase
        .from("warehouse_manifests")
        .insert({
          manifest_no,
          destination_name,
          vehicle_no: vehicle_no || null,
          driver_name: driver_name || null,
          status: "open",
          total_parcels: 0,
        })
        .select("*")
        .single();

      if (error) throw error;
      return NextResponse.json(data);
    }

    if (action === "add_items") {
      const manifestId = String(body?.manifest_id || "");
      const trackingNos: string[] = Array.isArray(body?.tracking_nos) ? body.tracking_nos : [];

      if (!manifestId || !trackingNos.length) {
        return NextResponse.json({ error: "manifest_id and tracking_nos are required" }, { status: 400 });
      }

      const { data: storageRows } = await supabase
        .from("warehouse_storage_records")
        .select("*")
        .in("tracking_no", trackingNos);

      const storageMap = new Map((storageRows || []).map((row: any) => [row.tracking_no, row]));

      const payload = trackingNos.map((trackingNo) => ({
        manifest_id: manifestId,
        tracking_no: trackingNo,
        storage_record_id: storageMap.get(trackingNo)?.id || null,
        status: "manifested",
      }));

      const { error: insertError } = await supabase
        .from("warehouse_manifest_items")
        .insert(payload);

      if (insertError) throw insertError;

      await supabase
        .from("warehouse_storage_records")
        .update({
          phase: "outbound",
          status: "manifested",
          updated_at: new Date().toISOString(),
        })
        .in("tracking_no", trackingNos);

      const { count } = await supabase
        .from("warehouse_manifest_items")
        .select("*", { count: "exact", head: true })
        .eq("manifest_id", manifestId);

      await supabase
        .from("warehouse_manifests")
        .update({
          total_parcels: Number(count || 0),
          updated_at: new Date().toISOString(),
        })
        .eq("id", manifestId);

      return NextResponse.json({ manifest_id: manifestId, added: trackingNos.length });
    }

    if (action === "close_manifest") {
      const manifestId = String(body?.manifest_id || "");

      const { data, error } = await supabase
        .from("warehouse_manifests")
        .update({
          status: "closed",
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", manifestId)
        .select("*")
        .single();

      if (error) throw error;
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Manifest update failed" }, { status: 500 });
  }
}