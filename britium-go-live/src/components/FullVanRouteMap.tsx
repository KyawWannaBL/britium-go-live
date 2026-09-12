import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Stop, VanPlan } from "@/lib/multiVanPlanner";

let googleMapsLoader: Promise<any> | null = null;

function loadGoogleMaps() {
  const w = window as any;
  if (w.google?.maps) return Promise.resolve(w.google.maps);
  if (googleMapsLoader) return googleMapsLoader;

  const apiKey = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();
  if (!apiKey) return Promise.reject(new Error("VITE_GOOGLE_MAPS_API_KEY is not configured for the browser map."));

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

// Google encoded polyline decoder. Keeping this local avoids another client dependency.
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

export default function FullVanRouteMap({
  origin,
  plan,
  vanLabel,
}: {
  origin: any;
  plan: VanPlan;
  vanLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const mapRef = useRef<HTMLDivElement | null>(null);
  const stops = plan.rows || [];
  const segments = Array.isArray(plan.route?.route_segments) ? plan.route!.route_segments! : [];
  const routeKey = useMemo(
    () => `${plan.route?.source || ""}|${plan.route?.optimized_at || ""}|${stops.map((s) => s.delivery_way_id).join(",")}|${segments.map((s) => s.encoded_polyline?.length || 0).join(",")}`,
    [plan.route?.source, plan.route?.optimized_at, stops, segments],
  );

  useEffect(() => {
    if (!open || !mapRef.current) return;
    let cancelled = false;
    const overlays: any[] = [];

    setError("");
    void loadGoogleMaps()
      .then((maps) => {
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

        overlays.push(new maps.Marker({
          map,
          position: originPoint,
          label: "W",
          title: String(origin?.label || "Warehouse / branch origin"),
        }));

        stops.forEach((stop: Stop, index: number) => {
          const position = validPoint(stop);
          if (!position) return;
          overlays.push(new maps.Marker({
            map,
            position,
            label: String(index + 1),
            title: `${index + 1}. ${String((stop as any).waybill_no || stop.delivery_way_id)} · ${stop.township}`,
          }));
        });

        let drewRoadGeometry = false;
        for (const segment of segments) {
          const encoded = String(segment?.encoded_polyline || "");
          if (!encoded) continue;
          const path = decodePolyline(encoded);
          if (path.length < 2) continue;
          path.forEach((point) => bounds.extend(point));
          overlays.push(new maps.Polyline({ map, path, geodesic: false, strokeOpacity: 0.9, strokeWeight: 5 }));
          drewRoadGeometry = true;
        }

        if (!drewRoadGeometry) {
          overlays.push(new maps.Polyline({
            map,
            path: [originPoint, ...stopPoints],
            geodesic: true,
            strokeOpacity: 0.45,
            strokeWeight: 3,
          }));
        }

        map.fitBounds(bounds, 42);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || "Could not display the full route map.");
      });

    return () => {
      cancelled = true;
      overlays.forEach((overlay) => overlay?.setMap?.(null));
    };
  }, [open, routeKey, origin]);

  const isGoogleRoadGeometry = plan.route?.geometry_provider === "GOOGLE_ROUTES" && segments.length > 0;
  const manuallyEdited = plan.route?.source === "OPERATOR_EDITED";
  const distance = Number(plan.route?.distance_m || 0);
  const duration = Number(plan.route?.duration_s || 0);

  return (
    <div style={{ marginTop: 10, border: "1px solid #38566b", borderRadius: 10, overflow: "hidden", background: "#081b2c" }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={{ width: "100%", border: 0, padding: "11px 12px", background: "#173a55", color: "white", fontWeight: 800, cursor: "pointer", textAlign: "left" }}
      >
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
          {isGoogleRoadGeometry ? (
            <div style={{ fontSize: 12 }}>Google Routes road geometry is displayed for the complete van plan. Long routes are stitched from Google route segments so every planned stop remains visible on one map.</div>
          ) : manuallyEdited ? (
            <div style={{ fontSize: 12, fontWeight: 700 }}>The sequence was manually edited. The line below is a sequence preview only; use “Re-optimize road route” to refresh the complete Google road path.</div>
          ) : (
            <div style={{ fontSize: 12, fontWeight: 700 }}>Google road geometry is not available for this plan. Stop locations are shown, but the connecting line is only a geographic sequence preview and must not be treated as a Google road route.</div>
          )}
          {plan.route?.geometry_warning && <div style={{ fontSize: 12 }}>{plan.route.geometry_warning}</div>}
          {error ? (
            <div role="alert" style={{ padding: 12, border: "1px solid #8f5a2a", borderRadius: 8 }}>{error}</div>
          ) : (
            <div ref={mapRef} style={{ width: "100%", height: 480, borderRadius: 8, background: "#102b45" }} />
          )}
        </div>
      )}
    </div>
  );
}
