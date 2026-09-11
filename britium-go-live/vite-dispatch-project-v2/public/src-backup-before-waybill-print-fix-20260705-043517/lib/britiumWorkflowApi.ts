// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";

function requireOk(data: any, error: any, label: string) {
  if (error) throw error;
  if (data && data.ok === false) throw new Error(data.message || `${label} failed`);
  return data;
}

export const britiumWorkflowApi = {
  async submitPickupRequest(payload: any, sourcePortal = "CUSTOMER_SERVICE") {
    const { data, error } = await supabase.rpc("be_unified_submit_pickup_request", {
      p_request: {
        ...payload,
        source_portal: sourcePortal,
        requester_type: payload.requester_type || sourcePortal.toLowerCase(),
      },
    });
    return requireOk(data, error, "Submit pickup request");
  },

  async generateDeliveryLines(payload: any) {
    const { data, error } = await supabase.rpc("be_data_entry_generate_delivery_lines", {
      p_payload: payload,
    });
    return requireOk(data, error, "Generate delivery lines");
  },

  async assignPickupResources(payload: {
    pickup_id: string;
    rider_code: string;
    driver_code?: string | null;
    helper_code?: string | null;
    vehicle_code?: string | null;
    supervisor_note?: string | null;
  }) {
    const { data, error } = await supabase.rpc("be_supervisor_assign_pickup_resources", {
      p_pickup_id: payload.pickup_id,
      p_rider_code: payload.rider_code,
      p_driver_code: payload.driver_code || null,
      p_helper_code: payload.helper_code || null,
      p_vehicle_code: payload.vehicle_code || null,
      p_supervisor_note: payload.supervisor_note || null,
    });
    return requireOk(data, error, "Assign pickup resources");
  },

  async emitWorkflowEvent(event: any) {
    const { data, error } = await supabase.rpc("be_workflow_emit_event", {
      p_event: event,
    });
    return requireOk(data, error, "Emit workflow event");
  },

  async loadPickupRequests(limit = 300) {
    const { data, error } = await supabase
      .from("be_portal_pickup_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  async loadDeliveryLines(pickupIds: string[]) {
    if (!pickupIds.length) return [];

    const { data, error } = await supabase
      .from("be_portal_pickup_request_items")
      .select("*")
      .in("pickup_id", pickupIds)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async loadNotifications(targetRoles: string[], limit = 50) {
    const { data, error } = await supabase
      .from("be_app_notifications")
      .select("*")
      .in("target_role", targetRoles)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  async loadCargoEvents(pickupId: string) {
    const { data, error } = await supabase
      .from("be_portal_cargo_events")
      .select("*")
      .eq("pickup_id", pickupId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return data || [];
  },
};

export default britiumWorkflowApi;
