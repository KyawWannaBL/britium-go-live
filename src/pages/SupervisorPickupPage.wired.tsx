tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  ClipboardCheck,
  Download,
  Filter,
  RefreshCcw,
  Search,
  Truck,
  UploadCloud,
  UserCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type WorkerRole = "RIDER" | "DRIVER" | "HELPER";

type PickupQueueItem = {
  id: string;
  pickup_id: string;
  request_code?: string;
  pickup_waybill_id?: string;
  waybill_no?: string;
  merchant_code?: string;
  merchant_name?: string;
  business_type?: string;
  payment_terms?: string;
  payment_type?: string;
  pickup_address?: string;
  township?: string;
  city?: string;
  region_state?: string;
  zone?: string;
  branch_code?: string;
  expected_parcels?: number;
  pickup_date?: string;
  vehicle_type?: string;
  pickup_status?: string;
  workflow_stage?: string;
  supervisor_status?: string;
  rider_status?: string;
  assigned_rider_email?: string;
  assigned_driver_email?: string;
  assigned_helper_email?: string;
  assigned_rider_code?: string;
  assigned_driver_code?: string;
  assigned_helper_code?: string;
  assigned_vehicle_id?: string;
  assigned_fleet_id?: string;
  has_unread_notification?: boolean;
  created_at?: string;
};

type WorkforceOption = {
  code: string;
  email: string;
  name: string;
  role: WorkerRole;
  status?: string;
  branch_code?: string;
  zone?: string;
  assigned_zone?: string;
  phone?: string;
};

type FleetOption = {
  id: string;
  vehicle_no: string;
  vehicle_type?: string;
  ownership_type?: string;
  status?: string;
  branch_code?: string;
};

type GoLiveCheck = {
  label: string;
  detail: string;
  status: "OK" | "ERROR" | "WARN";
};

function asText(value: any) {
  return String(value ?? "").trim();
}

function readRows(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.queue)) return value.queue;
  if (Array.isArray(value?.pickups)) return value.pickups;
  if (Array.isArray(value?.pickup_requests)) return value.pickup_requests;
  if (Array.isArray(value?.workforce)) return value.workforce;
  if (Array.isArray(value?.workforce_accounts)) return value.workforce_accounts;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

async function safeRpcRows(name: string, params: Record<string, any> = {}) {
  try {
    const { data, error } = await (supabase as any).rpc(name, params);
    if (error) throw error;
    return readRows(data);
  } catch {
    return [];
  }
}

async function safeTableRows(tableName: string, limit = 500) {
  try {
    const { data, error } = await (supabase as any)
      .from(tableName)
      .select("*")
      .limit(limit);

    if (error) throw error;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function dedupeByKey<T>(rows: T[], keyFn: (row: T) => string) {
  const seen = new Set<string>();

  return rows.filter((row) => {
    const key = keyFn(row).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizePickup(row: any): PickupQueueItem {
  const pickupId = asText(
    row.pickup_id ||
      row.pickup_code ||
      row.pickup_request_id ||
      row.request_code ||
      row.id,
  );

  const requestCode = asText(
    row.request_code ||
      row.pickup_request_code ||
      row.pickup_id ||
      pickupId,
  );

  const rowId = asText(row.id || pickupId || requestCode);

  return {
    id: rowId || pickupId || requestCode,
    pickup_id: pickupId,
    request_code: requestCode,
    pickup_waybill_id: asText(
      row.pickup_waybill_id ||
        row.waybill_no ||
        row.pickup_way_id ||
        row.waybill ||
        pickupId,
    ),
    waybill_no: asText(row.waybill_no || row.waybill),
    merchant_code: asText(row.merchant_code),
    merchant_name: asText(
      row.merchant_name ||
        row.customer_name ||
        row.contact_person ||
        row.sender_name,
    ),
    business_type: asText(row.business_type),
    payment_terms: asText(row.payment_terms),
    payment_type: asText(row.payment_type),
    pickup_address: asText(
      row.pickup_address ||
        row.address ||
        row.default_pickup_address ||
        row.sender_address,
    ),
    township: asText(row.township || row.pickup_township || row.zone),
    city: asText(row.city || row.pickup_city),
    region_state: asText(row.region_state),
    zone: asText(row.zone || row.assigned_zone || row.route_zone),
    branch_code: asText(row.branch_code || row.origin_branch_code),
    expected_parcels: Number(
      row.expected_parcels ||
        row.parcel_count ||
        row.total_parcels ||
        row.qty ||
        1,
    ),
    pickup_date: asText(
      row.pickup_date ||
        row.requested_pickup_date ||
        row.created_at,
    ),
    vehicle_type: asText(row.vehicle_type || row.vehicle_required),
    pickup_status: asText(row.pickup_status || row.status),
    workflow_stage: asText(row.workflow_stage),
    supervisor_status: asText(row.supervisor_status),
    rider_status: asText(row.rider_status),
    assigned_rider_email: asText(row.assigned_rider_email || row.rider_email),
    assigned_driver_email: asText(row.assigned_driver_email || row.driver_email),
    assigned_helper_email: asText(row.assigned_helper_email || row.helper_email),
    assigned_rider_code: asText(row.assigned_rider_code || row.rider_code),
    assigned_driver_code: asText(row.assigned_driver_code || row.driver_code),
    assigned_helper_code: asText(row.assigned_helper_code || row.helper_code),
    assigned_vehicle_id: asText(row.assigned_vehicle_id || row.assigned_fleet_id),
    assigned_fleet_id: asText(row.assigned_fleet_id || row.assigned_vehicle_id),
    has_unread_notification: Boolean(row.has_unread_notification),
    created_at: asText(row.created_at),
  };
}

function inferWorkerRole(row: any, fallbackRole?: WorkerRole): WorkerRole {
  const roleText = [
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
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  const identityText = [
    row.workforce_code,
    row.worker_code,
    row.rider_code,
    row.driver_code,
    row.helper_code,
    row.employee_code,
    row.code,
    row.id,
    row.email,
    row.user_email,
    row.full_name,
    row.display_name,
    row.name,
    row.rider_name,
    row.driver_name,
    row.helper_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  const combined = `${roleText} ${identityText}`;

  if (combined.includes("DRIVER") || combined.includes("DRV")) return "DRIVER";
  if (combined.includes("HELPER") || combined.includes("HLP")) return "HELPER";
  if (combined.includes("RIDER") || combined.includes("RID") || combined.includes("BIKE")) return "RIDER";

  return fallbackRole || "RIDER";
}

function normalizeWorker(row: any, fallbackRole?: WorkerRole): WorkforceOption | null {
  const role = inferWorkerRole(row, fallbackRole);

  const code = asText(
    row.workforce_code ||
      row.worker_code ||
      row.rider_code ||
      row.driver_code ||
      row.helper_code ||
      row.employee_code ||
      row.staff_code ||
      row.rider_id ||
      row.driver_id ||
      row.helper_id ||
      row.employee_id ||
      row.code ||
      row.id,
  );

  const email = asText(
    row.email ||
      row.user_email ||
      row.login_email ||
      row.auth_email ||
      row.rider_email ||
      row.driver_email ||
      row.helper_email,
  );

  const name = asText(
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
    status: asText(
      row.status ||
        row.record_status ||
        row.availability_status ||
        row.account_status ||
        row.active_status ||
        (row.is_active === false ? "Inactive" : "Active"),
    ),
    branch_code: asText(row.branch_code || row.branch || row.home_branch_code),
    assigned_zone: asText(row.assigned_zone || row.zone || row.route_zone),
    zone: asText(row.zone || row.assigned_zone || row.route_zone),
    phone: asText(row.phone_primary || row.phone || row.mobile || row.contact_phone),
  };
}

function normalizeFleet(row: any): FleetOption | null {
  const id = asText(
    row.fleet_id ||
      row.vehicle_id ||
      row.truck_id ||
      row.car_id ||
      row.id ||
      row.code ||
      row.vehicle_no ||
      row.plate_no,
  );

  const vehicleNo = asText(
    row.vehicle_no ||
      row.plate ||
      row.plate_no ||
      row.vehicle_plate ||
      row.registration_no ||
      row.license_no ||
      row.truck_no ||
      row.car_no ||
      id,
  );

  if (!id && !vehicleNo) return null;

  return {
    id: id || vehicleNo,
    vehicle_no: vehicleNo || id,
    vehicle_type: asText(row.vehicle_type || row.type || row.category || row.fleet_type),
    ownership_type: asText(row.ownership_type || row.owner_type),
    status: asText(
      row.status ||
        row.fleet_status ||
        row.vehicle_status ||
        row.availability_status ||
        (row.is_active === false ? "Inactive" : "Available"),
    ),
    branch_code: asText(row.branch_code || row.branch || row.home_branch_code),
  };
}

function isActiveStatus(status: any) {
  return ![
    "INACTIVE",
    "SUSPENDED",
    "BLACKLISTED",
    "MAINTENANCE",
    "UNAVAILABLE",
    "DELETED",
    "TERMINATED",
  ].includes(asText(status).toUpperCase());
}

function sameBranchOrAny(masterBranch?: string, pickupBranch?: string) {
  if (!masterBranch || !pickupBranch) return true;
  return masterBranch.toUpperCase() === pickupBranch.toUpperCase();
}

function workerValue(worker: WorkforceOption) {
  return worker.email || worker.code;
}

function workerLabel(worker: WorkforceOption) {
  return [worker.code, worker.name, worker.email, worker.phone].filter(Boolean).join(" - ");
}

function findWorkerByValue(rows: WorkforceOption[], value: string) {
  return rows.find((row) => row.email === value || row.code === value);
}

function findFleetByValue(rows: FleetOption[], value: string) {
  return rows.find((row) => row.id === value || row.vehicle_no === value);
}

async function getActorEmail() {
  const { data } = await supabase.auth.getUser();
  return data.user?.email || "testsupervisor@britiumexpress.com";
}

async function callAssignRpc(name: string, params: Record<string, any>) {
  const { data, error } = await (supabase as any).rpc(name, params);
  if (error) throw error;
  return data;
}

export default function SupervisorPickupPage() {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [queue, setQueue] = useState<PickupQueueItem[]>([]);
  const [riders, setRiders] = useState<WorkforceOption[]>([]);
  const [drivers, setDrivers] = useState<WorkforceOption[]>([]);
  const [helpers, setHelpers] = useState<WorkforceOption[]>([]);
  const [fleets, setFleets] = useState<FleetOption[]>([]);

  const [selectedId, setSelectedId] = useState("");
  const [selectedRider, setSelectedRider] = useState("");
  const [selectedDriver, setSelectedDriver] = useState("");
  const [selectedHelper, setSelectedHelper] = useState("");
  const [selectedFleet, setSelectedFleet] = useState("");
  const [supervisorNote, setSupervisorNote] = useState("");

  const selectedPickup = useMemo(
    () => queue.find((item) => item.id === selectedId || item.pickup_id === selectedId) || null,
    [queue, selectedId],
  );

  const eligibleRiders = useMemo(
    () => riders.filter((rider) => sameBranchOrAny(rider.branch_code, selectedPickup?.branch_code)),
    [riders, selectedPickup],
  );

  const eligibleDrivers = useMemo(
    () => drivers.filter((driver) => sameBranchOrAny(driver.branch_code, selectedPickup?.branch_code)),
    [drivers, selectedPickup],
  );

  const eligibleHelpers = useMemo(
    () => helpers.filter((helper) => sameBranchOrAny(helper.branch_code, selectedPickup?.branch_code)),
    [helpers, selectedPickup],
  );

  const eligibleFleets = useMemo(
    () =>
      fleets.filter(
        (fleet) =>
          sameBranchOrAny(fleet.branch_code, selectedPickup?.branch_code) &&
          (!selectedPickup?.vehicle_type || !fleet.vehicle_type || fleet.vehicle_type === selectedPickup.vehicle_type),
      ),
    [fleets, selectedPickup],
  );

  const selectedFleetRecord = useMemo(
    () => fleets.find((fleet) => fleet.id === selectedFleet) || null,
    [fleets, selectedFleet],
  );

  const filteredQueue = useMemo(() => {
    const text = search.trim().toLowerCase();

    return queue.filter((item) => {
      const dateText = String(item.pickup_date || item.created_at || "");
      const dateOk = (!fromDate || dateText >= fromDate) && (!toDate || dateText <= toDate);
      if (!dateOk) return false;

      if (!text) return true;

      return [
        item.pickup_id,
        item.pickup_waybill_id,
        item.waybill_no,
        item.merchant_name,
        item.merchant_code,
        item.township,
        item.city,
        item.branch_code,
        item.pickup_status,
        item.workflow_stage,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(text);
    });
  }, [queue, search, fromDate, toDate]);

  const goLiveChecks: GoLiveCheck[] = useMemo(
    () => [
      {
        label: t("Supervisor queue source", "Supervisor Queue Source"),
        detail: "RPC/table fallback sync",
        status: queue.length ? "OK" : "WARN",
      },
      {
        label: t("Pickup request selected", "Pickup Request ရွေးချယ်မှု"),
        detail: selectedPickup?.pickup_id || t("Select a pending pickup request.", "Pickup Request ရွေးချယ်ပါ။"),
        status: selectedPickup?.pickup_id ? "OK" : "WARN",
      },
      {
        label: t("Rider app connection", "Rider App ချိတ်ဆက်မှု"),
        detail: selectedRider
          ? selectedRider
          : riders.length
            ? t("Active riders loaded with email/code.", "Active Rider များ Email/Code ဖြင့် ရရှိပါသည်။")
            : t("No active rider loaded.", "Active Rider မရရှိပါ။"),
        status: selectedRider || riders.length ? "OK" : "ERROR",
      },
      {
        label: t("Driver app connection", "Driver App ချိတ်ဆက်မှု"),
        detail: drivers.length ? t("Drivers loaded.", "Driver များ ရရှိပါသည်။") : t("Driver optional for pickup assignment.", "Driver optional ဖြစ်သည်။"),
        status: drivers.length ? "OK" : "WARN",
      },
      {
        label: t("Helper app connection", "Helper App ချိတ်ဆက်မှု"),
        detail: helpers.length ? t("Helpers loaded.", "Helper များ ရရှိပါသည်။") : t("Helper optional.", "Helper optional ဖြစ်သည်။"),
        status: helpers.length ? "OK" : "WARN",
      },
      {
        label: t("Fleet master", "Fleet Master"),
        detail: selectedFleet
          ? selectedFleetRecord?.vehicle_no || selectedFleet
          : fleets.length
            ? t("Fleet records loaded.", "Fleet Master ရရှိပါသည်။")
            : t("Fleet optional.", "Fleet optional ဖြစ်သည်။"),
        status: selectedFleet || fleets.length ? "OK" : "WARN",
      },
      {
        label: t("Supervisor note length", "ကြီးကြပ်ရေးမှူး မှတ်ချက်"),
        detail: `${supervisorNote.length}/500`,
        status: supervisorNote.length <= 500 ? "OK" : "ERROR",
      },
    ],
    [t, queue.length, selectedPickup, selectedRider, selectedFleet, selectedFleetRecord, riders.length, drivers.length, helpers.length, fleets.length, supervisorNote.length],
  );

  const errorCount = goLiveChecks.filter((check) => check.status === "ERROR").length;
  const warningCount = goLiveChecks.filter((check) => check.status === "WARN").length;

  async function loadSupervisorQueue() {
    const sources = [
      async () => safeRpcRows("be_supervisor_assignment_snapshot"),
      async () => safeRpcRows("be_supervisor_pending_pickup_requests"),
      async () => safeRpcRows("be_supervisor_pickup_snapshot"),
      async () => safeTableRows("be_v_supervisor_pickup_queue"),
      async () => safeTableRows("be_portal_pickup_requests"),
    ];

    for (const source of sources) {
      const rows = await source();

      if (rows.length) {
        return rows
          .map(normalizePickup)
          .filter((row) => {
            const dateText = String(row.pickup_date || row.created_at || "");
            return (!fromDate || dateText >= fromDate) && (!toDate || dateText <= toDate);
          })
          .sort((a, b) => {
            const left = Date.parse(a.created_at || a.pickup_date || "") || 0;
            const right = Date.parse(b.created_at || b.pickup_date || "") || 0;
            return right - left;
          });
      }
    }

    return [];
  }

  async function loadAssignmentMasters() {
    const workforceRows: any[] = [];
    const fleetRows: any[] = [];

    const snapshotRpcNames = [
      "be_operational_master_snapshot",
      "be_master_data_page_snapshot",
      "be_assignment_master_snapshot",
      "be_supervisor_master_snapshot",
    ];

    for (const rpcName of snapshotRpcNames) {
      try {
        const { data, error } = await (supabase as any).rpc(rpcName, {});
        if (error) throw error;

        const snapshot = data || {};

        workforceRows.push(
          ...(snapshot.workforce || []),
          ...(snapshot.workforce_accounts || []),
          ...(snapshot.mobile_workforce || []),
          ...(snapshot.riders || []).map((row: any) => ({ ...row, role: "RIDER" })),
          ...(snapshot.drivers || []).map((row: any) => ({ ...row, role: "DRIVER" })),
          ...(snapshot.helpers || []).map((row: any) => ({ ...row, role: "HELPER" })),
          ...(snapshot.Rider_Master || []).map((row: any) => ({ ...row, role: "RIDER" })),
          ...(snapshot.Driver_Master || []).map((row: any) => ({ ...row, role: "DRIVER" })),
          ...(snapshot.Helper_Master || []).map((row: any) => ({ ...row, role: "HELPER" })),
        );

        fleetRows.push(
          ...(snapshot.fleets || []),
          ...(snapshot.vehicles || []),
          ...(snapshot.fleet || []),
          ...(snapshot.vehicle_master || []),
          ...(snapshot.Fleet_Master || []),
        );
      } catch {
        // Try next RPC.
      }
    }

    const genericWorkforceTables = [
      "be_mobile_workforce_accounts",
      "be_workforce_accounts",
      "be_workforce_master",
      "be_staff_master",
      "be_employee_master",
      "mobile_workforce_accounts",
      "workforce_master",
    ];

    for (const tableName of genericWorkforceTables) {
      workforceRows.push(...(await safeTableRows(tableName)));
    }

    const roleSpecificTables: Array<[string, WorkerRole]> = [
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

    for (const [tableName, role] of roleSpecificTables) {
      const rows = await safeTableRows(tableName);
      workforceRows.push(...rows.map((row) => ({ ...row, role })));
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
      fleetRows.push(...(await safeTableRows(tableName)));
    }

    const workers = dedupeByKey(
      workforceRows
        .map((row) => normalizeWorker(row))
        .filter(Boolean) as WorkforceOption[],
      (row) => row.email || row.code,
    ).filter((row) => isActiveStatus(row.status));

    const nextFleets = dedupeByKey(
      fleetRows
        .map(normalizeFleet)
        .filter(Boolean) as FleetOption[],
      (row) => row.id || row.vehicle_no,
    ).filter((row) => isActiveStatus(row.status));

    setRiders(workers.filter((row) => row.role === "RIDER"));
    setDrivers(workers.filter((row) => row.role === "DRIVER"));
    setHelpers(workers.filter((row) => row.role === "HELPER"));
    setFleets(nextFleets);
  }

  async function loadData(showSpinner = true) {
    if (showSpinner) setLoading(true);
    setMessage("");

    try {
      const [pickupRows] = await Promise.all([
        loadSupervisorQueue(),
        loadAssignmentMasters(),
      ]);

      setQueue(pickupRows);

      if (pickupRows.length && !selectedId) {
        setSelectedId(pickupRows[0].id || pickupRows[0].pickup_id);
      }
    } catch (error: any) {
      setMessage(error?.message || t("Unable to synchronize supervisor pickup queue.", "Supervisor Pickup Queue Sync မအောင်မြင်ပါ။"));
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function safeLoad() {
      if (!mounted) return;
      await loadData(false);
    }

    loadData();

    const channel = supabase
      .channel("supervisor-pickup-live-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "be_portal_pickup_requests" }, safeLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "be_app_notifications" }, safeLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "be_mobile_workforce_accounts" }, safeLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "be_fleet_master" }, safeLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "be_fleet_vehicles" }, safeLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "be_way_plans" }, safeLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "be_way_management" }, safeLoad)
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePickupSelect(item: PickupQueueItem) {
    setSelectedId(item.id || item.pickup_id);
    setSelectedRider(item.assigned_rider_email || item.assigned_rider_code || "");
    setSelectedDriver(item.assigned_driver_email || item.assigned_driver_code || "");
    setSelectedHelper(item.assigned_helper_email || item.assigned_helper_code || "");
    setSelectedFleet(item.assigned_vehicle_id || item.assigned_fleet_id || "");
    setSupervisorNote("");
  }

  async function markSupervisorNotificationRead(pickupId: string) {
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

  async function confirmAssignment() {
    if (!selectedPickup) {
      setMessage(t("Please select a pickup request.", "Pickup Request ရွေးချယ်ပါ။"));
      return;
    }

    if (!selectedRider) {
      setMessage(t("Go-live workflow requires Rider assignment.", "Go-live workflow အတွက် Rider ကို ရွေးချယ်ရန် လိုအပ်ပါသည်။"));
      return;
    }

    if (supervisorNote.length > 500) {
      setMessage(t("Supervisor note must be 500 characters or fewer.", "မှတ်ချက်သည် ၅၀၀ လုံးထက် မကျော်ရပါ။"));
      return;
    }

    setLoading(true);
    setMessage("");

    const rider = findWorkerByValue(riders, selectedRider);
    const driver = findWorkerByValue(drivers, selectedDriver);
    const helper = findWorkerByValue(helpers, selectedHelper);
    const fleet = findFleetByValue(fleets, selectedFleet);

    try {
      const actorEmail = await getActorEmail();

      const attempts = [
        () =>
          callAssignRpc("be_supervisor_assign_pickup", {
            p_pickup_id: selectedPickup.pickup_id,
            p_rider_email: rider?.email || selectedRider,
            p_driver_email: driver?.email || selectedDriver || null,
            p_helper_email: helper?.email || selectedHelper || null,
            p_vehicle_id: fleet?.id || selectedFleet || null,
            p_actor_email: actorEmail,
          }),

        () =>
          callAssignRpc("be_assign_pickup_request_by_rider_code", {
            p_request_code: selectedPickup.request_code || selectedPickup.pickup_id,
            p_rider_code: rider?.code || selectedRider,
            p_assigned_vehicle_id: fleet?.id || selectedFleet || null,
            p_assignment_note: supervisorNote.trim() || null,
            p_actor_registry_id: null,
          }),

        () =>
          callAssignRpc("be_assign_pickup_field_team", {
            p_pickup_id: selectedPickup.pickup_id || selectedPickup.request_code,
            p_rider_code: rider?.code || null,
            p_driver_code: driver?.code || null,
            p_helper_code: helper?.code || null,
            p_vehicle_plate: fleet?.vehicle_no || fleet?.id || null,
            p_supervisor_note: supervisorNote.trim() || null,
          }),
      ];

      let result: any = null;
      let lastError: any = null;

      for (const attempt of attempts) {
        try {
          result = await attempt();
          lastError = null;
          break;
        } catch (error: any) {
          lastError = error;

          const message = String(error?.message || "");
          const code = String(error?.code || "");

          if (code !== "42883" && !message.toLowerCase().includes("does not exist")) {
            throw error;
          }
        }
      }

      if (lastError) throw lastError;

      await markSupervisorNotificationRead(selectedPickup.pickup_id);

      setMessage(
        t(
          `Assigned ${selectedPickup.pickup_id}. Rider/Driver app job is now visible.`,
          `${selectedPickup.pickup_id} ကို တာဝန်ချထားပြီးပါပြီ။ Rider/Driver App တွင် Job မြင်နိုင်ပါပြီ။`,
        ),
      );

      setSelectedId("");
      setSelectedRider("");
      setSelectedDriver("");
      setSelectedHelper("");
      setSelectedFleet("");
      setSupervisorNote("");

      await loadData(false);

      console.info("Supervisor assignment result", result);
    } catch (error: any) {
      setMessage(error?.message || t("Assignment failed.", "တာဝန်ချထားမှု မအောင်မြင်ပါ။"));
    } finally {
      setLoading(false);
    }
  }

  function downloadReport() {
    const headers = [
      "pickup_id",
      "merchant_code",
      "merchant_name",
      "township",
      "city",
      "branch_code",
      "expected_parcels",
      "pickup_date",
      "pickup_status",
      "workflow_stage",
      "supervisor_status",
      "assigned_rider_email",
      "assigned_driver_email",
      "assigned_helper_email",
    ];

    const csv = [
      headers.join(","),
      ...filteredQueue.map((row) =>
        headers.map((header) => `"${String((row as any)[header] || "").replaceAll('"', '""')}"`).join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "supervisor-pickup-assignment-report.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleBulkUpload(file: File | null) {
    if (!file) return;

    setLoading(true);
    setMessage("");

    try {
      const path = `supervisor-pickup-assignment/${Date.now()}-${file.name}`;

      const { error: uploadError } = await (supabase as any).storage
        .from("supervisor-imports")
        .upload(path, file, { upsert: false });

      if (uploadError) throw uploadError;

      const { error } = await (supabase as any).rpc("be_register_supervisor_pickup_upload", {
        p_file_path: path,
        p_file_name: file.name,
        p_source_channel: "SUPERVISOR_PICKUP",
      });

      if (error) throw error;

      setMessage(t("Supervisor pickup upload registered successfully.", "Supervisor Pickup Upload အောင်မြင်ပါသည်။"));
      await loadData(false);
    } catch (error: any) {
      setMessage(error?.message || t("Supervisor pickup upload failed.", "Supervisor Pickup Upload မအောင်မြင်ပါ။"));
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const statusBadge = (item: PickupQueueItem) => {
    if (item.supervisor_status === "ASSIGNED" || item.pickup_status === "RIDER_ASSIGNED") {
      return t("Assigned", "Assigned");
    }

    return t("New Request", "New Request");
  };

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="border-b border-[#1a3a5c] pb-4">
        <h1 className="text-[#f6b84b] uppercase mb-1 text-[16px] tracking-widest">
          {t("SUPERVISOR ASSIGNMENT", "Pickup တာဝန်ချထားခြင်း")}
        </h1>
        <p className="text-[#4d7a9b] text-[13px]">
          {t(
            "Live CS pickup queue. Assignment writes Rider/Driver/Helper email into backend so mobile apps receive jobs.",
            "CS Pickup Queue မှ တိုက်ရိုက်ယူပြီး Rider/Driver/Helper App သို့ Job ပို့ပါသည်။",
          )}
        </p>
      </div>

      <div className="bg-[#0b2236] border border-[#1a3a5c] p-6 rounded-2xl flex flex-col lg:flex-row gap-4 items-end">
        <div className="w-full lg:w-auto">
          <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2 flex items-center gap-1">
            <Filter size={12} />
            {t("From Date", "မှ")}
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]"
          />
        </div>

        <div className="w-full lg:w-auto">
          <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2 flex items-center gap-1">
            <Filter size={12} />
            {t("To Date", "ထိ")}
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]"
          />
        </div>

        <div className="w-full lg:flex-1">
          <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2 flex items-center gap-1">
            <Search size={12} />
            {t("Search Pickup", "Pickup ရှာရန်")}
          </label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Pickup ID / merchant / township...", "Pickup ID / merchant / township...")}
            className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]"
          />
        </div>

        <div className="flex flex-wrap gap-2 w-full lg:w-auto justify-end">
          <button
            type="button"
            onClick={downloadReport}
            className="bg-[#1a3a5c] text-[#eef8ff] px-6 py-3 rounded-xl text-[12px] uppercase tracking-wider hover:border-[#f6b84b] border border-[#1a3a5c] flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Download size={14} /> {t("Download Report", "အစီရင်ခံစာ ရယူမည်")}
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="bg-[#f6b84b] text-[#061524] px-6 py-3 rounded-xl text-[12px] uppercase tracking-wider hover:bg-[#e5a93a] flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <UploadCloud size={14} /> {t("Bulk Upload", "ဖိုင်တင်မည်")}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => handleBulkUpload(e.target.files?.[0] || null)}
          />
        </div>
      </div>

      {message ? (
        <div className="bg-[#0b2236] border border-[#1a3a5c] p-4 rounded-2xl flex items-start gap-3 text-[#eef8ff] text-[13px]">
          <AlertTriangle size={16} className="text-[#f6b84b] mt-0.5 shrink-0" />
          <span className="break-words">{message}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_minmax(420px,0.95fr)] gap-6 items-start">
        <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl flex flex-col min-h-[560px] min-w-0">
          <div className="p-4 border-b border-[#1a3a5c] flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <h3 className="text-[#eef8ff] text-[14px] uppercase tracking-widest flex items-center gap-2">
              <ClipboardCheck size={16} className="text-[#4ea8de]" />
              {t("Live Supervisor Queue", "တာဝန်ချရန် Pickup များ")}
            </h3>
            <div className="flex items-center gap-3 text-[12px] text-[#4d7a9b]">
              <span>
                {filteredQueue.length} {t("records", "ခု")}
              </span>
              <button
                type="button"
                onClick={() => loadData()}
                className="text-[#4ea8de] hover:text-[#f6b84b] flex items-center gap-1 uppercase tracking-widest"
              >
                <RefreshCcw size={12} /> {loading ? t("Syncing...", "Sync...") : t("Sync", "Sync")}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar p-4 space-y-3">
            {filteredQueue.length === 0 ? (
              <div className="bg-[#061524] border border-[#1a3a5c] p-6 rounded-xl text-center text-[#4d7a9b] text-[13px]">
                {loading
                  ? t("Loading backend pickup queue...", "Backend Pickup Queue ကို ရယူနေပါသည်။")
                  : t("No pickup requests loaded from supervisor queue.", "Supervisor Queue မှ Pickup မရှိပါ။")}
              </div>
            ) : (
              filteredQueue.map((item) => {
                const active = item.id === selectedId || item.pickup_id === selectedId;
                const assigned = item.supervisor_status === "ASSIGNED" || item.pickup_status === "RIDER_ASSIGNED";

                return (
                  <button
                    key={`${item.id}-${item.pickup_id}`}
                    type="button"
                    onClick={() => handlePickupSelect(item)}
                    className={`w-full text-left bg-[#061524] border ${
                      active ? "border-[#f6b84b]" : "border-[#1a3a5c]"
                    } p-4 rounded-xl cursor-pointer transition-colors hover:border-[#f6b84b] min-w-0`}
                  >
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3 mb-3 min-w-0">
                      <div className="min-w-0">
                        <div className="text-[#f6b84b] text-[13px] font-bold break-words flex items-center gap-2">
                          {item.has_unread_notification && !assigned ? <Bell size={14} className="text-[#ff4f93]" /> : null}
                          <span>{item.pickup_id || t("Missing Pickup ID", "Pickup ID မရှိပါ")}</span>
                        </div>
                        <div className="text-[#4ea8de] text-[11px] mt-1 break-words">
                          {item.waybill_no ? `${t("Waybill", "Waybill")}: ${item.waybill_no}` : null}
                          {item.workflow_stage ? ` ${t("Stage", "Stage")}: ${item.workflow_stage}` : null}
                        </div>
                      </div>

                      <span
                        className={`border px-2 py-1 rounded-full text-[10px] uppercase tracking-widest shrink-0 ${
                          assigned
                            ? "bg-[#083927] text-[#22c55e] border-[#0d6b4c]"
                            : "bg-[#2a1934] text-[#ff4f93] border-[#ff4f93]/40"
                        }`}
                      >
                        {statusBadge(item)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px] min-w-0">
                      <div className="min-w-0">
                        <div className="text-[#4d7a9b] uppercase tracking-wider text-[10px]">
                          {t("Merchant", "Merchant")}
                        </div>
                        <div className="text-[#eef8ff] break-words">
                          {item.merchant_code ? `${item.merchant_code} - ` : ""}
                          {item.merchant_name || "—"}
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="text-[#4d7a9b] uppercase tracking-wider text-[10px]">
                          {t("Location", "Location")}
                        </div>
                        <div className="text-[#eef8ff] break-words">
                          {[item.township, item.city, item.branch_code].filter(Boolean).join(", ") || "—"}
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="text-[#4d7a9b] uppercase tracking-wider text-[10px]">
                          {t("Parcels / Vehicle", "Parcels / Vehicle")}
                        </div>
                        <div className="text-[#eef8ff] break-words">
                          {item.expected_parcels || 1} / {item.vehicle_type || t("Any", "Any")}
                        </div>
                      </div>
                    </div>

                    <div className="text-[#4d7a9b] text-[12px] mt-3 break-words">
                      {item.pickup_address || t("No pickup address available.", "Pickup လိပ်စာ မရှိပါ။")}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-6 min-w-0">
          <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl flex flex-col p-6 min-w-0">
            <h3 className="text-[#eef8ff] text-[14px] uppercase tracking-widest mb-6 border-b border-[#1a3a5c] pb-4 flex items-center gap-2">
              <UserCheck size={16} className="text-[#4ea8de]" />
              {t("Assignment Control", "တာဝန်သတ်မှတ်ရန်")}
            </h3>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">
                  {t("Selected Pickup ID", "ရွေးချယ်ထားသော Pickup")}
                </label>
                <input
                  readOnly
                  value={selectedPickup?.pickup_id || ""}
                  placeholder={t("Select a pickup request", "Pickup ရွေးချယ်ပါ")}
                  className="w-full bg-[#061524] border border-[#1a3a5c] text-[#4d7a9b] p-3 rounded-xl outline-none text-[13px]"
                />
              </div>

              <div>
                <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">
                  {t("Rider - required", "Rider - လိုအပ်သည်")}
                </label>
                <select
                  value={selectedRider}
                  onChange={(e) => setSelectedRider(e.target.value)}
                  className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] cursor-pointer"
                >
                  <option value="">{t("Select Rider", "Rider ရွေးချယ်ပါ")}</option>
                  {eligibleRiders.map((rider) => (
                    <option key={workerValue(rider)} value={workerValue(rider)}>
                      {workerLabel(rider)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">
                  {t("Driver", "Driver")}
                </label>
                <select
                  value={selectedDriver}
                  onChange={(e) => setSelectedDriver(e.target.value)}
                  className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] cursor-pointer"
                >
                  <option value="">{t("Select Driver", "Driver ရွေးချယ်ပါ")}</option>
                  {eligibleDrivers.map((driver) => (
                    <option key={workerValue(driver)} value={workerValue(driver)}>
                      {workerLabel(driver)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">
                  {t("Helper", "Helper")}
                </label>
                <select
                  value={selectedHelper}
                  onChange={(e) => setSelectedHelper(e.target.value)}
                  className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] cursor-pointer"
                >
                  <option value="">{t("Select Helper", "Helper ရွေးချယ်ပါ")}</option>
                  {eligibleHelpers.map((helper) => (
                    <option key={workerValue(helper)} value={workerValue(helper)}>
                      {workerLabel(helper)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">
                  {t("Vehicle / Fleet", "ယာဉ်")}
                </label>
                <select
                  value={selectedFleet}
                  onChange={(e) => setSelectedFleet(e.target.value)}
                  className="w-full bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px] cursor-pointer"
                >
                  <option value="">{t("Select Vehicle", "ယာဉ် ရွေးချယ်ပါ")}</option>
                  {eligibleFleets.map((fleet) => (
                    <option key={fleet.id} value={fleet.id}>
                      {[fleet.vehicle_no, fleet.vehicle_type, fleet.branch_code].filter(Boolean).join(" - ")}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#4d7a9b] text-[11px] uppercase tracking-widest mb-2">
                  {t("Supervisor Note", "ကြီးကြပ်ရေးမှူး မှတ်ချက်")}
                </label>
                <textarea
                  value={supervisorNote}
                  onChange={(e) => setSupervisorNote(e.target.value)}
                  maxLength={500}
                  placeholder={t("Special instructions...", "အထူးမှာကြားချက်...")}
                  className="w-full min-h-[96px] bg-[#061524] border border-[#1a3a5c] text-[#eef8ff] p-3 rounded-xl outline-none focus:border-[#f6b84b] text-[13px]"
                />
              </div>

              <button
                type="button"
                onClick={confirmAssignment}
                disabled={loading || !selectedPickup || !selectedRider || errorCount > 0}
                className="w-full bg-[#f6b84b] text-[#061524] p-4 rounded-xl text-[12px] uppercase tracking-wider font-black hover:bg-[#e5a93a] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Truck size={16} />
                {loading ? t("Assigning...", "Assigning...") : t("Confirm Assignment + Send to App", "တာဝန်ချပြီး App သို့ ပို့မည်")}
              </button>
            </div>
          </div>

          <div className="bg-[#0b2236] border border-[#1a3a5c] rounded-2xl p-6 min-w-0">
            <h3 className="text-[#eef8ff] text-[14px] uppercase tracking-widest mb-4 flex items-center gap-2">
              <ClipboardCheck size={16} className="text-[#ff4f93]" />
              {t("Go-Live Check", "Go-Live စစ်ဆေးချက်")}
            </h3>

            <div className={`border ${errorCount ? "border-[#ff4f93] bg-[#28192d]" : "border-[#1a3a5c] bg-[#061524]"} rounded-xl p-4 text-[13px] font-bold mb-4`}>
              <span className={errorCount ? "text-[#ff4f93]" : "text-[#22c55e]"}>
                {errorCount
                  ? t(`Please fix ${errorCount} error(s), ${warningCount} warning(s)`, `ပြင်ဆင်ရန် ${errorCount} error(s), ${warningCount} warning(s)`)
                  : t(`Ready with ${warningCount} warning(s)`, `အသင့်ဖြစ်ပါသည်။ warning ${warningCount}`)}
              </span>
            </div>

            <div className="space-y-3">
              {goLiveChecks.map((check) => (
                <div
                  key={check.label}
                  className={`rounded-xl border p-4 flex items-start justify-between gap-3 ${
                    check.status === "ERROR"
                      ? "border-[#ff4f93] bg-[#1b2034]"
                      : check.status === "WARN"
                        ? "border-[#f6b84b] bg-[#1b2331]"
                        : "border-[#0d6b4c] bg-[#082f35]"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-[#eef8ff] text-[13px] font-bold break-words">
                      {check.label}
                    </div>
                    <div className="text-[#9bb7cc] text-[12px] mt-1 break-words">
                      {check.detail}
                    </div>
                  </div>

                  <span
                    className={`px-3 py-1 rounded-full text-[11px] font-black shrink-0 ${
                      check.status === "ERROR"
                        ? "bg-[#ff4f93] text-[#061524]"
                        : check.status === "WARN"
                          ? "bg-[#f6b84b] text-[#061524]"
                          : "bg-[#22c55e] text-[#061524]"
                    }`}
                  >
                    {check.status === "OK" ? <CheckCircle size={12} /> : check.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

