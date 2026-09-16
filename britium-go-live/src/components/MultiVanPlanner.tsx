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
import FullVanRouteMap from "@/components/FullVanRouteMap";

const field: React.CSSProperties = { padding: 10, borderRadius: 8, color: "#102b45", background: "white", border: "1px solid #9cc2d9" };
const button: React.CSSProperties = { ...field, background: "#f6b84b", fontWeight: 800, cursor: "pointer" };
const secondary: React.CSSProperties = { ...field, background: "#173a55", color: "white", fontWeight: 700, cursor: "pointer" };

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

function routeLabel(plan: VanPlan) {
  const source = String(plan.route?.source || "");
  if (source === "OPERATOR_EDITED") return `Operator-edited route · based on ${String(plan.route?.base_source || "existing road plan").replaceAll("_", " ")}`;
  if (source === "GOOGLE_ROUTES") return "Google Routes road optimized";
  if (source === "MAPBOX_FALLBACK") return "Mapbox road optimized fallback";
  return "Road route pending";
}

function coord(row: any) {
  const lat = Number(row?.latitude), lng = Number(row?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? `${lat},${lng}` : "";
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

export default function MultiVanPlanner({ rows, region, onSaved }: { rows: Stop[]; region: string; onSaved: () => void }) {
  const [context, setContext] = useState<any>(null);
  const [plans, setPlans] = useState<OperationalVanPlan[]>([]);
  const [pickup, setPickup] = useState("*");
  const currentPickup = pickup;
  const scopedRows = currentPickup === "*" ? rows : rows.filter((r) => String(r.pickup_id || "") === currentPickup);
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
  const vehicles = available((context?.vehicles || []).filter((v: any) => v.operation_type === "DELIVERY"), "vehicle_code");
  const branch = region === "YANGON" ? "YGN" : region === "MANDALAY" ? "MDY" : "NPT";
  const drivers = available((context?.drivers || []).filter((d: any) => !d.branch_code || d.branch_code === branch), "driver_code");
  const riders = available((context?.riders || []).filter((d: any) => !d.branch_code || d.branch_code === branch), "rider_code");
  const helpers = available((context?.helpers || []).filter((d: any) => !d.branch_code || d.branch_code === branch), "helper_code");
  const origin = context?.route_origins?.[region];
  const isYangonMaster = region === "YANGON";

  function reset(next: OperationalVanPlan[] = []) {
    setPlans(next);
    setApproved(false);
    setReason("");
    request.current = null;
  }

  function patchPlan(index: number, patch: Partial<OperationalVanPlan>) {
    reset(plans.map((p, j) => j === index ? { ...p, ...patch } : p));
  }

  async function roadSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Authenticated Wayplan session is required for road planning.");
    return session.access_token;
  }

  async function optimizeOne(plan: OperationalVanPlan): Promise<OperationalVanPlan> {
    if (!origin) throw new Error(`${region} branch route origin is unavailable.`);
    if (plan.rows.length > 75) throw new Error(`${plan.master?.zoneName || "This route"} has ${plan.rows.length} stops. Split the zone operationally before road optimization because one route is limited to 75 stops.`);
    const token = await roadSession();
    const response = await fetch("/api/wayplan-route", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ origin, stops: plan.rows }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) throw new Error(result?.diagnostics?.join(" | ") || result?.message || result?.error || `Road route service failed (${response.status}).`);
    if (!["GOOGLE_ROUTES", "MAPBOX_FALLBACK"].includes(String(result.source || ""))) throw new Error("Automatic Wayplan rejected: a real road-routing source was not available.");
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
  }

  async function optimizePlans(next: OperationalVanPlan[], note?: string) {
    setBusy(true);
    setMessage(note || "Calculating actual road routes for the affected vans…");
    try {
      const optimized: OperationalVanPlan[] = [];
      for (const plan of next) optimized.push(await optimizeOne(plan));
      reset(optimized);
      const sources = Array.from(new Set(optimized.map((p) => routeLabel(p))));
      const waveCount = Math.max(1, ...optimized.map((p) => Number(p.wave_no || 1)));
      setMessage(`Review ${optimized.length} active route(s) across ${waveCount} fleet wave(s). Road source: ${sources.join(" / ")}. Warehouse loading is the exact reverse of each reviewed road route.`);
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
      reset(plans.map((p, j) => j === index ? optimized : p));
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
      reset(plans.map((p, j) => j === index ? optimized : p));
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

  async function yangonMasterAllocation(): Promise<OperationalVanPlan[]> {
    if (!origin) throw new Error("Yangon branch route origin is unavailable.");
    const usableVehicles = vehicles.filter((v) => v.available !== false);
    if (!usableVehicles.length) throw new Error("No delivery van is currently available.");
    const token = await roadSession();
    const response = await fetch("/api/wayplan-zone-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ origin, stops: scopedRows }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) throw new Error(result?.message || result?.error || `Yangon master planning failed (${response.status}).`);
    const activeRoutes = (result.routes || []).filter((route: any) => Number(route.parcel_count || 0) > 0);
    if (!activeRoutes.length) throw new Error("No route-ready parcel remains inside the Yangon urban master scope.");
    const byId = new Map(scopedRows.map((row) => [row.delivery_way_id, row]));
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

  function standardAllocation(): OperationalVanPlan[] {
    const usableVehicles = vehicles.filter((v) => v.available !== false);
    const requested = count ? Number(count) : undefined;
    return allocateVans(scopedRows, usableVehicles, requested, origin) as OperationalVanPlan[];
  }

  async function preview() {
    setBusy(true);
    setMessage(isYangonMaster ? "Stage 1/2: balancing compatible Yangon volumes to 50–75 parcels and assigning sequential fleet waves…" : "Stage 1/2: allocating parcels to practical delivery vans…");
    try {
      if (!origin) throw new Error(`${region} branch route origin is unavailable.`);
      const strategic = isYangonMaster ? await yangonMasterAllocation() : standardAllocation();
      const crewed = assignCrews(strategic, drivers, riders, helpers, convertMyanmarTownshipToEnglish) as OperationalVanPlan[];
      setBusy(false);
      await optimizePlans(crewed, "Stage 2/2: optimizing every active route on the actual road network…");
    } catch (e: any) {
      setPlans([]);
      setMessage(`No automatic Wayplan was generated. ${e?.message || "Strategic road planning failed."}`);
      setBusy(false);
    }
  }

  function crewName(list: Resource[], code: string) {
    return list.find((x) => x.id === code)?.name || "";
  }

  async function save() {
    if (plans.some((p) => !["GOOGLE_ROUTES", "MAPBOX_FALLBACK", "OPERATOR_EDITED"].includes(String(p.route?.source || "")))) {
      setMessage("Cannot create Wayplans: every active route must have a reviewed road-based route.");
      return;
    }
    setBusy(true);
    setMessage("");
    const payload = {
      region_code: region,
      planning_mode: isYangonMaster ? "YANGON_MASTER_MULTI_TRIP" : "STANDARD_50_75",
      plans: plans.map((p) => ({
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
    try {
      const { data, error } = await supabase.rpc("be_generate_multi_van_v43", { p_payload: { ...payload, request_id: request.current!.id } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Wayplan creation failed.");
      setMessage(`${data.wayplans.length} road-reviewed Wayplans created for ${data.parcel_count} parcels across ${data.wave_count || 1} fleet wave(s), with immutable generated route versions and Warehouse LIFO snapshots.`);
      setPlans([]);
      request.current = null;
      onSaved();
    } catch (e: any) {
      setMessage(`${e.message} Retry uses the same request to avoid duplicate Wayplans.`);
    } finally {
      setBusy(false);
    }
  }

  const short = plans.filter((p) => p.rows.length < 50);
  const oversized = plans.filter((p) => p.rows.length > 75);
  const invalidCrew = plans.some((p) => p.crew_mode === "EMERGENCY_MANUAL"
    ? !p.manual_driver_name?.trim() || !p.manual_rider_name?.trim() || String(p.emergency_substitution_reason || "").trim().length < 5
    : !p.driver_code || !p.rider_code);
  const roadInvalid = plans.some((p) => !["GOOGLE_ROUTES", "MAPBOX_FALLBACK", "OPERATOR_EDITED"].includes(String(p.route?.source || "")));
  const cannotSave = busy || !plans.length || invalidCrew || roadInvalid || oversized.length > 0 || short.length > 1 || (short.length === 1 && (!approved || reason.trim().length < 5));

  return <section style={{ padding: 16, border: "1px solid #1a3a5c", borderRadius: 16, background: "#0b2236", display: "grid", gap: 12 }}>
    <h2 style={{ margin: 0 }}>{isYangonMaster ? "Yangon Van Assignment Master · road optimized" : "Strategic road-based delivery van planning"}</h2>
    {isYangonMaster ? <>
      <p style={{ margin: 0 }}>East Dagon Logistics Center balances compatible Yangon volume into the <strong>50–75 parcels per route</strong> operating band, then assigns those routes across the active delivery fleet in sequential waves. A vehicle can run another trip only in a later wave.</p>
      <p style={{ margin: 0 }}>The Hlaing River hard fence remains isolated, Downtown is never merged with East Suburbs, and Dala/Seikkyi Kanaungto remain outside Britium van planning.</p>
    </> : <>
      <p style={{ margin: 0 }}>Plan {scopedRows.length} ready parcels using the standard <strong>50–{PRACTICAL_MAX_PARCELS_PER_VAN} parcels per delivery van</strong> operating band. Pickup/highway fleets remain reserved by Fleet Master role.</p>
    </>}
    <p style={{ margin: 0 }}>Straight-line/geographic fallback is not accepted for automatic Wayplan creation. Google Routes is primary; Mapbox may be used only as a road-based fallback. Review each active route on the whole-route map before creation.</p>

    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <label>Pickup batch <select style={field} value={currentPickup} disabled={busy} onChange={(e) => { setPickup(e.target.value); reset(); }}><option value="*">All ready pickups</option>{Array.from(new Set(rows.map((r) => String(r.pickup_id || "")))).filter(Boolean).map((id) => <option key={id} value={id}>{id}</option>)}</select></label>
      {!isYangonMaster && <label>Vans to use <select style={field} value={count} disabled={busy} onChange={(e) => { setCount(e.target.value); reset(); }}><option value="">Automatic - practical van count</option>{vehicles.filter((v) => v.available).map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>}
      <button style={button} disabled={busy || !context || !scopedRows.length || !origin} onClick={preview}>{busy ? "Planning road routes…" : isYangonMaster ? "Generate Yangon master plan" : "Generate strategic road plan"}</button>
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
            <label>Driver <select style={field} disabled={busy} value={plan.driver_code} onChange={(e) => patchPlan(i, { driver_code: e.target.value })}><option value="">Choose name</option>{drivers.filter((x) => x.available || x.id === plan.driver_code).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label>Rider <select style={field} disabled={busy} value={plan.rider_code} onChange={(e) => patchPlan(i, { rider_code: e.target.value })}><option value="">Choose name</option>{riders.filter((x) => x.available || x.id === plan.rider_code).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
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

    {short.length === 1 && <div style={{ padding: 10, border: "1px solid #8f5a2a", borderRadius: 8 }}><label><input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} /> Approve one route below 50 parcels</label><input style={{ ...field, width: "100%", marginTop: 8 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Mandatory operational reason" /></div>}
    {short.length > 1 && <p style={{ margin: 0 }}>More than one active route is below 50 parcels. Reassign or hold low-volume parcels before creation.</p>}
    {oversized.length > 0 && <p style={{ margin: 0 }}>One or more active routes exceeds 75 stops. Split that operational zone before creation.</p>}
    <button style={button} disabled={cannotSave} onClick={save}>Create reviewed Wayplans</button>
  </section>;
}