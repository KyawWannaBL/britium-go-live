// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock3,
  Database,
  Gauge,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Save,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  calculateRouteInFixedOrder,
  coordinateFromRecord,
  geocodeMissingStops,
  optimizeRouteFromHeadOffice,
  routeSavePayload,
  type OptimizedRoute,
  type RouteOrigin,
  type RouteProfile,
  type RouteStop,
} from "@/lib/mapboxHeadOfficeRoutingV45";

const BUILD_MARKER = "WAYPLAN_ROUTE_OPTIMIZATION_AND_ETA_V62_2026_08_02";
const C = { panel: "#0b2236", panel2: "#061524", panel3: "#102b45", border: "#1a3a5c", text: "#eef8ff", sub: "#9cc2d9", muted: "#5d87a4", gold: "#f6b84b", blue: "#38bdf8", green: "#34d399", red: "#fb7185", amber: "#f59e0b" };

function text(value: any, fallback = "") { const output = String(value ?? "").trim(); return output || fallback; }
function wayId(row: any) { return text(row.delivery_way_id || row.deliveryWayId || row.way_id || row.waybill_no || row.tracking_no).toUpperCase(); }
function number(value: any, fallback = 0) { const result = Number(value); return Number.isFinite(result) ? result : fallback; }
function formatDistance(value: any) { const meters = number(value); return meters >= 1000 ? `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km` : `${Math.round(meters)} m`; }
function formatDuration(value: any) { const seconds = Math.max(0, number(value)); const hours = Math.floor(seconds / 3600); const minutes = Math.max(1, Math.round((seconds % 3600) / 60)); return hours ? `${hours} hr ${minutes} min` : `${minutes} min`; }
function formatEta(value: any) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("en-GB", { timeZone: "Asia/Yangon", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }); }
function dateInputValue(value?: string) { const date = value ? new Date(value) : new Date(Date.now() + 5 * 60_000); if (Number.isNaN(date.getTime())) return ""; const pad = (v: number) => String(v).padStart(2, "0"); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function toIso(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(); }
function autoProfile(assignmentMode?: string, vehicleType?: string): RouteProfile { const values = `${assignmentMode || ""} ${vehicleType || ""}`.toLowerCase(); return values.includes("rider") || values.includes("bike") || values.includes("bicycle") ? "mapbox/cycling" : "mapbox/driving-traffic"; }

function buttonStyle(kind: "gold" | "blue" | "green" | "plain" | "amber" = "plain") {
  const palette = { gold: [C.gold, C.panel2], blue: [C.blue, C.panel2], green: [C.green, C.panel2], amber: [C.amber, C.panel2], plain: [C.panel3, C.text] }[kind];
  return { minHeight: 40, border: `1px solid ${kind === "plain" ? C.border : palette[0]}`, borderRadius: 10, background: palette[0], color: palette[1], padding: "8px 13px", fontWeight: 900, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 } as const;
}

function inputStyle() { return { width: "100%", minHeight: 39, border: `1px solid ${C.border}`, borderRadius: 9, background: "#f8fafc", color: "#07111e", padding: "7px 9px", fontWeight: 800 } as const; }

function routeStop(row: any): Partial<RouteStop> & { deliveryWayId: string } {
  const coordinate = coordinateFromRecord(row);
  return {
    deliveryWayId: wayId(row),
    recipientName: text(row.recipient_name || row.receiver_name),
    recipientPhone: text(row.recipient_phone || row.receiver_phone),
    address: text(row.recipient_address || row.delivery_address || row.address),
    township: text(row.township || row.delivery_township),
    placeName: text(row.place_name || row.mapbox_place_name),
    source: coordinate ? "BACKEND" : undefined,
    ...(coordinate || {}),
  };
}

function routeFromSavedPlan(plan: any): OptimizedRoute | null {
  if (!plan?.geometry?.coordinates?.length || !Array.isArray(plan?.ordered_stops)) return null;
  const orderedStops = plan.ordered_stops.map((item: any) => ({
    deliveryWayId: text(item.delivery_way_id),
    recipientName: text(item.recipient_name),
    recipientPhone: text(item.recipient_phone),
    address: text(item.address),
    township: text(item.township),
    placeName: text(item.place_name),
    latitude: number(item.latitude),
    longitude: number(item.longitude),
    source: text(item.coordinate_source, "BACKEND") as any,
    fromLabel: text(item.from_label),
    legDistanceMeters: number(item.leg_distance_m),
    legDurationSeconds: number(item.leg_duration_s),
    cumulativeDistanceMeters: number(item.cumulative_distance_m),
    cumulativeDurationSeconds: number(item.cumulative_duration_s),
    etaIso: text(item.eta_at),
  }));
  const legs = Array.isArray(plan.legs) ? plan.legs.map((leg: any, index: number) => ({
    sequence: number(leg.sequence, index + 1),
    fromLabel: text(leg.from_label),
    fromDeliveryWayId: text(leg.from_delivery_way_id) || null,
    toDeliveryWayId: text(leg.to_delivery_way_id),
    distanceMeters: number(leg.distance_m),
    durationSeconds: number(leg.duration_s),
    cumulativeDistanceMeters: number(leg.cumulative_distance_m),
    cumulativeDurationSeconds: number(leg.cumulative_duration_s),
    etaIso: text(leg.eta_at),
  })) : orderedStops.map((stop: any, index: number) => ({
    sequence: index + 1,
    fromLabel: stop.fromLabel || (index ? orderedStops[index - 1].deliveryWayId : "Britium Head Office"),
    fromDeliveryWayId: index ? orderedStops[index - 1].deliveryWayId : null,
    toDeliveryWayId: stop.deliveryWayId,
    distanceMeters: stop.legDistanceMeters || 0,
    durationSeconds: stop.legDurationSeconds || 0,
    cumulativeDistanceMeters: stop.cumulativeDistanceMeters || 0,
    cumulativeDurationSeconds: stop.cumulativeDurationSeconds || 0,
    etaIso: stop.etaIso || "",
  }));
  const departureTimeIso = text(plan.departure_time, new Date().toISOString());
  return {
    orderedStops,
    legs,
    geometry: plan.geometry,
    distanceMeters: number(plan.distance_m),
    durationSeconds: number(plan.duration_s),
    scheduledDurationSeconds: number(plan.scheduled_duration_s, number(plan.duration_s)),
    departureTimeIso,
    arrivalAtLastStopIso: text(plan.arrival_at_last_stop, departureTimeIso),
    serviceSecondsPerStop: number(plan.service_seconds_per_stop, 300),
    profile: (plan.profile || "mapbox/driving-traffic") as RouteProfile,
    mode: plan.route_mode || "MAPBOX_OPTIMIZATION_V1",
    requestCount: number(plan.request_count, 1),
  };
}

export default function MapboxWayplanPlannerV45({
  wayplanId,
  fallbackStops = [],
  assignmentMode,
  vehicleType,
  routeDate,
  onRouteStateChange,
}: {
  wayplanId: string;
  fallbackStops?: any[];
  assignmentMode?: string;
  vehicleType?: string;
  routeDate?: string;
  onRouteStateChange?: (ready: boolean, state?: any) => void;
}) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<any>(null);
  const [resolvedStops, setResolvedStops] = useState<RouteStop[]>([]);
  const [draftStops, setDraftStops] = useState<RouteStop[]>([]);
  const [route, setRoute] = useState<OptimizedRoute | null>(null);
  const [saved, setSaved] = useState(false);
  const [needsRecalculate, setNeedsRecalculate] = useState(false);
  const [profile, setProfile] = useState<RouteProfile>(() => autoProfile(assignmentMode, vehicleType));
  const [departureLocal, setDepartureLocal] = useState(() => dateInputValue(routeDate ? `${routeDate}T09:00:00+06:30` : undefined));
  const [serviceMinutes, setServiceMinutes] = useState(5);
  const token = text(import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || import.meta.env.VITE_MAPBOX_TOKEN);

  const origin: RouteOrigin = useMemo(() => snapshot?.origin || {
    code: "HUB_EAST_DAGON",
    name: "Britium Ventures Head Office",
    address: "East Dagon, Yangon",
    longitude: 96.199675,
    latitude: 16.889554,
  }, [snapshot]);

  const sourceRows = useMemo(() => {
    const rows = Array.isArray(snapshot?.stops) && snapshot.stops.length ? snapshot.stops : fallbackStops;
    return rows.filter((row: any) => wayId(row));
  }, [snapshot, fallbackStops]);

  const unresolvedCount = Math.max(0, sourceRows.length - resolvedStops.length);
  const visibleStops = draftStops.length ? draftStops : route?.orderedStops || resolvedStops;

  useEffect(() => {
    if (!route?.profile && !saved) setProfile(autoProfile(assignmentMode, vehicleType));
  }, [assignmentMode, vehicleType, route?.profile, saved]);

  const load = useCallback(async () => {
    if (!wayplanId) {
      setSnapshot(null); setResolvedStops([]); setDraftStops([]); setRoute(null); setSaved(false); setNeedsRecalculate(false); onRouteStateChange?.(false); return;
    }
    setLoading(true); setError(""); setMessage("");
    try {
      const { data, error: rpcError } = await supabase.rpc("be_wayplan_route_snapshot_v45", { p_wayplan_id: wayplanId });
      if (rpcError) throw rpcError;
      const next = Array.isArray(data) ? data[0] || {} : data || {};
      setSnapshot(next);
      const stops = (Array.isArray(next.stops) ? next.stops : fallbackStops).map(routeStop);
      const coordinateStops = stops.filter((stop: any) => Number.isFinite(stop.longitude) && Number.isFinite(stop.latitude)) as RouteStop[];
      setResolvedStops(coordinateStops);
      const savedRoute = routeFromSavedPlan(next.route_plan);
      if (savedRoute) {
        setRoute(savedRoute);
        setDraftStops(savedRoute.orderedStops);
        setProfile(savedRoute.profile);
        setDepartureLocal(dateInputValue(savedRoute.departureTimeIso));
        setServiceMinutes(Math.max(0, Math.round(savedRoute.serviceSecondsPerStop / 60)));
        setSaved(true); setNeedsRecalculate(false); onRouteStateChange?.(true, next.route_plan);
      } else {
        setRoute(null); setDraftStops(coordinateStops); setSaved(false); setNeedsRecalculate(false); onRouteStateChange?.(false, next);
      }
    } catch (caught: any) {
      setError(caught?.message || "Could not load the Head Office route snapshot."); setSaved(false); onRouteStateChange?.(false);
    } finally { setLoading(false); }
  }, [wayplanId, fallbackStops, onRouteStateChange]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!mapContainer.current || !token) return;
    mapboxgl.accessToken = token;
    if (!mapRef.current) {
      mapRef.current = new mapboxgl.Map({ container: mapContainer.current, style: "mapbox://styles/mapbox/navigation-night-v1", center: [origin.longitude, origin.latitude], zoom: 10.5 });
      mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    }
    const map = mapRef.current;
    const render = () => {
      markersRef.current.forEach((marker) => marker.remove()); markersRef.current = [];
      markersRef.current.push(new mapboxgl.Marker({ color: C.gold }).setLngLat([origin.longitude, origin.latitude]).setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML(`<strong>START</strong><br/>${origin.name}<br/>${text(origin.address, "-")}`)).addTo(map));
      visibleStops.forEach((stop, index) => {
        const element = document.createElement("div");
        element.textContent = String(index + 1);
        element.style.cssText = `width:27px;height:27px;border-radius:999px;background:${index === visibleStops.length - 1 ? C.gold : C.blue};color:#061524;font-weight:950;display:grid;place-items:center;border:2px solid white;font-size:11px`;
        markersRef.current.push(new mapboxgl.Marker({ element }).setLngLat([stop.longitude, stop.latitude]).setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML(`<strong>${index + 1}. ${stop.deliveryWayId}</strong><br/>${text(stop.recipientName, "-")}<br/>${text(stop.address, stop.township || "-")}<br/><b>${formatDistance(stop.legDistanceMeters)}</b> · ${formatDuration(stop.legDurationSeconds)}<br/>ETA ${formatEta(stop.etaIso)}`)).addTo(map));
      });
      const geometry = !needsRecalculate ? route?.geometry : null;
      const empty = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } } as any;
      const data = geometry?.coordinates?.length ? { type: "Feature", properties: {}, geometry } as any : empty;
      if (map.getSource("v62-route")) (map.getSource("v62-route") as mapboxgl.GeoJSONSource).setData(data);
      else {
        map.addSource("v62-route", { type: "geojson", data });
        map.addLayer({ id: "v62-route", type: "line", source: "v62-route", paint: { "line-color": C.green, "line-width": 5, "line-opacity": 0.92 } });
      }
      const coordinates = [[origin.longitude, origin.latitude], ...visibleStops.map((stop) => [stop.longitude, stop.latitude])];
      if (coordinates.length > 1) {
        const bounds = coordinates.reduce((box, coordinate) => box.extend(coordinate as [number, number]), new mapboxgl.LngLatBounds(coordinates[0] as [number, number], coordinates[0] as [number, number]));
        map.fitBounds(bounds, { padding: 55, maxZoom: 15, duration: 500 });
      }
    };
    if (map.loaded()) render(); else map.once("load", render);
  }, [token, origin, visibleStops, route, needsRecalculate]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  async function resolveCoordinates() {
    if (!token) { setError("Mapbox token is missing."); return; }
    setBusy("geocode"); setError(""); setMessage("");
    try {
      const stops = sourceRows.map(routeStop);
      const result = await geocodeMissingStops(stops, token, origin, (done, total, current) => setMessage(`Resolving ${done}/${total}: ${current}`));
      setResolvedStops(result.resolved); setDraftStops(result.resolved);
      setRoute(null); setSaved(false); setNeedsRecalculate(false); onRouteStateChange?.(false);
      if (result.failed.length) setError(`${result.failed.length} stop(s) could not be geocoded: ${result.failed.slice(0, 5).map((item) => item.deliveryWayId).join(", ")}. Correct the address or coordinates before continuing.`);
      else setMessage(`${result.resolved.length} delivery stop coordinate(s) are ready.`);
    } catch (caught: any) { setError(caught?.message || "Coordinate resolution failed."); }
    finally { setBusy(""); }
  }

  async function optimize() {
    if (!token) { setError("Mapbox token is missing."); return; }
    if (resolvedStops.length !== sourceRows.length) { setError(`Resolve all delivery coordinates first. Ready ${resolvedStops.length}/${sourceRows.length}.`); return; }
    setBusy("optimize"); setError(""); setMessage("");
    try {
      const result = await optimizeRouteFromHeadOffice(
        origin,
        resolvedStops,
        token,
        profile,
        (done, total) => setMessage(`Mapbox optimization request ${done}/${total} completed.`),
        { departureTimeIso: toIso(departureLocal), serviceSecondsPerStop: serviceMinutes * 60 },
      );
      setRoute(result); setDraftStops(result.orderedStops); setSaved(false); setNeedsRecalculate(false); onRouteStateChange?.(false);
      setMessage(`Route optimized from Head Office: ${formatDistance(result.distanceMeters)} · ${formatDuration(result.scheduledDurationSeconds)} · ${result.orderedStops.length} stops · last ETA ${formatEta(result.arrivalAtLastStopIso)}.`);
    } catch (caught: any) { setError(caught?.message || "Mapbox route optimization failed."); }
    finally { setBusy(""); }
  }

  async function recalculateFixedOrder() {
    if (!token || !draftStops.length) return;
    setBusy("recalculate"); setError(""); setMessage("");
    try {
      const result = await calculateRouteInFixedOrder(
        origin,
        draftStops,
        token,
        profile,
        (done, total) => setMessage(`Recalculating selected stop order ${done}/${total}.`),
        { departureTimeIso: toIso(departureLocal), serviceSecondsPerStop: serviceMinutes * 60 },
      );
      setRoute(result); setDraftStops(result.orderedStops); setNeedsRecalculate(false); setSaved(false); onRouteStateChange?.(false);
      setMessage(`Current stop order recalculated: ${formatDistance(result.distanceMeters)} · ${formatDuration(result.scheduledDurationSeconds)} · last ETA ${formatEta(result.arrivalAtLastStopIso)}.`);
    } catch (caught: any) { setError(caught?.message || "Could not calculate the selected stop order."); }
    finally { setBusy(""); }
  }

  function moveStop(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draftStops.length) return;
    const next = [...draftStops];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setDraftStops(next);
    setNeedsRecalculate(true); setSaved(false); onRouteStateChange?.(false);
    setMessage("Stop order changed. Recalculate the current order before saving.");
  }

  function scheduleChanged() {
    if (!route) return;
    setNeedsRecalculate(true); setSaved(false); onRouteStateChange?.(false);
  }

  async function saveRoute() {
    if (!route || !wayplanId || needsRecalculate) return;
    setBusy("save"); setError(""); setMessage("");
    try {
      const { data: userData } = await supabase.auth.getUser();
      const payload = routeSavePayload(origin, route);
      const { data, error: rpcError } = await supabase.rpc("be_wayplan_save_mapbox_route_v45", { p_wayplan_id: wayplanId, p_route: payload, p_actor_email: userData?.user?.email || null });
      if (rpcError) throw rpcError;
      if (data?.ok === false) throw new Error(data?.error || "Route save failed.");
      setSaved(true); onRouteStateChange?.(true, payload); setMessage(`Optimized route, stop distances and ETAs saved. Rider tracking is ready for ${wayplanId}.`);
    } catch (caught: any) { setError(caught?.message || "Could not save the optimized route."); setSaved(false); onRouteStateChange?.(false); }
    finally { setBusy(""); }
  }

  if (!wayplanId) return <section style={{ border: `1px solid ${C.border}`, borderRadius: 18, background: C.panel, padding: 16, color: C.sub }}>Create or choose a Wayplan before arranging its Mapbox route.</section>;

  return <section data-build={BUILD_MARKER} style={{ border: `1px solid ${saved ? C.green : C.border}`, borderRadius: 18, background: C.panel, padding: 16, color: C.text }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <div>
        <div style={{ color: C.gold, fontSize: 10, fontWeight: 950, letterSpacing: ".17em" }}>ROUTE OPTIMIZATION V62 · START-TO-LAST-STOP ETA</div>
        <h2 style={{ margin: "5px 0 0", fontSize: 18 }}>Wayplan Route Command</h2>
        <div style={{ color: C.sub, fontSize: 11, marginTop: 4 }}>Fixed start: {origin.name} · {origin.address} · {origin.latitude.toFixed(6)}, {origin.longitude.toFixed(6)}</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => void load()} disabled={loading || !!busy} style={buttonStyle("plain")}>{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}Refresh</button>
        <span style={{ border: `1px solid ${saved ? C.green : needsRecalculate ? C.amber : C.gold}`, color: saved ? C.green : needsRecalculate ? C.amber : C.gold, borderRadius: 999, padding: "8px 11px", fontSize: 10, fontWeight: 950 }}>{saved ? "ROUTE SAVED · TRACKING READY" : needsRecalculate ? "ORDER CHANGED · RECALCULATE" : "ROUTE REQUIRED BEFORE REVIEW"}</span>
      </div>
    </div>

    {error ? <div style={{ marginTop: 12, border: `1px solid ${C.red}`, background: "rgba(251,113,133,.10)", color: C.red, borderRadius: 12, padding: 11 }}><AlertTriangle size={15} style={{ verticalAlign: "middle", marginRight: 7 }} />{error}</div> : null}
    {message ? <div style={{ marginTop: 12, border: `1px solid ${needsRecalculate ? C.amber : C.blue}`, background: needsRecalculate ? "rgba(245,158,11,.08)" : "rgba(56,189,248,.08)", color: C.sub, borderRadius: 12, padding: 11 }}>{message}</div> : null}

    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(150px,1fr))", gap: 8, marginTop: 12 }} className="wayplan-v62-controls">
      <label style={{ color: C.sub, fontSize: 10, fontWeight: 850 }}>Travel mode
        <select value={profile} onChange={(event) => { setProfile(event.target.value as RouteProfile); scheduleChanged(); }} style={{ ...inputStyle(), marginTop: 4 }}>
          <option value="mapbox/cycling">Rider / Bicycle</option>
          <option value="mapbox/driving-traffic">Vehicle / Live traffic</option>
          <option value="mapbox/driving">Vehicle / Standard traffic</option>
        </select>
      </label>
      <label style={{ color: C.sub, fontSize: 10, fontWeight: 850 }}>Departure date and time
        <input type="datetime-local" value={departureLocal} onChange={(event) => { setDepartureLocal(event.target.value); scheduleChanged(); }} style={{ ...inputStyle(), marginTop: 4 }} />
      </label>
      <label style={{ color: C.sub, fontSize: 10, fontWeight: 850 }}>Service time at each completed stop
        <input type="number" min="0" max="60" value={serviceMinutes} onChange={(event) => { setServiceMinutes(Math.max(0, number(event.target.value, 5))); scheduleChanged(); }} style={{ ...inputStyle(), marginTop: 4 }} />
      </label>
      <div style={{ border: `1px solid ${C.border}`, background: C.panel2, borderRadius: 10, padding: 9 }}>
        <div style={{ color: C.muted, fontSize: 9 }}>AUTO PROFILE</div>
        <div style={{ color: C.text, fontWeight: 900, marginTop: 5 }}>{autoProfile(assignmentMode, vehicleType) === "mapbox/cycling" ? "Rider/Bicycle" : "Vehicle/Traffic"}</div>
        <div style={{ color: C.sub, fontSize: 9, marginTop: 3 }}>Manual selection remains available.</div>
      </div>
    </div>

    {route ? <div style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(120px,1fr))", gap: 8, marginTop: 10 }} className="wayplan-v62-summary">
      <Metric icon={<MapPin size={14} />} label="Stops" value={route.orderedStops.length} />
      <Metric icon={<Gauge size={14} />} label="Total distance" value={formatDistance(route.distanceMeters)} />
      <Metric icon={<Clock3 size={14} />} label="Travel time" value={formatDuration(route.durationSeconds)} />
      <Metric icon={<Clock3 size={14} />} label="With stop service" value={formatDuration(route.scheduledDurationSeconds)} />
      <Metric icon={<Navigation size={14} />} label="Last-stop ETA" value={formatEta(route.arrivalAtLastStopIso)} />
    </div> : null}

    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.25fr) minmax(420px,.75fr)", gap: 12, marginTop: 12 }} className="mapbox-v62-grid">
      <div ref={mapContainer} style={{ minHeight: 540, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden", background: C.panel2 }} />
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, background: C.panel2, padding: 12, minHeight: 540 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div><div style={{ color: C.muted, fontSize: 9 }}>PARCEL STOPS</div><div style={{ fontSize: 22, fontWeight: 950 }}>{sourceRows.length}</div></div>
          <div><div style={{ color: C.muted, fontSize: 9 }}>MISSING COORDINATES</div><div style={{ fontSize: 22, fontWeight: 950, color: unresolvedCount ? C.red : C.green }}>{unresolvedCount}</div></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
          <button onClick={() => void resolveCoordinates()} disabled={!!busy || !token || !sourceRows.length} style={{ ...buttonStyle("blue"), opacity: busy || !token || !sourceRows.length ? .5 : 1 }}>{busy === "geocode" ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}Resolve Coordinates</button>
          <button onClick={() => void optimize()} disabled={!!busy || resolvedStops.length !== sourceRows.length || !sourceRows.length} style={{ ...buttonStyle("gold"), opacity: busy || resolvedStops.length !== sourceRows.length || !sourceRows.length ? .5 : 1 }}>{busy === "optimize" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}Optimize Route</button>
          <button onClick={() => void recalculateFixedOrder()} disabled={!!busy || !draftStops.length || !needsRecalculate} style={{ ...buttonStyle("amber"), opacity: busy || !draftStops.length || !needsRecalculate ? .5 : 1 }}>{busy === "recalculate" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}Recalculate Current Order</button>
          <button onClick={() => void saveRoute()} disabled={!!busy || !route || needsRecalculate} style={{ ...buttonStyle("green"), opacity: busy || !route || needsRecalculate ? .5 : 1 }}>{busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save Sequence + ETA</button>
        </div>

        <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10, maxHeight: 365, overflow: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "31px minmax(0,1fr) 72px 70px 86px 56px", gap: 6, padding: "6px 0", color: C.muted, fontSize: 8, fontWeight: 950, letterSpacing: ".08em" }}>
            <span>SEQ</span><span>STOP</span><span>DISTANCE</span><span>TRAVEL</span><span>ETA</span><span>MOVE</span>
          </div>
          {visibleStops.map((stop, index) => <div key={stop.deliveryWayId} style={{ display: "grid", gridTemplateColumns: "31px minmax(0,1fr) 72px 70px 86px 56px", gap: 6, padding: "8px 0", borderTop: `1px solid ${C.border}`, alignItems: "center" }}>
            <div style={{ width: 27, height: 27, borderRadius: 999, background: index === visibleStops.length - 1 ? C.gold : C.blue, color: C.panel2, display: "grid", placeItems: "center", fontWeight: 950 }}>{index + 1}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: C.gold, fontWeight: 900, fontSize: 10 }}>{stop.deliveryWayId}{index === visibleStops.length - 1 ? " · LAST" : ""}</div>
              <div style={{ color: C.sub, fontSize: 9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{text(stop.address, stop.township || "-")}</div>
              <div style={{ color: C.muted, fontSize: 8, marginTop: 2 }}>From {text(stop.fromLabel, index ? visibleStops[index - 1]?.deliveryWayId : origin.name)}</div>
            </div>
            <div style={{ color: C.text, fontSize: 9, fontWeight: 850 }}>{formatDistance(stop.legDistanceMeters)}</div>
            <div style={{ color: C.text, fontSize: 9, fontWeight: 850 }}>{formatDuration(stop.legDurationSeconds)}</div>
            <div style={{ color: C.green, fontSize: 9, fontWeight: 850 }}>{formatEta(stop.etaIso)}</div>
            <div style={{ display: "flex", gap: 3 }}>
              <button title="Move earlier" onClick={() => moveStop(index, -1)} disabled={index === 0 || !!busy} style={{ border: `1px solid ${C.border}`, background: C.panel3, color: C.text, borderRadius: 7, padding: 4, opacity: index === 0 ? .35 : 1 }}><ArrowUp size={11} /></button>
              <button title="Move later" onClick={() => moveStop(index, 1)} disabled={index === visibleStops.length - 1 || !!busy} style={{ border: `1px solid ${C.border}`, background: C.panel3, color: C.text, borderRadius: 7, padding: 4, opacity: index === visibleStops.length - 1 ? .35 : 1 }}><ArrowDown size={11} /></button>
            </div>
          </div>)}
          {!sourceRows.length ? <div style={{ color: C.sub, textAlign: "center", padding: 22 }}>No Wayplan stops loaded.</div> : null}
        </div>
      </div>
    </div>
    <style>{`@media(max-width:1120px){.mapbox-v62-grid{grid-template-columns:1fr!important}.wayplan-v62-controls{grid-template-columns:repeat(2,1fr)!important}.wayplan-v62-summary{grid-template-columns:repeat(3,1fr)!important}}@media(max-width:720px){.wayplan-v62-controls,.wayplan-v62-summary{grid-template-columns:1fr!important}}`}</style>
  </section>;
}

function Metric({ icon, label, value }: any) {
  return <div style={{ border: `1px solid ${C.border}`, background: C.panel2, borderRadius: 11, padding: 9 }}>
    <div style={{ color: C.muted, fontSize: 8, fontWeight: 900, display: "flex", alignItems: "center", gap: 5 }}>{icon}{label.toUpperCase()}</div>
    <div style={{ color: C.text, fontWeight: 950, marginTop: 5 }}>{value}</div>
  </div>;
}
