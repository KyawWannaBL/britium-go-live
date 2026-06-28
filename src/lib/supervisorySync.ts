import { supabase } from "@/lib/supabase/client";

export type SupervisorWorkerRole = "RIDER" | "DRIVER" | "HELPER";

export type SupervisorPickupRow = {
  id: string;
  pickup_id: string;
  request_code: string;
  pickup_waybill_id: string;
  waybill_no: string;
  merchant_code: string;
  merchant_name: string;
  pickup_address: string;
  township: string;
  city: string;
  branch_code: string;
  expected_parcels: number;
  pickup_date: string;
  vehicle_type: string;
  pickup_status: string;
  workflow_stage: string;
  supervisor_status: string;
  rider_status: string;
  assigned_rider_email: string;
  assigned_driver_email: string;
  assigned_helper_email: string;
  assigned_rider_code: string;
  assigned_driver_code: string;
  assigned_helper_code: string;
  assigned_vehicle_id: string;
  assigned_fleet_id: string;
  has_unread_notification: boolean;
  created_at: string;
  raw: Record<string, any>;
};

export type SupervisorWorker = {
  id: string;
  code: string;
  email: string;
  name: string;
  role: SupervisorWorkerRole;
  status: string;
  branch_code: string;
  zone: string;
  phone: string;
  raw: Record<string, any>;
};

export type SupervisorFleet = {
  id: string;
  vehicle_no: string;
  vehicle_type: string;
  status: string;
  branch_code: string;
  raw: Record<string, any>;
};

export type SupervisorMasters = {
  riders: SupervisorWorker[];
  drivers: SupervisorWorker[];
  helpers: SupervisorWorker[];
  fleets: SupervisorFleet[];
};

export type SupervisorWayplanRow = {
  id: string;
  wayplan_id: string;
  pickup_id: string;
  waybill_no: string;
  merchant_code: string;
  merchant_name: string;
  route_zone: string;
  pickup_address: string;
  township: string;
  city: string;
  branch_code: string;
  assigned_rider: string;
  assigned_driver: string;
  assigned_helper: string;
  assigned_vehicle: string;
  status: string;
  planned_date: string;
  created_at: string;
  source: string;
  raw: Record<string, any>;
};

export const emptySupervisorMasters: SupervisorMasters = { riders: [], drivers: [], helpers: [], fleets: [] };

export function asText(value: any, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export function workerValue(worker: SupervisorWorker) {
  return worker.email || worker.code || worker.id;
}

export function workerLabel(worker: SupervisorWorker) {
  return [worker.code, worker.name, worker.email, worker.phone].filter(Boolean).join(" - ");
}

export function fleetLabel(fleet: SupervisorFleet) {
  return [fleet.vehicle_no, fleet.vehicle_type, fleet.branch_code].filter(Boolean).join(" - ");
}

export function sameBranchOrAny(masterBranch?: string, pickupBranch?: string) {
  if (!masterBranch || !pickupBranch) return true;
  return masterBranch.toUpperCase() === pickupBranch.toUpperCase();
}

function lower(value: any) {
  return asText(value).toLowerCase();
}

function readRows(value: any): Record<string, any>[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.queue)) return value.queue;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.pickups)) return value.pickups;
  if (Array.isArray(value?.pickup_requests)) return value.pickup_requests;
  if (Array.isArray(value?.wayplans)) return value.wayplans;
  if (Array.isArray(value?.way_plans)) return value.way_plans;
  return [];
}

async function rpc<T = any>(name: string, params?: Record<string, any>): Promise<T> {
  const { data, error } = await (supabase as any).rpc(name, params || {});
  if (error) throw error;
  return data as T;
}

async function tableRows(tableName: string, limit = 500): Promise<Record<string, any>[]> {
  try {
    const { data, error } = await (supabase as any).from(tableName).select("*").limit(limit);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function sortNewest<T extends { created_at?: string; pickup_date?: string; planned_date?: string }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const left = Date.parse(a.created_at || a.pickup_date || a.planned_date || "") || 0;
    const right = Date.parse(b.created_at || b.pickup_date || b.planned_date || "") || 0;
    return right - left;
  });
}

function dateInRange(rowDate: string, fromDate?: string, toDate?: string) {
  const value = asText(rowDate);
  if (!value) return true;
  return (!fromDate || value >= fromDate) && (!toDate || value <= toDate);
}

function normalizePickup(row: Record<string, any>): SupervisorPickupRow {
  const pickupId = asText(row.pickup_id || row.pickup_code || row.pickup_request_id || row.request_code || row.id);
  const requestCode = asText(row.request_code || row.pickup_request_code || row.pickup_id || pickupId);
  const pickupWaybill = asText(row.pickup_waybill_id || row.pickup_way_id || row.waybill_no || row.waybill || pickupId);
  return {
    id: asText(row.id || pickupId || requestCode),
    pickup_id: pickupId,
    request_code: requestCode,
    pickup_waybill_id: pickupWaybill,
    waybill_no: asText(row.waybill_no || row.waybill || pickupWaybill),
    merchant_code: asText(row.merchant_code),
    merchant_name: asText(row.merchant_name || row.customer_name || row.contact_person || row.sender_name),
    pickup_address: asText(row.pickup_address || row.address || row.default_pickup_address || row.sender_address),
    township: asText(row.township || row.pickup_township || row.zone),
    city: asText(row.city || row.pickup_city),
    branch_code: asText(row.branch_code || row.origin_branch_code),
    expected_parcels: Number(row.expected_parcels || row.parcel_count || row.total_parcels || row.qty || 1),
    pickup_date: asText(row.pickup_date || row.requested_pickup_date || row.created_at),
    vehicle_type: asText(row.vehicle_type || row.vehicle_required),
    pickup_status: asText(row.pickup_status || row.status),
    workflow_stage: asText(row.workflow_stage),
    supervisor_status: asText(row.supervisor_status),
    rider_status: asText(row.rider_status),
    assigned_rider_email: asText(row.assigned_rider_email),
    assigned_driver_email: asText(row.assigned_driver_email),
    assigned_helper_email: asText(row.assigned_helper_email),
    assigned_rider_code: asText(row.assigned_rider_code),
    assigned_driver_code: asText(row.assigned_driver_code),
    assigned_helper_code: asText(row.assigned_helper_code),
    assigned_vehicle_id: asText(row.assigned_vehicle_id || row.assigned_fleet_id),
    assigned_fleet_id: asText(row.assigned_fleet_id || row.assigned_vehicle_id),
    has_unread_notification: Boolean(row.has_unread_notification),
    created_at: asText(row.created_at),
    raw: row,
  };
}

function normalizeWorker(row: Record<string, any>, fallbackRole: SupervisorWorkerRole = "RIDER"): SupervisorWorker | null {
  const rawRole = asText(row.role || row.workforce_role || row.employee_type || row.staff_type || fallbackRole).toUpperCase();
  const role: SupervisorWorkerRole = rawRole.includes("DRIVER") ? "DRIVER" : rawRole.includes("HELPER") ? "HELPER" : "RIDER";
  const code = asText(row.workforce_code || row.rider_code || row.driver_code || row.helper_code || row.employee_code || row.rider_id || row.driver_id || row.helper_id || row.employee_id || row.code || row.id);
  const email = asText(row.email || row.user_email || row.login_email || row.auth_email);
  const name = asText(row.full_name || row.display_name || row.rider_name || row.driver_name || row.helper_name || row.employee_name || row.name || email || code);
  if (!code && !email) return null;
  return {
    id: asText(row.id || row.profile_id || row.employee_id || code || email),
    code: code || email,
    email,
    name,
    role,
    status: asText(row.status || row.record_status || row.availability_status || (row.is_active === false ? "Inactive" : "Active")),
    branch_code: asText(row.branch_code),
    zone: asText(row.assigned_zone || row.route_zone || row.zone),
    phone: asText(row.phone_primary || row.phone || row.mobile),
    raw: row,
  };
}

function normalizeFleet(row: Record<string, any>): SupervisorFleet | null {
  const id = asText(row.id || row.fleet_id || row.vehicle_id || row.code || row.vehicle_no);
  const vehicleNo = asText(row.vehicle_no || row.plate || row.plate_no || row.vehicle_plate || row.registration_no || row.license_no || id);
  if (!id && !vehicleNo) return null;
  return {
    id: id || vehicleNo,
    vehicle_no: vehicleNo,
    vehicle_type: asText(row.vehicle_type || row.type || row.category),
    status: asText(row.status || row.fleet_status || row.availability_status || (row.is_active === false ? "Inactive" : "Available")),
    branch_code: asText(row.branch_code),
    raw: row,
  };
}

function normalizeWayplan(row: Record<string, any>, source = "backend"): SupervisorWayplanRow {
  const pickupId = asText(row.pickup_id || row.pickup_code || row.pickup_request_id || row.request_code || row.id);
  const wayplanId = asText(row.wayplan_id || row.way_plan_id || row.plan_id || row.route_plan_id || row.id || pickupId);
  const vehicle = asText(row.assigned_vehicle_id || row.assigned_fleet_id || row.vehicle_no || row.vehicle_plate || row.fleet_code);
  return {
    id: asText(row.id || wayplanId || pickupId),
    wayplan_id: wayplanId,
    pickup_id: pickupId,
    waybill_no: asText(row.waybill_no || row.pickup_waybill_id || row.pickup_way_id),
    merchant_code: asText(row.merchant_code),
    merchant_name: asText(row.merchant_name || row.customer_name || row.sender_name),
    route_zone: asText(row.route_zone || row.zone || row.assigned_zone || row.township || row.pickup_township),
    pickup_address: asText(row.pickup_address || row.address || row.sender_address),
    township: asText(row.township || row.pickup_township || row.zone),
    city: asText(row.city || row.pickup_city),
    branch_code: asText(row.branch_code || row.origin_branch_code),
    assigned_rider: asText(row.assigned_rider_email || row.assigned_rider_code || row.rider_email || row.rider_code),
    assigned_driver: asText(row.assigned_driver_email || row.assigned_driver_code || row.driver_email || row.driver_code),
    assigned_helper: asText(row.assigned_helper_email || row.assigned_helper_code || row.helper_email || row.helper_code),
    assigned_vehicle: vehicle,
    status: asText(row.wayplan_status || row.plan_status || row.supervisor_status || row.pickup_status || row.status || "PENDING"),
    planned_date: asText(row.planned_date || row.pickup_date || row.requested_pickup_date || row.created_at),
    created_at: asText(row.created_at),
    source,
    raw: row,
  };
}

function isActiveStatus(status: string) {
  return !["INACTIVE", "SUSPENDED", "BLACKLISTED", "MAINTENANCE", "UNAVAILABLE", "DELETED", "TERMINATED"].includes(asText(status).toUpperCase());
}

function dedupeBy<T>(rows: T[], keyFn: (row: T) => string) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = keyFn(row).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function loadSupervisorPickupQueue(params: { fromDate?: string; toDate?: string } = {}): Promise<SupervisorPickupRow[]> {
  const loaders = [
    async () => readRows(await rpc("be_supervisor_assignment_snapshot")),
    async () => readRows(await rpc("be_supervisor_pending_pickup_requests")),
    async () => readRows(await rpc("be_supervisor_pickup_snapshot")),
    async () => tableRows("be_v_supervisor_pickup_queue", 500),
    async () => tableRows("be_portal_pickup_requests", 500),
  ];

  for (const load of loaders) {
    try {
      const rows = await load();
      if (rows.length) {
        return sortNewest(rows.map(normalizePickup).filter((row) => dateInRange(row.pickup_date || row.created_at, params.fromDate, params.toDate)));
      }
    } catch {
      // Try the next supported source.
    }
  }

  return [];
}

export async function loadSupervisorMasters(): Promise<SupervisorMasters> {
  let workforceRows: Record<string, any>[] = [];
  let fleetRows: Record<string, any>[] = [];

  try {
    const snapshot: any = await rpc("be_operational_master_snapshot");
    workforceRows = [
      ...(snapshot?.workforce || []),
      ...(snapshot?.workforce_accounts || []),
      ...(snapshot?.riders || []).map((row: Record<string, any>) => ({ ...row, role: "RIDER" })),
      ...(snapshot?.drivers || []).map((row: Record<string, any>) => ({ ...row, role: "DRIVER" })),
      ...(snapshot?.helpers || []).map((row: Record<string, any>) => ({ ...row, role: "HELPER" })),
    ];
    fleetRows = [...(snapshot?.fleets || []), ...(snapshot?.vehicles || [])];
  } catch {
    // Keep trying fallback sources.
  }

  if (!workforceRows.length) {
    try {
      workforceRows = readRows(await rpc("be_assignable_pickup_workforce"));
    } catch {
      workforceRows = [];
    }
  }

  if (!workforceRows.length) {
    workforceRows = await tableRows("be_mobile_workforce_accounts", 500);
  }

  if (!workforceRows.length) {
    try {
      const snapshot: any = await rpc("be_master_data_page_snapshot");
      workforceRows = [
        ...(snapshot?.workforce || []),
        ...(snapshot?.workforce_accounts || []),
        ...(snapshot?.riders || []).map((row: Record<string, any>) => ({ ...row, role: "RIDER" })),
        ...(snapshot?.drivers || []).map((row: Record<string, any>) => ({ ...row, role: "DRIVER" })),
        ...(snapshot?.helpers || []).map((row: Record<string, any>) => ({ ...row, role: "HELPER" })),
        ...(snapshot?.Rider_Master || []).map((row: Record<string, any>) => ({ ...row, role: "RIDER" })),
        ...(snapshot?.Driver_Master || []).map((row: Record<string, any>) => ({ ...row, role: "DRIVER" })),
        ...(snapshot?.Helper_Master || []).map((row: Record<string, any>) => ({ ...row, role: "HELPER" })),
      ];
      fleetRows = fleetRows.length ? fleetRows : [...(snapshot?.fleets || []), ...(snapshot?.vehicles || []), ...(snapshot?.Fleet_Master || [])];
    } catch {
      // Keep empty arrays; UI will report the missing source.
    }
  }

  if (!fleetRows.length) {
    for (const tableName of ["be_fleet_master", "be_fleet_vehicles", "fleet_master", "vehicle_master", "vehicles", "fleet_vehicles"]) {
      const rows = await tableRows(tableName, 500);
      if (rows.length) {
        fleetRows = rows;
        break;
      }
    }
  }

  const workers = dedupeBy(
    workforceRows.map((row) => normalizeWorker(row)).filter(Boolean) as SupervisorWorker[],
    (row) => row.email || row.code || row.id,
  ).filter((row) => isActiveStatus(row.status));

  return {
    riders: workers.filter((row) => row.role === "RIDER"),
    drivers: workers.filter((row) => row.role === "DRIVER"),
    helpers: workers.filter((row) => row.role === "HELPER"),
    fleets: dedupeBy(fleetRows.map(normalizeFleet).filter(Boolean) as SupervisorFleet[], (row) => row.id || row.vehicle_no).filter((row) => isActiveStatus(row.status)),
  };
}

export async function loadSupervisorWayplans(): Promise<SupervisorWayplanRow[]> {
  const loaders = [
    async () => ({ source: "be_supervisor_wayplan_snapshot", rows: readRows(await rpc("be_supervisor_wayplan_snapshot")) }),
    async () => ({ source: "be_wayplan_supervisor_snapshot", rows: readRows(await rpc("be_wayplan_supervisor_snapshot")) }),
    async () => ({ source: "be_way_management_snapshot", rows: readRows(await rpc("be_way_management_snapshot")) }),
    async () => ({ source: "be_v_supervisor_wayplan", rows: await tableRows("be_v_supervisor_wayplan", 500) }),
    async () => ({ source: "be_way_plans", rows: await tableRows("be_way_plans", 500) }),
    async () => ({ source: "be_way_management", rows: await tableRows("be_way_management", 500) }),
  ];

  for (const load of loaders) {
    try {
      const { source, rows } = await load();
      if (rows.length) return sortNewest(rows.map((row) => normalizeWayplan(row, source)));
    } catch {
      // Try the next supported source.
    }
  }

  const pickups = await loadSupervisorPickupQueue();
  return sortNewest(
    pickups.map((pickup) =>
      normalizeWayplan(
        {
          ...pickup.raw,
          pickup_id: pickup.pickup_id,
          wayplan_id: pickup.pickup_waybill_id || pickup.waybill_no || pickup.pickup_id,
          route_zone: pickup.township || pickup.branch_code,
          assigned_rider_email: pickup.assigned_rider_email || pickup.assigned_rider_code,
          assigned_driver_email: pickup.assigned_driver_email || pickup.assigned_driver_code,
          assigned_helper_email: pickup.assigned_helper_email || pickup.assigned_helper_code,
          assigned_vehicle_id: pickup.assigned_vehicle_id || pickup.assigned_fleet_id,
          wayplan_status: pickup.supervisor_status || pickup.pickup_status || "PICKUP_QUEUE",
        },
        "pickup_queue_fallback",
      ),
    ),
  );
}

export async function getSupervisorActorEmail() {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.email || "supervisor@britiumexpress.com";
  } catch {
    return "supervisor@britiumexpress.com";
  }
}

export async function assignSupervisorPickup(input: {
  pickup: SupervisorPickupRow;
  rider: SupervisorWorker;
  driver?: SupervisorWorker | null;
  helper?: SupervisorWorker | null;
  fleet?: SupervisorFleet | null;
  note?: string;
}) {
  const actorEmail = await getSupervisorActorEmail();
  const note = input.note?.trim() || null;

  try {
    return await rpc("be_supervisor_assign_pickup", {
      p_pickup_id: input.pickup.pickup_id,
      p_rider_email: input.rider.email || input.rider.code,
      p_driver_email: input.driver?.email || input.driver?.code || null,
      p_helper_email: input.helper?.email || input.helper?.code || null,
      p_vehicle_id: input.fleet?.id || null,
      p_actor_email: actorEmail,
    });
  } catch (error: any) {
    if (error?.code !== "42883" && !/does not exist/i.test(error?.message || "")) throw error;
  }

  if (input.rider.code) {
    try {
      return await rpc("be_assign_pickup_request_by_rider_code", {
        p_request_code: input.pickup.request_code || input.pickup.pickup_id,
        p_rider_code: input.rider.code,
        p_assigned_vehicle_id: input.fleet?.id || null,
        p_assignment_note: note,
        p_actor_registry_id: null,
      });
    } catch (error: any) {
      if (error?.code !== "42883" && !/does not exist/i.test(error?.message || "")) throw error;
    }
  }

  return await rpc("be_assign_pickup_field_team", {
    p_pickup_id: input.pickup.pickup_id || input.pickup.request_code,
    p_rider_code: input.rider.code || null,
    p_driver_code: input.driver?.code || null,
    p_helper_code: input.helper?.code || null,
    p_vehicle_plate: input.fleet?.vehicle_no || input.fleet?.id || null,
    p_supervisor_note: note,
  });
}

export async function markSupervisorPickupNotificationRead(pickupId: string) {
  try {
    await (supabase as any)
      .from("be_app_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("recipient_role", "supervisor")
      .eq("notification_type", "PICKUP_REQUESTED")
      .eq("pickup_id", pickupId);
  } catch {
    // Notification acknowledgement should not block assignment.
  }
}

export function subscribeSupervisorSync(onChange: () => void) {
  const channel = supabase
    .channel("supervisor-pickup-wayplan-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "be_portal_pickup_requests" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "be_app_notifications" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "be_mobile_workforce_accounts" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "be_way_plans" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "be_way_management" }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}