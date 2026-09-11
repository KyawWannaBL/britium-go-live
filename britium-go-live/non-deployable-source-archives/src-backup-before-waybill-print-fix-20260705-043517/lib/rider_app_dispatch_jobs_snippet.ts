// Rider / Driver app canonical dispatch job source.
// Use this for rider dashboard / assigned delivery route pages.

import { supabase } from "@/integrations/supabase/client";

export async function loadRiderDispatchJobs(currentUserEmail: string) {
  const { data, error } = await supabase
    .from("be_v_rider_dispatch_jobs")
    .select("*")
    .or(`driver_email.eq.${currentUserEmail},rider_email.eq.${currentUserEmail},helper_email.eq.${currentUserEmail}`)
    .order("wayplan_code", { ascending: true })
    .order("parcel_sequence", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function updateRiderDeliveryStatus(
  trackingNo: string,
  status: "DONE" | "FAIL" | "OUT_FOR_DELIVERY",
  currentUserEmail: string,
  note = ""
) {
  const { data, error } = await supabase.rpc("be_driver_update_delivery_status", {
    p_tracking_no: trackingNo,
    p_status: status,
    p_actor_email: currentUserEmail,
    p_note: note,
  });

  if (error) throw error;
  return data;
}
