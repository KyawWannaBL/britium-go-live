import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Stop, VanPlan } from "@/lib/multiVanPlanner";

let googleMapsLoader: Promise<any> | null = null;

function loadGoogleMaps() {
  const w = window as any;
  if (w.google?.maps) return Promise.resolve(w.google.maps);
  if (googleMapsLoader) return googleMapsLoader;

  const apiKey = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();
  if (!apiKey) return Promise.reject(new Error("Google Maps browser key is not configured."));

  googleMapsLoader = new Promise((resolve, reject) => {
    const id = "britium-google-maps-js";
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      const wait = () => {
        if ((window as any).google?.maps) resolve((window as any).google.maps);
        else window.setTimeout(wait, 80);
      };
      wait();
      return;
    }

    const script = document.createElement("script");
    script.id = id;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.onload = () => {
      if ((window as any).google?.maps) resolve((window as any).google.maps);
      else reject(new Error("Google Maps loaded without the Maps JavaScript API."));
    };
    script.onerror = () => reject(new Error("Could not load Google Maps JavaScript API."));
    document.head.appendChild(script);
  });

  return googleMapsLoader;
}

function validPoint(value: any) {
  const lat = Number(value?.latitude);
  const lng = Number(value?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function decodePolyline(encoded: string) {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

type RouteView = {
  source: string;
  distance_m: number;
  duration_s: number;
  segments: Array<{ encoded_polyline: string; distance_m: number; duration_s: number }>;
};

export default function FullVanRouteMap({ origin, plan, vanLabel }: { origin: any; plan: VanPlan; vanLabel: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [routeView, setRouteView] = useState<RouteView | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const stops = plan.rows || [];
  const route: any = plan.route || {};
  const routeKey = useMemo(
    () => `${route.source || ""}|${route.optimized_at || ""}|${stops.map((s) => s.delivery_way_id).join(",")}`,
    [route.source, route.optimized_at, stops],
  );

  useEffect(() => {
    setRouteView(null);
    setError("");
  }, [routeKey]);

  useEffect(() => {
    if (!open || routeView || loading) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Authenticated Wayplan session is required to view the Google route.");
      const response = await fetch("/api/wayplan-route-view", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ origin, stops }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || `Full Google route failed (${response.status}).`);
      if (!cancelled) setRouteView({ source: data.source, distance_m: Number(data.distance_m || 0), duration_s: Number(data.duration_s || 0), segments: data.segments || [] });
    })().catch((e: any) => {
      if (!cancelled) setError(e?.message || "Could not load the complete Google route.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, routeView, loading, routeKey, origin, stops]);

  useEffect(() => {
    if (!open || !routeView || !mapRef.current) return;
    let cancelled = false;
    const overlays: any[] = [];
    void loadGoogleMaps().then((maps) => {
      if (cancelled || !mapRef.current) return;
      const originPoint = validPoint(origin);
      const stopPoints = stops.map(validPoint).filter(Boolean) as Array<{ lat: number; lng: number }>;
      if (!originPoint || !stopPoints.length) throw new Error("The van route needs a valid branch origin and delivery coordinates.");

      const map = new maps.Map(mapRef.current, {
        center: originPoint,
        zoom: 11,
        fullscreenControl: true,
        streetViewControl: false,
        mapTypeControl: true,
        gestureHandling: "greedy",
      });
      const bounds = new maps.LatLngBounds();
      bounds.extend(originPoint);
      stopPoints.forEach((point) => bounds.extend(point));

      overlays.push(new maps.Marker({ map, position: originPoint, label: "W", title: String(origin?.label || "Warehouse / branch origin") }));
      stops.forEach((stop: Stop, index: number) => {
        const position = validPoint(stop);
        if (!position) return;
        overlays.push(new maps.Marker({ map, position, label: String(index + 1), title: `${index + 1}. ${String((stop as any).waybill_no || stop.delivery_way_id)} · ${stop.township}` }));
      });

      for (const segment of routeView.segments) {
        const path = decodePolyline(String(segment.encoded_polyline || ""));
        if (path.length < 2) continue;
        path.forEach((point) => bounds.extend(point));
        overlays.push(new maps.Polyline({ map, path, geodesic: false, strokeOpacity: 0.9, strokeWeight: 5 }));
      }
      map.fitBounds(bounds, 42);
    }).catch((e: any) => {
      if (!cancelled) setError(e?.message || "Could not display the Google route map.");
    });
    return () => {
      cancelled = true;
      overlays.forEach((overlay) => overlay?.setMap?.(null));
    };
  }, [open, routeView, routeKey, origin, stops]);

  const distance = Number(routeView?.distance_m || route.distance_m || 0);
  const duration = Number(routeView?.duration_s || route.duration_s || 0);

  return (
    <div style={{ marginTop: 10, border: "1px solid #38566b", borderRadius: 10, overflow: "hidden", background: "#081b2c" }}>
      <button type="button" onClick={() => setOpen((value) => !value)} style={{ width: "100%", border: 0, padding: "11px 12px", background: "#173a55", color: "white", fontWeight: 800, cursor: "pointer", textAlign: "left" }}>
        {open ? "Hide" : "View"} whole Google route map — {vanLabel}
      </button>
      {open && (
        <div style={{ padding: 10, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
            <strong>{stops.length} delivery stops</strong>
            {distance > 0 && <span>{(distance / 1000).toFixed(1)} km</span>}
            {duration > 0 && <span>{Math.round(duration / 60)} min estimated road time</span>}
            <span>W = warehouse/origin · 1…{stops.length} = delivery sequence</span>
          </div>
          <div style={{ fontSize: 12 }}>This is one complete per-van Google road map. For long 50–75 stop plans, the server stitches all Google route legs so management and operations can review the entire van journey on one screen.</div>
          {loading && <div style={{ padding: 12 }}>Loading complete Google road route…</div>}
          {error && <div role="alert" style={{ padding: 12, border: "1px solid #8f5a2a", borderRadius: 8 }}>{error}</div>}
          {!loading && !error && routeView && <div ref={mapRef} style={{ width: "100%", height: 520, borderRadius: 8, background: "#102b45" }} />}
        </div>
      )}
    </div>
  );
}
