import { supabase } from "@/integrations/supabase/client";

export async function getLiveDispatchWayplanBoard(payload: Record<string, any> = {}) {
  const { data, error } = await supabase.rpc("be_get_live_dispatch_wayplan_board", {
    p_payload: payload,
  });

  if (error) throw error;
  return data;
}

export async function assignLiveDispatchWayplan(payload: Record<string, any>) {
  const { data, error } = await supabase.rpc("be_assign_live_dispatch_wayplan", {
    p_payload: payload,
  });

  if (error) throw error;
  return data;
}
