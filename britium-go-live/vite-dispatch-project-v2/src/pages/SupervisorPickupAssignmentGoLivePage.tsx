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

type Pair = [string, string];

type Pickup = {
  pickup_id: string;
  pickup_way_id?: string;
  merchant_name?: string;
  pickup_address?: string;
  pickup_township?: string;
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
  assigned_rider_code?: string;
  assigned_driver_code?: string;
  assigned_helper_code?: string;
  assigned_rider_name?: string;
  assigned_driver_name?: string;
  assigned_helper_name?: string;
  assigned_vehicle_code?: string;
  assigned_vehicle_id?: string;
};

function asText(value: any) {
  return String(value ?? "").trim();
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
  const [riders, setRiders] = useState<Pair[]>([]);
  const [drivers, setDrivers] = useState<Pair[]>([]);
  const [helpers, setHelpers] = useState<Pair[]>([]);
  const [fleet, setFleet] = useState<Pair[]>([]);
  const [choice, setChoice] = useState<Record<string, any>>({});
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const pendingCount = useMemo(
    () => pickups.filter((p) => !p.assigned_rider_code && !p.assigned_driver_code && !p.assigned_helper_code).length,
    [pickups]
  );

  const waitingAcceptanceCount = useMemo(
    () => pickups.filter((p) => teamStatus(p) === "WAITING_TEAM_ACCEPTANCE" && (p.assigned_rider_code || p.assigned_driver_code || p.assigned_helper_code)).length,
    [pickups]
  );

  const teamReadyCount = useMemo(
    () => pickups.filter((p) => teamStatus(p) === "TEAM_READY").length,
    [pickups]
  );

  async function tryLoad(table: string, codeKeys: string[], nameKeys: string[]) {
    try {
      const { data, error } = await supabase.from(table).select("*").limit(200);
      if (error) throw error;

      return (data || [])
        .filter((x: any) => {
          const status = String(x.status || "ACTIVE").toUpperCase();
          return status === "ACTIVE" || x.is_active === true || x.active === true;
        })
        .map((x: any) => {
          const code =
            x.value ||
            x.code ||
            codeKeys.map((k) => x[k]).find(Boolean) ||
            x.id;

          const name =
            x.label ||
            x.display_name ||
            x.name ||
            nameKeys.map((k) => x[k]).find(Boolean) ||
            code;

          return code && name ? ([String(code), String(name)] as Pair) : null;
        })
        .filter(Boolean) as Pair[];
    } catch (err) {
      console.warn(`Could not load ${table}`, err);
      return [];
    }
  }

  async function loadMasterData() {
    const riderRows = await tryLoad(
      "be_riders",
      ["rider_code", "rider_id", "code", "id"],
      ["rider_name", "name", "label", "display_name"]
    );

    const driverRows = await tryLoad(
      "be_drivers",
      ["driver_code", "driver_id", "code", "id"],
      ["driver_name", "name", "label", "display_name"]
    );

    const helperRows = await tryLoad(
      "be_helpers",
      ["helper_code", "helper_id", "code", "id"],
      ["helper_name", "name", "label", "display_name"]
    );

    const fleetRows = await tryLoad(
      "be_fleet_vehicles",
      ["vehicle_code", "vehicle_id", "vehicle_no", "fleet_id", "code", "id"],
      ["label", "display_name", "vehicle_name", "vehicle_no", "name"]
    );

    setRiders(riderRows);
    setDrivers(driverRows);
    setHelpers(helperRows);
    setFleet(fleetRows);
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

  function findName(rows: Pair[], code?: string) {
    return rows.find(([value]) => value === code)?.[1] || "";
  }

  async function assign(pickup: Pickup) {
    const selected = {
      rider: pickup.assigned_rider_code || "",
      driver: pickup.assigned_driver_code || "",
      helper: pickup.assigned_helper_code || "",
      vehicle: pickup.assigned_vehicle_code || pickup.assigned_vehicle_id || "",
      ...(choice[pickup.pickup_id] || {}),
    };

    if (!selected.rider && !selected.driver && !selected.helper && !selected.vehicle) {
      setMsg("Please select at least one rider, driver, helper, or vehicle.");
      return;
    }

    setLoading(true);
    setMsg("");

    try {
      const payload = {
        pickup_id: pickup.pickup_id,
        pickup_way_id: pickup.pickup_way_id || pickup.pickup_id,

        rider_code: selected.rider || null,
        rider_name: findName(riders, selected.rider),

        driver_code: selected.driver || null,
        driver_name: findName(drivers, selected.driver),

        helper_code: selected.helper || null,
        helper_name: findName(helpers, selected.helper),

        vehicle_code: selected.vehicle || null,
        vehicle_name: findName(fleet, selected.vehicle),

        actor_email: "supervisor@britiumexpress.com",
      };

      const { data, error } = await supabase.rpc("be_supervisor_assign_job", {
        p_payload: payload,
      });

      if (error) throw error;

      if ((data as any)?.ok === false) {
        throw new Error((data as any)?.error || "Assignment failed.");
      }

      setMsg(`${pickup.pickup_id} assigned successfully.`);

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
      setLoading(false);
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
            Live pickup assignment queue with Rider / Driver / Helper acceptance status.
          </p>
        </div>

        <button
          onClick={() => {
            void loadMasterData();
            void loadPickups();
          }}
          className="rounded-xl bg-[#1f4770] px-5 py-3 font-bold"
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
        {pickups.map((p) => (
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
                    value={choice[p.pickup_id]?.rider ?? p.assigned_rider_code ?? ""}
                    onChange={(e) => setPick(p.pickup_id, "rider", e.target.value)}
                    className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-white"
                  >
                    <option value="">-- Select Available Rider --</option>
                    {riders.map(([code, name]) => (
                      <option key={code} value={code}>
                        {code} - {name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-bold text-[#9cc2d9]">
                  ASSIGN DRIVER
                  <select
                    value={choice[p.pickup_id]?.driver ?? p.assigned_driver_code ?? ""}
                    onChange={(e) => setPick(p.pickup_id, "driver", e.target.value)}
                    className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-white"
                  >
                    <option value="">-- Select Driver --</option>
                    {drivers.map(([code, name]) => (
                      <option key={code} value={code}>
                        {code} - {name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-bold text-[#9cc2d9]">
                  ASSIGN HELPER
                  <select
                    value={choice[p.pickup_id]?.helper ?? p.assigned_helper_code ?? ""}
                    onChange={(e) => setPick(p.pickup_id, "helper", e.target.value)}
                    className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-white"
                  >
                    <option value="">-- Select Helper --</option>
                    {helpers.map(([code, name]) => (
                      <option key={code} value={code}>
                        {code} - {name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-bold text-[#9cc2d9]">
                  REQUIRED FLEET VEHICLE
                  <select
                    value={choice[p.pickup_id]?.vehicle ?? p.assigned_vehicle_code ?? p.assigned_vehicle_id ?? ""}
                    onChange={(e) => setPick(p.pickup_id, "vehicle", e.target.value)}
                    className="rounded-xl border border-[#1a3a5c] bg-[#061524] px-4 py-3 text-white"
                  >
                    <option value="">-- Select Vehicle --</option>
                    {fleet.map(([code, name]) => (
                      <option key={code} value={code}>
                        {code} - {name}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  disabled={loading}
                  onClick={() => assign(p)}
                  className="mt-2 rounded-xl bg-[#f6b84b] px-5 py-4 font-black text-[#061524] disabled:opacity-60"
                >
                  <Truck className="mr-2 inline" size={18} />
                  Confirm Dispatch
                  <ArrowRight className="ml-2 inline" size={18} />
                </button>
              </div>
            </div>
          </article>
        ))}

        {!pickups.length && !loading && (
          <div className="rounded-2xl border border-[#1a3a5c] bg-[#0b2236] p-8 text-center text-[#9cc2d9]">
            No backend pending pickup requests.
          </div>
        )}
      </section>
    </main>
  );
}