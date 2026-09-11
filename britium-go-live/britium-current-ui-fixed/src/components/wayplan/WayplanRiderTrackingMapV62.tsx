// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  AlertTriangle,
  Bike,
  Clock3,
  Crosshair,
  Gauge,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  RefreshCw,
  Route as RouteIcon,
  Signal,
  SignalHigh,
  SignalLow,
  UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  calculateLiveLeg,
  type LiveLegRoute,
  type RouteProfile,
} from "@/lib/mapboxHeadOfficeRoutingV45";
import {
  gpsAgeMinutes,
  gpsStatusText,
  loadSupervisorLiveMapSnapshot,
  subscribeGpsTables,
  type SupervisorLiveMapPoint,
} from "@/lib/gpsCapture";

export const WAYPLAN_RIDER_TRACKING_V62_BUILD = "WAYPLAN_RIDER_TRACKING_MAP_V62_2026_08_02";

const C = {
  panel: "#0b2236",
  panel2: "#061524",
  panel3: "#102b45",
  border: "#1a3a5c",
  text: "#eef8ff",
  sub: "#9cc2d9",
  muted: "#5d87a4",
  gold: "#f6b84b",
  blue: "#38bdf8",
  green: "#34d399",
  red: "#fb7185",
  amber: "#f59e0b",
};

function text(value: any, fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function number(value: any, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function normalize(value: any) {
  return text(value).toLowerCase().replace(/[^a-z0-9@._-]+/g, "");
}

function unwrap(value: any) {
  return Array.isArray(value) ? value[0] || {} : value || {};
}

function formatDistance(value: any) {
  const meters = Math.max(0, number(value));
  return meters >= 1000 ? `${(meters / 1000).toFixed(meters >= 10_000 ? 0 : 1)} km` : `${Math.round(meters)} m`;
}

function formatDuration(value: any) {
  const totalMinutes = Math.max(0, Math.round(number(value) / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours} hr ${minutes} min` : `${Math.max(1, minutes)} min`;
}

function formatEta(value: any) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleString("en-GB", {
        timeZone: "Asia/Yangon",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
}

function formatUpdated(value: any) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "No GPS timestamp"
    : date.toLocaleString("en-GB", { timeZone: "Asia/Yangon", hour12: true });
}

function escapeHtml(value: any) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  } as Record<string, string>)[character]);
}

function deliveryWayId(stop: any) {
  return text(stop?.delivery_way_id || stop?.deliveryWayId || stop?.way_id || stop?.tracking_no).toUpperCase();
}

function currentStopIndex(stops: any[], execution: any) {
  const current = execution?.current_stop || execution?.currentStop || null;
  const sequence = number(current?.stop_sequence || current?.sequence, 0);
  if (sequence > 0 && sequence <= stops.length) return sequence - 1;
  const currentId = deliveryWayId(current);
  if (currentId) {
    const index = stops.findIndex((stop) => deliveryWayId(stop) === currentId);
    if (index >= 0) return index;
  }
  const status = text(execution?.run?.run_status || execution?.run_status).toUpperCase();
  return status === "COMPLETED" ? stops.length : 0;
}

function isValidPoint(point?: SupervisorLiveMapPoint | null) {
  return Boolean(point && Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function pickRiderPoint(
  rows: SupervisorLiveMapPoint[],
  riderCode: string,
  riderName: string,
  riderEmail: string,
  currentStop: any,
) {
  const keys = [riderCode, riderName, riderEmail].map(normalize).filter(Boolean);
  const currentKeys = [
    deliveryWayId(currentStop),
    text(currentStop?.pickup_id),
    text(currentStop?.request_code),
  ].map(normalize).filter(Boolean);
  const ranked = rows
    .filter(isValidPoint)
    .map((point) => {
      const identities = [point.rider_code, point.rider_name, point.rider_email].map(normalize).filter(Boolean);
      const jobs = [point.tracking_no, point.pickup_id, point.request_code].map(normalize).filter(Boolean);
      const identityMatch = keys.some((key) => identities.includes(key));
      const jobMatch = currentKeys.some((key) => jobs.includes(key));
      const updated = Date.parse(point.updated_at || "") || 0;
      return { point, score: identityMatch ? 100 : jobMatch ? 50 : 0, updated };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.updated - a.updated);
  return ranked[0]?.point || null;
}

function profileFromPlan(plan: any, assignmentMode?: string, vehicleType?: string): RouteProfile {
  const saved = text(plan?.profile);
  if (["mapbox/cycling", "mapbox/driving", "mapbox/driving-traffic"].includes(saved)) return saved as RouteProfile;
  const combined = `${assignmentMode || ""} ${vehicleType || ""}`.toLowerCase();
  return combined.includes("rider") || combined.includes("bike") || combined.includes("bicycle")
    ? "mapbox/cycling"
    : "mapbox/driving-traffic";
}

function TrackingSignal({ point }: { point: SupervisorLiveMapPoint | null }) {
  const status = point ? gpsStatusText(point) : "WAITING GPS";
  const age = point ? gpsAgeMinutes(point.updated_at) : null;
  const live = status === "LIVE";
  const stale = status === "STALE GPS" || (age !== null && age > 30);
  const Icon = live ? SignalHigh : stale ? SignalLow : Signal;
  const color = live ? C.green : stale ? C.red : C.amber;
  return <span style={{ border: `1px solid ${color}`, color, borderRadius: 999, padding: "7px 10px", fontSize: 10, fontWeight: 950, display: "inline-flex", alignItems: "center", gap: 6 }}>
    <Icon size={13} />{status}
  </span>;
}

export default function WayplanRiderTrackingMapV62({
  wayplanId,
  riderCode = "",
  riderName = "",
  riderEmail = "",
  assignmentMode = "RIDER",
  vehicleType = "",
}: {
  wayplanId: string;
  riderCode?: string;
  riderName?: string;
  riderEmail?: string;
  assignmentMode?: string;
  vehicleType?: string;
}) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [routeSnapshot, setRouteSnapshot] = useState<any>(null);
  const [execution, setExecution] = useState<any>(null);
  const [gpsRows, setGpsRows] = useState<SupervisorLiveMapPoint[]>([]);
  const [liveLeg, setLiveLeg] = useState<LiveLegRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshingGps, setRefreshingGps] = useState(false);
  const [error, setError] = useState("");
  const [liveLegError, setLiveLegError] = useState("");
  const token = text(import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || import.meta.env.VITE_MAPBOX_TOKEN);

  const loadRoute = useCallback(async () => {
    if (!wayplanId) return;
    setLoading(true);
    setError("");
    try {
      const routeRequest = (supabase as any).rpc("be_wayplan_route_snapshot_v45", { p_wayplan_id: wayplanId });
      const executionRequest = riderCode
        ? (supabase as any).rpc("be_rider_route_snapshot_v46", { p_wayplan_id: wayplanId, p_rider_key: riderCode })
        : Promise.resolve({ data: null, error: null });
      const [routeResult, executionResult] = await Promise.all([routeRequest, executionRequest]);
      if (routeResult.error) throw routeResult.error;
      setRouteSnapshot(unwrap(routeResult.data));
      if (!executionResult.error) setExecution(unwrap(executionResult.data));
    } catch (caught: any) {
      setError(caught?.message || "Unable to load the saved Wayplan route.");
    } finally {
      setLoading(false);
    }
  }, [riderCode, wayplanId]);

  const loadGps = useCallback(async () => {
    setRefreshingGps(true);
    try {
      const rows = await loadSupervisorLiveMapSnapshot();
      setGpsRows(rows);
    } catch (caught: any) {
      setError((current) => current || caught?.message || "Unable to load Rider GPS.");
    } finally {
      setRefreshingGps(false);
    }
  }, []);

  useEffect(() => {
    void loadRoute();
    void loadGps();
  }, [loadGps, loadRoute]);

  useEffect(() => {
    const stopRealtime = subscribeGpsTables(() => void loadGps());
    const timer = window.setInterval(() => void loadGps(), 20_000);
    return () => {
      stopRealtime();
      window.clearInterval(timer);
    };
  }, [loadGps]);

  const plan = routeSnapshot?.route_plan || routeSnapshot?.routePlan || null;
  const origin = routeSnapshot?.origin || plan?.origin || null;
  const stops = Array.isArray(plan?.ordered_stops) ? plan.ordered_stops : [];
  const activeIndex = currentStopIndex(stops, execution);
  const nextStop = activeIndex >= 0 && activeIndex < stops.length ? stops[activeIndex] : null;
  const resolvedRiderCode = riderCode || text(execution?.rider?.rider_code || execution?.rider_code || routeSnapshot?.rider_code || routeSnapshot?.assigned_rider_code);
  const resolvedRiderName = riderName || text(execution?.rider?.rider_name || execution?.rider?.name || execution?.rider_name || routeSnapshot?.rider_name || routeSnapshot?.assigned_rider_name);
  const resolvedRiderEmail = riderEmail || text(execution?.rider?.rider_email || execution?.rider?.email || execution?.rider_email || routeSnapshot?.rider_email || routeSnapshot?.assigned_rider_email);
  const riderPoint = useMemo(
    () => pickRiderPoint(gpsRows, resolvedRiderCode, resolvedRiderName, resolvedRiderEmail, nextStop || execution?.current_stop),
    [execution?.current_stop, gpsRows, nextStop, resolvedRiderCode, resolvedRiderEmail, resolvedRiderName],
  );
  const profile = profileFromPlan(plan, assignmentMode, vehicleType);

  useEffect(() => {
    let cancelled = false;
    if (!token || !isValidPoint(riderPoint) || !nextStop || !Number.isFinite(Number(nextStop.longitude)) || !Number.isFinite(Number(nextStop.latitude))) {
      setLiveLeg(null);
      setLiveLegError("");
      return;
    }
    void (async () => {
      try {
        const result = await calculateLiveLeg(
          { longitude: Number(riderPoint!.lng), latitude: Number(riderPoint!.lat) },
          { longitude: Number(nextStop.longitude), latitude: Number(nextStop.latitude) },
          token,
          profile,
          new Date().toISOString(),
        );
        if (!cancelled) {
          setLiveLeg(result);
          setLiveLegError("");
        }
      } catch (caught: any) {
        if (!cancelled) {
          setLiveLeg(null);
          setLiveLegError(caught?.message || "Live next-stop ETA is unavailable.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [nextStop?.delivery_way_id, nextStop?.latitude, nextStop?.longitude, profile, riderPoint?.lat, riderPoint?.lng, riderPoint?.updated_at, token]);

  useEffect(() => {
    if (!mapContainer.current || !token || !origin) return;
    mapboxgl.accessToken = token;
    if (!mapRef.current) {
      mapRef.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/navigation-night-v1",
        center: [Number(origin.longitude), Number(origin.latitude)],
        zoom: 11,
      });
      mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    }
    const map = mapRef.current;
    const render = () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];

      markersRef.current.push(
        new mapboxgl.Marker({ color: C.gold })
          .setLngLat([Number(origin.longitude), Number(origin.latitude)])
          .setPopup(new mapboxgl.Popup({ offset: 14 }).setHTML(`<strong>START</strong><br/>${escapeHtml(origin.name || "Britium Head Office")}`))
          .addTo(map),
      );

      stops.forEach((stop: any, index: number) => {
        const completed = index < activeIndex;
        const current = index === activeIndex;
        const last = index === stops.length - 1;
        const element = document.createElement("div");
        element.textContent = String(index + 1);
        element.style.cssText = `width:${current ? 32 : 26}px;height:${current ? 32 : 26}px;border-radius:999px;background:${completed ? C.green : current ? C.red : last ? C.gold : C.blue};color:#061524;font-weight:950;display:grid;place-items:center;border:${current ? 3 : 2}px solid white;font-size:${current ? 12 : 10}px;box-shadow:0 3px 12px rgba(0,0,0,.45)`;
        const popup = `<strong>${index + 1}. ${escapeHtml(deliveryWayId(stop))}${last ? " · LAST" : ""}</strong><br/>${escapeHtml(stop.recipient_name || "-")}<br/>${escapeHtml(stop.address || stop.township || "-")}<br/><b>${escapeHtml(formatDistance(stop.leg_distance_m))}</b> · ${escapeHtml(formatDuration(stop.leg_duration_s))}<br/>Planned ETA ${escapeHtml(formatEta(stop.eta_at))}`;
        markersRef.current.push(
          new mapboxgl.Marker({ element })
            .setLngLat([Number(stop.longitude), Number(stop.latitude)])
            .setPopup(new mapboxgl.Popup({ offset: 14 }).setHTML(popup))
            .addTo(map),
        );
      });

      if (isValidPoint(riderPoint)) {
        const element = document.createElement("div");
        const heading = Number.isFinite(Number(riderPoint?.heading)) ? Number(riderPoint?.heading) : 0;
        element.innerHTML = `<div style="width:34px;height:34px;border-radius:999px;background:${C.red};border:3px solid white;display:grid;place-items:center;color:white;font-size:18px;font-weight:950;box-shadow:0 4px 14px rgba(0,0,0,.55);transform:rotate(${heading}deg)">➤</div>`;
        markersRef.current.push(
          new mapboxgl.Marker({ element, rotationAlignment: "map" })
            .setLngLat([Number(riderPoint!.lng), Number(riderPoint!.lat)])
            .setPopup(new mapboxgl.Popup({ offset: 18 }).setHTML(`<strong>${escapeHtml(riderPoint!.rider_name || riderName || riderCode || "Rider")}</strong><br/>${escapeHtml(gpsStatusText(riderPoint!))}<br/>Updated ${escapeHtml(formatUpdated(riderPoint!.updated_at))}`))
            .addTo(map),
        );
      }

      const routeFeature = plan?.geometry?.coordinates?.length
        ? { type: "Feature", properties: {}, geometry: plan.geometry }
        : { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } };
      if (map.getSource("wayplan-v62-route")) (map.getSource("wayplan-v62-route") as mapboxgl.GeoJSONSource).setData(routeFeature as any);
      else {
        map.addSource("wayplan-v62-route", { type: "geojson", data: routeFeature as any });
        map.addLayer({ id: "wayplan-v62-route", type: "line", source: "wayplan-v62-route", paint: { "line-color": C.green, "line-width": 5, "line-opacity": 0.75 } });
      }

      const liveFeature = liveLeg?.geometry?.coordinates?.length
        ? { type: "Feature", properties: {}, geometry: liveLeg.geometry }
        : { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } };
      if (map.getSource("wayplan-v62-live-leg")) (map.getSource("wayplan-v62-live-leg") as mapboxgl.GeoJSONSource).setData(liveFeature as any);
      else {
        map.addSource("wayplan-v62-live-leg", { type: "geojson", data: liveFeature as any });
        map.addLayer({ id: "wayplan-v62-live-leg", type: "line", source: "wayplan-v62-live-leg", paint: { "line-color": C.red, "line-width": 6, "line-dasharray": [1.5, 1] } });
      }

      const coordinates: [number, number][] = [
        [Number(origin.longitude), Number(origin.latitude)],
        ...stops.filter((stop: any) => Number.isFinite(Number(stop.longitude)) && Number.isFinite(Number(stop.latitude))).map((stop: any) => [Number(stop.longitude), Number(stop.latitude)] as [number, number]),
      ];
      if (isValidPoint(riderPoint)) coordinates.push([Number(riderPoint!.lng), Number(riderPoint!.lat)]);
      if (coordinates.length > 1) {
        const bounds = coordinates.reduce((box, coordinate) => box.extend(coordinate), new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));
        map.fitBounds(bounds, { padding: 55, maxZoom: 15, duration: 450 });
      }
    };
    if (map.loaded()) render(); else map.once("load", render);
  }, [activeIndex, liveLeg, origin, plan, riderCode, riderName, riderPoint, stops, token]);

  useEffect(() => () => {
    mapRef.current?.remove();
    mapRef.current = null;
  }, []);

  if (!wayplanId) return null;
  if (loading && !routeSnapshot) return <section style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 18, padding: 16, color: C.sub }}><Loader2 size={15} className="animate-spin" style={{ verticalAlign: "middle", marginRight: 7 }} />Loading route and Rider tracking…</section>;
  if (!token) return <section style={{ border: `1px solid ${C.red}`, background: "rgba(251,113,133,.09)", borderRadius: 18, padding: 16, color: C.red }}><AlertTriangle size={15} style={{ verticalAlign: "middle", marginRight: 7 }} />Mapbox token is missing. Configure VITE_MAPBOX_ACCESS_TOKEN in production.</section>;
  if (!plan) return <section style={{ border: `1px solid ${C.amber}`, background: "rgba(245,158,11,.08)", borderRadius: 18, padding: 16, color: C.amber }}><AlertTriangle size={15} style={{ verticalAlign: "middle", marginRight: 7 }} />Save the optimized stop sequence before live Rider tracking begins.</section>;

  const runStatus = text(execution?.run?.run_status || execution?.run_status, "PLANNED").toUpperCase();
  const progress = stops.length ? Math.min(100, Math.round((Math.min(activeIndex, stops.length) / stops.length) * 100)) : 0;
  const speedKmh = isValidPoint(riderPoint) && Number.isFinite(Number(riderPoint?.speed_mps)) ? Number(riderPoint?.speed_mps) * 3.6 : null;

  return <section data-build={WAYPLAN_RIDER_TRACKING_V62_BUILD} style={{ border: `1px solid ${isValidPoint(riderPoint) ? C.green : C.border}`, background: C.panel, borderRadius: 18, padding: 16, color: C.text }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
      <div>
        <div style={{ color: C.gold, fontSize: 10, fontWeight: 950, letterSpacing: ".16em" }}>LIVE RIDER ROUTE TRACKING V62</div>
        <h2 style={{ margin: "5px 0 0", fontSize: 18 }}><RouteIcon size={17} style={{ verticalAlign: "middle", marginRight: 7 }} />{wayplanId}</h2>
        <div style={{ color: C.sub, fontSize: 11, marginTop: 4 }}><UserRound size={12} style={{ verticalAlign: "middle", marginRight: 5 }} />{resolvedRiderName || riderPoint?.rider_name || resolvedRiderCode || "Rider not assigned"} · {runStatus} · {stops.length} stops</div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <TrackingSignal point={riderPoint} />
        <button onClick={() => { void loadRoute(); void loadGps(); }} disabled={loading || refreshingGps} style={{ border: `1px solid ${C.border}`, background: C.panel3, color: C.text, borderRadius: 10, padding: "7px 10px", fontWeight: 900, display: "inline-flex", gap: 6, alignItems: "center" }}>
          {loading || refreshingGps ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Refresh
        </button>
      </div>
    </div>

    {error ? <div style={{ marginTop: 10, border: `1px solid ${C.red}`, background: "rgba(251,113,133,.08)", color: C.red, borderRadius: 11, padding: 10 }}><AlertTriangle size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />{error}</div> : null}
    {liveLegError ? <div style={{ marginTop: 8, color: C.amber, fontSize: 10 }}>{liveLegError}</div> : null}

    <div style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(115px,1fr))", gap: 8, marginTop: 12 }} className="wayplan-tracking-metrics-v62">
      <Metric icon={<Navigation size={13} />} label="Route progress" value={`${progress}%`} />
      <Metric icon={<MapPin size={13} />} label="Next stop" value={nextStop ? `#${activeIndex + 1}` : "Complete"} />
      <Metric icon={<Crosshair size={13} />} label="Live distance" value={liveLeg ? formatDistance(liveLeg.distanceMeters) : "-"} />
      <Metric icon={<Clock3 size={13} />} label="Live travel" value={liveLeg ? formatDuration(liveLeg.durationSeconds) : "-"} />
      <Metric icon={<Clock3 size={13} />} label="Live ETA" value={liveLeg ? formatEta(liveLeg.etaIso) : text(nextStop?.eta_at, "-") ? formatEta(nextStop?.eta_at) : "-"} />
      <Metric icon={profile === "mapbox/cycling" ? <Bike size={13} /> : <Gauge size={13} />} label="Speed / mode" value={speedKmh === null ? (profile === "mapbox/cycling" ? "Bicycle" : "Vehicle") : `${speedKmh.toFixed(1)} km/h`} />
    </div>

    <div style={{ height: 7, borderRadius: 999, background: C.panel2, overflow: "hidden", marginTop: 10 }}>
      <div style={{ height: "100%", width: `${progress}%`, background: C.green, transition: "width .25s ease" }} />
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.45fr) minmax(330px,.55fr)", gap: 12, marginTop: 12 }} className="wayplan-tracking-grid-v62">
      <div ref={mapContainer} style={{ minHeight: 510, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden", background: C.panel2 }} />
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, background: C.panel2, padding: 12, minHeight: 510 }}>
        <div style={{ color: C.gold, fontSize: 10, fontWeight: 950 }}>CURRENT RIDER POSITION</div>
        {isValidPoint(riderPoint) ? <>
          <div style={{ color: C.text, fontWeight: 950, marginTop: 6 }}>{riderPoint?.rider_name || resolvedRiderName || resolvedRiderCode}</div>
          <div style={{ color: C.sub, fontSize: 10, marginTop: 3 }}><LocateFixed size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />{Number(riderPoint?.lat).toFixed(6)}, {Number(riderPoint?.lng).toFixed(6)}</div>
          <div style={{ color: C.sub, fontSize: 10, marginTop: 3 }}>Accuracy {number(riderPoint?.accuracy_m).toFixed(0)} m · Updated {formatUpdated(riderPoint?.updated_at)}</div>
        </> : <div style={{ color: C.amber, marginTop: 7, fontSize: 11 }}>Waiting for the assigned Rider application to start the route and publish secured GPS updates.</div>}

        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 10 }}>
          <div style={{ color: C.gold, fontSize: 10, fontWeight: 950 }}>NEXT DELIVERY STOP</div>
          {nextStop ? <>
            <div style={{ color: C.text, fontWeight: 950, marginTop: 6 }}>#{activeIndex + 1} · {deliveryWayId(nextStop)}</div>
            <div style={{ color: C.sub, fontSize: 10, marginTop: 3 }}>{text(nextStop.recipient_name, "Recipient")}</div>
            <div style={{ color: C.sub, fontSize: 10, marginTop: 3 }}><MapPin size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />{text(nextStop.address, nextStop.township || "-")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginTop: 8 }}>
              <SmallMetric label="Planned leg" value={formatDistance(nextStop.leg_distance_m)} />
              <SmallMetric label="Planned ETA" value={formatEta(nextStop.eta_at)} />
              <SmallMetric label="Live distance" value={liveLeg ? formatDistance(liveLeg.distanceMeters) : "-"} />
              <SmallMetric label="Live ETA" value={liveLeg ? formatEta(liveLeg.etaIso) : "-"} />
            </div>
          </> : <div style={{ color: C.green, fontWeight: 900, marginTop: 7 }}>All route stops are complete.</div>}
        </div>

        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 10, maxHeight: 180, overflow: "auto" }}>
          {stops.map((stop: any, index: number) => <div key={`${deliveryWayId(stop)}-${index}`} style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 7, padding: "7px 0", borderTop: index ? `1px solid ${C.border}` : "none", opacity: index < activeIndex ? .55 : 1 }}>
            <div style={{ width: 25, height: 25, borderRadius: 999, display: "grid", placeItems: "center", fontWeight: 950, background: index < activeIndex ? C.green : index === activeIndex ? C.red : index === stops.length - 1 ? C.gold : C.blue, color: C.panel2 }}>{index + 1}</div>
            <div><div style={{ color: C.text, fontWeight: 900, fontSize: 10 }}>{deliveryWayId(stop)}{index === stops.length - 1 ? " · LAST" : ""}</div><div style={{ color: C.sub, fontSize: 9 }}>{formatDistance(stop.leg_distance_m)} · {formatDuration(stop.leg_duration_s)} · ETA {formatEta(stop.eta_at)}</div></div>
          </div>)}
        </div>
      </div>
    </div>
    <style>{`@media(max-width:1180px){.wayplan-tracking-grid-v62{grid-template-columns:1fr!important}.wayplan-tracking-metrics-v62{grid-template-columns:repeat(3,1fr)!important}}@media(max-width:720px){.wayplan-tracking-metrics-v62{grid-template-columns:repeat(2,1fr)!important}}`}</style>
  </section>;
}

function Metric({ icon, label, value }: any) {
  return <div style={{ border: `1px solid ${C.border}`, background: C.panel2, borderRadius: 11, padding: 9 }}>
    <div style={{ color: C.muted, fontSize: 8, fontWeight: 900, display: "flex", alignItems: "center", gap: 5 }}>{icon}{label.toUpperCase()}</div>
    <div style={{ color: C.text, fontWeight: 950, marginTop: 5, fontSize: 12 }}>{value}</div>
  </div>;
}

function SmallMetric({ label, value }: any) {
  return <div style={{ border: `1px solid ${C.border}`, background: C.panel3, borderRadius: 9, padding: 7 }}><div style={{ color: C.muted, fontSize: 8 }}>{label.toUpperCase()}</div><div style={{ color: C.text, fontWeight: 900, fontSize: 10, marginTop: 3 }}>{value}</div></div>;
}
