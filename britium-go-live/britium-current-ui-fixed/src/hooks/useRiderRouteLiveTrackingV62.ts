import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const RIDER_LIVE_TRACKING_V62_BUILD = "RIDER_LIVE_TRACKING_SECURE_RPC_V62_2026_08_02";

type TrackingState = {
  active: boolean;
  permission: PermissionState | "unsupported" | "unknown";
  syncing: boolean;
  lastSyncedAt: string;
  lastPositionAt: string;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  heading: number | null;
  speedMps: number | null;
  rpcName: string;
  error: string;
};

type TrackingOptions = {
  active: boolean;
  riderKey: string;
  riderEmail?: string;
  pickupId?: string;
  trackingNo?: string;
  wayplanId?: string;
  minimumIntervalMs?: number;
  minimumDistanceM?: number;
};

const initialState: TrackingState = {
  active: false,
  permission: "unknown",
  syncing: false,
  lastSyncedAt: "",
  lastPositionAt: "",
  latitude: null,
  longitude: null,
  accuracyM: null,
  heading: null,
  speedMps: null,
  rpcName: "",
  error: "",
};

function numberOrNull(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function radians(value: number) {
  return value * Math.PI / 180;
}

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radius = 6_371_000;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function isMissingRpc(error: any) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return ["42883", "PGRST202", "PGRST100"].includes(code)
    || message.includes("does not exist")
    || message.includes("could not find")
    || message.includes("function") && message.includes("schema cache");
}

async function pushSecureLocation(input: {
  actorEmail: string;
  riderKey: string;
  pickupId: string;
  trackingNo: string;
  wayplanId: string;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  heading: number | null;
  speedMps: number | null;
  capturedAt: string;
}) {
  const attempts = [
    // Canonical production signature exported from the active schema. This RPC
    // writes the event and live-location row under SECURITY DEFINER controls.
    {
      name: "be_rider_update_live_location",
      params: {
        p_actor_email: input.actorEmail || null,
        p_role_code: "rider",
        p_lat: input.latitude,
        p_lng: input.longitude,
        p_heading: input.heading,
        p_speed_mps: input.speedMps,
        p_accuracy_m: input.accuracyM,
        p_battery_pct: null,
        p_source: "RIDER_ROUTE_WATCH_V62",
      },
    },
    // Forward-compatible signatures are tried only when the canonical RPC is
    // absent from a newer deployment. No direct table fallback is permitted.
    {
      name: "be_update_rider_live_location",
      params: {
        p_actor_email: input.actorEmail || null,
        p_rider_email: input.actorEmail || null,
        p_pickup_id: input.pickupId || null,
        p_tracking_no: input.trackingNo || null,
        p_wayplan_id: input.wayplanId || null,
        p_lat: input.latitude,
        p_lng: input.longitude,
        p_accuracy_m: input.accuracyM,
        p_heading: input.heading,
        p_speed: input.speedMps,
        p_source: "RIDER_ROUTE_WATCH_V62",
      },
    },
    {
      name: "be_capture_rider_gps",
      params: {
        p_rider_email: input.actorEmail || null,
        p_pickup_id: input.pickupId || null,
        p_tracking_no: input.trackingNo || null,
        p_lat: input.latitude,
        p_lng: input.longitude,
        p_accuracy_m: input.accuracyM,
      },
    },
  ];

  let lastError: any = null;
  for (const attempt of attempts) {
    const { data, error } = await (supabase as any).rpc(attempt.name, attempt.params);
    if (!error) return { data, rpcName: attempt.name };
    lastError = error;
    if (!isMissingRpc(error)) throw error;
  }
  throw lastError || new Error("No secured Rider GPS RPC is available. Direct table writes are intentionally disabled.");
}

export function useRiderRouteLiveTrackingV62(options: TrackingOptions): TrackingState {
  const {
    active,
    riderKey,
    riderEmail = "",
    pickupId = "",
    trackingNo = "",
    wayplanId = "",
    minimumIntervalMs = 15_000,
    minimumDistanceM = 25,
  } = options;
  const [state, setState] = useState<TrackingState>(initialState);
  const lastSyncRef = useRef<{ at: number; latitude: number; longitude: number } | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let watchId: number | null = null;

    if (!active) {
      setState((current) => ({ ...current, active: false, syncing: false, error: "" }));
      return;
    }
    if (typeof window === "undefined" || typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState((current) => ({ ...current, active: false, permission: "unsupported", error: "GPS is unavailable on this device." }));
      return;
    }
    if (!window.isSecureContext) {
      setState((current) => ({ ...current, active: false, error: "Live route tracking requires HTTPS." }));
      return;
    }
    if (!riderKey) {
      setState((current) => ({ ...current, active: false, error: "Rider identity is required for live route tracking." }));
      return;
    }

    setState((current) => ({ ...current, active: true, error: "" }));

    void (async () => {
      try {
        if ("permissions" in navigator) {
          const permission = await navigator.permissions.query({ name: "geolocation" as PermissionName });
          if (!cancelled) setState((current) => ({ ...current, permission: permission.state }));
          permission.onchange = () => {
            if (!cancelled) setState((current) => ({ ...current, permission: permission.state }));
          };
        }
      } catch {
        if (!cancelled) setState((current) => ({ ...current, permission: "unknown" }));
      }
    })();

    watchId = navigator.geolocation.watchPosition(
      async (position) => {
        if (cancelled) return;
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const capturedAt = new Date(position.timestamp || Date.now()).toISOString();
        const accuracyM = numberOrNull(position.coords.accuracy);
        const heading = numberOrNull(position.coords.heading);
        const speedMps = numberOrNull(position.coords.speed);
        setState((current) => ({
          ...current,
          active: true,
          lastPositionAt: capturedAt,
          latitude,
          longitude,
          accuracyM,
          heading,
          speedMps,
          error: "",
        }));

        const now = Date.now();
        const previous = lastSyncRef.current;
        const elapsed = previous ? now - previous.at : Number.POSITIVE_INFINITY;
        const moved = previous ? distanceMeters(previous, { latitude, longitude }) : Number.POSITIVE_INFINITY;
        if (syncingRef.current || (elapsed < minimumIntervalMs && moved < minimumDistanceM)) return;

        syncingRef.current = true;
        setState((current) => ({ ...current, syncing: true }));
        try {
          const auth = await supabase.auth.getUser();
          const actorEmail = auth.data.user?.email || "";
          if (!actorEmail) throw new Error("An authenticated Rider account is required for live GPS synchronization.");
          const result = await pushSecureLocation({
            actorEmail,
            riderKey,
            pickupId,
            trackingNo,
            wayplanId,
            latitude,
            longitude,
            accuracyM,
            heading,
            speedMps,
            capturedAt,
          });
          lastSyncRef.current = { at: now, latitude, longitude };
          if (!cancelled) setState((current) => ({ ...current, syncing: false, lastSyncedAt: new Date().toISOString(), rpcName: result.rpcName, error: "" }));
        } catch (error: any) {
          if (!cancelled) setState((current) => ({ ...current, syncing: false, error: error?.message || "Live GPS synchronization failed." }));
        } finally {
          syncingRef.current = false;
        }
      },
      (error) => {
        if (cancelled) return;
        const message = error.code === error.PERMISSION_DENIED
          ? "Location permission is blocked. Enable it in browser site settings."
          : error.message || "Unable to read live GPS.";
        setState((current) => ({ ...current, syncing: false, permission: error.code === error.PERMISSION_DENIED ? "denied" : current.permission, error: message }));
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [active, minimumDistanceM, minimumIntervalMs, pickupId, riderEmail, riderKey, trackingNo, wayplanId]);

  return state;
}
