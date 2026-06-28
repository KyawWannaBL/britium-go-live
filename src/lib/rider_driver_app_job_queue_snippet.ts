// rider_driver_app_job_queue_snippet.ts
// Use this in the rider/driver/helper app after login.
// It reads only jobs assigned to the logged-in mobile workforce account.

import { supabase } from "@/integrations/supabase/client";

export async function loadMyMobileJobs() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;

  const email = userData.user?.email;
  if (!email) return [];

  const { data, error } = await (supabase as any)
    .from("be_v_mobile_workforce_jobs")
    .select("*")
    .eq("workforce_email", email)
    .order("assigned_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function riderMarkCollected(pickupId: string, collectedParcels: number, note = "Rider collected pickup") {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;

  const actorEmail = userData.user?.email;
  if (!actorEmail) throw new Error("No logged-in rider/driver/helper email found.");

  const { data, error } = await (supabase as any).rpc("be_rider_mark_pickup_collected", {
    p_pickup_id: pickupId,
    p_collected_parcels: collectedParcels,
    p_actor_email: actorEmail,
    p_note: note,
  });

  if (error) throw error;
  return data;
}

// Expected app flow:
// Supervisor assigns pickup P0620-APA-030 to testrider@britiumexpress.com
// Rider app login = testrider@britiumexpress.com
// loadMyMobileJobs() returns P0620-APA-030
// riderMarkCollected("P0620-APA-030", 30)
