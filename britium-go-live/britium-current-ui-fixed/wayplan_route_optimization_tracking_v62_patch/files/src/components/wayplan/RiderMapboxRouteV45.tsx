// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { AlertTriangle, Clock3, Gauge, Loader2, MapPin, Navigation, Route as RouteIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const RIDER_MAPBOX_ROUTE_V62_BUILD = "RIDER_MAPBOX_ROUTE_DISTANCE_ETA_V62_2026_08_02";

const C = { panel: "#0b2236", panel2: "#061524", border: "#1a3a5c", text: "#eef8ff", sub: "#9cc2d9", muted: "#5d87a4", gold: "#f6b84b", blue: "#38bdf8", green: "#34d399", red: "#fb7185" };
function text(value: any, fallback = "") { const out = String(value ?? "").trim(); return out || fallback; }
function number(value: any, fallback = 0) { const out = Number(value); return Number.isFinite(out) ? out : fallback; }
function formatDistance(value: any) { const meters = Math.max(0, number(value)); return meters >= 1000 ? `${(meters / 1000).toFixed(meters >= 10_000 ? 0 : 1)} km` : `${Math.round(meters)} m`; }
function formatDuration(value: any) { const minutes = Math.max(0, Math.round(number(value) / 60)); const hours = Math.floor(minutes / 60); return hours ? `${hours} hr ${minutes % 60} min` : `${Math.max(1, minutes)} min`; }
function formatEta(value: any) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("en-GB", { timeZone: "Asia/Yangon", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }); }
function wayId(stop: any) { return text(stop?.delivery_way_id || stop?.deliveryWayId || stop?.way_id).toUpperCase(); }
function escapeHtml(value: any) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[character]); }

export default function RiderMapboxRouteV45({
  wayplanId,
  livePosition,
  currentStopId,
}: {
  wayplanId: string;
  livePosition?: { latitude: number | null; longitude: number | null; heading?: number | null } | null;
  currentStopId?: string;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker[]>([]);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const token = text(import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || import.meta.env.VITE_MAPBOX_TOKEN);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    void supabase.rpc("be_wayplan_route_snapshot_v45", { p_wayplan_id: wayplanId }).then(({ data, error: rpcError }) => {
      if (cancelled) return;
      if (rpcError) setError(rpcError.message); else setSnapshot(Array.isArray(data) ? data[0] || {} : data || {});
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [wayplanId]);

  useEffect(() => {
    const plan = snapshot?.route_plan; const origin = snapshot?.origin || plan?.origin; const stops = plan?.ordered_stops || [];
    if (!container.current || !token || !origin || !plan?.geometry?.coordinates?.length) return;
    mapboxgl.accessToken = token;
    if (!mapRef.current) {
      mapRef.current = new mapboxgl.Map({ container: container.current, style: "mapbox://styles/mapbox/navigation-night-v1", center: [origin.longitude, origin.latitude], zoom: 11 });
      mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    }
    const map = mapRef.current;
    const render = () => {
      markerRef.current.forEach((marker) => marker.remove()); markerRef.current = [];
      markerRef.current.push(new mapboxgl.Marker({ color: C.gold }).setLngLat([origin.longitude, origin.latitude]).setPopup(new mapboxgl.Popup({ offset: 14 }).setText(`START · ${origin.name}`)).addTo(map));
      stops.forEach((stop: any, index: number) => {
        const current = currentStopId && wayId(stop) === text(currentStopId).toUpperCase();
        const last = index === stops.length - 1;
        const element = document.createElement("div");
        element.textContent = String(index + 1);
        element.style.cssText = `width:${current ? 31 : 25}px;height:${current ? 31 : 25}px;border-radius:999px;background:${current ? C.red : last ? C.gold : C.blue};color:#061524;font-weight:950;display:grid;place-items:center;border:${current ? 3 : 2}px solid white;font-size:${current ? 12 : 10}px`;
        markerRef.current.push(new mapboxgl.Marker({ element }).setLngLat([Number(stop.longitude), Number(stop.latitude)]).setPopup(new mapboxgl.Popup({ offset: 14 }).setHTML(`<strong>${index + 1}. ${escapeHtml(wayId(stop))}${last ? " · LAST" : ""}</strong><br/>${escapeHtml(stop.recipient_name || "-")}<br/>${escapeHtml(stop.address || stop.township || "-")}<br/><b>${escapeHtml(formatDistance(stop.leg_distance_m))}</b> · ${escapeHtml(formatDuration(stop.leg_duration_s))}<br/>ETA ${escapeHtml(formatEta(stop.eta_at))}`)).addTo(map));
      });
      if (Number.isFinite(Number(livePosition?.longitude)) && Number.isFinite(Number(livePosition?.latitude))) {
        const element = document.createElement("div");
        const heading = number(livePosition?.heading, 0);
        element.innerHTML = `<div style="width:34px;height:34px;border-radius:999px;background:${C.red};border:3px solid white;display:grid;place-items:center;color:white;font-size:18px;box-shadow:0 4px 14px rgba(0,0,0,.5);transform:rotate(${heading}deg)">➤</div>`;
        markerRef.current.push(new mapboxgl.Marker({ element, rotationAlignment: "map" }).setLngLat([Number(livePosition!.longitude), Number(livePosition!.latitude)]).setPopup(new mapboxgl.Popup({ offset: 18 }).setText("Your live route position")).addTo(map));
      }
      const feature = { type: "Feature", properties: {}, geometry: plan.geometry } as any;
      if (map.getSource("rider-route-v62")) (map.getSource("rider-route-v62") as mapboxgl.GeoJSONSource).setData(feature);
      else { map.addSource("rider-route-v62", { type: "geojson", data: feature }); map.addLayer({ id: "rider-route-v62", type: "line", source: "rider-route-v62", paint: { "line-color": C.green, "line-width": 5 } }); }
      const coordinates: [number, number][] = [[origin.longitude, origin.latitude], ...stops.map((stop: any) => [Number(stop.longitude), Number(stop.latitude)] as [number, number])];
      if (Number.isFinite(Number(livePosition?.longitude)) && Number.isFinite(Number(livePosition?.latitude))) coordinates.push([Number(livePosition!.longitude), Number(livePosition!.latitude)]);
      const bounds = coordinates.reduce((box, coord) => box.extend(coord), new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));
      map.fitBounds(bounds, { padding: 45, maxZoom: 15 });
    };
    if (map.loaded()) render(); else map.once("load", render);
  }, [currentStopId, livePosition?.heading, livePosition?.latitude, livePosition?.longitude, snapshot, token]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  if (loading) return <div style={{ border: `1px solid ${C.border}`, background: C.panel2, borderRadius: 14, padding: 14, color: C.sub }}><Loader2 size={15} className="animate-spin" style={{ verticalAlign: "middle", marginRight: 7 }} />Loading optimized route…</div>;
  if (error) return <div style={{ border: `1px solid ${C.red}`, background: "rgba(251,113,133,.09)", borderRadius: 14, padding: 14, color: C.red }}><AlertTriangle size={15} style={{ verticalAlign: "middle", marginRight: 7 }} />{error}</div>;
  if (!snapshot?.route_plan) return <div style={{ border: `1px solid ${C.red}`, background: "rgba(251,113,133,.09)", borderRadius: 14, padding: 14, color: C.red }}><AlertTriangle size={15} style={{ verticalAlign: "middle", marginRight: 7 }} />This route has no approved Head Office stop sequence. Contact Dispatch before starting.</div>;
  const plan = snapshot.route_plan; const origin = snapshot.origin || plan.origin; const stops = plan.ordered_stops || [];
  return <div data-build={RIDER_MAPBOX_ROUTE_V62_BUILD} style={{ border: `1px solid ${C.green}`, background: C.panel, borderRadius: 16, padding: 12, marginTop: 12 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
      <div><div style={{ color: C.gold, fontSize: 10, fontWeight: 950, letterSpacing: ".15em" }}>OPTIMIZED RIDER ROUTE V62 · START TO LAST STOP</div><div style={{ color: C.text, fontWeight: 950, marginTop: 4 }}><RouteIcon size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />{origin.name} → {stops.length} delivery stops</div><div style={{ color: C.sub, fontSize: 11, marginTop: 3 }}>{formatDistance(plan.distance_m)} · {formatDuration(plan.duration_s)} travel · last ETA {formatEta(plan.arrival_at_last_stop)}</div></div>
      <div style={{ color: C.green, fontSize: 10, fontWeight: 950 }}><Navigation size={14} style={{ verticalAlign: "middle", marginRight: 5 }} />FOLLOW SAVED STOP ORDER</div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7, marginTop: 9 }}>
      <Metric icon={<Gauge size={12} />} label="Total distance" value={formatDistance(plan.distance_m)} />
      <Metric icon={<Clock3 size={12} />} label="Travel + service" value={formatDuration(plan.scheduled_duration_s || plan.duration_s)} />
      <Metric icon={<MapPin size={12} />} label="Last-stop ETA" value={formatEta(plan.arrival_at_last_stop)} />
    </div>
    <div ref={container} style={{ height: 350, marginTop: 10, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", background: C.panel2 }} />
    <div style={{ maxHeight: 230, overflow: "auto", marginTop: 10 }}>{stops.map((stop: any, index: number) => {
      const current = currentStopId && wayId(stop) === text(currentStopId).toUpperCase();
      return <div key={wayId(stop)} style={{ display: "grid", gridTemplateColumns: "30px minmax(0,1fr) 78px 76px 90px", gap: 8, borderTop: `1px solid ${C.border}`, padding: "8px 0", background: current ? "rgba(251,113,133,.06)" : "transparent" }}>
        <div style={{ width: 26, height: 26, borderRadius: 999, background: current ? C.red : index === stops.length - 1 ? C.gold : C.blue, color: C.panel2, display: "grid", placeItems: "center", fontWeight: 950 }}>{index + 1}</div>
        <div><div style={{ color: C.gold, fontWeight: 900, fontSize: 11 }}>{wayId(stop)}{index === stops.length - 1 ? " · LAST" : ""}</div><div style={{ color: C.sub, fontSize: 10 }}><MapPin size={10} style={{ verticalAlign: "middle", marginRight: 4 }} />{text(stop.address, stop.township || "-")}</div></div>
        <div style={{ color: C.text, fontSize: 9, fontWeight: 850 }}>{formatDistance(stop.leg_distance_m)}</div>
        <div style={{ color: C.text, fontSize: 9, fontWeight: 850 }}>{formatDuration(stop.leg_duration_s)}</div>
        <div style={{ color: C.green, fontSize: 9, fontWeight: 850 }}>{formatEta(stop.eta_at)}</div>
      </div>;
    })}</div>
  </div>;
}

function Metric({ icon, label, value }: any) {
  return <div style={{ border: `1px solid ${C.border}`, background: C.panel2, borderRadius: 9, padding: 7 }}><div style={{ color: C.muted, fontSize: 8, display: "flex", alignItems: "center", gap: 4 }}>{icon}{label.toUpperCase()}</div><div style={{ color: C.text, fontWeight: 900, fontSize: 10, marginTop: 3 }}>{value}</div></div>;
}
