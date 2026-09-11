import { supabase } from "@/integrations/supabase/client";

export type ManifestRecord = {
  id: number;
  status: string;
  version: number;
  assigned_rider_id: string | null;
  vehicle_id: string | null;
  accepted_at: string | null;
  [key: string]: unknown;
};

export type DeliveryRecord = {
  id: string;
  manifest_id: number;
  status: string;
  version: number;
  delivered_at: string | null;
  completed_by: string | null;
  [key: string]: unknown;
};

function unwrap<T>(data: T | null, error: { message?: string } | null): T {
  if (error) throw new Error(error.message || "Supabase workflow operation failed");
  if (!data) throw new Error("Supabase workflow operation returned no data");
  return data;
}

export async function assignManifest(input: {
  manifestId: number;
  riderId: string;
  vehicleId: string;
  expectedVersion: number;
}): Promise<ManifestRecord> {
  const { data, error } = await supabase.rpc("assign_manifest", {
    p_manifest_id: input.manifestId,
    p_rider_id: input.riderId,
    p_vehicle_id: input.vehicleId,
    p_expected_version: input.expectedVersion,
  });
  return unwrap(data as ManifestRecord | null, error);
}

export async function acceptManifest(input: {
  manifestId: number;
  expectedVersion: number;
}): Promise<ManifestRecord> {
  const { data, error } = await supabase.rpc("accept_manifest", {
    p_manifest_id: input.manifestId,
    p_expected_version: input.expectedVersion,
  });
  return unwrap(data as ManifestRecord | null, error);
}

export async function completeDelivery(input: {
  deliveryId: string;
  operationId: string;
  expectedVersion: number;
  deviceTimestamp?: string | null;
}): Promise<DeliveryRecord> {
  const { data, error } = await supabase.rpc("complete_delivery", {
    p_delivery_id: input.deliveryId,
    p_operation_id: input.operationId,
    p_expected_version: input.expectedVersion,
    p_device_timestamp: input.deviceTimestamp || new Date().toISOString(),
  });
  return unwrap(data as DeliveryRecord | null, error);
}
