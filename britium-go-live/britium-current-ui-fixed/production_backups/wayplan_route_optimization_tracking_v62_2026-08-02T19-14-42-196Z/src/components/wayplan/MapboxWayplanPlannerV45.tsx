// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { AlertTriangle, CheckCircle2, Database, Loader2, MapPin, Navigation, RefreshCw, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  coordinateFromRecord,
  geocodeMissingStops,
  optimizeRouteFromHeadOffice,
  routeSavePayload,
  type OptimizedRoute,
  type RouteOrigin,
  type RouteStop,
} from "@/lib/mapboxHeadOfficeRoutingV45";

const C = { panel: "#0b2236", panel2: "#061524", border: "#1a3a5c", text: "#eef8ff", sub: "#9cc2d9", muted: "#5d87a4", gold: "#f6b84b", blue: "#38bdf8", green: "#34d399", red: "#fb7185" };

function text(value: any, fallback = "") { const output = String(value ?? "").trim(); return output || fallback; }
function wayId(row: any) { return text(row.delivery_way_id || row.deliveryWayId || row.way_id || row.waybill_no || row.tracking_no); }
function buttonStyle(kind: "gold" | "blue" | "green" | "plain" = "plain") {
  const palette = { gold: [C.gold, C.panel2], blue: [C.blue, C.panel2], green: [C.green, C.panel2], plain: [C.panel2, C.text] }[kind];
  return { minHeight: 40, border: `1px solid ${kind === "plain" ? C.border : palette[0]}`, borderRadius: 10, background: palette[0], color: palette[1], padding: "8px 13px", fontWeight: 900, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 } as const;
}

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

export default function MapboxWayplanPlannerV45({ wayplanId, fallbackStops = [], onRouteStateChange }: { wayplanId: string; fallbackStops?: any[]; onRouteStateChange?: (ready: boolean, state?: any) => void }) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<any>(null);
  const [resolvedStops, setResolvedStops] = useState<RouteStop[]>([]);
  const [route, setRoute] = useState<OptimizedRoute | null>(null);
  const [saved, setSaved] = useState(false);
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

  const load = useCallback(async () => {
    if (!wayplanId) { setSnapshot(null); setResolvedStops([]); setRoute(null); setSaved(false); onRouteStateChange?.(false); return; }
    setLoading(true); setError(""); setMessage("");
    try {
      const { data, error: rpcError } = await supabase.rpc("be_wayplan_route_snapshot_v45", { p_wayplan_id: wayplanId });
      if (rpcError) throw rpcError;
      const next = Array.isArray(data) ? data[0] || {} : data || {};
      setSnapshot(next);
      const stops = (Array.isArray(next.stops) ? next.stops : fallbackStops).map(routeStop);
      setResolvedStops(stops.filter((stop: any) => Number.isFinite(stop.longitude) && Number.isFinite(stop.latitude)) as RouteStop[]);
      if (next.route_plan?.geometry && Array.isArray(next.route_plan?.ordered_stops)) {
        const ordered = next.route_plan.ordered_stops.map((item: any) => ({
          deliveryWayId: text(item.delivery_way_id), recipientName: text(item.recipient_name), recipientPhone: text(item.recipient_phone), address: text(item.address), township: text(item.township), placeName: text(item.place_name), latitude: Number(item.latitude), longitude: Number(item.longitude), source: text(item.coordinate_source, "BACKEND") as any,
        }));
        setRoute({ orderedStops: ordered, geometry: next.route_plan.geometry, distanceMeters: Number(next.route_plan.distance_m || 0), durationSeconds: Number(next.route_plan.duration_s || 0), profile: next.route_plan.profile || "mapbox/driving-traffic", mode: next.route_plan.route_mode || "MAPBOX_OPTIMIZATION_V1", requestCount: Number(next.route_plan.request_count || 1) });
        setSaved(true); onRouteStateChange?.(true, next.route_plan);
      } else {
        setRoute(null); setSaved(false); onRouteStateChange?.(false, next);
      }
    } catch (caught: any) { setError(caught?.message || "Could not load the Head Office route snapshot."); setSaved(false); onRouteStateChange?.(false); }
    finally { setLoading(false); }
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
      markersRef.current.push(new mapboxgl.Marker({ color: C.gold }).setLngLat([origin.longitude, origin.latitude]).setPopup(new mapboxgl.Popup({ offset: 16 }).setText(`START · ${origin.name}`)).addTo(map));
      const stops = route?.orderedStops || resolvedStops;
      stops.forEach((stop, index) => {
        const element = document.createElement("div"); element.textContent = String(index + 1); element.style.cssText = "width:25px;height:25px;border-radius:999px;background:#38bdf8;color:#061524;font-weight:900;display:grid;place-items:center;border:2px solid white;font-size:11px";
        markersRef.current.push(new mapboxgl.Marker({ element }).setLngLat([stop.longitude, stop.latitude]).setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML(`<strong>${index + 1}. ${stop.deliveryWayId}</strong><br/>${text(stop.recipientName, "-")}<br/>${text(stop.address, stop.township || "-")}`)).addTo(map));
      });
      const geometry = route?.geometry;
      if (geometry?.coordinates?.length) {
        const data = { type: "Feature", properties: {}, geometry } as any;
        if (map.getSource("v45-route")) (map.getSource("v45-route") as mapboxgl.GeoJSONSource).setData(data);
        else { map.addSource("v45-route", { type: "geojson", data }); map.addLayer({ id: "v45-route", type: "line", source: "v45-route", paint: { "line-color": C.green, "line-width": 5, "line-opacity": 0.9 } }); }
      }
      const coordinates = [[origin.longitude, origin.latitude], ...stops.map((stop) => [stop.longitude, stop.latitude])];
      if (coordinates.length > 1) { const bounds = coordinates.reduce((box, coordinate) => box.extend(coordinate as [number, number]), new mapboxgl.LngLatBounds(coordinates[0] as [number, number], coordinates[0] as [number, number])); map.fitBounds(bounds, { padding: 55, maxZoom: 15, duration: 500 }); }
    };
    if (map.loaded()) render(); else map.once("load", render);
  }, [token, origin, resolvedStops, route]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  async function resolveCoordinates() {
    if (!token) { setError("Mapbox token is missing."); return; }
    setBusy("geocode"); setError(""); setMessage("");
    try {
      const stops = sourceRows.map(routeStop);
      const result = await geocodeMissingStops(stops, token, origin, (done, total, current) => setMessage(`Resolving ${done}/${total}: ${current}`));
      setResolvedStops(result.resolved);
      setRoute(null); setSaved(false); onRouteStateChange?.(false);
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
      const result = await optimizeRouteFromHeadOffice(origin, resolvedStops, token, "mapbox/driving-traffic", (done, total) => setMessage(`Mapbox optimization request ${done}/${total} completed.`));
      setRoute(result); setSaved(false); onRouteStateChange?.(false);
      setMessage(`Route arranged from Head Office: ${(result.distanceMeters / 1000).toFixed(1)} km · ${Math.round(result.durationSeconds / 60)} min · ${result.orderedStops.length} stops.`);
    } catch (caught: any) { setError(caught?.message || "Mapbox route optimization failed."); }
    finally { setBusy(""); }
  }

  async function saveRoute() {
    if (!route || !wayplanId) return;
    setBusy("save"); setError(""); setMessage("");
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error: rpcError } = await supabase.rpc("be_wayplan_save_mapbox_route_v45", { p_wayplan_id: wayplanId, p_route: routeSavePayload(origin, route), p_actor_email: userData?.user?.email || null });
      if (rpcError) throw rpcError; if (data?.ok === false) throw new Error(data?.error || "Route save failed.");
      setSaved(true); onRouteStateChange?.(true, data); setMessage(`Mapbox route saved from ${origin.name}. Supervisor review is now available.`);
    } catch (caught: any) { setError(caught?.message || "Could not save the Mapbox route."); setSaved(false); onRouteStateChange?.(false); }
    finally { setBusy(""); }
  }

  if (!wayplanId) return <section style={{ border: `1px solid ${C.border}`, borderRadius: 18, background: C.panel, padding: 16, color: C.sub }}>Create or choose a Wayplan before arranging its Mapbox route.</section>;

  return <section style={{ border: `1px solid ${saved ? C.green : C.border}`, borderRadius: 18, background: C.panel, padding: 16, color: C.text }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <div><div style={{ color: C.gold, fontSize: 10, fontWeight: 950, letterSpacing: ".17em" }}>MAPBOX V45 · FIXED HEAD OFFICE ORIGIN</div><h2 style={{ margin: "5px 0 0", fontSize: 18 }}>Rider Route Arrangement</h2><div style={{ color: C.sub, fontSize: 11, marginTop: 4 }}>START: {origin.name} · {origin.address} · {origin.latitude.toFixed(6)}, {origin.longitude.toFixed(6)}</div></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button onClick={() => void load()} disabled={loading || !!busy} style={buttonStyle("plain")}>{loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}Refresh</button><span style={{ border: `1px solid ${saved ? C.green : C.gold}`, color: saved ? C.green : C.gold, borderRadius: 999, padding: "8px 11px", fontSize: 10, fontWeight: 950 }}>{saved ? "ROUTE SAVED · REVIEW READY" : "ROUTE REQUIRED BEFORE REVIEW"}</span></div>
    </div>
    {error ? <div style={{ marginTop: 12, border: `1px solid ${C.red}`, background: "rgba(251,113,133,.10)", color: C.red, borderRadius: 12, padding: 11 }}><AlertTriangle size={15} style={{ verticalAlign: "middle", marginRight: 7 }} />{error}</div> : null}
    {message ? <div style={{ marginTop: 12, border: `1px solid ${C.blue}`, background: "rgba(56,189,248,.08)", color: C.sub, borderRadius: 12, padding: 11 }}>{message}</div> : null}
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(320px,.65fr)", gap: 12, marginTop: 12 }} className="mapbox-v45-grid">
      <div ref={mapContainer} style={{ minHeight: 450, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden", background: C.panel2 }} />
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, background: C.panel2, padding: 12, minHeight: 450 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><div><div style={{ color: C.muted, fontSize: 9 }}>PARCEL STOPS</div><div style={{ fontSize: 22, fontWeight: 950 }}>{sourceRows.length}</div></div><div><div style={{ color: C.muted, fontSize: 9 }}>MISSING COORDINATES</div><div style={{ fontSize: 22, fontWeight: 950, color: unresolvedCount ? C.red : C.green }}>{unresolvedCount}</div></div></div>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}><button onClick={() => void resolveCoordinates()} disabled={!!busy || !token || !sourceRows.length} style={{ ...buttonStyle("blue"), opacity: busy || !token || !sourceRows.length ? .5 : 1 }}>{busy === "geocode" ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}Resolve Missing Coordinates</button><button onClick={() => void optimize()} disabled={!!busy || resolvedStops.length !== sourceRows.length || !sourceRows.length} style={{ ...buttonStyle("gold"), opacity: busy || resolvedStops.length !== sourceRows.length || !sourceRows.length ? .5 : 1 }}>{busy === "optimize" ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}Optimize from Head Office</button><button onClick={() => void saveRoute()} disabled={!!busy || !route} style={{ ...buttonStyle("green"), opacity: busy || !route ? .5 : 1 }}>{busy === "save" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save Route & Stop Sequence</button></div>
        <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10, maxHeight: 265, overflow: "auto" }}>
          {(route?.orderedStops || resolvedStops).map((stop, index) => <div key={stop.deliveryWayId} style={{ display: "grid", gridTemplateColumns: "28px minmax(0,1fr) auto", gap: 8, padding: "8px 0", borderBottom: `1px solid ${C.border}`, alignItems: "center" }}><div style={{ width: 26, height: 26, borderRadius: 999, background: index === 0 ? C.gold : C.blue, color: C.panel2, display: "grid", placeItems: "center", fontWeight: 950 }}>{index + 1}</div><div style={{ minWidth: 0 }}><div style={{ color: C.gold, fontWeight: 900, fontSize: 11 }}>{stop.deliveryWayId}</div><div style={{ color: C.sub, fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><MapPin size={10} style={{ verticalAlign: "middle", marginRight: 3 }} />{text(stop.address, stop.township || "-")}</div></div><CheckCircle2 size={14} color={C.green} /></div>)}
          {!sourceRows.length ? <div style={{ color: C.sub, textAlign: "center", padding: 22 }}>No Wayplan stops loaded.</div> : null}
        </div>
      </div>
    </div>
    <style>{`@media(max-width:1050px){.mapbox-v45-grid{grid-template-columns:1fr!important}}`}</style>
  </section>;
}
