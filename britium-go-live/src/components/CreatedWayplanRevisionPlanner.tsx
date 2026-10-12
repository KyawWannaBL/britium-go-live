// @ts-nocheck
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { type Resource, type Stop, type VanPlan } from "@/lib/multiVanPlanner";
import FullVanRouteMap from "@/components/FullVanRouteMap";

const field: React.CSSProperties = { padding: 10, borderRadius: 8, color: "#102b45", background: "white", border: "1px solid #9cc2d9" };
const button: React.CSSProperties = { ...field, background: "#f6b84b", fontWeight: 800, cursor: "pointer" };
const secondary: React.CSSProperties = { ...field, background: "#173a55", color: "white", fontWeight: 700, cursor: "pointer" };

type RevisionPlan = VanPlan & {
  crew_mode?: "ROSTER";
  wave_no?: number;
  trip_no?: number;
};

type Props = {
  sourceWayplan: any;
  rows: Stop[];
  region: string;
  onSaved: (result: any) => void | Promise<void>;
};

function coord(row: any) {
  if (row?.latitude == null || row?.longitude == null || String(row.latitude).trim() === "" || String(row.longitude).trim() === "") return false;
  const lat = Number(row.latitude), lng = Number(row.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 9 && lat <= 29 && lng >= 92 && lng <= 102;
}

function isRiderOnlyVehicle(code: string) { return ["MOTORBIKE", "BICYCLE"].includes(String(code || "").toUpperCase()); }

export default function CreatedWayplanRevisionPlanner({ sourceWayplan, rows, region, onSaved }: Props) {
  const [context, setContext] = useState<any>(null);
  const [plan, setPlan] = useState<RevisionPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [approved, setApproved] = useState(false);
  const [reason, setReason] = useState("");
  const request = useRef<{ body: string; id: string } | null>(null);

  useEffect(() => {
    setPlan(null);
    setApproved(false);
    setReason("");
    request.current = null;
  }, [sourceWayplan?.wayplan_id, rows]);

  useEffect(() => {
    let alive = true;
    supabase.rpc("be_multi_van_context").then(({ data, error }) => {
      if (!alive) return;
      if (error) setMessage(error.message);
      else setContext(data);
    });
    return () => { alive = false; };
  }, [region]);

  const sourceId = String(sourceWayplan?.wayplan_id || "");
  const otherBusy = (context?.busy || []).filter((b: any) => !sourceId || ![b.wayplan_id, b.wayplan_code].includes(sourceId));
  const available = (items: any[], key: string): Resource[] => (items || []).map((x) => ({
    ...x,
    available: !otherBusy.some((b: any) => [b.driver_code, b.rider_code, b.helper_code, b[key]].filter(Boolean).includes(x.id)),
  }));
  const branch = region === "YANGON" ? "YGN" : region === "MANDALAY" ? "MDY" : "NPT";
  const vehicles = available((context?.vehicles || []).filter((v: any) => v.operation_type === "DELIVERY"), "vehicle_code");
  const drivers = available((context?.drivers || []).filter((d: any) => !d.branch_code || d.branch_code === branch), "driver_code");
  const riders = available((context?.riders || []).filter((d: any) => !d.branch_code || d.branch_code === branch), "rider_code");
  const helpers = available((context?.helpers || []).filter((d: any) => !d.branch_code || d.branch_code === branch), "helper_code");
  const origin = context?.route_origins?.[region];

  function resourceName(list: Resource[], code: string) {
    return list.find((x) => x.id === code)?.name || "";
  }

  function preferSourceCrew(next: RevisionPlan): RevisionPlan {
    const vehicle = vehicles.find((x) => x.id === sourceWayplan?.vehicle_code && x.available !== false);
    const driver = drivers.find((x) => x.id === sourceWayplan?.driver_code && x.available !== false);
    const rider = riders.find((x) => x.id === sourceWayplan?.rider_code && x.available !== false);
    const helper = helpers.find((x) => x.id === sourceWayplan?.helper_code && x.available !== false);
    const vehicleCode = vehicle?.id || next.vehicle_code;
    const riderOnly = isRiderOnlyVehicle(vehicleCode);
    return {
      ...next, vehicle_code: vehicleCode,
      driver_code: riderOnly ? "" : (driver?.id || ""),
      rider_code: riderOnly ? (rider?.id || "") : "",
      helper_code: riderOnly ? "" : (helper?.id || ""),
    };
  }

  async function roadSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Authenticated Wayplan session is required for revision routing.");
    return session.access_token;
  }

  async function optimizeOne(inputPlan: RevisionPlan): Promise<RevisionPlan> {
    if (!origin) throw new Error(`${region} branch route origin is unavailable.`);
    if (!inputPlan.rows.length) throw new Error("Keep at least one way in the revised Wayplan.");
    if (inputPlan.rows.length > 75) throw new Error("A revised Wayplan cannot exceed 75 stops.");
    if (inputPlan.rows.some((row) => !coord(row))) throw new Error("Every revised way needs an accepted map coordinate before optimization.");
    const token = await roadSession();
    const response = await fetch("/api/wayplan-route", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ origin, stops: inputPlan.rows }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.ok) throw new Error(result?.diagnostics?.join(" | ") || result?.message || result?.error || `Road route service failed (${response.status}).`);
    if (!["GOOGLE_ROUTES", "MAPBOX_FALLBACK", "DEFERRED_PROVIDER"].includes(String(result.source || ""))) throw new Error("A supported reviewed route state is required before saving a revision.");
    const byId = new Map(inputPlan.rows.map((row) => [String(row.delivery_way_id), row]));
    const ordered = (result.ordered_stops || []).map((row: any) => byId.get(String(row.delivery_way_id))).filter(Boolean) as Stop[];
    if (ordered.length !== inputPlan.rows.length || new Set(ordered.map((row) => row.delivery_way_id)).size !== inputPlan.rows.length) throw new Error("Road optimizer did not return every revised way exactly once.");
    return {
      ...inputPlan,
      rows: ordered,
      route: {
        ...(inputPlan.route || {}),
        source: result.source,
        route_mode: result.route_mode,
        distance_m: Number(result.distance_m || 0),
        duration_s: Number(result.duration_s || 0),
        request_count: Number(result.request_count || 0),
        fallback: Boolean(result.fallback),
        estimated: Boolean(result.estimated),
        warning: result.warning || null,
        optimized_at: result.optimized_at || new Date().toISOString(),
      },
    };
  }

  async function prepareRevision() {
    setBusy(true);
    setMessage("Optimizing the revised route and preserving compatible source crew from Britium Ventures Head Office…");
    try {
      if (!context || !origin) throw new Error("Wayplan routing context is not ready.");
      if (!rows.length) throw new Error("Keep at least one way in the revision.");
      if (rows.length > 75) throw new Error("A revised Wayplan cannot exceed 75 ways.");
      const usableVehicles = vehicles.filter((v) => v.available !== false);
      if (!usableVehicles.length) throw new Error("No delivery vehicle is currently available.");
      const strategic: RevisionPlan[] = [{
        vehicle_code: usableVehicles[0].id,
        driver_code: "",
        rider_code: "",
        helper_code: "",
        crew_mode: "ROSTER",
        wave_no: 1,
        trip_no: 1,
        rows,
        route: { source: "REVISION_PENDING_ROAD", route_mode: "CREATED_REVISION_V46", fallback: false },
      }];
      // Crew is intentionally not auto-assigned; keep only compatible source crew.
      const preferred = preferSourceCrew(strategic[0]);
      const optimized = await optimizeOne(preferred);
      setPlan(optimized);
      setMessage(`Revision ready for review: ${optimized.rows.length} ways · ${optimized.route?.source || "road route"} · check the vehicle-specific crew before saving. No dispatch has occurred.`);
    } catch (e: any) {
      setPlan(null);
      setMessage(e?.message || "Revision planning failed.");
    } finally {
      setBusy(false);
    }
  }

  function patchPlan(patch: Partial<RevisionPlan>) {
    setPlan((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      if (patch.vehicle_code !== undefined) {
        if (isRiderOnlyVehicle(next.vehicle_code)) { next.driver_code = ""; next.helper_code = ""; }
        else next.rider_code = "";
      }
      return next;
    });
    request.current = null;
  }

  async function saveRevision() {
    if (!plan) return;
    if (!isRiderOnlyVehicle(plan.vehicle_code) && plan.rows.length < 50 && (!approved || reason.trim().length < 5)) {
      setMessage("Approve the below-50 revision and enter an operational reason before saving.");
      return;
    }
    if (!plan.vehicle_code || (isRiderOnlyVehicle(plan.vehicle_code) ? !plan.rider_code : !plan.driver_code)) {
      setMessage("Choose a vehicle and its required Rider or Driver before saving the revised Wayplan.");
      return;
    }
    setBusy(true);
    setMessage("Saving the reviewed route and replacement CREATED Wayplan…");
    try {
      const reviewed = plan;
      const payload = {
        source_wayplan_id: sourceWayplan.wayplan_id,
        region_code: region,
        plan: {
          vehicle_code: reviewed.vehicle_code,
          wave_no: 1,
          trip_no: 1,
          crew_mode: "ROSTER",
          driver_code: reviewed.driver_code || null,
          rider_code: reviewed.rider_code || null,
          helper_code: reviewed.helper_code || null,
          driver_name: resourceName(drivers, reviewed.driver_code),
          rider_name: resourceName(riders, reviewed.rider_code),
          helper_name: reviewed.helper_code ? resourceName(helpers, reviewed.helper_code) : "",
          delivery_way_ids: reviewed.rows.map((row) => row.delivery_way_id),
          route: {
            source: reviewed.route?.source,
            base_source: reviewed.route?.base_source || null,
            route_mode: reviewed.route?.route_mode,
            distance_m: reviewed.route?.distance_m || 0,
            duration_s: reviewed.route?.duration_s || 0,
            request_count: reviewed.route?.request_count || 0,
            fallback: Boolean(reviewed.route?.fallback),
            estimated: Boolean(reviewed.route?.estimated),
            warning: reviewed.route?.warning || null,
            optimized_at: reviewed.route?.optimized_at || new Date().toISOString(),
          },
        },
        approve_below_minimum: approved,
        below_minimum_reason: reason,
      };
      const body = JSON.stringify(payload);
      if (request.current?.body !== body) request.current = { body, id: crypto.randomUUID() };
      const { data, error } = await supabase.rpc("be_replace_created_wayplan_v46", {
        p_payload: { ...payload, request_id: request.current!.id },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Wayplan revision failed.");
      setMessage(`Revision saved as ${data.replacement_wayplan_id}. It replaces ${data.replaces_wayplan_id}; the original route history remains preserved and the replacement is still CREATED.`);
      setPlan(null);
      request.current = null;
      await onSaved(data);
    } catch (e: any) {
      setMessage(`${e?.message || "Wayplan revision failed."} Retry keeps the same request id to prevent duplicate replacements.`);
    } finally {
      setBusy(false);
    }
  }

  const riderOnly = Boolean(plan && isRiderOnlyVehicle(plan.vehicle_code));
  const short = !riderOnly && rows.length > 0 && rows.length < 50;
  const cannotSave = busy || !plan || !plan.vehicle_code || (riderOnly ? !plan.rider_code : !plan.driver_code) || plan.rows.length > 75 || (short && (!approved || reason.trim().length < 5));

  return <section style={{ padding: 16, border: "1px solid #8f5a2a", borderRadius: 16, background: "#0b2236", display: "grid", gap: 12 }}>
    <div>
      <h2 style={{ margin: 0 }}>Edit CREATED Wayplan · revision V46</h2>
      <p style={{ margin: "5px 0 0" }}>Source: <strong>{sourceWayplan?.wayplan_id}</strong> · {rows.length} selected ways. The original generated route and Warehouse LIFO snapshot stay immutable; saving creates a replacement CREATED Wayplan.</p>
    </div>

    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button style={button} disabled={busy || !context || !rows.length || rows.length > 75} onClick={prepareRevision}>{busy ? "Optimizing…" : "Optimize revised route + assign crew"}</button>
      <span style={{ alignSelf: "center" }}>Origin: <strong>Britium Ventures Head Office</strong> · temporary Mapbox-first billing-safe mode; unavailable routing uses an explicitly labelled estimate</span>
    </div>

    {message && <p role="status" style={{ margin: 0 }}>{message}</p>}

    {plan && <>
      <div style={{ fontWeight: 800 }}>{plan.rows.length} ways · {plan.route?.source} · {plan.route?.duration_s ? `${Math.round(Number(plan.route.duration_s) / 60)} min` : ""} {plan.route?.distance_m ? `· ${(Number(plan.route.distance_m) / 1000).toFixed(1)} km` : ""}</div>
      {plan.route?.warning && <p role="status" style={{ margin: 0 }}>{plan.route.warning}</p>}
      <p style={{ margin: 0 }}>{riderOnly ? "Motor Bike/Bicycle: Rider required; Driver and Helper disabled; no minimum parcel count." : "Van/car/truck: Driver required, Helper optional, Rider disabled."}</p>
      <FullVanRouteMap origin={origin} plan={plan} vanLabel={`Revision of ${sourceWayplan?.wayplan_id}`} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label>Vehicle <select style={field} disabled={busy} value={plan.vehicle_code || ""} onChange={(e) => patchPlan({ vehicle_code: e.target.value })}><option value="">Choose</option>{vehicles.filter((x) => x.available !== false || x.id === plan.vehicle_code).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Driver <select style={field} disabled={busy || riderOnly} value={riderOnly ? "" : (plan.driver_code || "")} onChange={(e) => patchPlan({ driver_code: e.target.value })}><option value="">Choose Driver</option>{drivers.filter((x) => x.available !== false || x.id === plan.driver_code).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Rider <select style={field} disabled={busy || !riderOnly} value={riderOnly ? (plan.rider_code || "") : ""} onChange={(e) => patchPlan({ rider_code: e.target.value })}><option value="">Choose Rider</option>{riders.filter((x) => x.available !== false || x.id === plan.rider_code).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Helper <select style={field} disabled={busy || riderOnly} value={riderOnly ? "" : (plan.helper_code || "")} onChange={(e) => patchPlan({ helper_code: e.target.value })}><option value="">No Helper</option>{helpers.filter((x) => x.available !== false || x.id === plan.helper_code).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      </div>
      <details open>
        <summary>Reviewed delivery sequence</summary>
        <ol>{plan.rows.map((row) => <li key={row.delivery_way_id}>{String((row as any).waybill_no || row.delivery_way_id)} · {row.township}</li>)}</ol>
      </details>
    </>}

    {short && <div style={{ padding: 10, border: "1px solid #8f5a2a", borderRadius: 8 }}>
      <label><input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} /> Approve revised Wayplan below 50 parcels</label>
      <input style={{ ...field, width: "100%", marginTop: 8 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Mandatory operational reason" />
    </div>}

    <button style={button} disabled={cannotSave} onClick={saveRevision}>Save Revision</button>
    <button style={secondary} disabled={busy || !plan} onClick={prepareRevision}>Re-optimize road route again</button>
  </section>;
}
