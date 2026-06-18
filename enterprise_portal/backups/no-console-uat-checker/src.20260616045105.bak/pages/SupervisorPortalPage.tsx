// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw, Send, ShieldCheck, Truck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const C = {
  bg: "#061524",
  panel: "#0b2236",
  panel2: "#081b2e",
  border: "#1f4966",
  text: "#eef8ff",
  sub: "#a8c4da",
  muted: "#6f95b3",
  gold: "#f6b84b",
  orange: "#ff8a4c",
  green: "#22c55e",
  red: "#ff4f86",
  blue: "#38bdf8",
};

function text(v: any, fallback = "") {
  if (v === null || v === undefined || v === "") return fallback;
  return String(v);
}

function upper(v: any) {
  return text(v).toUpperCase();
}

function countValue(v: any) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function readPayload(row: any) {
  const payload = row?.payload || row?.metadata || row?.data || row?.details || {};
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload);
    } catch {
      return {};
    }
  }
  return payload && typeof payload === "object" ? payload : {};
}

function normType(row: any) {
  const hay = [
    row.workforce_type,
    row.worker_type,
    row.role,
    row.role_type,
    row.account_type,
    row.designation,
    row.position,
    row.type,
    row.user_role,
  ].map((x) => text(x).toLowerCase()).join(" ");

  const code = text(row.workforce_code || row.worker_id || row.employee_code || row.code).toLowerCase();

  if (hay.includes("driver") || code.startsWith("drv") || code.startsWith("dri")) return "driver";
  if (hay.includes("helper") || code.startsWith("hlp") || code.startsWith("hel")) return "helper";
  if (hay.includes("rider") || hay.includes("delivery") || code.startsWith("rid") || code.startsWith("rd")) return "rider";

  return "";
}

function normalizeWorker(row: any, source = "") {
  const payload = readPayload(row);
  const merged = { ...payload, ...row };
  const type = normType(merged);

  return {
    source,
    type,
    code: text(
      merged.workforce_code ||
      merged.worker_code ||
      merged.worker_id ||
      merged.employee_code ||
      merged.rider_code ||
      merged.driver_code ||
      merged.helper_code ||
      merged.code ||
      merged.account ||
      merged.id
    ),
    name: text(
      merged.display_name ||
      merged.full_name ||
      merged.employee_name ||
      merged.rider_name ||
      merged.driver_name ||
      merged.helper_name ||
      merged.name ||
      merged.account
    ),
    phone: text(merged.phone_e164 || merged.phone_number || merged.phone_primary || merged.phone || merged.mobile),
    branch: text(merged.branch_code || merged.branch || merged.home_branch, "YGN"),
    zone: text(merged.assigned_zone || merged.zone || merged.township || merged.service_township),
    status: text(merged.status || merged.account_status || (merged.is_active === false ? "inactive" : "active"), "active"),
    raw: row,
  };
}

function normalizeVehicle(row: any, source = "") {
  const payload = readPayload(row);
  const merged = { ...payload, ...row };

  return {
    source,
    code: text(
      merged.vehicle_code ||
      merged.fleet_code ||
      merged.vehicle_no ||
      merged.plate_no ||
      merged.plate_number ||
      merged.registration_no ||
      merged.code ||
      merged.value ||
      merged.id
    ),
    label: text(
      merged.vehicle_label ||
      merged.fleet_name ||
      merged.vehicle_name ||
      merged.plate_no ||
      merged.plate_number ||
      merged.registration_no ||
      merged.label ||
      merged.name ||
      merged.code
    ),
    type: text(merged.vehicle_type || merged.fleet_type || merged.type || merged.option_type),
    branch: text(merged.branch_code || merged.branch || "YGN"),
    status: text(merged.status || (merged.is_active === false ? "inactive" : "active"), "active"),
    raw: row,
  };
}

function inputStyle(extra: any = {}) {
  return {
    width: "100%",
    minWidth: 0,
    border: `1px solid ${C.border}`,
    background: "#092035",
    color: C.text,
    borderRadius: 12,
    padding: "12px 13px",
    outline: "none",
    fontWeight: 800,
    fontSize: 14,
    ...extra,
  };
}

function labelStyle() {
  return {
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontSize: 11,
    fontWeight: 900,
    marginBottom: 7,
  };
}

function Field({ label, children }: any) {
  return (
    <label style={{ display: "grid", minWidth: 0 }}>
      <span style={labelStyle()}>{label}</span>
      {children}
    </label>
  );
}

function Card({ label, value, note, accent = C.gold }: any) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderTop: `3px solid ${accent}`, background: C.panel, borderRadius: 18, padding: 18 }}>
      <div style={{ color: C.muted, textTransform: "uppercase", letterSpacing: ".12em", fontSize: 11, fontWeight: 950 }}>{label}</div>
      <div style={{ color: accent, fontSize: 28, fontWeight: 950, marginTop: 10 }}>{value}</div>
      {note ? <div style={{ color: C.sub, marginTop: 6, fontWeight: 700 }}>{note}</div> : null}
    </div>
  );
}

export default function SupervisorPortalPage() {
  const [pickups, setPickups] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);

  const [selectedPickup, setSelectedPickup] = useState("");
  const [riderCode, setRiderCode] = useState("");
  const [driverCode, setDriverCode] = useState("");
  const [helperCode, setHelperCode] = useState("");
  const [vehicleCode, setVehicleCode] = useState("");
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [notice, setNotice] = useState<any>(null);

  const riders = useMemo(() => workers.filter((w) => w.type === "rider"), [workers]);
  const drivers = useMemo(() => workers.filter((w) => w.type === "driver"), [workers]);
  const helpers = useMemo(() => workers.filter((w) => w.type === "helper"), [workers]);

  const pendingPickups = useMemo(() => {
    return pickups.filter((p) => {
      const s = upper(p.status || p.assignment_status);
      const assigned = text(p.assigned_rider_code || p.assigned_workforce_code || "");
      return !assigned && ["PICKUP_REQUESTED", "SUBMITTED", "PENDING_ASSIGNMENT", "PENDING_PICKUP"].some((x) => s.includes(x));
    });
  }, [pickups]);

  async function loadPickups() {
    const res = await supabase
      .from("be_portal_pickup_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);

    if (res.error) throw res.error;
    setPickups(res.data || []);

    const firstPending = (res.data || []).find((p) => !text(p.assigned_rider_code || p.assigned_workforce_code));
    if (firstPending && !selectedPickup) {
      setSelectedPickup(text(firstPending.pickup_id || firstPending.canonical_pickup_id || firstPending.pickup_way_id));
    }
  }

  async function loadWorkers() {
    const candidateTables = [
      "be_mobile_workforce_accounts",
      "be_workforce_accounts",
      "be_user_account_registry",
      "be_employee_master",
      "be_master_data_options",
    ];

    const found: any[] = [];
    const debug: string[] = [];

    for (const table of candidateTables) {
      const res = await supabase.from(table).select("*").limit(1000);

      if (res.error) {
        debug.push(`${table}: ${res.error.message}`);
        continue;
      }

      const rows = Array.isArray(res.data) ? res.data : [];
      debug.push(`${table}: ${rows.length}`);

      rows.map((r) => normalizeWorker(r, table))
        .filter((w) => w.code && w.name && ["rider", "driver", "helper"].includes(w.type))
        .forEach((w) => {
          const exists = found.find((x) => x.type === w.type && x.code === w.code);
          if (!exists) found.push(w);
        });
    }

    console.info("[Supervisor Masterdata Workforce]", debug, found);
    setWorkers(found);
  }

  async function loadVehicles() {
    const candidateTables = [
      "be_fleet_master",
      "be_vehicle_master",
      "be_master_fleet",
      "be_master_vehicles",
      "be_fleets",
      "be_vehicles",
      "fleet_master",
      "vehicle_master",
      "fleets",
      "vehicles",
      "be_master_data_options",
    ];

    const found: any[] = [];
    const debug: string[] = [];

    for (const table of candidateTables) {
      const res = await supabase.from(table).select("*").limit(1000);

      if (res.error) {
        debug.push(`${table}: ${res.error.message}`);
        continue;
      }

      const rows = Array.isArray(res.data) ? res.data : [];
      debug.push(`${table}: ${rows.length}`);

      rows.map((r) => normalizeVehicle(r, table))
        .filter((v) => {
          const hay = JSON.stringify(v.raw || {}).toLowerCase();
          return v.code && (
            v.source !== "be_master_data_options" ||
            hay.includes("fleet") ||
            hay.includes("vehicle") ||
            hay.includes("plate")
          );
        })
        .forEach((v) => {
          const exists = found.find((x) => x.code === v.code);
          if (!exists) found.push(v);
        });
    }

    console.info("[Supervisor Masterdata Fleet]", debug, found);
    setVehicles(found);
  }

  async function loadNotifications() {
    const res = await supabase
      .from("be_app_notifications")
      .select("*")
      .in("target_role", ["supervisor", "dispatch", "operation_manager"])
      .order("created_at", { ascending: false })
      .limit(30);

    if (!res.error) setNotifications(res.data || []);
  }

  async function loadAll() {
    setLoading(true);
    setNotice(null);
    try {
      await Promise.all([loadPickups(), loadWorkers(), loadVehicles(), loadNotifications()]);
    } catch (e: any) {
      setNotice({ type: "error", text: e?.message || "Failed to load supervisor master data." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  function currentPickup() {
    return pickups.find((p) => {
      const id = text(p.pickup_id || p.canonical_pickup_id || p.pickup_way_id);
      return id === selectedPickup;
    });
  }

  function workerLabel(w: any) {
    const zone = w.zone ? ` · ${w.zone}` : "";
    const branch = w.branch ? ` · ${w.branch}` : "";
    return `${w.code} · ${w.name}${branch}${zone}`;
  }

  async function assignResources() {
    setNotice(null);

    if (!selectedPickup) {
      setNotice({ type: "error", text: "Select pickup request first." });
      return;
    }

    if (!riderCode) {
      setNotice({ type: "error", text: "Select rider from master data." });
      return;
    }

    setSaving(true);

    try {
      const { data, error } = await supabase.rpc("be_supervisor_assign_pickup_resources", {
        p_pickup_id: selectedPickup,
        p_rider_code: riderCode,
        p_driver_code: driverCode || null,
        p_helper_code: helperCode || null,
        p_vehicle_code: vehicleCode || null,
        p_supervisor_note: note || null,
      });

      if (error) throw error;
      if (!data?.ok) throw new Error("Assignment RPC did not return success.");

      setNotice({
        type: "success",
        text: `Assigned ${selectedPickup}: rider ${riderCode}${driverCode ? `, driver ${driverCode}` : ""}${helperCode ? `, helper ${helperCode}` : ""}${vehicleCode ? `, fleet ${vehicleCode}` : ""}.`,
      });

      setRiderCode("");
      setDriverCode("");
      setHelperCode("");
      setVehicleCode("");
      setNote("");

      await loadAll();
    } catch (e: any) {
      setNotice({ type: "error", text: e?.message || "Assignment failed." });
    } finally {
      setSaving(false);
    }
  }

  const selected = currentPickup();

  return (
    <div style={{ minHeight: "100%", background: C.bg, color: C.text, padding: 24, fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1500, margin: "0 auto", display: "grid", gap: 18 }}>
        <section style={{ background: `linear-gradient(135deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.border}`, borderRadius: 24, padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start", flexWrap: "wrap" }}>
            <div>
              <div style={{ color: C.gold, fontSize: 11, fontWeight: 950, letterSpacing: ".18em", textTransform: "uppercase" }}>
                Britium Express · Supervisor Hub
              </div>
              <h1 style={{ margin: "8px 0 0", fontSize: 28 }}>Pickup Resource Assignment</h1>
              <p style={{ margin: "8px 0 0", color: C.sub }}>
                Assign rider, driver, helper, and fleet/vehicle number from backend master data.
              </p>
              <p style={{ margin: "8px 0 0", color: C.muted, fontSize: 12 }}>
                Masterdata loaded: {riders.length} riders · {drivers.length} drivers · {helpers.length} helpers · {vehicles.length} fleet records
              </p>
            </div>

            <button
              type="button"
              onClick={loadAll}
              disabled={loading}
              style={{ border: `1px solid ${C.border}`, background: "#092035", color: C.text, borderRadius: 12, padding: "10px 14px", fontWeight: 900, cursor: "pointer", display: "flex", gap: 8, alignItems: "center" }}
            >
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        </section>

        {notice && (
          <div style={{ border: `1px solid ${notice.type === "success" ? C.green : C.red}`, background: notice.type === "success" ? "rgba(34,197,94,.12)" : "rgba(255,79,134,.12)", color: notice.type === "success" ? C.green : C.red, borderRadius: 16, padding: 14, fontWeight: 850 }}>
            {notice.text}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
          <Card label="Need Assignment" value={pendingPickups.length} note="Backend pickup requests" accent={C.gold} />
          <Card label="Riders" value={riders.length} note="be_mobile_workforce_accounts" accent={C.blue} />
          <Card label="Drivers" value={drivers.length} note="Master data synced" accent={C.green} />
          <Card label="Helpers" value={helpers.length} note="Master data synced" accent={C.orange} />
          <Card label="Fleet / Vehicles" value={vehicles.length} note="Master data synced" accent={C.red} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, .7fr)", gap: 18 }}>
          <section style={{ background: `linear-gradient(135deg, ${C.panel}, #092035)`, border: `1px solid ${C.border}`, borderRadius: 24, padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <ShieldCheck color={C.gold} size={20} />
              <h2 style={{ margin: 0, fontSize: 22 }}>Order Picking Assignment</h2>
            </div>

            <p style={{ color: C.sub, marginTop: 8 }}>
              Select one CS pickup request and assign operational resources from live master data.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 18 }}>
              <Field label="Pickup Request">
                <select value={selectedPickup} onChange={(e) => setSelectedPickup(e.target.value)} style={inputStyle({ minHeight: 48 })}>
                  <option value="">Select pickup request</option>
                  {pendingPickups.map((p) => {
                    const id = text(p.pickup_id || p.canonical_pickup_id || p.pickup_way_id);
                    return (
                      <option key={id} value={id}>
                        {id} · {text(p.merchant_name)} · {countValue(p.parcel_count || p.metadata?.delivery_way_count)} parcel(s)
                      </option>
                    );
                  })}
                </select>
              </Field>

              <Field label="Rider">
                <select value={riderCode} onChange={(e) => setRiderCode(e.target.value)} style={inputStyle({ minHeight: 48 })}>
                  <option value="">Select rider from master data</option>
                  {riders.map((w) => (
                    <option key={`${w.type}-${w.code}`} value={w.code}>{workerLabel(w)}</option>
                  ))}
                </select>
              </Field>

              <Field label="Driver">
                <select value={driverCode} onChange={(e) => setDriverCode(e.target.value)} style={inputStyle({ minHeight: 48 })}>
                  <option value="">No driver / select driver</option>
                  {drivers.map((w) => (
                    <option key={`${w.type}-${w.code}`} value={w.code}>{workerLabel(w)}</option>
                  ))}
                </select>
              </Field>

              <Field label="Helper">
                <select value={helperCode} onChange={(e) => setHelperCode(e.target.value)} style={inputStyle({ minHeight: 48 })}>
                  <option value="">No helper / select helper</option>
                  {helpers.map((w) => (
                    <option key={`${w.type}-${w.code}`} value={w.code}>{workerLabel(w)}</option>
                  ))}
                </select>
              </Field>

              <Field label="Fleet / Vehicle Master">
                <select value={vehicleCode} onChange={(e) => setVehicleCode(e.target.value)} style={inputStyle({ minHeight: 48 })}>
                  <option value="">Select fleet / vehicle</option>
                  {vehicles.map((v) => (
                    <option key={v.code} value={v.code}>
                      {v.code} · {v.label || v.type || "Vehicle"} · {v.branch}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Fleet Number Manual Override">
                <input
                  value={vehicleCode}
                  onChange={(e) => setVehicleCode(e.target.value)}
                  placeholder="Type fleet / plate number if not in master"
                  style={inputStyle()}
                />
              </Field>
            </div>

            <div style={{ marginTop: 14 }}>
              <Field label="Supervisor Note">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional assignment instruction"
                  style={inputStyle({ minHeight: 80, resize: "vertical" })}
                />
              </Field>
            </div>

            {selected && (
              <div style={{ marginTop: 16, border: `1px solid ${C.border}`, background: "#071827", borderRadius: 16, padding: 16 }}>
                <b style={{ color: C.gold }}>{text(selected.pickup_id || selected.canonical_pickup_id)}</b>
                <div style={{ color: C.text, marginTop: 6 }}>{text(selected.merchant_name)} · {text(selected.pickup_township || selected.township)} · {countValue(selected.parcel_count)} parcel(s)</div>
                <div style={{ color: C.sub, marginTop: 6 }}>{text(selected.pickup_address)}</div>
              </div>
            )}

            <button
              type="button"
              onClick={assignResources}
              disabled={saving}
              style={{ marginTop: 18, width: "100%", border: `1px solid rgba(246,184,75,.55)`, background: "linear-gradient(135deg,#f6b84b,#ff8a4c)", color: "#1b0b05", borderRadius: 14, padding: "14px 18px", fontWeight: 950, cursor: saving ? "not-allowed" : "pointer", display: "flex", gap: 10, justifyContent: "center", alignItems: "center", fontSize: 16 }}
            >
              <Send size={18} /> {saving ? "Assigning..." : "Assign pickup resources"}
            </button>
          </section>

          <aside style={{ background: `linear-gradient(135deg, ${C.panel}, #092035)`, border: `1px solid ${C.border}`, borderRadius: 24, padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Users color={C.blue} size={20} />
              <h2 style={{ margin: 0, fontSize: 22 }}>Pickup Notifications</h2>
            </div>

            <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
              {notifications.length === 0 && (
                <div style={{ color: C.muted, border: `1px dashed ${C.border}`, borderRadius: 14, padding: 16 }}>
                  No assignment notifications.
                </div>
              )}

              {notifications.slice(0, 12).map((n: any) => (
                <div key={n.id || `${n.title}-${n.created_at}`} style={{ border: `1px solid ${C.border}`, background: "#071827", borderRadius: 14, padding: 14 }}>
                  <b style={{ color: C.gold }}>{text(n.title, "Notification")}</b>
                  <div style={{ color: C.sub, marginTop: 6 }}>{text(n.message)}</div>
                  <div style={{ color: C.muted, marginTop: 6, fontSize: 12 }}>{text(n.created_at).slice(0, 19).replace("T", " ")}</div>
                </div>
              ))}
            </div>
          </aside>
        </div>

        <section style={{ background: `linear-gradient(135deg, ${C.panel}, #092035)`, border: `1px solid ${C.border}`, borderRadius: 24, padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Truck color={C.green} size={20} />
            <h2 style={{ margin: 0, fontSize: 22 }}>Assigned / Active Pickup Requests</h2>
          </div>

          <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
            {pickups.slice(0, 20).map((p) => {
              const id = text(p.pickup_id || p.canonical_pickup_id || p.pickup_way_id);
              return (
                <div key={id || p.id} style={{ border: `1px solid ${C.border}`, background: "#071827", borderRadius: 14, padding: 14, display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 10 }}>
                  <div>
                    <b style={{ color: C.gold }}>{id}</b>
                    <div style={{ color: C.sub, marginTop: 5 }}>{text(p.merchant_name)} · {text(p.pickup_township || p.township)}</div>
                  </div>
                  <div style={{ color: C.text }}>
                    Rider: {text(p.assigned_rider_code || p.assigned_workforce_code, "-")}<br />
                    Driver: {text(p.assigned_driver_code, "-")}<br />
                    Helper: {text(p.assigned_helper_code, "-")}
                  </div>
                  <div style={{ color: C.text }}>
                    Fleet: {text(p.assigned_vehicle_code || p.vehicle_code || p.assigned_vehicle, "-")}<br />
                    Status: {text(p.status)}<br />
                    Assignment: {text(p.assignment_status, "-")}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
