import { supabase } from "@/integrations/supabase/client";

export type OperationalQueueName =
  | "cs"
  | "supervisor"
  | "rider"
  | "dataEntry"
  | "warehouse"
  | "wayplan"
  | "dispatch"
  | "finance"
  | "chain";

const VIEW_BY_QUEUE: Record<OperationalQueueName, string> = {
  cs: "be_v_cs_pickup_queue",
  supervisor: "be_v_supervisor_pickup_queue",
  rider: "be_v_rider_jobs",
  dataEntry: "be_v_data_entry_queue",
  warehouse: "be_v_warehouse_queue",
  wayplan: "be_v_wayplan_queue",
  dispatch: "be_v_dispatch_queue",
  finance: "be_v_finance_cod_queue",
  chain: "be_v_operational_chain",
};

export async function loadOperationalQueue(queue: OperationalQueueName, limit = 100) {
  const view = VIEW_BY_QUEUE[queue];

  const { data, error } = await supabase
    .from(view)
    .select("*")
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function assignPickup(input: {
  pickupId: string;
  riderEmail: string;
  driverEmail?: string;
  helperEmail?: string;
  vehicleId?: string;
  actorEmail: string;
}) {
  const { data, error } = await supabase.rpc("be_supervisor_assign_pickup", {
    p_pickup_id: input.pickupId,
    p_rider_email: input.riderEmail,
    p_driver_email: input.driverEmail || null,
    p_helper_email: input.helperEmail || null,
    p_vehicle_id: input.vehicleId || null,
    p_actor_email: input.actorEmail,
  });

  if (error) throw error;
  return data;
}

export async function riderMarkCollected(input: {
  pickupId: string;
  collectedParcels: number;
  actorEmail: string;
  note?: string;
}) {
  const { data, error } = await supabase.rpc("be_rider_mark_pickup_collected", {
    p_pickup_id: input.pickupId,
    p_collected_parcels: input.collectedParcels,
    p_actor_email: input.actorEmail,
    p_note: input.note || "Rider collected pickup",
  });

  if (error) throw error;
  return data;
}

export async function createWaybill(input: {
  pickupId: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  destinationCity: string;
  destinationTownship: string;
  codAmount: number;
  actorEmail: string;
}) {
  const { data, error } = await supabase.rpc("be_data_entry_create_waybill", {
    p_pickup_id: input.pickupId,
    p_waybill_no: null,
    p_receiver_name: input.receiverName,
    p_receiver_phone: input.receiverPhone,
    p_receiver_address: input.receiverAddress,
    p_destination_city: input.destinationCity,
    p_destination_township: input.destinationTownship,
    p_cod_amount: input.codAmount,
    p_actor_email: input.actorEmail,
  });

  if (error) throw error;
  return data;
}

export async function warehouseReceive(input: {
  waybillNo: string;
  actorEmail: string;
  branchCode?: string;
  note?: string;
}) {
  const { data, error } = await supabase.rpc("be_warehouse_receive_waybill", {
    p_waybill_no: input.waybillNo,
    p_actor_email: input.actorEmail,
    p_branch_code: input.branchCode || "YGN",
    p_note: input.note || "Warehouse received",
  });

  if (error) throw error;
  return data;
}

export async function createWayplanForWaybill(input: {
  waybillNo: string;
  branchCode?: string;
  routeCode?: string;
  routeName?: string;
  vehicleId?: string;
  riderEmail?: string;
  driverEmail?: string;
  helperEmail?: string;
  actorEmail: string;
}) {
  const { data, error } = await supabase.rpc("be_wayplan_create_for_waybill", {
    p_waybill_no: input.waybillNo,
    p_branch_code: input.branchCode || "YGN",
    p_route_code: input.routeCode || "ROUTE",
    p_route_name: input.routeName || null,
    p_dispatch_date: new Date().toISOString().slice(0, 10),
    p_vehicle_id: input.vehicleId || null,
    p_rider_email: input.riderEmail || null,
    p_driver_email: input.driverEmail || null,
    p_helper_email: input.helperEmail || null,
    p_actor_email: input.actorEmail,
  });

  if (error) throw error;
  return data;
}

export async function dispatchStart(input: {
  wayplanId: string;
  actorEmail: string;
}) {
  const { data, error } = await supabase.rpc("be_dispatch_start_wayplan", {
    p_wayplan_id: input.wayplanId,
    p_actor_email: input.actorEmail,
  });

  if (error) throw error;
  return data;
}

export async function markDelivered(input: {
  waybillNo: string;
  collectedCodAmount: number;
  actorEmail: string;
}) {
  const { data, error } = await supabase.rpc("be_dispatch_mark_delivered", {
    p_waybill_no: input.waybillNo,
    p_collected_cod_amount: input.collectedCodAmount,
    p_actor_email: input.actorEmail,
  });

  if (error) throw error;
  return data;
}

export async function settleCod(input: {
  waybillNo: string;
  settledAmount: number;
  method?: string;
  referenceNo?: string;
  actorEmail: string;
}) {
  const { data, error } = await supabase.rpc("be_finance_settle_cod", {
    p_waybill_no: input.waybillNo,
    p_settled_amount: input.settledAmount,
    p_settlement_method: input.method || "CASH_HANDOVER",
    p_reference_no: input.referenceNo || null,
    p_actor_email: input.actorEmail,
  });

  if (error) throw error;
  return data;
}
