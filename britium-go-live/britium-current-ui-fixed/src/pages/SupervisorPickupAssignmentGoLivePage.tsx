import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Clock,
  MapPin,
  Package,
  RefreshCw,
  ShieldCheck,
  Truck,
  UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type WorkforceOption = {
  id: string;
  employee_id: string | null;
  full_name: string | null;
  email: string | null;
  role?: string | null;
  app_role?: string | null;
  user_role?: string | null;
  role_code?: string | null;
};

type VehicleOption = {
  id: string;
  vehicle_code: string | null;
  label: string | null;
  vehicle_type?: string | null;
  status?: string | null;
  branch_code?: string | null;
  is_active?: boolean | null;
};

type Pickup = {
  pickup_id: string;
  pickup_way_id?: string;
  merchant_name?: string;
  pickup_address?: string;
  pickup_township?: string;
  branch_code?: string;
  required_vehicle?: string;
  expected_parcels?: number;
  expected_parcel_count?: number;
  parcel_count?: number;
  delivery_count?: number;
  total_weight_kg?: number;
  pickup_status?: string;
  assignment_status?: string;
  workflow_stage?: string;
  supervisor_status?: string;
  rider_status?: string;
  driver_status?: string;
  helper_status?: string;
  team_acceptance_status?: string;
  
  assigned_rider_id?: string;
  assigned_rider_code?: string;
  assigned_rider_name?: string;
  
  assigned_driver_id?: string;
  assigned_driver_code?: string;
  assigned_driver_name?: string;
  
  assigned_helper_id?: string;
  assigned_helper_code?: string;
  assigned_helper_name?: string;
  
  assigned_vehicle_id?: string;
  assigned_vehicle_code?: string;
};

function asText(value: any) {
  return String(value ?? "").trim();
}

type WorkforceRole = "RIDER" | "DRIVER" | "HELPER";

const workforceRoleAliases: Record<WorkforceRole, Set<string>> = {
  RIDER: new Set(["RIDER", "FIELD_RIDER", "PICKUP_RIDER", "DELIVERY_RIDER", "RIDER_APP"]),
  DRIVER: new Set(["DRIVER", "FLEET_DRIVER", "DRIVER_APP"]),
  HELPER: new Set(["HELPER", "FLEET_HELPER", "DRIVER_HELPER", "HELPER_APP"]),
};

function normalizeRole(value: unknown) {
  return asText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function hasWorkforceRole(profile: WorkforceOption, role: WorkforceRole) {
  const roleMatched = [profile.role, profile.app_role, profile.user_role, profile.role_code]
    .map(normalizeRole)
    .some((value) => workforceRoleAliases[role].has(value));

  if (roleMatched) return true;

  const employeeId = normalizeRole(profile.employee_id);
  if (role === "RIDER") return employeeId.startsWith("RID");
  if (role === "DRIVER") return employeeId.startsWith("DRV");
  return employeeId.startsWith("HLP");
}

function normalizeWorkforceRow(row: any): WorkforceOption {
  return {
    id: asText(row.auth_user_id || row.id),
    employee_id: asText(row.workforce_code || row.employee_id) || null,
    full_name: asText(row.full_name || row.name || row.display_name) || null,
    email: asText(row.email || row.user_email) || null,
    role: asText(row.role || row.workforce_role) || null,
    app_role: asText(row.app_role) || null,
    user_role: asText(row.user_role) || null,
    role_code: asText(row.role_code) || null,
  };
}

function isActiveMasterRow(row: any) {
  const status = normalizeRole(row.status || row.record_status);
  return row.is_active !== false && !["INACTIVE", "SUSPENDED", "BLACKLISTED", "TERMINATED"].includes(status);
}

function isVehicleEligible(vehicle: VehicleOption, _pickup: Pickup) {
  const status = normalizeRole(vehicle.status);
  return vehicle.is_active !== false &&
    ![
      "INACTIVE",
      "SUSPENDED",
      "BLACKLISTED",
      "TERMINATED",
      "MAINTENANCE",
      "UNAVAILABLE",
    ].includes(status);
}

function normalizeAssignmentStatus(status?: string) {
  const value = asText(status).toUpperCase();

  if (["ACCEPTED", "ACCEPT", "ACCEPTED_PICKUP", "ACCEPTED_BY_RIDER", "PICKUP_VERIFIED", "DELIVERED", "COD_SETTLED"].includes(value)) {
    return "ACCEPTED";
  }

  if (["REJECTED", "REJECT", "DECLINED", "CANCELLED", "FAILED"].includes(value)) {
    return "REJECTED";
  }

  return value || "WAITING_ACCEPTANCE";
}

function statusColor(status?: string) {
  switch (normalizeAssignmentStatus(status)) {
    case "ACCEPTED":
      return "border-emerald-400/30 bg-emerald-500/15 text-emerald-300";
    case "REJECTED":
      return "border-red-400/30 bg-red-500/15 text-red-300";
    case "NOT_ASSIGNED":
      return "border-slate-400/20 bg-slate-500/10 text-slate-400";
    default:
      return "border-amber-400/30 bg-amber-500/15 text-amber-300";
  }
}

function TeamStatusCard({ label, name, code, status }: { label: string; name?: string; code?: string; status?: string }) {
  const visibleStatus = name || code ? normalizeAssignmentStatus(status) : "NOT_ASSIGNED";

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-[10px] font-black uppercase tracking-wider text-[#9cc2d9]">{label}</div>
      <div className="mt-1 truncate text-sm font-bold text-white">{name || code || "Not assigned"}</div>
      <span className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusColor(visibleStatus)}`}>
        {visibleStatus.replace(/_/g, " ")}
      </span>
    </div>
  );
}

function teamStatus(pickup: Pickup) {
  if (pickup.team_acceptance_status) {
    const stored = asText(pickup.team_acceptance_status).toUpperCase();
    if (["TEAM_READY", "NEEDS_REASSIGNMENT", "WAITING_TEAM_ACCEPTANCE", "NOT_ASSIGNED"].includes(stored)) return stored;
  }
  const statuses = [
    pickup.assigned_rider_code ? normalizeAssignmentStatus(pickup.rider_status) : null,
    pickup.assigned_driver_code ? normalizeAssignmentStatus(pickup.driver_status) : null,
    pickup.assigned_helper_code ? normalizeAssignmentStatus(pickup.helper_status) : null,
  ].filter(Boolean) as string[];

  if (!statuses.length) return "NOT_ASSIGNED";
  if (statuses.some((status) => status === "REJECTED")) return "NEEDS_REASSIGNMENT";
  if (statuses.every((status) => status === "ACCEPTED")) return "TEAM_READY";
  return "WAITING_TEAM_ACCEPTANCE";
}

function isAssignableOrAssigned(pickup: Pickup) {
  const values = [
    pickup.assignment_status,
    pickup.pickup_status,
    pickup.workflow_stage,
    pickup.supervisor_status,
  ].map((status) => asText(status).toUpperCase());

  if (values.some((status) => ["DELIVERED", "COD_SETTLED", "FINANCE_CLOSED", "CANCELLED"].includes(status))) {
    return false;
  }

  return true;
}

export default function SupervisorPickupAssignmentGoLivePage() {
  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [riders, setRiders] = useState<WorkforceOption[]>([]);
  const [drivers, setDrivers] = useState<WorkforceOption[]>([]);
  const [helpers, setHelpers] = useState<WorkforceOption[]>([]);
  const [fleet, setFleet] = useState<VehicleOption[]>([]);
  const [choice, setChoice] = useState<Record<string, any>>({});
  const [msg, setMsg] = useState("");
  const [masterDataMsg, setMasterDataMsg] = useState("");
  const [masterDataLoading, setMasterDataLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [assigningPickupId, setAssigningPickupId] = useState("");

  const pendingCount = useMemo(
    () => pickups.filter((p) => !p.assigned_rider_id && !p.assigned_driver_id && !p.assigned_helper_id).length,
    [pickups]
  );

  const waitingAcceptanceCount = useMemo(
    () => pickups.filter((p) => teamStatus(p) === "WAITING_TEAM_ACCEPTANCE" && (p.assigned_rider_id || p.assigned_driver_id || p.assigned_helper_id)).length,
    [pickups]
  );

  const teamReadyCount = useMemo(
    () => pickups.filter((p) => teamStatus(p) === "TEAM_READY").length,
    [pickups]
  );

  async function loadMasterData() {
    setMasterDataLoading(true);
    setMasterDataMsg("");

    const [workforceResult, fleetVehiclesResult, fleetMasterResult] = await Promise.all([
      supabase
        .from("be_mobile_workforce_accounts")
        .select("*")
        .order("role")
        .order("workforce_code"),
      supabase
        .from("be_fleet_vehicles")
        .select("*")
        .order("vehicle_code")
        .limit(200),
      supabase
        .from("be_fleet_master")
        .select("*")
        .limit(200),
    ]);

    const errors: string[] = [];
    let workforceRows = workforceResult.error
      ? []
      : (workforceResult.data || []).filter(isActiveMasterRow).map(normalizeWorkforceRow);

    if (!workforceRows.length) {
      const profileResult = await supabase
        .from("profiles")
        .select("id, employee_id, full_name, email, role, app_role, user_role, role_code, is_active, is_approved")
        .order("employee_id");

      if (profileResult.error) {
        console.warn("Could not load workforce master or profiles", workforceResult.error, profileResult.error);
        errors.push(`Workforce master: ${workforceResult.error?.message || profileResult.error.message}`);
      } else {
        workforceRows = (profileResult.data || [])
          .filter((row: any) => row.is_active !== false && row.is_approved !== false)
          .map(normalizeWorkforceRow);
      }
    }

    const nextRiders = workforceRows.filter((profile) => hasWorkforceRole(profile, "RIDER") && profile.id);
    const nextDrivers = workforceRows.filter((profile) => hasWorkforceRole(profile, "DRIVER") && profile.id);
    const nextHelpers = workforceRows.filter((profile) => hasWorkforceRole(profile, "HELPER") && profile.id);

    setRiders(nextRiders);
    setDrivers(nextDrivers);
    setHelpers(nextHelpers);

    if (!nextRiders.length && !nextDrivers.length && !nextHelpers.length) {
      errors.push(
        "No authenticated Rider, Driver, or Helper accounts were found. Create or map workforce Auth users before dispatch."
      );
    }

    const fleetRows = [
      ...(fleetVehiclesResult.error ? [] : fleetVehiclesResult.data || []),
      ...(fleetMasterResult.error ? [] : fleetMasterResult.data || []),
    ];

    if (!fleetRows.length && fleetVehiclesResult.error && fleetMasterResult.error) {
      console.warn("Could not load fleet vehicles", fleetVehiclesResult.error, fleetMasterResult.error);
      setFleet([]);
      errors.push(`Fleet vehicles: ${fleetVehiclesResult.error.message}`);
    } else {
      const normalizedFleet = fleetRows.map((v: any) => ({
        id: asText(v.id || v.vehicle_id || v.fleet_id || v.vehicle_code || v.code),
        vehicle_code: asText(v.vehicle_code || v.code || v.vehicle_id || v.fleet_id) || null,
        label: asText(v.vehicle_name || v.label || v.display_name || v.vehicle_no || v.plate_no) || null,
        vehicle_type: asText(v.vehicle_type || v.type || v.category) || null,
        status: asText(v.status || v.fleet_status || (v.is_active === false ? "Inactive" : "Available")) || null,
        branch_code: asText(v.branch_code || v.branch) || null,
        is_active: v.is_active,
      }));
      const seen = new Set<string>();
      setFleet(normalizedFleet.filter((vehicle) => {
        const key = normalizeRole(vehicle.id || vehicle.vehicle_code || vehicle.label);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      }));
    }

    if (errors.length) {
      setMasterDataMsg(errors.join(" "));
    }

    setMasterDataLoading(false);
  }

  async function loadPickups() {
    setLoading(true);
    setMsg("");

    try {
      const { data, error } = await supabase
        .from("be_portal_pickup_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(150);

      if (error) throw error;

      setPickups(((data || []) as Pickup[]).filter(isAssignableOrAssigned));
    } catch (err: any) {
      console.error("Pickup queue load failed", err);
      setMsg(err?.message || "Could not load pickup assignment queue.");
    } finally {
      setLoading(false);
    }
  }

  function setPick(pickupId: string, key: string, value: string) {
    setChoice((prev) => ({
      ...prev,
      [pickupId]: {
        ...(prev[pickupId] || {}),
        [key]: value,
      },
    }));
  }

  async function assign(pickup: Pickup) {
    const selectedRiderId = choice[pickup.pickup_id]?.rider ?? pickup.assigned_rider_id ?? "";
    const selectedDriverId = choice[pickup.pickup_id]?.driver ?? pickup.assigned_driver_id ?? "";
    const selectedHelperId = choice[pickup.pickup_id]?.helper ?? pickup.assigned_helper_id ?? "";
    const selectedVehicleId = choice[pickup.pickup_id]?.vehicle ?? pickup.assigned_vehicle_id ?? "";

    if (!selectedRiderId) {
      setMsg("Select an authenticated Rider before dispatch.");
      return;
    }

    if (selectedDriverId && !selectedVehicleId) {
      setMsg("Select a fleet vehicle when a Driver is assigned.");
      return;
    }

    const selectedRider = riders.find((r) => r.id === selectedRiderId);
    const selectedDriver = drivers.find((d) => d.id === selectedDriverId);
    const selectedHelper = helpers.find((h) => h.id === selectedHelperId);
    const selectedVehicle = fleet.find((v) => v.id === selectedVehicleId);

    setAssigningPickupId(pickup.pickup_id);
    setMsg("");

    try {
      const { data: authData } = await supabase.auth.getUser();
      const actorEmail = authData.user?.email;
      if (!actorEmail) throw new Error("Authenticated supervisor identity is unavailable.");

      const payload = {
        pickup_id: pickup.pickup_id,
        pickup_way_id: pickup.pickup_way_id || pickup.pickup_id,

        // Rider Mapping
        rider_auth_id: selectedRider?.id ?? null,
        rider_code: selectedRider?.employee_id ?? null, 
        rider_name: selectedRider?.full_name ?? null,
        rider_email: selectedRider?.email ?? null,

        // Driver Mapping
        driver_auth_id: selectedDriver?.id ?? null,
        driver_code: selectedDriver?.employee_id ?? null,
        driver_name: selectedDriver?.full_name ?? null,
        driver_email: selectedDriver?.email ?? null,

        // Helper Mapping
        helper_auth_id: selectedHelper?.id ?? null,
        helper_code: selectedHelper?.employee_id ?? null,
        helper_name: selectedHelper?.full_name ?? null,
        helper_email: selectedHelper?.email ?? null,

        // Vehicle Mapping
        vehicle_id: selectedVehicle?.id ?? null,
        vehicle_code: selectedVehicle?.vehicle_code ?? null,
        vehicle_name: selectedVehicle?.label ?? null,

        supervisor_note: "Assigned via Dispatch Command",
        actor_email: actorEmail,
      };

      const { data, error } = await supabase.rpc("be_supervisor_assign_job", {
        p_payload: payload,
      });

      if (error) throw error;

      if ((data as any)?.ok === false) {
        throw new Error((data as any)?.error || "Assignment failed.");
      }

      setMsg(`${pickup.pickup_id} dispatched successfully.`);

      setChoice((prev) => {
        const next = { ...prev };
        delete next[pickup.pickup_id];
        return next;
      });

      await loadPickups();
    } catch (err: any) {
      console.error("Assignment failed", err);
      setMsg(err?.message || "Could not confirm dispatch.");
    } finally {
      setAssigningPickupId("");
    }
  }

  useEffect(() => {
    void loadMasterData();
    void loadPickups();

    const refresh = () => {
      void loadPickups();
    };

    const channel = supabase
      .channel("supervisor-pickup-assignment-live-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "be_portal_pickup_requests" }, refresh)
      .subscribe();

    const timer = window.setInterval(refresh, 8000);

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#061524] p-6 text-[#eef8ff]">
      <header className="mb-6 flex items-start justify-between border-b border-[#1a3a5c] pb-6">
        <div>
          <div className="text-sm font-black tracking-[0.45em] text-[#f6b84b]">
            DISPATCH COMMAND
          </div>
          <h1 className="mt-2 text-2xl font-black">Supervisor Assignment</h1>
          <p className="mt-2 text-[#9cc2d9]">
            Live pickup assignment queue mapped to authenticated user IDs.
          </p>
        </div>

        <button
          onClick={() => {
            void loadMasterData();
            void loadPickups();
          }}
          className="rounded-xl bg-[#1f4770] px-5 py-3 font-bold hover:bg-[#255280] transition-colors"
        >
          <RefreshCw className="mr-2 inline" size={16} />
          Refresh
        </button>
      </header>

      {msg && (
        <div className="mb-5 rounded-xl border border-[#f6b84b]/40 bg-[#f6b84b]/10 px-4 py-3 text-[#f6b84b]">
          {msg}
        </div>
      )}

      {masterDataMsg && (
        <div className="mb-5 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-red-200">
          {masterDataMsg}
        </div>
      )}

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <span className="rounded-xl border border-[#1a3a5c] bg-[#0b2236] px-5 py-3 font-bold">
          <Clock className="mr-2 inline text-[#f6b84b]" size={18} />
          Queue: {pickups.length}
        </span>
        <span className="rounded-xl border border-[#1a3a5c] bg-[#0b2236] px-5 py-3 font-bold text-[#f6b84b]">
          Pending Assignment: {pendingCount}
        </span>
        <span className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-5 py-3 font-bold text-amber-300">
          Waiting Accept: {waitingAcceptanceCount}
        </span>
        <span className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-5 py-3 font-bold text-emerald-300">
          Team Ready: {teamReadyCount}
        </span>
      </div>

      <section className="space-y-5">
        {pickups.map((p) => {
          const eligibleFleet = fleet.filter((vehicle) => isVehicleEligible(vehicle, p));
          const selectedDriverId =
            choice[p.pickup_id]?.driver ?? p.assigned_driver_id ?? "";

          return (
          <article
            key={p.pickup_id}
            className="grid overflow-hidden rounded-2xl border border-[#1a3a5c] bg-[#0b2236] lg:grid-cols-[1fr_430px]"
          >
            <div className="p-7">
              <div className="flex items-center gap-3">
                <span className="text-lg font-black text-[#f6b84b]">
                  {p.pickup_way_id || p.pickup_id}
                </span>
                <span className="rounded-lg bg-[#1f4770] px-3 py-1 text-sm font-bold text-[#4ea8de]">
                  {p.pickup_status || "Pending"}
                </span>
              </div>

              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <div>
                  <div className="text-sm font-bold text-[#9cc2d9]">
                    <UserRound className="mr-2 inline" size={16} />
                    MERCHANT
                  </div>
                  <div className="mt-1 font-bold">{p.merchant_name || "-"}</div>
                </div>

                <div>
                  <div className="text-sm font-bold text-[#9cc2d9]">
                    <MapPin className="mr-2 inline text-[#ff5d73]" size={16} />
                    LOCATION
                  </div>
                  <div className="mt-1 font-bold">
                    {p.pickup_address || p.pickup_township || "-"}
                  </div>
                </div>

                <div>
                  <Package className="mr-2 inline text-[#22c55e]" size={18} />
                  <b>
                    {p.parcel_count ||
                      p.expected_parcels ||
                      p.expected_parcel_count ||
                      p.delivery_count ||
                      1}{" "}
                    Parcels
                  </b>
                </div>

                <div>
                  <ShieldCheck className="mr-2 inline text-[#f6b84b]" size={18} />
                  <b>{p.total_weight_kg || 0} kg Est.</b>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-[#1a3a5c] bg-[#061524] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#9cc2d9]">
                    Team Acceptance Status
                  </span>
                  <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${statusColor(teamStatus(p))}`}>
                    {teamStatus(p).replace(/_/g, " ")}
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <TeamStatusCard
                    label="Rider"
                    name={p.assigned_rider_name}
                    code={p.assigned_rider_code}
                    status={p.rider_status}
                  />
                  <TeamStatusCard
                    label="Driver"
                    name={p.assigned_driver_name}
                    code={p.assigned_driver_code}
                    status={p.driver_status}
                  />
                  <TeamStatusCard
                    label="Helper"
                    name={p.assigned_helper_name}
                    code={p.assigned_helper_code}
                    status={p.helper_status}
                  />
                </div>
              </div>
            </div>

            <div className="border-l border-[#1a3a5c] p-7">
              <div className="grid gap-4">
                <label className="grid gap-2 text-sm font-bold text-[#9cc2d9]">
                  ASSIGN FIELD RIDER
                  <select
                    value={choice[p.pickup_id]?.rider ?? p.assigned_rider_id ?? ""}
                    onChange={(e) => setPick(p.pickup_id, "rider", e.target.value)}
                    disabled={masterDataLoading || riders.length === 0}
                    className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-white outline-none focus:border-[#f6b84b]"
                  >
                    <option value="">
                      {masterDataLoading
                        ? "-- Loading Riders --"
                        : riders.length
                          ? "-- Select Available Rider --"
                          : "-- No Available Riders --"}
                    </option>
                    {riders.map((rider) => (
                      <option key={rider.id} value={rider.id}>
                        {rider.employee_id} - {rider.full_name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-bold text-[#9cc2d9]">
                  ASSIGN DRIVER
                  <select
                    value={choice[p.pickup_id]?.driver ?? p.assigned_driver_id ?? ""}
                    onChange={(e) => setPick(p.pickup_id, "driver", e.target.value)}
                    disabled={masterDataLoading || drivers.length === 0}
                    className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-white outline-none focus:border-[#4ea8de]"
                  >
                    <option value="">
                      {masterDataLoading
                        ? "-- Loading Drivers --"
                        : drivers.length
                          ? "-- Select Driver --"
                          : "-- No Available Drivers --"}
                    </option>
                    {drivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.employee_id} - {driver.full_name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-bold text-[#9cc2d9]">
                  ASSIGN HELPER
                  <select
                    value={choice[p.pickup_id]?.helper ?? p.assigned_helper_id ?? ""}
                    onChange={(e) => setPick(p.pickup_id, "helper", e.target.value)}
                    disabled={masterDataLoading || helpers.length === 0}
                    className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-white outline-none focus:border-[#4ea8de]"
                  >
                    <option value="">
                      {masterDataLoading
                        ? "-- Loading Helpers --"
                        : helpers.length
                          ? "-- Select Helper --"
                          : "-- No Available Helpers --"}
                    </option>
                    {helpers.map((helper) => (
                      <option key={helper.id} value={helper.id}>
                        {helper.employee_id} - {helper.full_name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-bold text-[#9cc2d9]">
                  FLEET VEHICLE {selectedDriverId ? "(REQUIRED WITH DRIVER)" : "(OPTIONAL)"}
                  <select
                    value={choice[p.pickup_id]?.vehicle ?? p.assigned_vehicle_id ?? ""}
                    onChange={(e) => setPick(p.pickup_id, "vehicle", e.target.value)}
                    disabled={masterDataLoading || eligibleFleet.length === 0}
                    className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-white outline-none focus:border-[#4ea8de]"
                  >
                    <option value="">
                      {masterDataLoading
                        ? "-- Loading Vehicles --"
                        : eligibleFleet.length
                          ? selectedDriverId
                            ? "-- Select Vehicle --"
                            : "-- No Fleet / Rider Own Vehicle --"
                          : "-- No Eligible Vehicles --"}
                    </option>
                    {eligibleFleet.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.vehicle_code} - {v.label}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  disabled={
                    assigningPickupId === p.pickup_id ||
                    !(choice[p.pickup_id]?.rider ?? p.assigned_rider_id) ||
                    (
                      Boolean(choice[p.pickup_id]?.driver ?? p.assigned_driver_id) &&
                      !(choice[p.pickup_id]?.vehicle ?? p.assigned_vehicle_id)
                    )
                  }
                  onClick={() => assign(p)}
                  className="mt-2 rounded-xl bg-[#f6b84b] hover:bg-[#ffdb99] px-5 py-4 font-black text-[#061524] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Truck className="mr-2 inline" size={18} />
                  Confirm Dispatch
                  <ArrowRight className="ml-2 inline" size={18} />
                </button>
              </div>
            </div>
          </article>
          );
        })}

        {!pickups.length && !loading && (
          <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-8 text-center text-[#9cc2d9]">
            No backend pending pickup requests.
          </div>
        )}
      </section>
    </main>
  );
}

