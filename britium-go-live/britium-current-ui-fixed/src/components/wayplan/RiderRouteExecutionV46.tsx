// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, LocateFixed, Navigation, RefreshCw, Route, ShieldCheck, Signal, SignalHigh } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { acceptManifest } from "@/lib/routedDeliveryApi";
import RiderMapboxRouteV45 from "@/components/wayplan/RiderMapboxRouteV45";
import { useRiderRouteLiveTrackingV62 } from "@/hooks/useRiderRouteLiveTrackingV62";

export const RIDER_V46_ROUTE_BUILD = "RIDER_ROUTE_EXECUTION_AND_LIVE_TRACKING_V62_2026_08_02";

const C = {
  panel: "#0b2236",
  panel2: "#061524",
  border: "#1a3a5c",
  text: "#eef8ff",
  sub: "#9cc2d9",
  gold: "#f6b84b",
  blue: "#38bdf8",
  green: "#34d399",
  red: "#fb7185",
};

function text(value: any, fallback = "") {
  const out = String(value ?? "").trim();
  return out || fallback;
}

function operationId(prefix: string) {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}

async function browserLocation() {
  if (!navigator.geolocation) throw new Error("GPS is not available on this device.");
  return await new Promise<{ latitude: number; longitude: number; accuracy: number | null }>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
      }),
      (error) => reject(new Error(error.message || "GPS permission is required.")),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
    );
  });
}

function unwrap(data: any) {
  return Array.isArray(data) ? data[0] || {} : data || {};
}

export default function RiderRouteExecutionV46({ wayplan, rider, busy, onRefresh }: any) {
  const wayplanId = text(wayplan?.wayplan_code || wayplan?.wayplan_no || wayplan?.id);
  const riderKey = text(rider?.rider_code || rider?.rider_id || rider?.code || rider?.id);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!wayplanId || !riderKey) return;
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await (supabase as any).rpc("be_rider_route_snapshot_v46", {
      p_wayplan_id: wayplanId,
      p_rider_key: riderKey,
    });
    if (rpcError) setError(rpcError.message || "Unable to load route execution state.");
    else setSnapshot(unwrap(data));
    setLoading(false);
  }, [riderKey, wayplanId]);

  useEffect(() => { void load(); }, [load]);

  const run = snapshot?.run || {};
  const current = snapshot?.current_stop || null;
  const status = text(run.run_status, "ASSIGNED").toUpperCase();
  const counts = snapshot?.counts || {};
  const actionBusy = busy || working;
  const riderEmail = text(rider?.email || rider?.rider_email || rider?.user_email);
  const liveTracking = useRiderRouteLiveTrackingV62({
    active: status === "IN_PROGRESS",
    riderKey,
    riderEmail,
    wayplanId,
    pickupId: text(current?.pickup_id || current?.request_code),
    trackingNo: text(current?.delivery_way_id || current?.tracking_no),
  });

  const progress = useMemo(() => {
    const total = Number(counts.total || 0);
    const finalCount = Number(counts.delivered || 0) + Number(counts.failed || 0) + Number(counts.rto || 0);
    return total > 0 ? Math.min(100, Math.round((finalCount / total) * 100)) : 0;
  }, [counts]);

  async function runAction(action: "ACCEPT" | "START" | "ARRIVE") {
    setWorking(true);
    setError("");
    setMessage("");
    try {
      if (action === "ACCEPT") {
        const { error: rpcError } = await (supabase as any).rpc("be_rider_accept_route_v46", {
          p_wayplan_id: wayplanId,
          p_rider_key: riderKey,
          p_operation_id: operationId("accept-route"),
        });
        if (rpcError) throw rpcError;
        setMessage("Route accepted. Start it only from Britium Head Office.");
      }

      if (action === "START") {
        const gps = await browserLocation();
        const manifestStatus = text(wayplan?.manifest_status).toUpperCase();
        if (Number.isInteger(wayplan?.manifest_id) && !["ACCEPTED", "IN_PROGRESS", "DISPATCHED", "COMPLETED"].includes(manifestStatus)) {
          await acceptManifest({
            manifestId: wayplan.manifest_id,
            expectedVersion: Number(wayplan?.manifest_version || 0),
          });
        }
        const { error: rpcError } = await (supabase as any).rpc("be_rider_start_route_v46", {
          p_wayplan_id: wayplanId,
          p_rider_key: riderKey,
          p_latitude: gps.latitude,
          p_longitude: gps.longitude,
          p_operation_id: operationId("start-route"),
        });
        if (rpcError) throw rpcError;
        setMessage("Route started from Head Office. Follow the saved stop order.");
      }

      if (action === "ARRIVE") {
        if (!current?.delivery_way_id) throw new Error("There is no active delivery stop.");
        const gps = await browserLocation();
        const { data, error: rpcError } = await (supabase as any).rpc("be_rider_arrive_stop_v46", {
          p_wayplan_id: wayplanId,
          p_delivery_way_id: current.delivery_way_id,
          p_rider_key: riderKey,
          p_latitude: gps.latitude,
          p_longitude: gps.longitude,
          p_operation_id: operationId("arrive-stop"),
        });
        if (rpcError) throw rpcError;
        const result = unwrap(data);
        setMessage(result?.geo_verified === false
          ? `Arrival recorded with GPS warning (${Math.round(Number(result?.distance_m || 0))} m from saved stop).`
          : "Arrival recorded for the current stop.");
      }

      await load();
      await onRefresh?.();
    } catch (caught: any) {
      setError(caught?.message || String(caught));
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return <div style={{ border: `1px solid ${C.border}`, background: C.panel2, borderRadius: 14, padding: 14, color: C.sub }}>
      <Loader2 size={15} className="animate-spin" style={{ verticalAlign: "middle", marginRight: 7 }} />
      Loading Rider route execution...
    </div>;
  }

  return <div style={{ border: `1px solid ${status === "COMPLETED" ? C.green : C.blue}`, background: C.panel, borderRadius: 16, padding: 12, marginTop: 12 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
      <div>
        <div style={{ color: C.gold, fontSize: 10, fontWeight: 950, letterSpacing: ".14em" }}>V46 RIDER DELIVERY EXECUTION</div>
        <div style={{ color: C.text, fontWeight: 950, marginTop: 5, display: "flex", alignItems: "center", gap: 7 }}>
          <Route size={16} /> {wayplanId}
        </div>
        <div style={{ color: C.sub, fontSize: 11, marginTop: 4 }}>
          Status: <b style={{ color: status === "COMPLETED" ? C.green : C.blue }}>{status}</b> · Progress {progress}%
        </div>
      </div>
      <button disabled={actionBusy} onClick={() => void load()} style={buttonStyle(C.panel2, C.text)}>
        <RefreshCw size={14} /> Refresh
      </button>
    </div>

    <div style={{ height: 7, borderRadius: 999, background: C.panel2, overflow: "hidden", marginTop: 10 }}>
      <div style={{ height: "100%", width: `${progress}%`, background: C.green, transition: "width .2s ease" }} />
    </div>

    <div style={{ marginTop: 9, border: `1px solid ${liveTracking.error ? C.red : liveTracking.active ? C.green : C.border}`, background: C.panel2, borderRadius: 11, padding: 9, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <div style={{ color: liveTracking.error ? C.red : liveTracking.active ? C.green : C.sub, fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", gap: 6 }}>
        {liveTracking.active ? <SignalHigh size={14} /> : <Signal size={14} />}
        {status === "IN_PROGRESS"
          ? liveTracking.error
            ? "LIVE GPS NEEDS ATTENTION"
            : liveTracking.syncing
              ? "SYNCING SECURED RIDER GPS"
              : liveTracking.lastSyncedAt
                ? "LIVE RIDER GPS ACTIVE"
                : "WAITING FOR FIRST GPS FIX"
          : "LIVE GPS STARTS WITH THE DELIVERY ROUTE"}
      </div>
      <div style={{ color: C.sub, fontSize: 9 }}>
        {liveTracking.lastSyncedAt ? `Last sync ${new Date(liveTracking.lastSyncedAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Yangon" })} · ${liveTracking.rpcName}` : "Secured RPC only · no direct location-table writes"}
      </div>
    </div>
    {liveTracking.error ? <div style={{ color: C.red, fontSize: 10, marginTop: 6 }}><AlertTriangle size={12} style={{ verticalAlign: "middle", marginRight: 5 }} />{liveTracking.error}</div> : null}

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 8, marginTop: 10 }}>
      <Metric label="Total" value={counts.total} />
      <Metric label="Delivered" value={counts.delivered} />
      <Metric label="Failed" value={counts.failed} />
      <Metric label="RTO" value={counts.rto} />
      <Metric label="Remaining" value={counts.remaining} />
    </div>

    {current ? <div style={{ marginTop: 10, border: `1px solid ${C.border}`, background: C.panel2, borderRadius: 12, padding: 11 }}>
      <div style={{ color: C.gold, fontSize: 10, fontWeight: 950 }}>CURRENT STOP #{current.stop_sequence}</div>
      <div style={{ color: C.text, fontWeight: 950, marginTop: 4 }}>{current.delivery_way_id}</div>
      <div style={{ color: C.sub, fontSize: 11, marginTop: 3 }}>{text(current.recipient_name, "Recipient")} · {text(current.address, current.township || "-")}</div>
    </div> : <div style={{ marginTop: 10, color: C.green, display: "flex", gap: 7, alignItems: "center", fontWeight: 900 }}><CheckCircle2 size={16} />No remaining delivery stops.</div>}

    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
      {status === "ASSIGNED" ? <button disabled={actionBusy} onClick={() => void runAction("ACCEPT")} style={buttonStyle(C.blue, C.panel2)}><ShieldCheck size={15} />Accept Route</button> : null}
      {status === "ACCEPTED" ? <button disabled={actionBusy} onClick={() => void runAction("START")} style={buttonStyle(C.green, C.panel2)}><Navigation size={15} />Start at Head Office</button> : null}
      {status === "IN_PROGRESS" && current ? <button disabled={actionBusy} onClick={() => void runAction("ARRIVE")} style={buttonStyle(C.gold, C.panel2)}><LocateFixed size={15} />Arrive Current Stop</button> : null}
    </div>

    {message ? <div style={{ color: C.green, marginTop: 9, fontSize: 11, fontWeight: 850 }}>{message}</div> : null}
    {error ? <div style={{ color: C.red, marginTop: 9, fontSize: 11, fontWeight: 850 }}>{error}</div> : null}

    <RiderMapboxRouteV45
      wayplanId={wayplanId}
      currentStopId={text(current?.delivery_way_id)}
      livePosition={{ latitude: liveTracking.latitude, longitude: liveTracking.longitude, heading: liveTracking.heading }}
    />
  </div>;
}

function Metric({ label, value }: any) {
  return <div style={{ border: `1px solid ${C.border}`, background: C.panel2, borderRadius: 10, padding: 8 }}>
    <div style={{ color: C.sub, fontSize: 9, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</div>
    <div style={{ color: C.text, fontSize: 17, fontWeight: 950, marginTop: 3 }}>{Number(value || 0).toLocaleString()}</div>
  </div>;
}

function buttonStyle(background: string, color: string) {
  return {
    border: `1px solid ${C.border}`,
    background,
    color,
    borderRadius: 10,
    padding: "8px 11px",
    fontWeight: 900,
    fontSize: 11,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  } as const;
}
