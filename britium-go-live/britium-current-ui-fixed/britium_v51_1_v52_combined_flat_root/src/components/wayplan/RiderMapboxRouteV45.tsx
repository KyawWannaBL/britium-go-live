// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { AlertTriangle, Loader2, MapPin, Navigation, Route as RouteIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const C = { panel: "#0b2236", panel2: "#061524", border: "#1a3a5c", text: "#eef8ff", sub: "#9cc2d9", gold: "#f6b84b", blue: "#38bdf8", green: "#34d399", red: "#fb7185" };
function text(value: any, fallback = "") { const out = String(value ?? "").trim(); return out || fallback; }

export default function RiderMapboxRouteV45({ wayplanId }: { wayplanId: string }) {
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
    const plan = snapshot?.route_plan; const origin = snapshot?.origin; const stops = plan?.ordered_stops || [];
    if (!container.current || !token || !origin || !plan?.geometry?.coordinates?.length) return;
    mapboxgl.accessToken = token;
    if (!mapRef.current) { mapRef.current = new mapboxgl.Map({ container: container.current, style: "mapbox://styles/mapbox/navigation-night-v1", center: [origin.longitude, origin.latitude], zoom: 11 }); mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right"); }
    const map = mapRef.current;
    const render = () => {
      markerRef.current.forEach((marker) => marker.remove()); markerRef.current = [];
      markerRef.current.push(new mapboxgl.Marker({ color: C.gold }).setLngLat([origin.longitude, origin.latitude]).setPopup(new mapboxgl.Popup({ offset: 14 }).setText(`START · ${origin.name}`)).addTo(map));
      stops.forEach((stop: any, index: number) => { const element = document.createElement("div"); element.textContent = String(index + 1); element.style.cssText = "width:24px;height:24px;border-radius:999px;background:#38bdf8;color:#061524;font-weight:900;display:grid;place-items:center;border:2px solid white;font-size:10px"; markerRef.current.push(new mapboxgl.Marker({ element }).setLngLat([Number(stop.longitude), Number(stop.latitude)]).setPopup(new mapboxgl.Popup({ offset: 14 }).setHTML(`<strong>${index + 1}. ${text(stop.delivery_way_id)}</strong><br/>${text(stop.recipient_name, "-")}<br/>${text(stop.address, stop.township || "-")}`)).addTo(map)); });
      const feature = { type: "Feature", properties: {}, geometry: plan.geometry } as any;
      if (map.getSource("rider-route-v45")) (map.getSource("rider-route-v45") as mapboxgl.GeoJSONSource).setData(feature); else { map.addSource("rider-route-v45", { type: "geojson", data: feature }); map.addLayer({ id: "rider-route-v45", type: "line", source: "rider-route-v45", paint: { "line-color": C.green, "line-width": 5 } }); }
      const coordinates = [[origin.longitude, origin.latitude], ...stops.map((stop: any) => [Number(stop.longitude), Number(stop.latitude)])]; const bounds = coordinates.reduce((box, coord) => box.extend(coord as [number, number]), new mapboxgl.LngLatBounds(coordinates[0] as [number, number], coordinates[0] as [number, number])); map.fitBounds(bounds, { padding: 45, maxZoom: 15 });
    };
    if (map.loaded()) render(); else map.once("load", render);
  }, [snapshot, token]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  if (loading) return <div style={{ border: `1px solid ${C.border}`, background: C.panel2, borderRadius: 14, padding: 14, color: C.sub }}><Loader2 size={15} className="animate-spin" style={{ verticalAlign: "middle", marginRight: 7 }} />Loading Mapbox route from Head Office…</div>;
  if (error) return <div style={{ border: `1px solid ${C.red}`, background: "rgba(251,113,133,.09)", borderRadius: 14, padding: 14, color: C.red }}><AlertTriangle size={15} style={{ verticalAlign: "middle", marginRight: 7 }} />{error}</div>;
  if (!snapshot?.route_plan) return <div style={{ border: `1px solid ${C.red}`, background: "rgba(251,113,133,.09)", borderRadius: 14, padding: 14, color: C.red }}><AlertTriangle size={15} style={{ verticalAlign: "middle", marginRight: 7 }} />This route has no approved Head Office Mapbox sequence. Contact Dispatch before starting.</div>;
  const plan = snapshot.route_plan; const origin = snapshot.origin; const stops = plan.ordered_stops || [];
  return <div style={{ border: `1px solid ${C.green}`, background: C.panel, borderRadius: 16, padding: 12, marginTop: 12 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}><div><div style={{ color: C.gold, fontSize: 10, fontWeight: 950, letterSpacing: ".15em" }}>MAPBOX RIDER ROUTE · START LOCKED</div><div style={{ color: C.text, fontWeight: 950, marginTop: 4 }}><RouteIcon size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />{origin.name} → {stops.length} delivery stops</div><div style={{ color: C.sub, fontSize: 11, marginTop: 3 }}>{(Number(plan.distance_m || 0) / 1000).toFixed(1)} km · {Math.round(Number(plan.duration_s || 0) / 60)} min</div></div><div style={{ color: C.green, fontSize: 10, fontWeight: 950 }}><Navigation size={14} style={{ verticalAlign: "middle", marginRight: 5 }} />FOLLOW SAVED STOP ORDER</div></div>
    <div ref={container} style={{ height: 330, marginTop: 10, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", background: C.panel2 }} />
    <div style={{ maxHeight: 190, overflow: "auto", marginTop: 10 }}>{stops.map((stop: any, index: number) => <div key={stop.delivery_way_id} style={{ display: "grid", gridTemplateColumns: "30px 1fr", gap: 8, borderTop: `1px solid ${C.border}`, padding: "8px 0" }}><div style={{ width: 26, height: 26, borderRadius: 999, background: C.blue, color: C.panel2, display: "grid", placeItems: "center", fontWeight: 950 }}>{index + 1}</div><div><div style={{ color: C.gold, fontWeight: 900, fontSize: 11 }}>{stop.delivery_way_id}</div><div style={{ color: C.sub, fontSize: 10 }}><MapPin size={10} style={{ verticalAlign: "middle", marginRight: 4 }} />{text(stop.address, stop.township || "-")}</div></div></div>)}</div>
  </div>;
}
