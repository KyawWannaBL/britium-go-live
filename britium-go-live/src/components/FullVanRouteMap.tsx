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

type Props = {
  origin: any;
  plan: VanPlan;
  vanLabel: string;
  allowLocationEdit?: boolean;
  onStopPinUpdated?: (deliveryWayId: string, latitude: number, longitude: number) => Promise<void> | void;
};

export default function FullVanRouteMap({ origin, plan, vanLabel, allowLocationEdit = true, onStopPinUpdated }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [routeView, setRouteView] = useState<RouteView | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [draftPin, setDraftPin] = useState<{ lat: number; lng: number } | null>(null);
  const [savingPin, setSavingPin] = useState(false);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRefs = useRef<Map<string, any>>(new Map());
  const draftMarkerRef = useRef<any>(null);
  const mapClickListenerRef = useRef<any>(null);

  const stops = plan.rows || [];
  const route: any = plan.route || {};
  const selectedStop = stops.find((stop) => stop.delivery_way_id === selectedId) || null;
  const routeKey = useMemo(
    () => `${route.source || ""}|${route.optimized_at || ""}|${stops.map((s) => `${s.delivery_way_id}:${s.latitude}:${s.longitude}`).join(",")}`,
    [route.source, route.optimized_at, stops],
  );

  useEffect(() => {
    setRouteView(null);
    setDraftPin(null);
    setMessage("");
    setError("");
  }, [routeKey]);

  useEffect(() => {
    if (!open || routeView || loading) return;
    let cancelled = false;
    setLoading(true);
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
      // Map pin editing must stay available even when detailed route geometry is unavailable.
      if (!cancelled) setMessage(`Road line unavailable: ${e?.message || "Google route could not be loaded"}. Stop pins can still be reviewed and corrected.`);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, routeView, loading, routeKey, origin, stops]);

  useEffect(() => {
    if (!open || !mapRef.current) return;
    let cancelled = false;
    const overlays: any[] = [];
    setMapLoading(true);
    setError("");

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
      mapInstanceRef.current = map;
      markerRefs.current.clear();
      const bounds = new maps.LatLngBounds();
      bounds.extend(originPoint);
      stopPoints.forEach((point) => bounds.extend(point));

      overlays.push(new maps.Marker({ map, position: originPoint, label: "W", title: String(origin?.label || "Warehouse / branch origin") }));

      stops.forEach((stop: Stop, index: number) => {
        const position = validPoint(stop);
        if (!position) return;
        const marker = new maps.Marker({
          map,
          position,
          label: String(index + 1),
          title: `${index + 1}. ${String((stop as any).waybill_no || stop.delivery_way_id)} · ${stop.township}`,
          draggable: Boolean(allowLocationEdit && onStopPinUpdated),
        });
        markerRefs.current.set(stop.delivery_way_id, marker);
        overlays.push(marker);
        marker.addListener("click", () => {
          setSelectedId(stop.delivery_way_id);
          setDraftPin(null);
          setMessage(`Selected stop ${index + 1}. Click anywhere on the map or drag this marker, then press Update location.`);
        });
        if (allowLocationEdit && onStopPinUpdated) {
          marker.addListener("dragend", (event: any) => {
            const lat = Number(event.latLng?.lat?.());
            const lng = Number(event.latLng?.lng?.());
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
            setSelectedId(stop.delivery_way_id);
            setDraftPin({ lat, lng });
            setMessage(`New pin selected for ${String((stop as any).waybill_no || stop.delivery_way_id)}. Press Update location to save and recalculate this van.`);
          });
        }
      });

      if (routeView?.segments?.length) {
        for (const segment of routeView.segments) {
          const path = decodePolyline(String(segment.encoded_polyline || ""));
          if (path.length < 2) continue;
          path.forEach((point) => bounds.extend(point));
          overlays.push(new maps.Polyline({ map, path, geodesic: false, strokeOpacity: 0.9, strokeWeight: 5 }));
        }
      } else {
        overlays.push(new maps.Polyline({ map, path: [originPoint, ...stopPoints], geodesic: true, strokeOpacity: 0.35, strokeWeight: 3 }));
      }

      if (allowLocationEdit && onStopPinUpdated) {
        mapClickListenerRef.current = map.addListener("click", (event: any) => {
          if (!selectedId) {
            setMessage("Select a delivery stop marker first, then click the corrected location on the map.");
            return;
          }
          const lat = Number(event.latLng?.lat?.());
          const lng = Number(event.latLng?.lng?.());
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          setDraftPin({ lat, lng });
          setMessage("Corrected pin selected. Press Update location to save and recalculate the van route.");
        });
      }

      map.fitBounds(bounds, 42);
    }).catch((e: any) => {
      if (!cancelled) setError(e?.message || "Could not display the Google route map.");
    }).finally(() => {
      if (!cancelled) setMapLoading(false);
    });

    return () => {
      cancelled = true;
      mapClickListenerRef.current?.remove?.();
      mapClickListenerRef.current = null;
      overlays.forEach((overlay) => overlay?.setMap?.(null));
      markerRefs.current.clear();
      mapInstanceRef.current = null;
    };
  }, [open, routeView, routeKey, origin, stops, allowLocationEdit, onStopPinUpdated, selectedId]);

  useEffect(() => {
    if (!mapInstanceRef.current || !selectedStop) return;
    const marker = markerRefs.current.get(selectedStop.delivery_way_id);
    const current = draftPin || validPoint(selectedStop);
    if (current && marker) marker.setPosition(current);

    if (draftPin) {
      const maps = (window as any).google?.maps;
      if (!maps) return;
      if (!draftMarkerRef.current) {
        draftMarkerRef.current = new maps.Marker({
          map: mapInstanceRef.current,
          position: draftPin,
          title: "Proposed corrected location",
          label: "✓",
          zIndex: 9999,
        });
      } else {
        draftMarkerRef.current.setMap(mapInstanceRef.current);
        draftMarkerRef.current.setPosition(draftPin);
      }
      mapInstanceRef.current.panTo(draftPin);
    } else if (draftMarkerRef.current) {
      draftMarkerRef.current.setMap(null);
    }
  }, [selectedId, selectedStop, draftPin]);

  async function updateLocation() {
    if (!selectedStop || !draftPin || !onStopPinUpdated) return;
    setSavingPin(true);
    setError("");
    setMessage("Saving corrected pin and recalculating this van route…");
    try {
      const { data, error: rpcError } = await supabase.rpc("be_update_delivery_location_pin_v1", {
        p_delivery_way_id: selectedStop.delivery_way_id,
        p_latitude: draftPin.lat,
        p_longitude: draftPin.lng,
        p_context: "WAYPLAN_COMMAND_MAP",
      });
      if (rpcError) throw rpcError;
      if (!data?.ok) throw new Error(data?.error || "Location update failed.");
      await onStopPinUpdated(selectedStop.delivery_way_id, draftPin.lat, draftPin.lng);
      setDraftPin(null);
      setMessage(`${String((selectedStop as any).waybill_no || selectedStop.delivery_way_id)} location updated. The van route has been recalculated; review the new sequence before creating the Wayplan.`);
    } catch (e: any) {
      setError(e?.message || "Could not update the location pin.");
    } finally {
      setSavingPin(false);
    }
  }

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
          <div style={{ fontSize: 12 }}>
            {allowLocationEdit && onStopPinUpdated
              ? "Location correction: click a numbered marker to select the parcel, then click the correct place on the map (or drag the marker) and press Update location. The route recalculates automatically."
              : "Complete per-van route map for operational review."}
          </div>
          {loading && <div style={{ padding: 8 }}>Loading complete Google road route…</div>}
          {message && <div style={{ padding: 10, border: "1px solid #38566b", borderRadius: 8 }}>{message}</div>}
          {error && <div role="alert" style={{ padding: 12, border: "1px solid #8f5a2a", borderRadius: 8 }}>{error}</div>}
          <div ref={mapRef} style={{ width: "100%", height: 520, borderRadius: 8, background: "#102b45", opacity: mapLoading ? 0.75 : 1 }} />

          {allowLocationEdit && onStopPinUpdated && (
            <div style={{ display: "grid", gap: 8, padding: 10, border: "1px solid #38566b", borderRadius: 8 }}>
              <label style={{ display: "grid", gap: 5, fontSize: 12 }}>
                Stop to correct
                <select
                  value={selectedId}
                  onChange={(event) => { setSelectedId(event.target.value); setDraftPin(null); setMessage(event.target.value ? "Stop selected. Click its correct location on the map." : ""); }}
                  style={{ padding: 9, borderRadius: 8 }}
                >
                  <option value="">Select delivery stop</option>
                  {stops.map((stop, index) => <option value={stop.delivery_way_id} key={stop.delivery_way_id}>{index + 1}. {String((stop as any).waybill_no || stop.delivery_way_id)} · {stop.township}</option>)}
                </select>
              </label>
              {selectedStop && <div style={{ fontSize: 12 }}>Current: {Number(selectedStop.latitude).toFixed(6)}, {Number(selectedStop.longitude).toFixed(6)}{draftPin ? `  →  New: ${draftPin.lat.toFixed(6)}, ${draftPin.lng.toFixed(6)}` : ""}</div>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  disabled={!selectedStop || !draftPin || savingPin}
                  onClick={() => void updateLocation()}
                  style={{ border: 0, borderRadius: 8, padding: "10px 14px", background: "#f6b84b", color: "#061524", fontWeight: 900, cursor: !selectedStop || !draftPin || savingPin ? "not-allowed" : "pointer" }}
                >
                  {savingPin ? "Updating…" : "Update location & re-optimize"}
                </button>
                <button
                  type="button"
                  disabled={!draftPin || savingPin}
                  onClick={() => { setDraftPin(null); setMessage("Proposed pin discarded."); }}
                  style={{ border: "1px solid #38566b", borderRadius: 8, padding: "10px 14px", background: "#173a55", color: "white", fontWeight: 800 }}
                >
                  Cancel pin change
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
