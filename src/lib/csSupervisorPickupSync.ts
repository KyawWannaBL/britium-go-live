import { supabase } from "@/integrations/supabase/client";

export type CsPickupPayload = {
  pickup_way_id?: string;
  pickup_id?: string;
  request_code?: string;
  merchant_code?: string;
  merchant_name?: string;
  pickup_address?: string;
  township?: string;
  city?: string;
  branch_code?: string;
  expected_parcels?: number;
};

export type SupervisorAssignPayload = {
  pickup_id: string;
  rider_email?: string;
  driver_email?: string;
  helper_email?: string;
  vehicle_id?: string;
  actor_email?: string;
};

function rowsFrom(value: any) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.queue)) return value.queue;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.wayplans)) return value.wayplans;
  return [];
}

export async function createCsPickupOrder(payload: CsPickupPayload) {
  const { data, error } = await (supabase as any).rpc("be_cs_create_pickup_request", {
    p_payload: payload,
  });

  if (error) throw error;
  return data;
}

export async function loadSupervisorPickupQueue() {
  const attempts = [
    async () => {
      const { data, error } = await (supabase as any).rpc("be_supervisor_assignment_snapshot");
      if (error) throw error;
      return rowsFrom(data);
    },
    async () => {
      const { data, error } = await (supabase as any).rpc("be_supervisor_pending_pickup_requests");
      if (error) throw error;
      return rowsFrom(data);
    },
    async () => {
      const { data, error } = await (supabase as any)
        .from("be_portal_pickup_requests")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      return rowsFrom(data);
    },
  ];

  let lastError: any = null;

  for (const attempt of attempts) {
    try {
      const rows = await attempt();
      if (rows.length) return rows;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return [];
}

export async function assignSupervisorPickup(payload: SupervisorAssignPayload) {
  const { data, error } = await (supabase as any).rpc("be_supervisor_assign_pickup", {
    p_pickup_id: payload.pickup_id,
    p_rider_email: payload.rider_email || null,
    p_driver_email: payload.driver_email || null,
    p_helper_email: payload.helper_email || null,
    p_vehicle_id: payload.vehicle_id || null,
    p_actor_email: payload.actor_email || null,
  });

  if (error) throw error;
  return data;
}

export async function loadSupervisorWayplanFromPickupRequests() {
  const { data, error } = await (supabase as any).rpc("be_supervisor_wayplan_snapshot");
  if (error) throw error;
  return rowsFrom(data);
}

export function subscribeCsSupervisorPickupSync(onChange: () => void) {
  const channel = supabase
    .channel("cs-supervisor-pickup-sync")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "be_portal_pickup_requests" },
      onChange,
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
