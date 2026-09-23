import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  allocateVans,
  assignCrews,
  scheduleSequentialRouteWaves,
  PRACTICAL_MAX_PARCELS_PER_VAN,
  type Resource,
  type Stop,
  type VanPlan,
} from "@/lib/multiVanPlanner";
import { convertMyanmarTownshipToEnglish } from "@/lib/myanmarAddressConverter";
import { resolveDeliveryLocation, saveDeliveryLocation } from "@/lib/deliveryLocationService";
import { recoverWayplanLocations } from "@/lib/wayplanLocationRecovery";
import FullVanRouteMap from "@/components/FullVanRouteMap";

const field: React.CSSProperties = { padding: 10, borderRadius: 8, color: "#102b45", background: "white", border: "1px solid #9cc2d9" };
const button: React.CSSProperties = { ...field, background: "#f6b84b", fontWeight: 800, cursor: "pointer" };
const secondary: React.CSSProperties = { ...field, background: "#173a55", color: "white", fontWeight: 700, cursor: "pointer" };
const LOCATION_RECOVERY_INTERACTIVE_LIMIT = 8;
const LOCATION_RECOVERY_TIMEOUT_MS = 4500;

function isProviderQuotaError(error: unknown) {
  return /RESOURCE_EXHAUSTED|quota|rate.?limit|too many requests/i.test(String((error as any)?.message || error || ""));
}

type MasterMeta = {
  planCode?: string;
  planName?: string;
  routeCode?: string;
  zoneName?: string;
  configuredTownships?: string[];
  vehicleType?: string;
  dispatchWindow?: string;
  routingStrategy?: string;
};

type OperationalVanPlan = VanPlan & { master?: MasterMeta };

function pickupBatchId(row: any) {
  const direct = String(row?.pickup_id || row?.pickup_way_id || row?.metadata?.pickup_id || "").trim();
  if (direct) return direct;
  const deliveryWayId = String(row?.delivery_way_id || "").trim();
  const match = deliveryWayId.match(/^(P\d{4}-[A-Z0-9]+-\d+)-\d+$/i);
  return match?.[1] || "";
}

function hasRiderAssignment(plan: VanPlan) {
  return plan.crew_mode === "EMERGENCY_MANUAL"
    ? Boolean(String(plan.manual_rider_name || "").trim())
    : Boolean(String(plan.rider_code || "").trim());
}

function routeLabel(plan: VanPlan) {
  const source = String(plan.route?.source || "");
  if (source === "OPERATOR_EDITED") return `Operator-edited route · based on ${String(plan.route?.base_source || "existing road plan").replaceAll("_", " ")}`;
  if (source === "GOOGLE_ROUTES") return "Google Routes road optimized";
  if (source === "MAPBOX_FALLBACK") return "Mapbox road optimized";
  if (source === "DEFERRED_LOCATION") return "Wayplan assigned · road optimization deferred until location is available";
  if (source === "DEFERRED_PROVIDER") return "Wayplan assigned · routing provider temporarily unavailable";
  return "Road route pending";
}

function coord(row: any) {
  const lat = Number(row?.latitude), lng = Number(row?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? `${lat},${lng}` : "";
}

function personKey(resource: Resource | undefined | null) {
  return String(resource?.name || resource?.id || "").normalize("NFC").trim().toLowerCase().replace(/[^a-z0-9\u1000-\u109f]+/g, "");
}

function googleMapSegments(origin: any, rows: Stop[]) {
  const output: { label: string; url: string }[] = [];
  const valid = rows.filter((r) => coord(r));
  if (!valid.length || !coord(origin)) return output;
  let start = coord(origin);
  for (let i = 0; i < valid.length; i += 8) {
    const chunk = valid.slice(i, i + 8);
    const destination = coord(chunk[chunk.length - 1]);
    const waypoints = chunk.slice(0, -1).map(coord).filter(Boolean).join("|");
    const q = new URLSearchParams({ api: "1", origin: start, destination, travelmode: "driving" });
    if (waypoints) q.set("waypoints", waypoints);
    output.push({ label: `Open Google Maps ${Math.floor(i / 8) + 1}`, url: `https://www.google.com/maps/dir/?${q.toString()}` });
    start = destination;
  }
  return output;
}

export default function MultiVanPlanner({ rows, region, onSaved }: { rows: Stop[]; region: string; onSaved: (result: any) => void | Promise<void> }) {
  const [context, setContext] = useState<any>(null);
  const [plans, setPlans] = useState<OperationalVanPlan[]>([]);
  const [pickup, setPickup] = useState("*");
  const pickupBatches = Array.from(new Set(rows.map((row) => pickupBatchId(row)).filter(Boolean))).sort();
  const currentPickup = pickupBatches.includes(pickup) ? pickup : "*";
  const scopedRows = currentPickup === "*" ? rows : rows.filter((row) => pickupBatchId(row) === currentPickup);
  const [count, setCount] = useState("");
  const [reason, setReason] = useState("");
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef<{ body: string; id: string } | null>(null);

  useEffect(() => {
    setPlans([]);
    setApproved(false);
    setReason("");
    setPickup((current) => current !== "*" && !rows.some((row) => pickupBatchId(row) === current) ? "*" : current);
    setContext(null);
    let alive = true;
    supabase.rpc("be_multi_van_context").then(({ data, error }) => {
      if (!alive) return;
      if (error) setMessage(error.message);
      else setContext(data);
    });
    return () => { alive = false; };
  }, [region, rows]);

  const available = (items: any[], key: string): Resource[] => (items || []).map((x) => ({
    ...x,
    available: !(context?.busy || []).some((b: any) => [b.driver_code, b.rider_code, b.helper_code, b[key]].filter(Boolean).includes(x.id)),
  }));
  const branch = region === "YANGON" ? "YGN" : region === "MANDALAY" ? "MDY" : "NPT";
  const vehicles = available(
    (context?.vehicles || []).filter((v: any) =>
      v.operation_type === "DELIVERY" && (!v.branch_code || v.branch_code === branch)
    ),
    "vehicle_code"
  );
  const drivers = available((context?.drivers || []).filter((d: any) => !d.branch_code || d.branch_code === branch), "driver_code");
  const riders = available((context?.riders || []).filter((d: any) => !d.branch_code || d.branch_code === branch), "rider_code");
  const helpers = available((context?.helpers || []).filter((d: any) => !d.branch_code || d.branch_code === branch), "helper_code");
  const origin = context?.route_origins?.[region];
  const isYangonMaster = region === "YANGON";

  function reset(next: OperationalVanPlan[] = [], preserveApproval = false) {
    setPlans(next);
    if (!preserveApproval) {
      setApproved(false);
      setReason("");
    }
    request.current = null;
  }

  function repairCrewGaps(nextPlans: OperationalVanPlan[]) {
    const waveUsed = new Map<number, Set<string>>();
    const reserve = (used: Set<string>, resource: Resource | undefined) => {
      if (!resource) return;
      used.add(`id:${resource.id}`);
      const person = personKey(resource);
      if (person) used.add(`person:${person}`);
    };
    const free = (used: Set<string>, resource: Resource | undefined) => {
      if (!resource || resource.available === false) return false;
      const person = personKey(resource);
      return !used.has(`id:${resource.id}`) && (!person || !used.has(`person:${person}`));
    };
    const find = (list: Resource[], code: string) => list.find((item) => item.id === code);
    const choose = (list: Resource[], used: Set<string>, avoidPerson = "") =>
      list.find((item) => free(used, item) && (!avoidPerson || personKey(item) !== avoidPerson));

    return nextPlans.map((plan) => {
      if (plan.crew_mode === "EMERGENCY_MANUAL") return plan;
      const wave = Math.max(1, Number(plan.wave_no || 1));
      const used = waveUsed.get(wave) || new Set<string>();
      waveUsed.set(wave, used);

      let driver = find(drivers, plan.driver_code);
      if (!free(used, driver)) driver = choose(drivers, used);
      reserve(used, driver);

      const requestedHelper = find(helpers, plan.helper_code);
      const requestedHelperPerson = personKey(requestedHelper);
      // Rider is optional. An empty rider_code is an intentional Driver-only route,
      // not a crew gap to auto-fill. Only repair a Rider that was explicitly selected.
      let rider = find(riders, plan.rider_code);
      if (!plan.rider_code) rider = undefined;
      else if (!free(used, rider)) rider = choose(riders, used, requestedHelperPerson);
      reserve(used, rider);

      // Helper is optional and must never be auto-filled. Preserve it only when the
      // operator explicitly selected an available Helper; otherwise leave it blank.
      let helper = requestedHelper;
      if (!plan.helper_code || !free(used, helper)) helper = undefined;
      reserve(used, helper);

      return {
        ...plan,
        crew_mode: "ROSTER",
        driver_code: driver?.id || "",
        rider_code: rider?.id || "",
        helper_code: helper?.id || "",
      };
    });
  }

  function patchPlan(index: number, patch: Partial<OperationalVanPlan>) {
    const next = plans.map((p, j) => j === index ? { ...p, ...patch } : p);
    // Do not auto-fill Rider after an operator explicitly selects "No rider".
    // Crew edits preserve the reviewed route and below-minimum approval.
    reset(next, true);
  }

  function autoAssignMissingCrew() {
    const repaired = repairCrewGaps(plans).map((plan, index) => ({
      ...plan,
      rider_code: plans[index]?.rider_code || "",
    }));
    reset(repaired, true);
    const stillMissing = repaired.some((plan) => plan.crew_mode !== "EMERGENCY_MANUAL" && !plan.driver_code);
    setMessage(stillMissing
      ? "Automatic crew repair could not find an available Driver for every route. Choose an available Driver or use an approved Emergency substitution."
      : "Missing Driver assignments were repaired automatically. Rider and Helper are optional; review the crew, then create the reviewed Wayplans.");
  }

  async function roadSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Authenticated Wayplan session is required for road planning.");
    return session.access_token;
  }

  async function fetchWayplanApi(path: string, init: RequestInit, label: string) {
    const attempts = 3;
    let lastError: any = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);
      try {
        const response = await fetch(path, { ...init, signal: controller.signal, cache: "no-store" });
        if (response.ok || ![502, 503, 504].includes(response.status)) return response;
        lastError = new Error(`${label} temporarily unavailable (HTTP ${response.status}).`);
      } catch (error: any) {
        const message = error?.name === "AbortError"
          ? `${label} timed out after 45 seconds.`
          : error?.message || `${label} failed to fetch.`;
        lastError = new Error(message);
      } finally {
        clearTimeout(timeoutId);
      }
      if (attempt < attempts) {
        setMessage(`${label} network request failed. Retrying automatically (${attempt + 1}/${attempts})…`);
        await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
      }
    }
    throw new Error(`${lastError?.message || `${label} failed to fetch.`} Please retry; your parcel selection is preserved.`);
  }

  async function optimizeOne(plan: OperationalVanPlan): Promise<OperationalVanPlan> {
    if (!origin) throw new Error(`${region} branch route origin is unavailable.`);
    if (plan.rows.length > 75) throw new Error(`${plan.master?.zoneName || "This route"} has ${plan.rows.length} stops. Split the zone operationally before road optimization because one route is limited to 75 stops.`);
    try {
      const token = await roadSession();
      const response = await fetchWayplanApi("/api/wayplan-route", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ origin, stops: plan.rows }),
      }, "Wayplan road optimizer");
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.diagnostics?.join(" | ") || result?.message || result?.error || `Road route service failed (${response.status}).`);
      if (!["GOOGLE_ROUTES", "MAPBOX_FALLBACK", "DEFERRED_PROVIDER"].includes(String(result.source || ""))) throw new Error("Automatic Wayplan rejected: the routing service returned an unsupported route state.");
      const byId = new Map(plan.rows.map((row) => [row.delivery_way_id, row]));
      const ordered = (result.ordered_stops || []).map((row: any) => byId.get(String(row.delivery_way_id))).filter(Boolean) as Stop[];
      if (ordered.length !== plan.rows.length) throw new Error("Road optimizer did not return every selected parcel exactly once.");
      return {
        ...plan,
        rows: ordered,
        route: {
          ...(plan.route || {}),
          source: result.source,
          route_mode: result.route_mode,
          distance_m: Number(result.distance_m || 0),
          duration_s: Number(result.duration_s || 0),
          request_count: Number(result.request_count || 0),
          fallback: Boolean(result.fallback),
          warning: [plan.master?.routingStrategy, result.warning].filter(Boolean).join(" "),
          optimized_at: result.optimized_at,
        },
      };
    } catch (error: any) {
      const message = String(error?.message || error || "");
      const providerOutage = /temporarily unavailable|HTTP 50[234]|timed out|failed to fetch|road_routing_unavailable|Mapbox road matrix failed|Google Routes matrix failed/i.test(message);
      if (!providerOutage) throw error;
      return {
        ...plan,
        route: {
          ...(plan.route || {}),
          source: "DEFERRED_PROVIDER",
          route_mode: "PROVIDER_OUTAGE_OPERATOR_REVIEW",
          manual: true,
          fallback: true,
          warning: `Road-routing provider is temporarily unavailable. The selected parcel set, van assignment, and current reviewed sequence were preserved. Review the sequence before dispatch and use Re-optimize road route when the provider recovers. ${message}`,
          optimized_at: new Date().toISOString(),
        },
      };
    }
  }

  async function optimizePlans(next: OperationalVanPlan[], note?: string) {
    setBusy(true);
    setMessage(note || "Calculating actual road routes for the affected vans…");
    try {
      const optimized: OperationalVanPlan[] = [];
      for (const plan of next) {
        if (plan.rows.some((row) => !coord(row))) {
          optimized.push({
            ...plan,
            route: {
              ...(plan.route || {}),
              source: "DEFERRED_LOCATION",
              route_mode: "TOWNSHIP_ADDRESS_SEQUENCE_PENDING_COORDINATES",
              manual: true,
              fallback: false,
              warning: "Wayplan assignment is allowed. Road optimization remains deferred until all stops on this route have valid coordinates.",
              optimized_at: new Date().toISOString(),
            },
          });
        } else {
          optimized.push(await optimizeOne(plan));
        }
      }
      reset(optimized);
      const sources = Array.from(new Set(optimized.map((p) => routeLabel(p))));
      const waveCount = Math.max(1, ...optimized.map((p) => Number(p.wave_no || 1)));
      setMessage(`Review ${optimized.length} active route(s) across ${waveCount} fleet wave(s). Route state: ${sources.join(" / ")}. Location-pending or provider-deferred routes can be assigned now and re-optimized later.`);
    } catch (e: any) {
      setPlans([]);
      setMessage(`No automatic Wayplan was generated. ${e?.message || "Road routing is unavailable."}`);
    } finally {
      setBusy(false);
    }
  }

  async function reoptimizeOne(index: number) {
    setBusy(true);
    setMessage(`Re-optimizing Route ${plans[index].master?.routeCode || index + 1} on the road network…`);
    try {
      const optimized = await optimizeOne(plans[index]);
      reset(plans.map((p, j) => j === index ? optimized : p), true);
      setMessage(`${plans[index].master?.zoneName || `Van ${index + 1}`}: ${routeLabel(optimized)}. Review the whole route map before saving.`);
    } catch (e: any) {
      setMessage(`Route was not replaced: ${e?.message || "road optimization unavailable"}`);
    } finally {
      setBusy(false);
    }
  }

  async function updateStopPin(index: number, deliveryWayId: string, latitude: number, longitude: number) {
    setBusy(true);
    setMessage("Location updated. Recalculating the affected road route…");
    try {
      const changed: OperationalVanPlan = {
        ...plans[index],
        rows: plans[index].rows.map((row) => row.delivery_way_id === deliveryWayId ? { ...row, latitude, longitude } : row),
      };
      const optimized = await optimizeOne(changed);
      reset(plans.map((p, j) => j === index ? optimized : p), true);
      setMessage(`Corrected pin saved and route recalculated as ${routeLabel(optimized)}.`);
    } catch (e: any) {
      setMessage(e?.message || "Location saved, but road route could not be recalculated. Do not create this Wayplan until re-optimization succeeds.");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  function moveStop(index: number, from: number, to: number) {
    if (to < 0 || to >= plans[index].rows.length || from === to) return;
    const rs = [...plans[index].rows];
    const [item] = rs.splice(from, 1);
    rs.splice(to, 0, item);
    const previous = plans[index].route?.source || "";
    patchPlan(index, {
      rows: rs,
      route: {
        ...(plans[index].route || {}),
        source: "OPERATOR_EDITED",
        base_source: previous === "OPERATOR_EDITED" ? plans[index].route?.base_source : previous,
        manual: true,
        fallback: plans[index].route?.fallback,
        route_mode: "OPERATOR_EDITED_SEQUENCE",
        warning: "Sequence manually edited by an authorized operator. Re-optimize to refresh road time/distance. Warehouse LIFO follows the reviewed sequence.",
      },
    });
  }

  async function yangonMasterAllocation(planningRows: Stop[] = scopedRows): Promise<OperationalVanPlan[]> {
    if (!origin) throw new Error("Yangon branch route origin is unavailable.");
    const usableVehicles = vehicles.filter((v) => v.available !== false);
    if (!usableVehicles.length) throw new Error("No delivery van is currently available.");
    const token = await roadSession();
    const response = await fetchWayplanApi("/api/wayplan-zone-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ origin, stops: planningRows }),
    }, "Yangon master route planner");
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) throw new Error(result?.message || result?.error || `Yangon master planning failed (${response.status}).`);
    const activeRoutes = (result.routes || []).filter((route: any) => Number(route.parcel_count || 0) > 0);
    if (!activeRoutes.length) throw new Error("No route-ready parcel remains inside the Yangon urban master scope.");
    const byId = new Map(planningRows.map((row) => [row.delivery_way_id, row]));
    const routeJobs = activeRoutes.map((route: any) => {
      const routeRows = (route.delivery_way_ids || []).map((id: string) => byId.get(String(id))).filter(Boolean) as Stop[];
      if (routeRows.length !== Number(route.parcel_count || 0)) throw new Error(`${route.name} contains an incomplete parcel assignment.`);
      return {
        route,
        routeRows,
        weight_kg: routeRows.reduce((sum, row) => sum + Number(row.parcel_weight_kg || 0), 0),
      };
    });
    const scheduled = scheduleSequentialRouteWaves(routeJobs, usableVehicles);
    return scheduled.map((assignment) => {
      const { route, routeRows } = assignment;
      const townshipSummary = (route.township_counts || []).map((x: any) => `${x.township} (${x.parcel_count})`).join(", ");
      return {
        vehicle_code: assignment.vehicle_code,
        driver_code: "",
        rider_code: "",
        helper_code: "",
        crew_mode: "ROSTER",
        wave_no: assignment.wave_no,
        trip_no: assignment.trip_no,
        rows: routeRows,
        master: {
          planCode: result.plan_code,
          planName: result.plan_name,
          routeCode: String(route.route_code || ""),
          zoneName: String(route.name || ""),
          configuredTownships: route.configured_townships || [],
          vehicleType: String(route.vehicle_type || ""),
          dispatchWindow: String(route.dispatch_window || ""),
          routingStrategy: String(route.routing_strategy || ""),
        },
        route: {
          source: "YANGON_MASTER_PENDING_ROAD",
          route_mode: result.sequencing_policy,
          fallback: false,
          warning: `Wave ${assignment.wave_no} · Trip ${assignment.trip_no}. ${result.plan_name} · Route ${route.route_code}: ${route.name}. ${townshipSummary ? `Today: ${townshipSummary}. ` : ""}${route.routing_strategy || ""}`,
          optimized_at: result.generated_at,
        },
      } as OperationalVanPlan;
    });
  }

  function standardAllocation(planningRows: Stop[] = scopedRows): OperationalVanPlan[] {
    const usableVehicles = vehicles.filter((v) => v.available !== false);
    const requested = count ? Number(count) : undefined;
    return allocateVans(planningRows, usableVehicles, requested, origin) as OperationalVanPlan[];
  }

  function deferredLocationAllocation(planningRows: Stop[] = scopedRows): OperationalVanPlan[] {
    const usableVehicles = vehicles.filter((v) => v.available !== false);
    if (!usableVehicles.length) throw new Error("No delivery van is currently available.");
    if (!planningRows.length) throw new Error("No parcels selected.");

    const ordered = [...planningRows].sort((a,b) =>
      String(a.township || "").localeCompare(String(b.township || "")) ||
      String((a as any).address || "").localeCompare(String((b as any).address || "")) ||
      a.delivery_way_id.localeCompare(b.delivery_way_id)
    );
    const routeCount = Math.max(1, Math.ceil(ordered.length / PRACTICAL_MAX_PARCELS_PER_VAN));
    const sizes = Array.from({ length: routeCount }, () => Math.floor(ordered.length / routeCount));
    for (let i=0;i<ordered.length % routeCount;i+=1) sizes[i] += 1;

    const jobs: any[] = [];
    let offset = 0;
    sizes.forEach((size,index) => {
      const routeRows = ordered.slice(offset, offset + size);
      offset += size;
      jobs.push({
        routeRows,
        route: {
          route_code: `DEFERRED-${index+1}`,
          name: `Deferred location route ${index+1}`,
          configured_townships: Array.from(new Set(routeRows.map((r) => String(r.township || "")).filter(Boolean))),
          routing_strategy: "Assignment created from warehouse-ready rows. Road optimization is deferred until missing delivery coordinates are supplied.",
        },
        weight_kg: routeRows.reduce((sum,row) => sum + Number((row as any).parcel_weight_kg || 0),0),
      });
    });

    const scheduled = scheduleSequentialRouteWaves(jobs, usableVehicles);
    return scheduled.map((assignment:any) => ({
      vehicle_code: assignment.vehicle_code,
      driver_code: "",
      rider_code: "",
      helper_code: "",
      crew_mode: "ROSTER",
      wave_no: assignment.wave_no,
      trip_no: assignment.trip_no,
      rows: assignment.routeRows,
      master: {
        planCode: "DEFERRED_LOCATION_ASSIGNMENT_V126",
        planName: "Location-pending Wayplan assignment",
        routeCode: assignment.route.route_code,
        zoneName: assignment.route.name,
        configuredTownships: assignment.route.configured_townships,
        routingStrategy: assignment.route.routing_strategy,
      },
      route: {
        source: "DEFERRED_LOCATION",
        route_mode: "TOWNSHIP_ADDRESS_SEQUENCE_PENDING_COORDINATES",
        fallback: false,
        manual: true,
        warning: assignment.route.routing_strategy,
        optimized_at: new Date().toISOString(),
      },
    } as OperationalVanPlan));
  }

  async function preview() {
    setBusy(true);
    setMessage(isYangonMaster ? "Stage 1/2: balancing compatible Yangon volumes to 50–75 parcels and assigning sequential fleet waves…" : "Stage 1/2: allocating parcels to practical delivery vans…");
    try {
      if (!origin) throw new Error(`${region} branch route origin is unavailable.`);
      let planningRows = scopedRows;
      const pendingBefore = scopedRows.filter((row) => !coord(row)).length;
      if (pendingBefore) {
        if (pendingBefore > LOCATION_RECOVERY_INTERACTIVE_LIMIT) {
          setMessage(`${pendingBefore} selected parcel locations are still pending. Wayplan generation will continue immediately with deferred road optimization instead of waiting on map providers.`);
        } else {
          setMessage(`Stage 0/2: trying a short location recovery for ${pendingBefore} parcel${pendingBefore === 1 ? "" : "s"}; provider quota/errors will not block Wayplan generation…`);
          try {
            const recoveryTask = recoverWayplanLocations(scopedRows, {
              resolve: async (row) => {
                try {
                  return await resolveDeliveryLocation({
                    deliveryWayId: row.delivery_way_id,
                    address: String((row as any).address || (row as any).recipient_address || ""),
                    township: String(row.township || ""),
                    merchantId: String((row as any).merchant_code || (row as any).merchant_id || ""),
                    client: supabase,
                  });
                } catch (error) {
                  if (isProviderQuotaError(error)) return null;
                  throw error;
                }
              },
              persist: async (location) => {
                await saveDeliveryLocation(supabase, location as any);
              },
              concurrency: 3,
            });
            const recovery = await Promise.race([
              recoveryTask,
              new Promise<never>((_, reject) => window.setTimeout(
                () => reject(new Error("Location recovery timed out; continue with deferred road optimization.")),
                LOCATION_RECOVERY_TIMEOUT_MS,
              )),
            ]);
            planningRows = recovery.rows as Stop[];
            if (recovery.recovered) {
              setMessage(`Recovered and synchronized ${recovery.recovered} of ${recovery.attempted} missing delivery location${recovery.attempted === 1 ? "" : "s"}. Continuing Wayplan preparation…`);
            } else if (recovery.unresolved) {
              setMessage(`No missing location could be safely auto-accepted. ${recovery.unresolved} parcel${recovery.unresolved === 1 ? "" : "s"} will stay selectable with deferred road optimization until the pin is reviewed.`);
            }
          } catch (error) {
            planningRows = scopedRows;
            const quota = isProviderQuotaError(error);
            setMessage(quota
              ? "Map provider quota is exhausted. Selected parcels remain available and Wayplan generation is continuing with deferred road optimization."
              : "Location recovery is unavailable or timed out. Selected parcels remain available and Wayplan generation is continuing with deferred road optimization.");
          }
        }
      }

      const hasLocationPending = planningRows.some((row) => !coord(row));
      const strategic = hasLocationPending
        ? deferredLocationAllocation(planningRows)
        : (isYangonMaster ? await yangonMasterAllocation(planningRows) : standardAllocation(planningRows));
      // Driver is mandatory. Rider/Helper remain optional.
      // For sub-50 routes, assign an available Rider automatically when possible so the route
      // uses the approved Rider minimum exemption instead of forcing an unnecessary exception approval.
      let crewed = repairCrewGaps(assignCrews(strategic, drivers, [], [], convertMyanmarTownshipToEnglish) as OperationalVanPlan[]);
      const riderPool = riders.filter((r) => r.available !== false);
      const riderUsedByWave = new Map<number, Set<string>>();
      crewed = crewed.map((plan) => {
        if (plan.crew_mode === "EMERGENCY_MANUAL" || plan.rows.length >= 50 || plan.rider_code) return plan;
        const wave = Math.max(1, Number(plan.wave_no || 1));
        const used = riderUsedByWave.get(wave) || new Set<string>();
        riderUsedByWave.set(wave, used);
        const rider = riderPool.find((candidate) =>
          !used.has(candidate.id) &&
          personKey(candidate) !== personKey(drivers.find((d) => d.id === plan.driver_code))
        );
        if (!rider) return plan;
        used.add(rider.id);
        return { ...plan, rider_code: rider.id };
      });
      if (crewed.some((plan) => plan.crew_mode !== "EMERGENCY_MANUAL" && !plan.driver_code)) {
        throw new Error("The route plan was created, but no available Driver could be assigned. Refresh crew availability or use an approved Emergency substitution.");
      }
      setBusy(false);
      await optimizePlans(
        crewed,
        crewed.some((plan) => plan.rows.some((row) => !coord(row)))
          ? "Stage 2/2: saving assignment-ready routes. Road optimization will run only for routes with complete coordinates…"
          : "Stage 2/2: optimizing every active route on the actual road network…"
      );
    } catch (e: any) {
      setPlans([]);
      setMessage(`No automatic Wayplan was generated. ${e?.message || "Strategic road planning failed."} The selected parcels remain selected; you do not need to restart the queue workflow.`);
      setBusy(false);
    }
  }

  function crewName(list: Resource[], code: string) {
    return list.find((x) => x.id === code)?.name || "";
  }

  async function save() {
    if (plans.some((p) => !["GOOGLE_ROUTES", "MAPBOX_FALLBACK", "OPERATOR_EDITED", "DEFERRED_LOCATION", "DEFERRED_PROVIDER"].includes(String(p.route?.source || "")))) {
      setMessage("Cannot create Wayplans: every active route must be road-reviewed or explicitly marked as a deferred assignment.");
      return;
    }
    setBusy(true);

    let plansForSave = plans;
    const removedBusyHelpers: string[] = [];
    try {
      // Refresh physical crew availability immediately before creation. Helper is optional:
      // if it became busy after preview, remove it rather than failing the whole Wayplan.
      const fresh = await supabase.rpc("be_multi_van_context");
      if (!fresh.error && fresh.data) {
        const physicallyBusyCodes = new Set<string>();
        for (const item of fresh.data.busy || []) {
          [item?.driver_code,item?.rider_code,item?.helper_code].filter(Boolean).forEach((code:any)=>physicallyBusyCodes.add(String(code)));
        }
        plansForSave = plans.map((plan) => {
          if (plan.crew_mode === "EMERGENCY_MANUAL" || !plan.helper_code || !physicallyBusyCodes.has(String(plan.helper_code))) return plan;
          removedBusyHelpers.push(crewName(helpers, plan.helper_code) || String(plan.helper_code));
          return {...plan,helper_code:""};
        });
        if (removedBusyHelpers.length) setPlans(plansForSave);
      }
    } catch {
      // The backend performs the authoritative crew guard; continue if this optional refresh fails.
    }

    setMessage(`Creating ${plansForSave.length} reviewed Wayplan${plansForSave.length === 1 ? "" : "s"} for ${plansForSave.reduce((sum, plan) => sum + plan.rows.length, 0)} parcels…${removedBusyHelpers.length ? " Busy optional Helper assignment removed automatically." : ""}`);
    const payload = {
      region_code: region,
      planning_mode: isYangonMaster ? "YANGON_MASTER_MULTI_TRIP" : "STANDARD_50_75",
      plans: plansForSave.map((p) => ({
        vehicle_code: p.vehicle_code,
        wave_no: p.wave_no,
        trip_no: p.trip_no,
        crew_mode: p.crew_mode || "ROSTER",
        driver_code: p.crew_mode === "EMERGENCY_MANUAL" ? null : p.driver_code,
        rider_code: p.crew_mode === "EMERGENCY_MANUAL" ? null : p.rider_code,
        helper_code: p.crew_mode === "EMERGENCY_MANUAL" ? null : p.helper_code,
        driver_name: p.crew_mode === "EMERGENCY_MANUAL" ? p.manual_driver_name : crewName(drivers, p.driver_code),
        rider_name: p.crew_mode === "EMERGENCY_MANUAL" ? p.manual_rider_name : crewName(riders, p.rider_code),
        helper_name: p.crew_mode === "EMERGENCY_MANUAL" ? p.manual_helper_name : crewName(helpers, p.helper_code),
        emergency_substitution_reason: p.emergency_substitution_reason || null,
        delivery_way_ids: p.rows.map((r) => r.delivery_way_id),
        master_zone: p.master || null,
        route: {
          source: p.route?.source || null,
          base_source: p.route?.base_source || null,
          route_mode: p.route?.route_mode || null,
          distance_m: p.route?.distance_m || 0,
          duration_s: p.route?.duration_s || 0,
          request_count: p.route?.request_count || 0,
          fallback: Boolean(p.route?.fallback),
          manual: Boolean(p.route?.manual),
          warning: p.route?.warning || null,
          optimized_at: p.route?.optimized_at || new Date().toISOString(),
        },
      })),
      approve_below_minimum: approved,
      below_minimum_reason: reason,
    };
    const body = JSON.stringify(payload);
    if (request.current?.body !== body) request.current = { body, id: crypto.randomUUID() };
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const rpcRequest = supabase.rpc("be_generate_multi_van_v43", { p_payload: { ...payload, request_id: request.current!.id } });
      const timeoutRequest = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("No response from Wayplan creation after 60 seconds. The request ID is preserved, so retrying will not create duplicates.")), 60000);
      });
      const { data, error } = await Promise.race([rpcRequest, timeoutRequest]) as any;
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Wayplan creation failed.");

      const createdWayplans = Array.isArray(data.wayplans) ? data.wayplans : [];
      const createdIds = createdWayplans.map((wayplan: any) => String(wayplan?.wayplan_id || "")).filter(Boolean);
      setMessage(`${createdWayplans.length} road-reviewed Wayplan${createdWayplans.length === 1 ? "" : "s"} created for ${data.parcel_count || 0} parcels across ${data.wave_count || 1} fleet wave(s).${removedBusyHelpers.length ? ` Optional busy Helper removed: ${removedBusyHelpers.join(", ")}.` : ""} Next: review the CREATED Wayplan/manifest, complete Supervisor approval + mandatory Dispatch scan, then publish Dispatch.`);
      setPlans([]);
      request.current = null;
      await onSaved({ ...data, created_wayplan_ids: createdIds });
    } catch (e: any) {
      setMessage(`Wayplan creation failed: ${e?.message || "Unknown error."} The reviewed routes are still on screen. Correct the issue and retry; the same request ID prevents duplicate Wayplans.`);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setBusy(false);
    }
  }

  const short = plans.filter((p) => p.rows.length < 50 && !hasRiderAssignment(p));
  const riderMinimumExempt = plans.filter((p) => p.rows.length < 50 && hasRiderAssignment(p));
  const oversized = plans.filter((p) => p.rows.length > 75);
  const invalidCrewPlans = plans.filter((p) => p.crew_mode === "EMERGENCY_MANUAL"
    ? !p.manual_driver_name?.trim() || !p.manual_rider_name?.trim() || String(p.emergency_substitution_reason || "").trim().length < 5
    : !p.driver_code);
  const invalidCrew = invalidCrewPlans.length > 0;
  const roadInvalidPlans = plans.filter((p) => !["GOOGLE_ROUTES", "MAPBOX_FALLBACK", "OPERATOR_EDITED", "DEFERRED_LOCATION", "DEFERRED_PROVIDER"].includes(String(p.route?.source || "")));
  const roadInvalid = roadInvalidPlans.length > 0;
  const readinessIssues: string[] = [];
  if (!plans.length) readinessIssues.push("Generate and review at least one Wayplan assignment.");
  invalidCrewPlans.forEach((plan, index) => {
    const label = plan.master?.routeCode || `route ${index + 1}`;
    if (plan.crew_mode === "EMERGENCY_MANUAL") readinessIssues.push(`${label}: enter Emergency Driver, Emergency Rider and a substitution reason.`);
    else {
      if (!plan.driver_code) readinessIssues.push(`${label}: choose a Driver.`);
    }
  });
  roadInvalidPlans.forEach((plan, index) => readinessIssues.push(`${plan.master?.routeCode || `route ${index + 1}`}: road optimization is incomplete.`));
  if (oversized.length) readinessIssues.push("Split any route above 75 parcels before creation.");
  if (!isYangonMaster && short.length > 1) readinessIssues.push("More than one Driver/van-only route is below 50 parcels; rebalance, assign a Rider, or hold low-volume parcels.");
  if (short.length > 0 && !approved) readinessIssues.push(isYangonMaster ? "Approve the unavoidable below-50 Driver/van-only hard-fence route batch." : "Approve the one Driver/van-only route below 50 parcels.");
  if (short.length > 0 && reason.trim().length < 5) readinessIssues.push(isYangonMaster ? "Enter an operational reason of at least 5 characters for the below-50 Driver/van-only hard-fence route batch." : "Enter an operational reason of at least 5 characters for the below-50 Driver/van-only route.");
  const cannotSave = busy || readinessIssues.length > 0;

  return <section style={{ padding: 16, border: "1px solid #1a3a5c", borderRadius: 16, background: "#0b2236", display: "grid", gap: 12 }}>
    <h2 style={{ margin: 0 }}>{isYangonMaster ? "Yangon Van Assignment Master · road optimized" : "Strategic road-based delivery van planning"}</h2>
    {isYangonMaster ? <>
      <p style={{ margin: 0 }}>Yangon Head Office planning balances compatible Yangon volume into the <strong>50–75 parcels per route</strong> operating band, then assigns those routes across the active delivery fleet in sequential waves. A vehicle can run another trip only in a later wave.</p>
      <p style={{ margin: 0 }}>For an operator-selected batch of up to 75 Britium ways, the system keeps all selected ways on one delivery van. For larger batches above 75, Yangon zone/hard-fence rules guide multi-van balancing. Dala/Seikkyi Kanaungto remain outside Britium van planning.</p>
    </> : <>
      <p style={{ margin: 0 }}>Plan {scopedRows.length} ready parcels using the standard <strong>50–{PRACTICAL_MAX_PARCELS_PER_VAN} parcels per delivery van</strong> operating band. Pickup/highway fleets remain reserved by Fleet Master role.</p>
    </>}
    <p style={{ margin: 0 }}>Straight-line/geographic fallback is not accepted for automatic Wayplan creation. Temporary billing-safe mode uses Mapbox road routing first; Google Routes remains available as recovery and can be restored as primary later. Review each active route on the whole-route map before creation.</p>

    <div data-wayplan-selection-summary-v52="true" style={{ border: "1px solid #38566b", borderRadius: 10, padding: 10, background: "#102b45" }}>
      <strong>{rows.length} selected parcel{rows.length === 1 ? "" : "s"} · {pickupBatches.length} pickup batch{pickupBatches.length === 1 ? "" : "es"} detected</strong>
      <div style={{ marginTop: 4, fontSize: 12 }}>{rows.length ? (pickupBatches.length ? "Pickup batches are resolved from pickup_id / pickup_way_id and legacy consolidated IDs." : "No pickup batch reference is attached to the selected parcels; planning can still use All selected pickups, but the source data should be reviewed.") : "Select parcels from the Ready for Wayplan queue first."}</div>
    </div>

    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <label>Pickup batch <select style={field} value={currentPickup} disabled={busy || !rows.length} onChange={(e) => { setPickup(e.target.value); reset(); }}><option value="*">All selected pickups ({rows.length})</option>{pickupBatches.map((id) => <option key={id} value={id}>{id} ({rows.filter((row) => pickupBatchId(row) === id).length})</option>)}</select></label>
      {!isYangonMaster && <label>Vans to use <select style={field} value={count} disabled={busy} onChange={(e) => { setCount(e.target.value); reset(); }}><option value="">Automatic - practical van count</option>{vehicles.filter((v) => v.available).map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>}
      <button style={button} disabled={busy || !context || !scopedRows.length || !origin} onClick={preview}>{busy ? "Planning road routes…" : isYangonMaster ? "Generate reviewed Yangon route plan" : "Generate reviewed route plan"}</button>
    </div>

    {message && <p role="status" style={{ margin: 0 }}>{message}</p>}

    {plans.map((plan, i) => {
      const delivery = plan.rows;
      const lifo = [...delivery].reverse();
      const maps = googleMapSegments(origin, delivery);
      const emergency = plan.crew_mode === "EMERGENCY_MANUAL";
      const vehicleName = vehicles.find((v) => v.id === plan.vehicle_code)?.name || plan.vehicle_code || `Van ${i + 1}`;
      const title = plan.master ? `Wave ${plan.wave_no || 1} · Trip ${plan.trip_no || 1} · Route ${plan.master.routeCode} · ${plan.master.zoneName}` : `Van ${i + 1}`;
      return <section key={`${plan.wave_no || 1}-${plan.master?.routeCode || i}-${plan.vehicle_code}`} style={{ padding: 12, border: "1px solid #38566b", borderRadius: 10 }}>
        <strong>{title}: {delivery.length} parcels · {Array.from(new Set(delivery.map((r) => r.township))).join(", ")}</strong>
        {plan.master && <div style={{ marginTop: 4, fontSize: 12 }}>Master plan: {plan.master.planName} · Vehicle: {vehicleName} · Preferred type: {plan.master.vehicleType} · Dispatch: {plan.master.dispatchWindow}</div>}
        <div style={{ marginTop: 6, fontWeight: 800 }}>{routeLabel(plan)}{plan.route?.duration_s ? ` · ${Math.round(Number(plan.route.duration_s) / 60)} min` : ""}{plan.route?.distance_m ? ` · ${(Number(plan.route.distance_m) / 1000).toFixed(1)} km` : ""}</div>
        {plan.route?.warning && <div style={{ marginTop: 5 }}>{plan.route.warning}</div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button style={secondary} disabled={busy} onClick={() => void reoptimizeOne(i)}>Re-optimize road route</button>
          {maps.map((m) => <a key={m.label} href={m.url} target="_blank" rel="noreferrer" style={{ ...secondary, textDecoration: "none" }}>{m.label}</a>)}
        </div>

        <FullVanRouteMap origin={origin} plan={plan} vanLabel={`${title} · ${vehicleName}`} allowLocationEdit onStopPinUpdated={(deliveryWayId, latitude, longitude) => updateStopPin(i, deliveryWayId, latitude, longitude)} />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          <label>Vehicle <select style={field} disabled={busy} value={plan.vehicle_code} onChange={(e) => patchPlan(i, { vehicle_code: e.target.value })}><option value="">Choose</option>{vehicles.filter((x) => x.available || x.id === plan.vehicle_code).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label>Crew mode <select style={field} disabled={busy} value={plan.crew_mode || "ROSTER"} onChange={(e) => patchPlan(i, { crew_mode: e.target.value as any })}><option value="ROSTER">Normal roster</option><option value="EMERGENCY_MANUAL">Emergency substitution</option></select></label>
          {!emergency && <>
            <label>Driver * <select style={field} disabled={busy} value={plan.driver_code} onChange={(e) => patchPlan(i, { driver_code: e.target.value })}><option value="">Choose name</option>{drivers.filter((x) => x.available || x.id === plan.driver_code).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label>Rider (optional) <select data-rider-optional-v57="true" style={field} disabled={busy} value={plan.rider_code || ""} onChange={(e) => patchPlan(i, { rider_code: e.target.value })}><option value="">No rider — Driver only</option>{riders.filter((x) => x.available || x.id === plan.rider_code).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label>Helper (optional) <select style={field} disabled={busy} value={plan.helper_code} onChange={(e) => patchPlan(i, { helper_code: e.target.value })}><option value="">No helper</option>{helpers.filter((x) => x.available || x.id === plan.helper_code).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          </>}
        </div>

        {emergency && <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(180px,1fr))", gap: 8, marginTop: 10, padding: 10, border: "1px solid #8f5a2a", borderRadius: 8 }}>
          <input style={field} disabled={busy} placeholder="Emergency Driver name" value={plan.manual_driver_name || ""} onChange={(e) => patchPlan(i, { manual_driver_name: e.target.value })} />
          <input style={field} disabled={busy} placeholder="Emergency Rider name" value={plan.manual_rider_name || ""} onChange={(e) => patchPlan(i, { manual_rider_name: e.target.value })} />
          <input style={field} disabled={busy} placeholder="Emergency Helper name (optional)" value={plan.manual_helper_name || ""} onChange={(e) => patchPlan(i, { manual_helper_name: e.target.value })} />
          <input style={{ ...field, gridColumn: "1 / -1" }} disabled={busy} placeholder="Mandatory reason for emergency substitution" value={plan.emergency_substitution_reason || ""} onChange={(e) => patchPlan(i, { emergency_substitution_reason: e.target.value })} />
          <div style={{ gridColumn: "1 / -1", fontSize: 12 }}>Emergency manual crew is audit-recorded. A manually substituted Rider has no Rider-App login mapping unless separately provisioned; use only as an approved operational exception.</div>
        </div>}

        <details style={{ marginTop: 10 }} open>
          <summary>Editable delivery sequence</summary>
          <div style={{ maxHeight: 320, overflow: "auto" }}>{delivery.map((row, n) => <div key={row.delivery_way_id} style={{ padding: 5, display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 8, alignItems: "center" }}><strong>{n + 1}.</strong><span>{String((row as any).waybill_no || row.delivery_way_id)} · {row.township}</span><span style={{ display: "flex", gap: 4 }}><button style={secondary} disabled={busy || n === 0} onClick={() => moveStop(i, n, n - 1)}>↑</button><button style={secondary} disabled={busy || n === delivery.length - 1} onClick={() => moveStop(i, n, n + 1)}>↓</button></span></div>)}</div>
        </details>

        <details style={{ marginTop: 10 }}>
          <summary>Warehouse LIFO loading order</summary>
          <ol>{lifo.map((row) => <li key={row.delivery_way_id}>{String((row as any).waybill_no || row.delivery_way_id)} · {row.township}</li>)}</ol>
        </details>
      </section>;
    })}

    {riderMinimumExempt.length > 0 && <div data-rider-minimum-exempt-v84="true" style={{ padding: 10, border: "1px solid #2f855a", borderRadius: 8, background: "rgba(47,133,90,0.12)" }}><strong>Rider assignment: no minimum parcel count.</strong><div style={{ marginTop: 4 }}>{riderMinimumExempt.length} Rider-selected route{riderMinimumExempt.length === 1 ? "" : "s"} below 50 parcels can be created without below-minimum approval or reason. The 50-parcel minimum applies only to Driver/van-only routes.</div></div>}
    {short.length > 0 && <div style={{ padding: 10, border: "1px solid #8f5a2a", borderRadius: 8 }}><label><input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} /> {isYangonMaster ? `Approve ${short.length} unavoidable below-50 Driver/van-only hard-fence route${short.length === 1 ? "" : "s"}` : "Approve one Driver/van-only route below 50 parcels"}</label><input style={{ ...field, width: "100%", marginTop: 8 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isYangonMaster ? "Mandatory operational reason for Driver/van-only hard-fence low-volume route(s)" : "Mandatory operational reason"} /></div>}
    {!isYangonMaster && short.length > 1 && <p style={{ margin: 0 }}>More than one Driver/van-only route is below 50 parcels. Reassign, select a Rider, or hold low-volume parcels before creation.</p>}
    {oversized.length > 0 && <p style={{ margin: 0 }}>One or more active routes exceeds 75 stops. Split that operational zone before creation.</p>}
    {plans.length > 0 && <div data-wayplan-create-readiness-v56="true" style={{ padding: 10, border: `1px solid ${readinessIssues.length ? "#8f5a2a" : "#2f855a"}`, borderRadius: 8, background: readinessIssues.length ? "rgba(143,90,42,0.12)" : "rgba(47,133,90,0.12)" }}>
      <strong>{readinessIssues.length ? "Creation blocked — complete these items:" : "Ready to create reviewed Wayplans"}</strong>
      {readinessIssues.length ? <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>{readinessIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : <div style={{ marginTop: 4 }}>Road route, fleet and mandatory Driver checks are complete. Rider-selected routes have no minimum parcel requirement; the 50-parcel minimum applies only to Driver/van-only routes. Helper remains optional.</div>}
      {invalidCrew && <button type="button" style={{ ...secondary, marginTop: 8 }} disabled={busy} onClick={autoAssignMissingCrew}>Auto-assign missing Driver</button>}
    </div>}
    <button data-create-reviewed-wayplans-v56="true" style={{ ...button, opacity: cannotSave ? 0.55 : 1 }} disabled={cannotSave} onClick={save}>{busy ? "Creating reviewed Wayplans…" : cannotSave ? "Create reviewed Wayplans — resolve items above" : "Create reviewed Wayplans"}</button>
  </section>;
}