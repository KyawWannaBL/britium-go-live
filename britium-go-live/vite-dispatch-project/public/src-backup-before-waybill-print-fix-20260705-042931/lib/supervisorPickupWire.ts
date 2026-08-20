import { supabase } from "@/integrations/supabase/client";

export type WorkerRole = "RIDER" | "DRIVER" | "HELPER";

export type SupervisorPickupRow = {
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

export type SupervisorMasters = {
  riders: WorkforceOption[];
  drivers: WorkforceOption[];
  helpers: WorkforceOption[];
  fleets: FleetOption[];
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
  if (Array.isArray(value?.wayplans)) return value.wayplans;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.records)) return value.records;
  if (Array.isArray(value?.workforce)) return value.workforce;
  if (Array.isArray(value?.workforce_accounts)) return value.workforce_accounts;
  if (Array.isArray(value?.fleets)) return value.fleets;
  if (Array.isArray(value?.vehicles)) return value.vehicles;
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
  const blocked = ["INACTIVE", "SUSPENDED", "BLACKLISTED", "MAINTENANCE", "UNAVAILABLE", "DELETED", "TERMINATED"];
  return !blocked.includes(text(status).toUpperCase());
}

export function normalizeSupervisorPickup(row: Record<string, any>): SupervisorPickupRow {
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
  const id = text(row.fleet_id || row.vehicle_id || row.truck_id || row.car_id || row.id || row.code || row.vehicle_no || row.plate_no);
  const vehicleNo = text(row.vehicle_no || row.plate || row.plate_no || row.vehicle_plate || row.registration_no || row.license_no || id);

  if (!id && !vehicleNo) return null;

  return {
    id: id || vehicleNo,
    vehicle_no: vehicleNo || id,
    vehicle_type: text(row.vehicle_type || row.type || row.category || row.fleet_type),
    status: text(row.status || row.fleet_status || row.vehicle_status || row.availability_status || (row.is_active === false ? "Inactive" : "Available")),
    branch_code: text(row.branch_code || row.branch || row.home_branch_code),
  };
}

export async function loadSupervisorPickupQueue() {
  const loaders = [
    async () => rpcRows("be_supervisor_assignment_snapshot"),
    async () => rpcRows("be_supervisor_pending_pickup_requests"),
    async () => rpcRows("be_supervisor_pickup_snapshot"),
    async () => tableRows("be_portal_pickup_requests", 500),
  ];

  let lastError: any = null;

  for (const load of loaders) {
    try {
      const rows = await load();
      if (rows.length) {
        return rows
          .map(normalizeSupervisorPickup)
          .sort((a, b) => Date.parse(b.updated_at || b.created_at || "") - Date.parse(a.updated_at || a.created_at || ""));
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return [];
}

export async function loadSupervisorWayplanRows() {
  const loaders = [
    async () => rpcRows("be_supervisor_wayplan_snapshot"),
    async () => rpcRows("be_wayplan_supervisor_snapshot"),
    async () => rpcRows("be_way_management_snapshot"),
    async () => tableRows("be_portal_pickup_requests", 500),
  ];

  let lastError: any = null;

  for (const load of loaders) {
    try {
      const rows = await load();
      if (rows.length) {
        return rows
          .map(normalizeSupervisorPickup)
          .sort((a, b) => Date.parse(b.updated_at || b.created_at || "") - Date.parse(a.updated_at || a.created_at || ""));
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return [];
}

export async function loadSupervisorMasters(): Promise<SupervisorMasters> {
  const workforceRows: Record<string, any>[] = [];
  const fleetRows: Record<string, any>[] = [];

  const rpcNames = [
    "be_operational_master_snapshot",
    "be_master_data_page_snapshot",
    "be_assignment_master_snapshot",
    "be_supervisor_master_snapshot",
  ];

  for (const name of rpcNames) {
    try {
      const { data, error } = await (supabase as any).rpc(name, {});
      if (error) throw error;

      workforceRows.push(
        ...rowsFrom(data?.workforce),
        ...rowsFrom(data?.workforce_accounts),
        ...rowsFrom(data?.mobile_workforce),
        ...rowsFrom(data?.riders).map((row) => ({ ...row, role: "RIDER" })),
        ...rowsFrom(data?.drivers).map((row) => ({ ...row, role: "DRIVER" })),
        ...rowsFrom(data?.helpers).map((row) => ({ ...row, role: "HELPER" })),
      );

      fleetRows.push(
        ...rowsFrom(data?.fleets),
        ...rowsFrom(data?.fleet),
        ...rowsFrom(data?.vehicles),
        ...rowsFrom(data?.vehicle_master),
      );
    } catch {
      // Continue to table fallbacks.
    }
  }

  const workforceTables = [
    "be_mobile_workforce_accounts",
    "be_workforce_accounts",
    "be_workforce_master",
    "be_staff_master",
    "be_employee_master",
    "mobile_workforce_accounts",
    "workforce_master",
  ];

  for (const tableName of workforceTables) {
    try {
      workforceRows.push(...(await tableRows(tableName, 500)));
    } catch {
      // Continue.
    }
  }

  const roleTables: Array<[string, WorkerRole]> = [
    ["be_rider_master", "RIDER"],
    ["rider_master", "RIDER"],
    ["be_riders", "RIDER"],
    ["riders", "RIDER"],
    ["be_driver_master", "DRIVER"],
    ["driver_master", "DRIVER"],
    ["be_drivers", "DRIVER"],
    ["drivers", "DRIVER"],
    ["be_helper_master", "HELPER"],
    ["helper_master", "HELPER"],
    ["be_helpers", "HELPER"],
    ["helpers", "HELPER"],
  ];

  for (const [tableName, role] of roleTables) {
    try {
      const rows = await tableRows(tableName, 500);
      workforceRows.push(...rows.map((row) => ({ ...row, role })));
    } catch {
      // Continue.
    }
  }

  const fleetTables = [
    "be_fleet_master",
    "be_fleet_vehicles",
    "be_vehicle_master",
    "be_vehicles",
    "be_branch_fleet",
    "be_transport_fleet",
    "fleet_master",
    "vehicle_master",
    "vehicles",
    "fleet_vehicles",
  ];

  for (const tableName of fleetTables) {
    try {
      fleetRows.push(...(await tableRows(tableName, 500)));
    } catch {
      // Continue.
    }
  }

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

export async function assignSupervisorPickup(input: {
  pickup_id: string;
  rider_email?: string | null;
  driver_email?: string | null;
  helper_email?: string | null;
  vehicle_id?: string | null;
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
  return data;
}

export async function getActorEmail() {
  const { data } = await supabase.auth.getUser();
  return data.user?.email || "";
}

export function subscribeCsPickupSync(onChange: () => void) {
  const channel = supabase
    .channel("cs-pickup-supervisor-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "be_portal_pickup_requests" }, onChange)
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
