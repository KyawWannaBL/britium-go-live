// @ts-nocheck
// Britium Express — Rider App API Layer (Extended Go-Live)
// Path: src/lib/riderAppApi.ts

import { supabase } from "@/integrations/supabase/client";

export type RiderActionResult = { ok?: boolean; [key: string]: any };

export type OfflineEvent = {
  client_event_id: string;
  action_type: string;
  entity_type?: string;
  entity_key?: string;
  payload: Record<string, any>;
  created_at: string;
};

const OFFLINE_KEY = "britium:rider-app:offline-events:v1";
const RIDER_KEY   = "britium:rider-app:rider-id:v1";
const RIDER_CODE_KEY = "britium:rider-app:rider-code:v1";

function nowIso() { return new Date().toISOString(); }

function uuidish() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "evt-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function ensureNoRpcError(data: any, error: any) {
  if (error) {
    const msg = error.message || error.details || error.hint || "Supabase RPC failed";
    throw new Error(msg);
  }
  return data;
}

// ---- localStorage helpers (offline queue + rider identity) ----

export const riderStorage = {
  getRiderId(): string   { return localStorage.getItem(RIDER_KEY) || ""; },
  setRiderId(id: string) { localStorage.setItem(RIDER_KEY, id || ""); },

  getRiderCode(): string   { return localStorage.getItem(RIDER_CODE_KEY) || ""; },
  setRiderCode(code: string) { localStorage.setItem(RIDER_CODE_KEY, code || ""); },

  getQueue(): OfflineEvent[] {
    try {
      const raw    = localStorage.getItem(OFFLINE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  },
  setQueue(events: OfflineEvent[]) {
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(events || []));
  },
  enqueue(action_type: string, entity_type: string, entity_key: string, payload: Record<string, any>) {
    const next: OfflineEvent = {
      client_event_id: uuidish(),
      action_type,
      entity_type,
      entity_key,
      payload,
      created_at: nowIso(),
    };
    this.setQueue([...this.getQueue(), next]);
    return next;
  },
  clearQueue() { this.setQueue([]); },
};

// ---- Main API object ----

export const riderAppApi = {

  // ---- Auth / Session ----------------------------------------
  /* Returns rider profile linked to the current Supabase auth session */
  async loginContext(): Promise<any> {
    const { data, error } = await (supabase as any).rpc("be_rider_login_context");
    return ensureNoRpcError(data, error);
  },

  /* Links authenticated user to a template rider code (RID001, RID002 …) */
  async linkToTemplateRider(templateCode: string): Promise<any> {
    if (!templateCode?.trim()) throw new Error("Rider template code is required");
    const { data, error } = await (supabase as any).rpc(
      "be_rider_link_current_user_to_template_rider",
      { p_template_code: templateCode.trim().toUpperCase() }
    );
    return ensureNoRpcError(data, error);
  },

  /* Returns auth diagnostics: linkage status, table/RPC checks */
  async authDiagnostics(): Promise<any> {
    const { data, error } = await (supabase as any).rpc("be_rider_auth_diagnostics");
    return ensureNoRpcError(data, error);
  },

  // ---- Legacy rider code resolver ----------------------------
  async resolveRiderId(input: string): Promise<any> {
    const token = (input || "").trim();
    if (!token) throw new Error("Rider ID / Rider Code is required");
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
      const { data, error } = await supabase.from("riders").select("*").eq("id", token).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Rider not found: " + token);
      return data;
    }
    const { data, error } = await supabase.from("riders").select("*").ilike("rider_code", token).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Rider code not found: " + token);
    return data;
  },

  // ---- Snapshot (full dashboard data) ------------------------
  async snapshot(riderId: string) {
    const { data, error } = await (supabase as any).rpc("be_rider_app_snapshot", { p_rider_id: riderId });
    return ensureNoRpcError(data, error);
  },

  // ---- Dedicated pickup/wayplan queries ----------------------
  /* Returns assigned pickup requests for a rider */
  async assignedPickups(riderId: string, limit = 50): Promise<any> {
    const { data, error } = await (supabase as any).rpc("be_rider_assigned_pickups", {
      p_rider_id: riderId,
      p_limit: limit,
    });
    return ensureNoRpcError(data, error);
  },

  /* Returns assigned delivery wayplans with stops for a rider */
  async assignedWayplans(riderId: string, limit = 20): Promise<any> {
    const { data, error } = await (supabase as any).rpc("be_rider_assigned_wayplans", {
      p_rider_id: riderId,
      p_limit: limit,
    });
    return ensureNoRpcError(data, error);
  },

  // ---- Pickup actions ----------------------------------------
  async startPickupTrip(payload: { requestCode: string; riderId: string; gpsLat: number; gpsLng: number }) {
    const { data, error } = await (supabase as any).rpc("be_rider_start_pickup_trip", {
      p_request_code: payload.requestCode,
      p_rider_id:     payload.riderId,
      p_gps_lat:      payload.gpsLat,
      p_gps_lng:      payload.gpsLng,
    });
    return ensureNoRpcError(data, error);
  },

  async arriveAtPickup(payload: { requestCode: string; riderId: string; gpsLat: number; gpsLng: number }) {
    const { data, error } = await (supabase as any).rpc("be_rider_arrive_at_pickup", {
      p_request_code: payload.requestCode,
      p_rider_id:     payload.riderId,
      p_gps_lat:      payload.gpsLat,
      p_gps_lng:      payload.gpsLng,
    });
    return ensureNoRpcError(data, error);
  },

  async confirmPickupCompleted(payload: {
    requestCode: string; riderId: string; actualParcelCount: number;
    gpsLat: number; gpsLng: number; photoUrl?: string | null; signatureUrl?: string | null; remarks?: string | null;
  }) {
    const { data, error } = await (supabase as any).rpc("be_rider_confirm_pickup_completed", {
      p_request_code:       payload.requestCode,
      p_rider_id:           payload.riderId,
      p_actual_parcel_count: payload.actualParcelCount,
      p_gps_lat:            payload.gpsLat,
      p_gps_lng:            payload.gpsLng,
      p_photo_url:          payload.photoUrl || null,
      p_signature_url:      payload.signatureUrl || null,
      p_remarks:            payload.remarks || null,
    });
    return ensureNoRpcError(data, error);
  },

  async reportPickupException(payload: {
    requestCode: string; exceptionCode: string; riderId: string; remarks: string;
    gpsLat: number; gpsLng: number; photoUrl?: string | null;
    callAttemptCount?: number | null; nextAttemptDate?: string | null;
  }) {
    const { data, error } = await (supabase as any).rpc("be_rider_report_pickup_exception", {
      p_request_code:       payload.requestCode,
      p_exception_code:     payload.exceptionCode,
      p_rider_id:           payload.riderId,
      p_remarks:            payload.remarks,
      p_gps_lat:            payload.gpsLat,
      p_gps_lng:            payload.gpsLng,
      p_photo_url:          payload.photoUrl || null,
      p_call_attempt_count: payload.callAttemptCount || null,
      p_next_attempt_date:  payload.nextAttemptDate || null,
    });
    return ensureNoRpcError(data, error);
  },

  // ---- Delivery actions --------------------------------------
  async startDeliveryRoute(payload: { wayplanId: string; riderId: string; gpsLat: number; gpsLng: number }) {
    const { data, error } = await (supabase as any).rpc("be_rider_start_delivery_route", {
      p_wayplan_id: payload.wayplanId,
      p_rider_id:   payload.riderId,
      p_gps_lat:    payload.gpsLat,
      p_gps_lng:    payload.gpsLng,
    });
    return ensureNoRpcError(data, error);
  },

  async arriveDeliveryStop(payload: { deliveryWayId: string; riderId: string; gpsLat: number; gpsLng: number }) {
    const { data, error } = await (supabase as any).rpc("be_rider_arrive_delivery_stop", {
      p_delivery_way_id: payload.deliveryWayId,
      p_rider_id:        payload.riderId,
      p_gps_lat:         payload.gpsLat,
      p_gps_lng:         payload.gpsLng,
    });
    return ensureNoRpcError(data, error);
  },

  async markDelivered(payload: {
    deliveryWayId: string; riderId: string; receiverName: string;
    codCollected?: number | null; gpsLat: number; gpsLng: number;
    photoUrl?: string | null; signatureUrl?: string | null; remarks?: string | null;
  }) {
    const { data, error } = await (supabase as any).rpc("be_rider_mark_delivered", {
      p_delivery_way_id: payload.deliveryWayId,
      p_rider_id:        payload.riderId,
      p_receiver_name:   payload.receiverName,
      p_cod_collected:   payload.codCollected ?? null,
      p_gps_lat:         payload.gpsLat,
      p_gps_lng:         payload.gpsLng,
      p_photo_url:       payload.photoUrl || null,
      p_signature_url:   payload.signatureUrl || null,
      p_remarks:         payload.remarks || null,
    });
    return ensureNoRpcError(data, error);
  },

  async reportDeliveryException(payload: {
    deliveryWayId: string; exceptionCode: string; riderId: string; remarks: string;
    gpsLat: number; gpsLng: number; photoUrl?: string | null;
    callAttemptCount?: number | null; codNote?: string | null; nextAttemptDate?: string | null;
  }) {
    const { data, error } = await (supabase as any).rpc("be_rider_report_delivery_exception", {
      p_delivery_way_id:    payload.deliveryWayId,
      p_exception_code:     payload.exceptionCode,
      p_rider_id:           payload.riderId,
      p_remarks:            payload.remarks,
      p_gps_lat:            payload.gpsLat,
      p_gps_lng:            payload.gpsLng,
      p_photo_url:          payload.photoUrl || null,
      p_call_attempt_count: payload.callAttemptCount || null,
      p_cod_note:           payload.codNote || null,
      p_next_attempt_date:  payload.nextAttemptDate || null,
    });
    return ensureNoRpcError(data, error);
  },

  // ---- GPS & Offline -----------------------------------------
  /* Log a GPS breadcrumb ping for audit trail */
  async logGpsPing(payload: {
    riderId: string; gpsLat: number; gpsLng: number;
    context?: string; entityType?: string; entityKey?: string; accuracy?: number;
  }) {
    const { data, error } = await (supabase as any).rpc("be_rider_log_gps_ping", {
      p_rider_id:    payload.riderId,
      p_gps_lat:     payload.gpsLat,
      p_gps_lng:     payload.gpsLng,
      p_context:     payload.context || "GENERAL",
      p_entity_type: payload.entityType || null,
      p_entity_key:  payload.entityKey || null,
      p_accuracy:    payload.accuracy || null,
    });
    return ensureNoRpcError(data, error);
  },

  /* Submit offline event queue to server for audit */
  async submitOfflineEvents(riderId: string, events: OfflineEvent[]) {
    const { data, error } = await (supabase as any).rpc("be_rider_submit_offline_events", {
      p_rider_id: riderId,
      p_events:   events,
    });
    return ensureNoRpcError(data, error);
  },

  /* Legacy alias for submitOfflineEvents */
  async ingestOfflineEvents(riderId: string, events: OfflineEvent[]) {
    return this.submitOfflineEvents(riderId, events);
  },

  // ---- Offline queue replay ----------------------------------
  async runQueuedEvent(event: OfflineEvent) {
    const p = event.payload || {};
    switch (event.action_type) {
      case "START_PICKUP_TRIP":         return this.startPickupTrip(p);
      case "ARRIVE_AT_PICKUP":          return this.arriveAtPickup(p);
      case "CONFIRM_PICKUP_COMPLETED":  return this.confirmPickupCompleted(p);
      case "REPORT_PICKUP_EXCEPTION":   return this.reportPickupException(p);
      case "START_DELIVERY_ROUTE":      return this.startDeliveryRoute(p);
      case "ARRIVE_DELIVERY_STOP":      return this.arriveDeliveryStop(p);
      case "MARK_DELIVERED":            return this.markDelivered(p);
      case "REPORT_DELIVERY_EXCEPTION": return this.reportDeliveryException(p);
      default: throw new Error("Unsupported queued action: " + event.action_type);
    }
  },

  async flushQueue(riderId: string) {
    const queue = riderStorage.getQueue();
    if (!queue.length) return { ok: true, flushed: 0, failed: 0 };
    try { await this.submitOfflineEvents(riderId, queue); } catch { /* non-blocking */ }
    const remaining: OfflineEvent[] = [];
    let flushed = 0;
    let failed  = 0;
    for (const event of queue) {
      try { await this.runQueuedEvent(event); flushed++; }
      catch (err) { console.error("Offline replay failed", event, err); remaining.push(event); failed++; }
    }
    riderStorage.setQueue(remaining);
    return { ok: failed === 0, flushed, failed };
  },
};

// ---- GPS helper ----

export function getBrowserLocation(): Promise<{ gpsLat: number; gpsLng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("GPS / location permission is not available in this browser"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ gpsLat: Number(pos.coords.latitude), gpsLng: Number(pos.coords.longitude) }),
      (err) => reject(new Error(err.message || "GPS permission denied")),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  });
}

// ---- Exception rule validator ----

export function validateRuleDrivenException(rule: any, input: any): string[] {
  const errors: string[] = [];
  const yes = (v: any) => String(v || "").toUpperCase() === "YES";
  if (!input.exceptionCode) errors.push("Exception reason is required");
  if (yes(rule?.require_remark)    && !String(input.remarks || "").trim()) errors.push("Remarks are required by rule");
  if (yes(rule?.require_photo)     && !String(input.photoUrl || "").trim()) errors.push("Photo URL is required by rule");
  if (yes(rule?.require_call_log)  && Number(input.callAttemptCount || 0) <= 0) errors.push("Call attempt count is required by rule");
  if (yes(rule?.require_cod_note)  && !String(input.codNote || "").trim()) errors.push("COD note is required by rule");
  if (yes(rule?.allow_reschedule)  && !String(input.nextAttemptDate || "").trim()) errors.push("Next attempt date is required because reschedule is allowed");
  return errors;
}
