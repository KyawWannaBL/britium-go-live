import { supabase } from "@/integrations/supabase/client";

export type GpsCapture = {
  lat: number;
  lng: number;
  accuracy_m: number | null;
  heading: number | null;
  speed_mps: number | null;
  captured_at: string;
};

export type RiderGpsSyncInput = {
  actorEmail: string;
  pickupId?: string | null;
  requestCode?: string | null;
  trackingNo?: string | null;
  waybillNo?: string | null;
  gps: GpsCapture;
  source?: string;
};

export type SupervisorLiveMapPoint = {
  id: string;
  pickup_id: string;
  request_code: string;
  tracking_no: string;
  rider_email: string;
  rider_code: string;
  rider_name: string;
  status: string;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  heading: number | null;
  speed_mps: number | null;
  updated_at: string;
  township: string;
  branch_code: string;
  raw: Record<string, any>;
};

function asText(value: any) {
  return String(value ?? "").trim();
}

function numberOrNull(value: any) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function readRows(value: any): Record<string, any>[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.jobs)) return value.jobs;
  if (Array.isArray(value?.locations)) return value.locations;
  if (Array.isArray(value?.live_locations)) return value.live_locations;
  if (Array.isArray(value?.riders)) return value.riders;
  return [];
}

async function rpcRows(name: string, params: Record<string, any> = {}) {
  const { data, error } = await (supabase as any).rpc(name, params);
  if (error) throw error;
  return readRows(data);
}

async function tableRows(tableName: string, limit = 500) {
  const { data, error } = await (supabase as any)
    .from(tableName)
    .select("*")
    .limit(limit);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function captureBrowserGps(): Promise<GpsCapture> {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    throw new Error("GPS is only available in the browser.");
  }

  if (!window.isSecureContext) {
    throw new Error("GPS requires HTTPS secure context.");
  }

  if (!("geolocation" in navigator)) {
    throw new Error("GPS is disabled by browser, device, or hosting permissions policy.");
  }

  try {
    if ("permissions" in navigator) {
      const permission = await navigator.permissions.query({
        name: "geolocation" as PermissionName,
      });

      if (permission.state === "denied") {
        throw new Error("Location permission is denied. Enable location permission in browser site settings.");
      }
    }
  } catch (error: any) {
    if (String(error?.message || "").includes("denied")) throw error;
  }

  return await new Promise<GpsCapture>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy_m: numberOrNull(position.coords.accuracy),
          heading: numberOrNull(position.coords.heading),
          speed_mps: numberOrNull(position.coords.speed),
          captured_at: new Date().toISOString(),
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error("Location permission is blocked by browser or Permissions-Policy."));
          return;
        }

        reject(new Error(error.message || "Unable to capture GPS."));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  });
}

export async function syncRiderGps(input: RiderGpsSyncInput) {
  // FIX: Added `?? null` and `|| null` to EVERYTHING so undefined is never sent to Supabase
  const attempts = [
    {
      name: "be_update_rider_live_location",
      params: {
        p_actor_email: input.actorEmail || null,
        p_rider_email: input.actorEmail || null,
        p_pickup_id: input.pickupId || null,
        p_request_code: input.requestCode || null,
        p_tracking_no: input.trackingNo || input.waybillNo || null,
        p_waybill_no: input.waybillNo || input.trackingNo || null,
        p_lat: input.gps?.lat ?? null,
        p_lng: input.gps?.lng ?? null,
        p_accuracy_m: input.gps?.accuracy_m ?? null,
        p_heading: input.gps?.heading ?? null,
        p_speed: input.gps?.speed_mps ?? null,
        p_source: input.source || "RIDER_GPS_CAPTURE",
      },
    },
    {
      name: "be_rider_update_live_location",
      params: {
        p_actor_email: input.actorEmail || null,
        p_pickup_id: input.pickupId || null,
        p_tracking_no: input.trackingNo || input.waybillNo || null,
        p_latitude: input.gps?.lat ?? null,
        p_longitude: input.gps?.lng ?? null,
        p_accuracy_m: input.gps?.accuracy_m ?? null,
      },
    },
    {
      name: "be_capture_rider_gps",
      params: {
        p_rider_email: input.actorEmail || null,
        p_pickup_id: input.pickupId || null,
        p_tracking_no: input.trackingNo || input.waybillNo || null,
        p_lat: input.gps?.lat ?? null,
        p_lng: input.gps?.lng ?? null,
        p_accuracy_m: input.gps?.accuracy_m ?? null,
      },
    },
  ];

  let lastError: any = null;

  for (const attempt of attempts) {
    try {
      const { data, error } = await (supabase as any).rpc(attempt.name, attempt.params);
      if (error) throw error;
      return data;
    } catch (error: any) {
      lastError = error;
      const message = String(error?.message || "");
      const code = String(error?.code || "");

      // FIX: Added PGRST202 and PGRST100 so if an RPC signature mismatch (400 error) occurs,
      // it correctly catches it and moves on to the next fallback instead of crashing the app!
      if (
        code !== "42883" && 
        code !== "PGRST202" && 
        code !== "PGRST100" && 
        !message.toLowerCase().includes("does not exist") &&
        !message.toLowerCase().includes("could not find")
      ) {
        throw error;
      }
    }
  }

  try {
    const { data, error } = await (supabase as any)
      .from("be_rider_live_locations")
      .upsert(
        {
          rider_email: input.actorEmail || null,
          pickup_id: input.pickupId || null,
          request_code: input.requestCode || null,
          tracking_no: input.trackingNo || input.waybillNo || null,
          lat: input.gps?.lat ?? null,
          lng: input.gps?.lng ?? null,
          accuracy_m: input.gps?.accuracy_m ?? null,
          heading: input.gps?.heading ?? null,
          speed_mps: input.gps?.speed_mps ?? null,
          source: input.source || "RIDER_GPS_CAPTURE",
          updated_at: input.gps?.captured_at || new Date().toISOString(),
        },
        {
          onConflict: "rider_email",
        },
      )
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error: any) {
    throw lastError || error;
  }
}

export async function captureAndSyncRiderGps(input: Omit<RiderGpsSyncInput, "gps">) {
  const gps = await captureBrowserGps();

  await syncRiderGps({
    ...input,
    gps,
  });

  return gps;
}

export function normalizeSupervisorLiveMapPoint(row: Record<string, any>): SupervisorLiveMapPoint {
  const lat = numberOrNull(
    row.lat ||
      row.latitude ||
      row.gps_lat ||
      row.current_lat ||
      row.rider_lat ||
      row.location_lat,
  );

  const lng = numberOrNull(
    row.lng ||
      row.lon ||
      row.long ||
      row.longitude ||
      row.gps_lng ||
      row.gps_lon ||
      row.current_lng ||
      row.rider_lng ||
      row.location_lng,
  );

  const pickupId = asText(row.pickup_id || row.pickup_code || row.pickup_request_id || row.request_code);
  const requestCode = asText(row.request_code || row.pickup_request_code || pickupId);
  const trackingNo = asText(row.tracking_no || row.waybill_no || row.pickup_waybill_id || row.pickup_way_id || pickupId);

  const riderEmail = asText(row.rider_email || row.assigned_rider_email || row.email || row.user_email);
  const riderCode = asText(row.rider_code || row.assigned_rider_code || row.workforce_code || row.worker_code);

  return {
    id: asText(row.id || pickupId || requestCode || riderEmail || riderCode),
    pickup_id: pickupId,
    request_code: requestCode,
    tracking_no: trackingNo,
    rider_email: riderEmail,
    rider_code: riderCode,
    rider_name: asText(row.rider_name || row.full_name || row.name || row.display_name || riderEmail || riderCode),
    status: asText(row.status || row.gps_status || row.delivery_status || row.pickup_status || "WAITING_GPS"),
    lat,
    lng,
    accuracy_m: numberOrNull(row.accuracy_m || row.accuracy || row.gps_accuracy),
    heading: numberOrNull(row.heading || row.bearing || row.gps_heading),
    speed_mps: numberOrNull(row.speed_mps || row.speed || row.gps_speed),
    updated_at: asText(row.updated_at || row.last_seen_at || row.gps_updated_at || row.created_at),
    township: asText(row.township || row.pickup_township || row.zone),
    branch_code: asText(row.branch_code || row.origin_branch_code),
    raw: row,
  };
}

/**
 * Read only the branch-authorized, time-limited live fleet endpoint.
 * Never fall back to arbitrary GPS tables or legacy unscoped snapshots.
 * The backend function must be installed and access-tested before this
 * frontend change is merged to production.
 */
export async function loadSupervisorLiveMapSnapshot(): Promise<SupervisorLiveMapPoint[]> {
  const { data, error } = await (supabase as any).rpc("be_ops_live_fleet_positions_v1");
  if (error) throw new Error(error.message || "Authorized live-fleet access is unavailable.");
  if (data?.ok !== true || !Array.isArray(data.positions)) {
    throw new Error("Authorized live-fleet data is unavailable.");
  }

  const now = Date.now();
  const fresh = data.positions.filter((item: any) => {
    const lat = Number(item?.latitude), lng = Number(item?.longitude);
    const seen = Date.parse(String(item?.last_seen_at || ""));
    const expiry = Date.parse(String(item?.expires_at || ""));
    return Number.isFinite(lat) && Number.isFinite(lng) &&
      Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
      !(lat === 0 && lng === 0) &&
      Number.isFinite(seen) && Number.isFinite(expiry) &&
      expiry > now && seen <= now && now - seen < 120000;
  });
  return fresh.map((point: any) => normalizeSupervisorLiveMapPoint({
    ...point,
    rider_code: point.worker_code,
    rider_name: point.worker_code,
    lat: point.latitude,
    lng: point.longitude,
    status: "LIVE",
    updated_at: point.last_seen_at,
    gps_status: "LIVE",
  }));
}

export function gpsAgeMinutes(updatedAt?: string) {
  const time = Date.parse(updatedAt || "");
  if (!time) return null;
  return Math.max(0, Math.round((Date.now() - time) / 60000));
}

export function gpsStatusText(point: SupervisorLiveMapPoint) {
  if (!point.lat || !point.lng) return "WAITING GPS";

  const age = gpsAgeMinutes(point.updated_at);
  if (age === null) return "GPS ACTIVE";
  if (age <= 5) return "LIVE";
  if (age <= 30) return `${age} MIN AGO`;
  return "STALE GPS";
}

export function googleMapsUrl(lat?: number | null, lng?: number | null) {
  if (!lat || !lng) return "";
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function subscribeGpsTables(onChange: () => void) {
  const channel = supabase
    .channel("supervisor-rider-gps-sync")
    .on("postgres_changes", { event: "*", schema: "public", table: "be_rider_live_locations" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "be_live_rider_locations" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "be_mobile_gps_locations" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "be_mobile_location_events" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "be_rider_location_events" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "be_portal_pickup_requests" }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
