// Rider/Driver app production dispatch wiring
// Use this in RiderDashboardPage / AssignedDeliveryRoutePage to read the same source
// as Dispatch Command Center. No mock/demo data.

import { supabase } from "@/integrations/supabase/client";

export async function loadRiderDispatchJobs(currentUserEmail?: string) {
  let query = supabase
    .from("be_v_rider_dispatch_jobs")
    .select("*")
    .order("asset_code", { ascending: true })
    .order("parcel_sequence", { ascending: true });

  // If your rider accounts are mapped by rider_email or driver_email, enable this filter.
  if (currentUserEmail) {
    query = query.or(`rider_email.eq.${currentUserEmail},driver_email.eq.${currentUserEmail},helper_email.eq.${currentUserEmail}`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function markDispatchJobDone(trackingNo: string, actorEmail: string) {
  const { data, error } = await supabase.rpc("be_driver_update_delivery_status", {
    p_tracking_no: trackingNo,
    p_status: "DONE",
    p_actor_email: actorEmail,
    p_note: null,
  });
  if (error) throw error;
  return data;
}

export async function markDispatchJobFailed(trackingNo: string, reason: string, actorEmail: string) {
  const { data, error } = await supabase.rpc("be_driver_update_delivery_status", {
    p_tracking_no: trackingNo,
    p_status: "FAIL",
    p_actor_email: actorEmail,
    p_note: reason,
  });
  if (error) throw error;
  return data;
}

export async function markDispatchJobRto(trackingNo: string, reason: string, actorEmail: string) {
  const { data, error } = await supabase.rpc("be_driver_update_delivery_status", {
    p_tracking_no: trackingNo,
    p_status: "RTO",
    p_actor_email: actorEmail,
    p_note: reason,
  });
  if (error) throw error;
  return data;
}
