import { supabase } from "@/integrations/supabase/client";

export type WorkerRole = "RIDER" | "DRIVER" | "HELPER";

export type PickupOrder = {
  id: string;
  pickup_id: string;
  pickup_way_id: string;
  request_code: string;
  waybill_no: string;
  wayplan_code: string;
  merchant_code: string;
  merchant_name: string;
  pickup_address: string;
  township: string;
  city: string;
  branch_code: string;
  receiver_name: string;
  receiver_phone: string;
  cod_amount: number;
  expected_parcels: number;
  pickup_status: string;
  workflow_stage: string;
  supervisor_status: string;
  assigned_rider_email: string;
  assigned_driver_email: string;
  assigned_helper_email: string;
  assigned_rider_code: string;
  assigned_driver_code: string;
  assigned_helper_code: string;
  assigned_vehicle_id: string;
  assigned_fleet_id: string;
  supervisor_note: string;
  created_at: string;
  updated_at: string;
  raw: Record<string, any>;
};

export type WorkforceOption = {
  code: string;
  email: string;
  name: string;
  role: WorkerRole;
  status: string;
  branch_code: string;
  phone: string;
};

export type FleetOption = {
  id: string;
  vehicle_no: string;
  vehicle_type: string;
  status: string;
  branch_code: string;
};

export type Masters = {
  riders: WorkforceOption[];
  drivers: WorkforceOption[];
  helpers: WorkforceOption[];
  fleets: FleetOption[];
};

export type LiveGpsPoint = {
  id: string;
  pickup_id: string;
  request_code: string;
  rider_email: string;
  rider_code: string;
  rider_name: string;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  updated_at: string;
};

const emptyMasters: Masters = {
  riders: [],
  drivers: [],
  helpers: [],
  fleets: [],
};

function text(value: any) {
  return String(value ?? "").trim();
}

function num(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function rowsFrom(value: any): Record<string, any>[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.queue)) return value.queue;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.jobs)) return value.jobs;
  if (Array.isArray(value?.wayplans)) return value.wayplans;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.records)) return value.records;
  if (Array.isArray(value?.workforce)) return value.workforce;
  if (Array.isArray(value?.workforce_accounts)) return value.workforce_accounts;
  if (Array.isArray(value?.riders)) return value.riders;
  if (Array.isArray(value?.drivers)) return value.drivers;
  if (Array.isArray(value?.helpers)) return value.helpers;
  if (Array.isArray(value?.fleets)) return value.fleets;
  if (Array.isArray(value?.fleet)) return value.fleet;
  if (Array.isArray(value?.vehicles)) return value.vehicles;
  if (Array.isArray(value?.locations)) return value.locations;
  return [];
}

async function rpcRows(name: string, params: Record<string, any> = {}) {
  const { data, error } = await (supabase as any).rpc(name, params);
  if (error) throw error;
  return rowsFrom(data);
}

async function tableRows(tableName: string, limit = 500) {
  const { data, error } = await (supabase as any)
    .from(tableName)
    .select("*")
    .limit(limit);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
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

function activeStatus(status: string) {
  return ![
    "INACTIVE",
    "SUSPENDED",
    "BLACKLISTED",
    "MAINTENANCE",
    "UNAVAILABLE",
    "DELETED",
    "TERMINATED",
  ].includes(text(status).toUpperCase());
}

export function normalizePickup(row: Record<string, any>): PickupOrder {
  const pickupId = text(
    row.pickup_id ||
      row.pickup_way_id ||
      row.request_code ||
      row.waybill_no ||
      row.wayplan_code ||
      row.id,
  );

  return {
    id: text(row.id || pickupId),
    pickup_id: pickupId,
    pickup_way_id: text(row.pickup_way_id || pickupId),
    request_code: text(row.request_code || pickupId),
    waybill_no: text(row.waybill_no || row.wayplan_code || pickupId),
    wayplan_code: text(row.wayplan_code || row.waybill_no || pickupId),

    merchant_code: text(row.merchant_code),
    merchant_name: text(row.merchant_name || row.customer_name || row.sender_name),
    pickup_address: text(row.pickup_address || row.address || row.sender_address),
    township: text(row.township || row.pickup_township || row.zone),
    city: text(row.city || row.pickup_city),
    branch_code: text(row.branch_code || row.origin_branch_code),

    receiver_name: text(row.receiver_name || row.customer_name || row.merchant_name),
    receiver_phone: text(row.receiver_phone || row.customer_phone || row.phone || row.contact_phone),
    cod_amount: num(row.cod_amount || row.cod_due || row.amount, 0),
    expected_parcels: num(row.expected_parcels || row.parcel_count || row.total_parcels || row.qty, 1),

    pickup_status: text(row.pickup_status || row.delivery_status || row.status || "PICKUP_REQUESTED"),
    workflow_stage: text(row.workflow_stage || row.dispatch_status || row.delivery_status || "SUPERVISOR_ASSIGNMENT"),
    supervisor_status: text(
      row.supervisor_status ||
        (row.assigned_rider_email || row.rider_email ? "ASSIGNED" : "PENDING_ASSIGNMENT"),
    ),

    assigned_rider_email: text(row.assigned_rider_email || row.rider_email),
    assigned_driver_email: text(row.assigned_driver_email || row.driver_email),
    assigned_helper_email: text(row.assigned_helper_email || row.helper_email),

    assigned_rider_code: text(row.assigned_rider_code || row.rider_code),
    assigned_driver_code: text(row.assigned_driver_code || row.driver_code),
    assigned_helper_code: text(row.assigned_helper_code || row.helper_code),

    assigned_vehicle_id: text(row.assigned_vehicle_id || row.vehicle_id),
    assigned_fleet_id: text(row.assigned_fleet_id || row.vehicle_id),

    supervisor_note: text(row.supervisor_note),

    created_at: text(row.created_at),
    updated_at: text(row.updated_at || row.created_at),

    raw: row,
  };
}

function inferRole(row: Record<string, any>, fallback: WorkerRole = "RIDER"): WorkerRole {
  const combined = [
    row.role,
    row.workforce_role,
    row.worker_role,
    row.worker_type,
    row.workforce_type,
    row.employee_type,
    row.staff_type,
    row.job_type,
    row.position,
    row.designation,
    row.user_role,
    row.app_role,
    row.account_type,
    row.mobile_role,
    row.team,
    row.department,
    row.type,
    row.workforce_code,
    row.worker_code,
    row.rider_code,
    row.driver_code,
    row.helper_code,
    row.email,
    row.user_email,
    row.name,
    row.full_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  if (combined.includes("DRIVER") || combined.includes("DRV")) return "DRIVER";
  if (combined.includes("HELPER") || combined.includes("HLP")) return "HELPER";
  if (combined.includes("RIDER") || combined.includes("RID") || combined.includes("BIKE")) return "RIDER";
  return fallback;
}

function normalizeWorker(row: Record<string, any>, fallback?: WorkerRole): WorkforceOption | null {
  const role = inferRole(row, fallback || "RIDER");

  const code = text(
    row.workforce_code ||
      row.worker_code ||
      row.rider_code ||
      row.driver_code ||
      row.helper_code ||
      row.employee_code ||
      row.staff_code ||
      row.code ||
      row.id,
  );

  const email = text(
    row.email ||
      row.user_email ||
      row.login_email ||
      row.auth_email ||
      row.rider_email ||
      row.driver_email ||
      row.helper_email,
  );

  const name = text(
    row.full_name ||
      row.display_name ||
      row.rider_name ||
      row.driver_name ||
      row.helper_name ||
      row.employee_name ||
      row.worker_name ||
      row.name ||
      email ||
      code,
  );

  if (!code && !email) return null;

  return {
    code: code || email,
    email,
    name,
    role,
    status: text(row.status || row.availability_status || row.account_status || (row.is_active === false ? "Inactive" : "Active")),
    branch_code: text(row.branch_code || row.branch || row.home_branch_code),
    phone: text(row.phone_primary || row.phone || row.mobile || row.contact_phone),
  };
}

function normalizeFleet(row: Record<string, any>): FleetOption | null {
  const id = text(
    row.fleet_id ||
      row.vehicle_id ||
      row.truck_id ||
      row.car_id ||
      row.id ||
      row.code ||
      row.vehicle_no ||
      row.plate_no,
  );

  const vehicleNo = text(
    row.vehicle_no ||
      row.plate ||
      row.plate_no ||
      row.vehicle_plate ||
      row.registration_no ||
      row.license_no ||
      id,
  );

  if (!id && !vehicleNo) return null;

  return {
    id: id || vehicleNo,
    vehicle_no: vehicleNo || id,
    vehicle_type: text(row.vehicle_type || row.type || row.category || row.fleet_type),
    status: text(row.status || row.fleet_status || row.vehicle_status || row.availability_status || (row.is_active === false ? "Inactive" : "Available")),
    branch_code: text(row.branch_code || row.branch || row.home_branch_code),
  };
}

export async function loadPickupQueue() {
  try {
    const rows = await rpcRows("be_supervisor_assignment_snapshot");
    if (rows.length) {
      return rows
        .map(normalizePickup)
        .sort((a, b) => Date.parse(b.updated_at || b.created_at || "") - Date.parse(a.updated_at || a.created_at || ""));
    }
  } catch {
    // Single fallback only.
  }

  const rows = await tableRows("be_portal_pickup_requests", 500);
  return rows
    .map(normalizePickup)
    .sort((a, b) => Date.parse(b.updated_at || b.created_at || "") - Date.parse(a.updated_at || a.created_at || ""));
}

export async function loadWayplanRows() {
  try {
    const rows = await rpcRows("be_supervisor_wayplan_snapshot");
    if (rows.length) {
      return rows
        .map(normalizePickup)
        .sort((a, b) => Date.parse(b.updated_at || b.created_at || "") - Date.parse(a.updated_at || a.created_at || ""));
    }
  } catch {
    // Single fallback only.
  }

  const rows = await tableRows("be_portal_pickup_requests", 500);
  return rows
    .map(normalizePickup)
    .sort((a, b) => Date.parse(b.updated_at || b.created_at || "") - Date.parse(a.updated_at || a.created_at || ""));
}

export async function loadMasters(): Promise<Masters> {
  const { data, error } = await (supabase as any).rpc("be_operational_master_snapshot", {});

  if (error) {
    return emptyMasters;
  }

  const workforceRows: Record<string, any>[] = [
    ...rowsFrom(data?.workforce),
    ...rowsFrom(data?.workforce_accounts),
    ...rowsFrom(data?.mobile_workforce),
    ...rowsFrom(data?.riders).map((row) => ({ ...row, role: "RIDER" })),
    ...rowsFrom(data?.drivers).map((row) => ({ ...row, role: "DRIVER" })),
    ...rowsFrom(data?.helpers).map((row) => ({ ...row, role: "HELPER" })),
    ...rowsFrom(data?.Rider_Master).map((row) => ({ ...row, role: "RIDER" })),
    ...rowsFrom(data?.Driver_Master).map((row) => ({ ...row, role: "DRIVER" })),
    ...rowsFrom(data?.Helper_Master).map((row) => ({ ...row, role: "HELPER" })),
  ];

  const fleetRows: Record<string, any>[] = [
    ...rowsFrom(data?.fleets),
    ...rowsFrom(data?.fleet),
    ...rowsFrom(data?.vehicles),
    ...rowsFrom(data?.vehicle_master),
    ...rowsFrom(data?.Fleet_Master),
  ];

  const workers = dedupeBy(
    workforceRows.map((row) => normalizeWorker(row)).filter(Boolean) as WorkforceOption[],
    (row) => row.email || row.code,
  ).filter((row) => activeStatus(row.status));

  const fleets = dedupeBy(
    fleetRows.map(normalizeFleet).filter(Boolean) as FleetOption[],
    (row) => row.id || row.vehicle_no,
  ).filter((row) => activeStatus(row.status));

  return {
    riders: workers.filter((row) => row.role === "RIDER"),
    drivers: workers.filter((row) => row.role === "DRIVER"),
    helpers: workers.filter((row) => row.role === "HELPER"),
    fleets,
  };
}

export async function assignPickup(input: {
  pickup_id: string;
  rider_email?: string | null;
  driver_email?: string | null;
  helper_email?: string | null;
  vehicle_id?: string | null;
  supervisor_note?: string | null;
  actor_email?: string | null;
}) {
  const { data, error } = await (supabase as any).rpc("be_supervisor_assign_pickup", {
    p_pickup_id: input.pickup_id,
    p_rider_email: input.rider_email || null,
    p_driver_email: input.driver_email || null,
    p_helper_email: input.helper_email || null,
    p_vehicle_id: input.vehicle_id || null,
    p_actor_email: input.actor_email || null,
  });

  if (error) throw error;

  try {
    await (supabase as any)
      .from("be_portal_pickup_requests")
      .update({
        supervisor_note: input.supervisor_note || null,
        updated_at: new Date().toISOString(),
      })
      .or(`pickup_id.eq.${input.pickup_id},pickup_way_id.eq.${input.pickup_id},request_code.eq.${input.pickup_id}`);
  } catch {
    // Optional note update.
  }

  return data;
}

export async function getActorEmail() {
  const { data } = await supabase.auth.getUser();
  return data.user?.email || "";
}

export async function loadLiveGpsRows(): Promise<LiveGpsPoint[]> {
  const rows = await tableRows("be_rider_live_locations", 500);

  return dedupeBy(
    rows
      .map((row) => ({
        id: text(row.id || row.pickup_id || row.request_code || row.rider_email || row.actor_email || row.rider_code),
        pickup_id: text(row.pickup_id || row.pickup_way_id || row.request_code),
        request_code: text(row.request_code || row.pickup_request_code || row.pickup_id),
        rider_email: text(row.rider_email || row.actor_email || row.assigned_rider_email || row.email || row.user_email),
        rider_code: text(row.rider_code || row.assigned_rider_code || row.workforce_code || row.worker_code),
        rider_name: text(row.rider_name || row.name || row.full_name || row.display_name || row.rider_email || row.actor_email),
        lat: num(row.lat || row.latitude || row.gps_lat || row.current_lat || row.rider_lat, NaN),
        lng: num(row.lng || row.lon || row.long || row.longitude || row.gps_lng || row.current_lng || row.rider_lng, NaN),
        accuracy_m: num(row.accuracy_m || row.accuracy || row.gps_accuracy, NaN),
        updated_at: text(row.updated_at || row.gps_updated_at || row.last_seen_at || row.created_at),
      }))
      .map((row) => ({
        ...row,
        lat: Number.isFinite(row.lat as any) ? row.lat : null,
        lng: Number.isFinite(row.lng as any) ? row.lng : null,
        accuracy_m: Number.isFinite(row.accuracy_m as any) ? row.accuracy_m : null,
      })),
    (row) => `${row.rider_email || row.rider_code}:${row.pickup_id}:${row.lat || ""}:${row.lng || ""}`,
  );
}

export function subscribeSupervisorAssignmentSync(onChange: () => void) {
  const channel = supabase
    .channel("supervisor-assignment-template-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "be_portal_pickup_requests" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "be_rider_live_locations" }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export function workerValue(worker: WorkforceOption) {
  return worker.email || worker.code;
}

export function workerLabel(worker: WorkforceOption) {
  return [worker.code, worker.name, worker.email, worker.phone].filter(Boolean).join(" - ");
}

export function gpsLink(point: LiveGpsPoint | null) {
  if (!point?.lat || !point?.lng) return "";
  return `https://www.google.com/maps?q=${point.lat},${point.lng}`;
}

export { emptyMasters };
