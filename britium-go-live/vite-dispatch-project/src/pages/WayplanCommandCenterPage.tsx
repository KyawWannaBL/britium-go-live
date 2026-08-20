// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Route,
  Truck,
  PackageCheck,
  Printer,
  Send,
  FileText,
  MapPin,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { routeOrder } from "@/lib/dispatchAllocation";
import { guardedBrowserPrint } from "@/lib/documentPrintGuard";

type Row = Record<string, any>;

const C = {
  bg: "#061524",
  panel: "#0b2236",
  panel2: "#102b45",
  border: "#1a3a5c",
  text: "#eef8ff",
  sub: "#9cc2d9",
  gold: "#f6b84b",
  blue: "#4ea8de",
  green: "#34d399",
  red: "#f87171",
};

function text(v: any, fallback = "") {
  const out = String(v ?? "").trim();
  return out || fallback;
}

function money(v: any) {
  return `${Number(v || 0).toLocaleString()} Ks`;
}

function compactDate(v: any) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function btn(kind: "gold" | "blue" | "green" | "red" | "plain" = "plain") {
  const map: any = {
    gold: { bg: C.gold, fg: C.bg, border: C.gold },
    blue: { bg: C.blue, fg: C.bg, border: C.blue },
    green: { bg: C.green, fg: C.bg, border: C.green },
    red: { bg: "rgba(248,113,113,0.12)", fg: C.red, border: "rgba(248,113,113,0.55)" },
    plain: { bg: C.panel2, fg: C.text, border: C.border },
  };
  const v = map[kind];
  return {
    border: `1px solid ${v.border}`,
    background: v.bg,
    color: v.fg,
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 800,
    fontSize: 12,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 42,
  } as React.CSSProperties;
}

function input() {
  return {
    width: "100%",
    background: "#061524",
    color: C.text,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: "10px 12px",
    outline: "none",
    minHeight: 42,
  } as React.CSSProperties;
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section
      style={{
        border: `1px solid ${C.border}`,
        background: C.panel,
        borderRadius: 20,
        padding: 16,
        boxShadow: "0 12px 34px rgba(0,0,0,0.18)",
        ...style,
      }}
    >
      {children}
    </section>
  );
}


function buildDispatchAllocationPayload(rows: any[]) {
  return rows.map((row) => {
    const id = String(row.delivery_way_id || row.tracking_no || row.pickup_id || row.id || "");
    const township = String(row.township || row.pickup_township || row.delivery_township || row.town || "");
    const type = String(row.job_type || row.type || row.operation_type || "DELIVERY").toUpperCase().includes("PICKUP")
      ? "PICKUP"
      : "DELIVERY";
    return routeOrder({ id, township, type });
  });
}

export default function WayplanCommandCenterPage() {
  const [loading, setLoading] = useState(false);
  const [readyRows, setReadyRows] = useState<Row[]>([]);
  const [wayplans, setWayplans] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [activeWayplan, setActiveWayplan] = useState<Row | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [vehicleCode, setVehicleCode] = useState("FLT001");
  const [vehicleName, setVehicleName] = useState("6H-7397");
  const [driverCode, setDriverCode] = useState("DRV001");
  const [driverName, setDriverName] = useState("U Wai Phyo Lwin");
  const [riderCode, setRiderCode] = useState("RID001");
  const [riderName, setRiderName] = useState("Ko Kyaw Zin Khant");
  const [helperCode, setHelperCode] = useState("HLP001");
  const [helperName, setHelperName] = useState("Ko Moe Sat Zin Tun");

  const selectedRows = useMemo(
    () => readyRows.filter((row) => selected[text(row.delivery_way_id || row.waybill_no)]),
    [readyRows, selected]
  );

  const manifestStops = useMemo(() => {
    const stops = activeWayplan?.stops;
    if (Array.isArray(stops)) return stops;
    if (typeof stops === "string") {
      try {
        const parsed = JSON.parse(stops);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }, [activeWayplan]);

  const selectedTotalCod = selectedRows.reduce((sum, row) => sum + Number(row.cod_amount || 0), 0);
  const selectedTotalWeight = selectedRows.reduce((sum, row) => sum + Number(row.parcel_weight_kg || 0), 0);

  async function loadAll() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const [queueResult, wayplanResult] = await Promise.all([
        supabase.rpc("be_dispatch_ready_queue", { p_limit: 300 }),
        supabase.rpc("be_wayplan_command_center", { p_limit: 100 }),
      ]);

      if (queueResult.error) throw queueResult.error;
      if (wayplanResult.error) throw wayplanResult.error;

      const q = queueResult.data?.queue || queueResult.data?.data || [];
      const w = wayplanResult.data?.wayplans || wayplanResult.data?.data || [];

      setReadyRows(Array.isArray(q) ? q : []);
      setWayplans(Array.isArray(w) ? w : []);
      setActiveWayplan(Array.isArray(w) && w.length ? w[0] : null);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not load dispatch / wayplan data.");
    } finally {
      setLoading(false);
    }
  }

  function toggleOne(row: Row) {
    const id = text(row.delivery_way_id || row.waybill_no);
    if (!id) return;
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAll() {
    const allSelected = readyRows.length > 0 && selectedRows.length === readyRows.length;
    if (allSelected) {
      setSelected({});
      return;
    }

    const next: Record<string, boolean> = {};
    readyRows.forEach((row) => {
      const id = text(row.delivery_way_id || row.waybill_no);
      if (id) next[id] = true;
    });
    setSelected(next);
  }

  async function generateWayplan() {
    setError("");
    setMessage("");

    const deliveryIds = selectedRows.map((row) => text(row.delivery_way_id || row.waybill_no)).filter(Boolean);

    if (!deliveryIds.length) {
      setError("Select at least one stop before generating wayplan.");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.rpc("be_generate_wayplan", {
        p_payload: {
          branch_code: "YGN",
          delivery_way_ids: deliveryIds,
          vehicle_code: vehicleCode,
          vehicle_name: vehicleName,
          driver_code: driverCode,
          driver_name: driverName,
          rider_code: riderCode,
          rider_name: riderName,
          helper_code: helperCode,
          helper_name: helperName,
          actor: "wayplan_command_center",
        },
      });

      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.error || "Wayplan generation failed.");

      setMessage(`Wayplan generated: ${data?.wayplan_id || "created"}`);
      setSelected({});
      await loadAll();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not generate wayplan.");
    } finally {
      setLoading(false);
    }
  }


  async function updateWayplanStatus(nextStatus: string) {
    if (!activeWayplan?.wayplan_id) {
      setError("Select a wayplan first.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const { data, error } = await supabase.rpc("be_wayplan_update_status", {
        p_payload: {
          wayplan_id: activeWayplan.wayplan_id,
          status: nextStatus,
          actor: "wayplan_command_center",
        },
      });

      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.error || "Could not update wayplan status.");

      setMessage(`${activeWayplan.wayplan_id} updated to ${nextStatus}.`);
      await loadAll();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not update wayplan status.");
    } finally {
      setLoading(false);
    }
  }

  async function dispatchWayplan() {
    if (!activeWayplan?.wayplan_id) {
      setError("Select a wayplan first.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const { data, error } = await supabase.rpc("be_dispatch_start_wayplan", {
        p_payload: {
          wayplan_id: activeWayplan.wayplan_id,
          actor: "wayplan_command_center",
        },
      });

      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.error || "Could not dispatch wayplan.");

      setMessage(`${activeWayplan.wayplan_id} dispatched.`);
      await loadAll();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not dispatch wayplan.");
    } finally {
      setLoading(false);
    }
  }

  async function printManifest() {
    if (!activeWayplan) {
      setError("Select a wayplan before printing manifest.");
      return;
    }
    await guardedBrowserPrint({
      documentType: "MANIFEST",
      documentNo: manifestNo || selectedManifest?.manifest_no || selectedManifest?.manifestNo || selectedManifest?.wayplan_id || selectedManifest?.batch_id || "MANIFEST-UNKNOWN",
      actorEmail: user?.email || "operator@britiumexpress.com",
      actorRole: userRole || "operator",
      reason: "Manifest Print Studio batch print",
    });
  }

  useEffect(() => {
    void loadAll();
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 20 }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #wayplan-manifest, #wayplan-manifest * { visibility: visible !important; }
          #wayplan-manifest {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            color: black !important;
            padding: 20px !important;
          }
          #wayplan-manifest table { width: 100%; border-collapse: collapse; }
          #wayplan-manifest th, #wayplan-manifest td {
            border: 1px solid #111;
            padding: 6px;
            font-size: 11px;
            color: black !important;
          }
          #wayplan-manifest .no-print { display: none !important; }
        }
      `}</style>

      <div style={{ display: "grid", gap: 16 }}>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ color: C.blue, fontSize: 12, fontWeight: 900, letterSpacing: "0.28em" }}>WAREHOUSE & WAYPLAN</div>
              <h1 style={{ margin: "8px 0 4px", fontSize: 24 }}>Wayplan Command Center</h1>
              <p style={{ margin: 0, color: C.sub }}>Generate wayplans, produce manifest, and dispatch to warehouse / field team.</p>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={loadAll} disabled={loading} style={btn("plain")}>
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
              <button onClick={printManifest} style={btn("gold")}>
                <Printer size={16} /> Print Manifest
              </button>
              <button onClick={dispatchWayplan} disabled={loading || !activeWayplan} style={btn("green")}>
                <Send size={16} /> Dispatch Wayplan
              </button>
            </div>
          </div>
        </Card>

        {error && <div style={{ border: `1px solid ${C.red}`, background: "rgba(248,113,113,0.12)", color: C.red, borderRadius: 14, padding: 12 }}>{error}</div>}
        {message && <div style={{ border: `1px solid ${C.green}`, background: "rgba(52,211,153,0.12)", color: C.green, borderRadius: 14, padding: 12 }}>{message}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16 }} className="wayplan-grid">
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16 }}>Ready for Wayplan Queue</h2>
                <p style={{ margin: "4px 0 0", color: C.sub, fontSize: 12 }}>{readyRows.length} ready stops / {selectedRows.length} selected</p>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={toggleAll} style={btn("plain")}>
                  <CheckCircle2 size={15} /> {selectedRows.length === readyRows.length && readyRows.length ? "Clear" : "Select All"}
                </button>
                <button onClick={generateWayplan} disabled={loading || !selectedRows.length} style={btn("gold")}>
                  <Route size={15} /> Generate Wayplan
                </button>
              </div>
            </div>

            <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1050 }}>
                <thead>
                  <tr style={{ background: C.gold, color: C.bg, textTransform: "uppercase", fontSize: 11 }}>
                    <th style={{ padding: 10, textAlign: "left" }}>Select</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Waybill / Stage</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Customer / Address</th>
                    <th style={{ padding: 10, textAlign: "left" }}>Township</th>
                    <th style={{ padding: 10, textAlign: "right" }}>COD</th>
                    <th style={{ padding: 10, textAlign: "right" }}>Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {readyRows.length ? readyRows.map((row) => {
                    const id = text(row.delivery_way_id || row.waybill_no);
                    return (
                      <tr key={id} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ padding: 10 }}>
                          <input type="checkbox" checked={Boolean(selected[id])} onChange={() => toggleOne(row)} />
                        </td>
                        <td style={{ padding: 10 }}>
                          <div style={{ color: C.gold, fontWeight: 900 }}>{id}</div>
                          <div style={{ color: C.sub, fontSize: 11 }}>{text(row.dispatch_status)} / {text(row.warehouse_status)}</div>
                        </td>
                        <td style={{ padding: 10 }}>
                          <div style={{ fontWeight: 800 }}>{text(row.recipient_name || row.merchant_name, "Customer")}</div>
                          <div style={{ color: C.sub, fontSize: 11, maxWidth: 520, whiteSpace: "normal" }}>{text(row.address, "No address")}</div>
                        </td>
                        <td style={{ padding: 10 }}>{text(row.township, "-")}</td>
                        <td style={{ padding: 10, textAlign: "right", color: C.green, fontWeight: 900 }}>{money(row.cod_amount)}</td>
                        <td style={{ padding: 10, textAlign: "right", color: C.gold, fontWeight: 900 }}>{Number(row.parcel_weight_kg || 0).toLocaleString()} kg</td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={6} style={{ padding: 32, textAlign: "center", color: C.sub }}>
                        No parcels ready for wayplan. Complete Data Entry / Warehouse ready status first.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <div style={{ display: "grid", gap: 16 }}>
            <Card>
              <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Assignment Control</h2>
              <div style={{ display: "grid", gap: 10 }}>
                <label>Vehicle Code<input value={vehicleCode} onChange={(e) => setVehicleCode(e.target.value)} style={input()} /></label>
                <label>Vehicle Name<input value={vehicleName} onChange={(e) => setVehicleName(e.target.value)} style={input()} /></label>
                <label>Driver Code<input value={driverCode} onChange={(e) => setDriverCode(e.target.value)} style={input()} /></label>
                <label>Driver Name<input value={driverName} onChange={(e) => setDriverName(e.target.value)} style={input()} /></label>
                <label>Rider Code<input value={riderCode} onChange={(e) => setRiderCode(e.target.value)} style={input()} /></label>
                <label>Rider Name<input value={riderName} onChange={(e) => setRiderName(e.target.value)} style={input()} /></label>
                <label>Helper Code<input value={helperCode} onChange={(e) => setHelperCode(e.target.value)} style={input()} /></label>
                <label>Helper Name<input value={helperName} onChange={(e) => setHelperName(e.target.value)} style={input()} /></label>
              </div>

              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Card style={{ padding: 12, background: C.panel2 }}>
                  <small style={{ color: C.sub }}>Selected Stops</small>
                  <strong style={{ color: C.gold, fontSize: 22 }}>{selectedRows.length}</strong>
                </Card>
                <Card style={{ padding: 12, background: C.panel2 }}>
                  <small style={{ color: C.sub }}>Selected COD</small>
                  <strong style={{ color: C.green, fontSize: 16 }}>{money(selectedTotalCod)}</strong>
                </Card>
              </div>
              <div style={{ color: C.sub, fontSize: 12, marginTop: 8 }}>Weight: {selectedTotalWeight.toLocaleString()} kg</div>
            </Card>

            <Card>
              <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Generated Wayplans</h2>

              <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
                <label style={{ color: C.sub, fontSize: 12, fontWeight: 800 }}>
                  Select Wayplan
                  <select
                    value={activeWayplan?.wayplan_id || ""}
                    onChange={(e) => {
                      const wp = wayplans.find((x) => x.wayplan_id === e.target.value);
                      setActiveWayplan(wp || null);
                    }}
                    style={input()}
                  >
                    <option value="">Choose wayplan...</option>
                    {wayplans.map((wp) => (
                      <option key={wp.wayplan_id} value={wp.wayplan_id}>
                        {wp.wayplan_id} / {wp.wayplan_status} / {wp.total_stops || 0} stops
                      </option>
                    ))}
                  </select>
                </label>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button onClick={() => updateWayplanStatus("DISPATCHED")} disabled={loading || !activeWayplan} style={btn("green")}>
                    Dispatch
                  </button>
                  <button onClick={() => updateWayplanStatus("COMPLETED")} disabled={loading || !activeWayplan} style={btn("blue")}>
                    Complete
                  </button>
                  <button onClick={() => updateWayplanStatus("ON_HOLD")} disabled={loading || !activeWayplan} style={btn("plain")}>
                    Hold
                  </button>
                  <button onClick={() => updateWayplanStatus("CREATED")} disabled={loading || !activeWayplan} style={btn("gold")}>
                    Reopen
                  </button>
                </div>

                <div style={{ border: `1px solid ${C.border}`, background: C.panel2, borderRadius: 14, padding: 10 }}>
                  <div style={{ color: C.sub, fontSize: 11 }}>Active Wayplan</div>
                  <div style={{ color: C.gold, fontWeight: 900 }}>{activeWayplan?.wayplan_id || "-"}</div>
                  <div style={{ color: C.green, fontSize: 12 }}>
                    {activeWayplan?.wayplan_status || "-"} / {activeWayplan?.total_stops || 0} stops / {money(activeWayplan?.total_cod)}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gap: 8, maxHeight: 360, overflowY: "auto" }}>
                {wayplans.length ? wayplans.map((wp) => (
                  <button
                    key={wp.wayplan_id}
                    onClick={() => setActiveWayplan(wp)}
                    style={{
                      textAlign: "left",
                      border: `1px solid ${activeWayplan?.wayplan_id === wp.wayplan_id ? C.gold : C.border}`,
                      background: activeWayplan?.wayplan_id === wp.wayplan_id ? "rgba(246,184,75,0.12)" : C.panel2,
                      color: C.text,
                      borderRadius: 14,
                      padding: 12,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ color: C.gold, fontWeight: 900 }}>{wp.wayplan_id}</div>
                    <div style={{ color: C.sub, fontSize: 11 }}>{wp.wayplan_status} / {compactDate(wp.created_at)}</div>
                    <div style={{ color: C.green, fontSize: 12 }}>{wp.total_stops || 0} stops / {money(wp.total_cod)}</div>
                  </button>
                )) : <div style={{ color: C.sub }}>No generated wayplans yet.</div>}
              </div>
            </Card>
          </div>
        </div>

        <Card id="wayplan-manifest">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <div style={{ color: C.gold, fontSize: 12, fontWeight: 900, letterSpacing: "0.22em" }}>BRITIUM EXPRESS</div>
              <h2 style={{ margin: "6px 0", fontSize: 20 }}>Wayplan Manifest</h2>
              <div style={{ color: C.sub }}>Wayplan: <strong style={{ display: "inline", color: C.text }}>{activeWayplan?.wayplan_id || "-"}</strong></div>
            </div>
            <div style={{ color: C.sub, fontSize: 12 }}>
              <div>Status: {activeWayplan?.wayplan_status || "-"}</div>
              <div>Vehicle: {activeWayplan?.vehicle_code || vehicleCode} / {activeWayplan?.vehicle_name || vehicleName}</div>
              <div>Driver: {activeWayplan?.driver_code || driverCode} / {activeWayplan?.driver_name || driverName}</div>
              <div>Rider: {activeWayplan?.rider_code || riderCode} / {activeWayplan?.rider_name || riderName}</div>
              <div>Printed: {compactDate(new Date().toISOString())}</div>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1050 }}>
              <thead>
                <tr style={{ background: C.gold, color: C.bg, fontSize: 11, textTransform: "uppercase" }}>
                  <th style={{ padding: 8, textAlign: "left" }}>Seq</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Waybill</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Recipient</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Phone</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Township</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Address</th>
                  <th style={{ padding: 8, textAlign: "right" }}>COD</th>
                  <th style={{ padding: 8, textAlign: "right" }}>Weight</th>
                  <th style={{ padding: 8, textAlign: "left" }}>Signature</th>
                </tr>
              </thead>
              <tbody>
                {manifestStops.length ? manifestStops.map((stop: Row, i: number) => (
                  <tr key={stop.id || `${stop.delivery_way_id}-${i}`} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: 8 }}>{stop.stop_sequence || i + 1}</td>
                    <td style={{ padding: 8, color: C.gold, fontWeight: 900 }}>{text(stop.delivery_way_id || stop.waybill_no)}</td>
                    <td style={{ padding: 8 }}>{text(stop.recipient_name)}</td>
                    <td style={{ padding: 8 }}>{text(stop.recipient_phone)}</td>
                    <td style={{ padding: 8 }}>{text(stop.township)}</td>
                    <td style={{ padding: 8, whiteSpace: "normal" }}><MapPin size={12} /> {text(stop.address)}</td>
                    <td style={{ padding: 8, textAlign: "right" }}>{money(stop.cod_amount)}</td>
                    <td style={{ padding: 8, textAlign: "right" }}>{Number(stop.parcel_weight_kg || 0).toLocaleString()} kg</td>
                    <td style={{ padding: 8 }}>________________</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={9} style={{ padding: 24, textAlign: "center", color: C.sub }}>
                      Select or generate a wayplan to show manifest.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </main>
  );
}