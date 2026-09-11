import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

export async function GET() {
  const { data, error } = await supabase
    .from("warehouse_outbound_batches")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body?.action || "");

    if (action === "queue_batch") {
      const { batch_no, destination_name, vehicle_no, driver_name, total_parcels } = body;

      const { data, error } = await supabase
        .from("warehouse_outbound_batches")
        .insert({
          batch_no,
          destination_name,
          vehicle_no: vehicle_no || null,
          driver_name: driver_name || null,
          total_parcels: Number(total_parcels || 0),
          status: "queued",
        })
        .select("*")
        .single();

      if (error) throw error;
      return NextResponse.json(data);
    }

    if (action === "dispatch_batch") {
      const batchId = String(body?.batch_id || "");
      if (!batchId) {
        return NextResponse.json({ error: "batch_id is required" }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("warehouse_outbound_batches")
        .update({
          status: "dispatched",
          dispatched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", batchId)
        .select("*")
        .single();

      if (error) throw error;
      return NextResponse.json(data);
    }

    if (action === "hold_batch") {
      const batchId = String(body?.batch_id || "");
      const { data, error } = await supabase
        .from("warehouse_outbound_batches")
        .update({
          status: "hold",
          updated_at: new Date().toISOString(),
        })
        .eq("id", batchId)
        .select("*")
        .single();

      if (error) throw error;
      return NextResponse.json(data);
    }

    if (action === "attach_manifest") {
      const batchId = String(body?.batch_id || "");
      const manifestId = String(body?.manifest_id || "");

      const { data, error } = await supabase
        .from("warehouse_outbound_batches")
        .update({
          manifest_id: manifestId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", batchId)
        .select("*")
        .single();

      if (error) throw error;
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Outbound update failed" }, { status: 500 });
  }
}