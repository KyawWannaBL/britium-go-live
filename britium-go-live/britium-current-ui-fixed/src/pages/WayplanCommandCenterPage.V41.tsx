// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Filter,
  Loader2,
  MapPin,
  PackageCheck,
  Printer,
  RefreshCw,
  Route,
  Search,
  Send,
  Truck,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const BUILD_MARKER = "WAYPLAN_V41_SELECTED_HANDOFF_TO_DISPATCH_2026-07-30";

type Row = Record<string, any>;

const C = {
  bg: "#061524",
  panel: "#0b2236",
  panel2: "#081b2e",
  panel3: "#102b45",
  border: "#1a3a5c",
  text: "#eef8ff",
  sub: "#9cc2d9",
  muted: "#5d87a4",
  gold: "#f6b84b",
  blue: "#38bdf8",
  green: "#34d399",
  red: "#fb7185",
  amber: "#f59e0b",
};

function text(value: any, fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function money(value: any) {
  return `${Number(value || 0).toLocaleString("en-US")} MMK`;
}

function dateTime(value: any) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-GB", { timeZone: "Asia/Yangon" });
}

function escapeHtml(value: any) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  } as Record<string, string>)[character]);
}

function wayId(row: Row) {
  return text(row.delivery_way_id || row.waybill_no || row.tracking_no || row.way_id);
}

function routeZone(row: Row) {
  return text(row.route_zone, "UNASSIGNED");
}

function cardStyle(extra: React.CSSProperties = {}) {
  return {
    border: `1px solid ${C.border}`,
    background: C.panel,
    borderRadius: 20,
    padding: 16,
    boxShadow: "0 12px 34px rgba(0,0,0,0.18)",
    ...extra,
  } as React.CSSProperties;
}

function inputStyle(extra: React.CSSProperties = {}) {
  return {
    width: "100%",
    minHeight: 42,
    border: `1px solid ${C.border}`,
    borderRadius: 11,
    background: "#f8fafc",
    color: "#07111e",
    padding: "9px 11px",
    outline: "none",
    fontWeight: 700,
    ...extra,
  } as React.CSSProperties;
}

function buttonStyle(kind: "gold" | "blue" | "green" | "plain" | "red" = "plain") {
  const palette = {
    gold: { bg: C.gold, fg: C.bg, border: C.gold },
    blue: { bg: C.blue, fg: C.bg, border: C.blue },
    green: { bg: C.green, fg: C.bg, border: C.green },
    red: { bg: "rgba(251,113,133,0.13)", fg: C.red, border: "rgba(251,113,133,0.55)" },
    plain: { bg: C.panel3, fg: C.text, border: C.border },
  }[kind];

  return {
    minHeight: 42,
    border: `1px solid ${palette.border}`,
    borderRadius: 11,
    background: palette.bg,
    color: palette.fg,
    padding: "9px 14px",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  } as React.CSSProperties;
}

function buildManifestHtml(wayplan: Row, stops: Row[]) {
  const totalCod = stops.reduce((sum, row) => sum + Number(row.cod_amount || row.actual_collect || 0), 0);
  const totalWeight = stops.reduce((sum, row) => sum + Number(row.weight_kg || row.parcel_weight_kg || 0), 0);
  const rows = stops.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><strong>${escapeHtml(wayId(row))}</strong></td>
      <td>${escapeHtml(row.recipient_name)}</td>
      <td>${escapeHtml(row.recipient_phone)}</td>
      <td>${escapeHtml(row.township || row.delivery_township)}</td>
      <td>${escapeHtml(row.recipient_address || row.address)}</td>
      <td class="number">${Number(row.cod_amount || row.actual_collect || 0).toLocaleString("en-US")}</td>
      <td class="number">${Number(row.weight_kg || row.parcel_weight_kg || 0).toLocaleString("en-US")}</td>
      <td>${escapeHtml(row.remarks || row.remark || "")}</td>
      <td>________________</td>
    </tr>`).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(wayplan.wayplan_id || wayplan.wayplan_code || "Wayplan Manifest")}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm; }
    body { font-family: Arial, "Myanmar Text", sans-serif; margin: 0; color: #111; }
    h1 { margin: 0 0 6px; font-size: 20px; }
    .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 10px 0; font-size: 11px; }
    .meta div { border: 1px solid #999; padding: 6px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #111; padding: 4px; font-size: 9px; vertical-align: top; word-break: break-word; }
    th { background: #f6b84b; }
    .number { text-align: right; }
    .footer { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-top: 24px; text-align: center; font-size: 10px; }
    .footer div { padding-top: 26px; border-top: 1px solid #111; }
  </style>
</head>
<body>
  <h1>BRITIUM EXPRESS — WAYPLAN MANIFEST</h1>
  <div class="meta">
    <div><strong>Wayplan:</strong> ${escapeHtml(wayplan.wayplan_id || wayplan.wayplan_code || "-")}</div>
    <div><strong>Route:</strong> ${escapeHtml(wayplan.route_zone || wayplan.route_name || "-")}</div>
    <div><strong>Rider:</strong> ${escapeHtml(wayplan.rider_name || wayplan.assigned_rider_name || "-")}</div>
    <div><strong>Vehicle:</strong> ${escapeHtml(wayplan.vehicle_name || wayplan.vehicle_code || wayplan.assigned_vehicle_plate || "-")}</div>
    <div><strong>Parcels:</strong> ${stops.length}</div>
    <div><strong>Total COD:</strong> ${totalCod.toLocaleString("en-US")} MMK</div>
    <div><strong>Total Weight:</strong> ${totalWeight.toLocaleString("en-US")} kg</div>
    <div><strong>Printed:</strong> ${escapeHtml(dateTime(new Date().toISOString()))}</div>
  </div>
  <table>
    <thead>
      <tr><th style="width:3%">#</th><th style="width:9%">Way ID</th><th style="width:9%">Recipient</th><th style="width:8%">Phone</th><th style="width:8%">Township</th><th style="width:22%">Address</th><th style="width:8%">COD</th><th style="width:6%">Kg</th><th style="width:14%">Remarks</th><th style="width:13%">Signature</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer"><div>Warehouse</div><div>Dispatcher</div><div>Rider / Driver</div><div>Operations</div></div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };</script>
</body>
</html>`;
}

function printManifest(wayplan: Row, stops: Row[]) {
  const printWindow = window.open("", "_blank", "width=1280,height=900");
  if (!printWindow) {
    window.alert("Popup blocked. Allow popups and try Print Manifest again.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(buildManifestHtml(wayplan, stops));
  printWindow.document.close();
}

export default function WayplanCommandCenterPage() {
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<Row>({ stats: {}, rows: [], pickups: [], route_groups: [] });
  const [wayplans, setWayplans] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [selectedPickup, setSelectedPickup] = useState("");
  const [selectedRoute, setSelectedRoute] = useState("");
  const [query, setQuery] = useState("");
  const [activeWayplan, setActiveWayplan] = useState<Row | null>(null);

  const [branchCode, setBranchCode] = useState("YGN");
  const [routeDate, setRouteDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cutoff, setCutoff] = useState("17:00");
  const [vehicleType, setVehicleType] = useState("delivery_van");
  const [vehicleCode, setVehicleCode] = useState("");
  const [vehicleName, setVehicleName] = useState("");
  const [riderCode, setRiderCode] = useState("");
  const [riderName, setRiderName] = useState("");
  const [driverCode, setDriverCode] = useState("");
  const [driverName, setDriverName] = useState("");
  const [helperCode, setHelperCode] = useState("");
  const [helperName, setHelperName] = useState("");

  const rows: Row[] = Array.isArray(snapshot.rows) ? snapshot.rows : [];
  const pickups: string[] = Array.isArray(snapshot.pickups) ? snapshot.pickups : [];
  const routes: string[] = Array.isArray(snapshot.route_groups) ? snapshot.route_groups : [];
  const stats = snapshot.stats || {};

  const filteredRows = useMemo(() => {
    const search = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (selectedPickup && text(row.pickup_id) !== selectedPickup) return false;
      if (selectedRoute && routeZone(row) !== selectedRoute) return false;
      if (!search) return true;
      return [
        wayId(row), row.pickup_id, row.batch_waybill_no, row.recipient_name,
        row.recipient_phone, row.township, row.recipient_address, row.route_zone,
      ].some((value) => text(value).toLowerCase().includes(search));
    });
  }, [rows, selectedPickup, selectedRoute, query]);

  const selectableRows = useMemo(
    () => filteredRows.filter((row) => !row.already_planned && routeZone(row) !== "UNASSIGNED"),
    [filteredRows],
  );

  const selectedRows = useMemo(
    () => rows.filter((row) => selected[wayId(row)] && !row.already_planned),
    [rows, selected],
  );

  const selectedRoutes = useMemo(
    () => [...new Set(selectedRows.map(routeZone))],
    [selectedRows],
  );

  const selectedCod = selectedRows.reduce((sum, row) => sum + Number(row.cod_amount || 0), 0);
  const selectedWeight = selectedRows.reduce((sum, row) => sum + Number(row.weight_kg || 0), 0);

  const manifestStops = useMemo(() => {
    const embedded = activeWayplan?.stops;
    if (Array.isArray(embedded)) return embedded;
    if (typeof embedded === "string") {
      try {
        const parsed = JSON.parse(embedded);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Ignore malformed legacy stop payload and use the last created rows.
      }
    }
    return [];
  }, [activeWayplan]);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const warehouseResult = await supabase.rpc("be_wayplan_warehouse_ready_snapshot_v40", {
        p_pickup_id: null,
      });
      if (warehouseResult.error) throw warehouseResult.error;
      const nextSnapshot = warehouseResult.data || { stats: {}, rows: [], pickups: [], route_groups: [] };
      setSnapshot(nextSnapshot);

      const nextPickups = Array.isArray(nextSnapshot.pickups) ? nextSnapshot.pickups : [];
      setSelectedPickup((current) => current || nextPickups[0] || "");

      const legacyResult = await supabase.rpc("be_wayplan_command_center", { p_limit: 100 });
      if (!legacyResult.error) {
        const list = legacyResult.data?.wayplans || legacyResult.data?.data || [];
        const normalized = Array.isArray(list) ? list : [];
        setWayplans(normalized);
        setActiveWayplan((current) => {
          if (current) {
            const match = normalized.find((item) => text(item.wayplan_id || item.wayplan_code) === text(current.wayplan_id || current.wayplan_code));
            return match ? { ...current, ...match, stops: match.stops || current.stops } : current;
          }
          return normalized[0] || null;
        });
      }
    } catch (caught: any) {
      setError(caught?.message || "Could not load Warehouse Ready parcels for Wayplan creation.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    setSelected({});
  }, [selectedPickup, selectedRoute]);

  function toggleOne(row: Row) {
    const id = wayId(row);
    if (!id || row.already_planned || routeZone(row) === "UNASSIGNED") return;
    setSelected((current) => ({ ...current, [id]: !current[id] }));
  }

  function toggleVisible() {
    const allSelected = selectableRows.length > 0 && selectableRows.every((row) => selected[wayId(row)]);
    if (allSelected) {
      setSelected((current) => {
        const next = { ...current };
        selectableRows.forEach((row) => delete next[wayId(row)]);
        return next;
      });
      return;
    }
    setSelected((current) => {
      const next = { ...current };
      selectableRows.forEach((row) => { next[wayId(row)] = true; });
      return next;
    });
  }

  async function actorEmail() {
    const { data } = await supabase.auth.getUser();
    return data?.user?.email || "wayplan@britiumexpress.com";
  }

  async function createWayplan() {
    setError("");
    setNotice("");

    if (!selectedRows.length) {
      setError("Select at least one Warehouse Ready parcel.");
      return;
    }
    if (selectedRoutes.length !== 1) {
      setError(`Create one route group per Wayplan. Selected groups: ${selectedRoutes.join(", ") || "none"}.`);
      return;
    }
    if (selectedRoutes[0] === "UNASSIGNED") {
      setError("The selected parcels have no route mapping. Correct the recipient township first.");
      return;
    }
    if (!(riderCode.trim() || riderName.trim())) {
      setError("Assign an authorized Rider before creating the Wayplan.");
      return;
    }
    if (!(vehicleCode.trim() || vehicleName.trim())) {
      setError("Assign a permitted vehicle before creating the Wayplan.");
      return;
    }

    setActionBusy("create");
    try {
      const actor = await actorEmail();
      const payload = {
        branch_code: branchCode,
        dispatch_date: routeDate,
        route_date: routeDate,
        cutoff_time: cutoff,
        route_zone: selectedRoutes[0],
        route_name: `${selectedRoutes[0]} · ${routeDate}`,
        delivery_way_ids: selectedRows.map(wayId),
        vehicle_type: vehicleType,
        vehicle_code: vehicleCode.trim() || null,
        vehicle_name: vehicleName.trim() || null,
        rider_code: riderCode.trim() || null,
        rider_name: riderName.trim() || null,
        driver_code: driverCode.trim() || null,
        driver_name: driverName.trim() || null,
        helper_code: helperCode.trim() || null,
        helper_name: helperName.trim() || null,
        actor,
      };

      const { data, error: rpcError } = await supabase.rpc("be_generate_wayplan_from_warehouse_v40", {
        p_payload: payload,
      });
      if (rpcError) throw rpcError;
      if (data?.ok === false) throw new Error(data?.error || "Wayplan creation failed.");

      const createdId = text(data?.wayplan_id || data?.wayplan_code);
      const synthetic = {
        wayplan_id: createdId,
        wayplan_code: createdId,
        wayplan_status: "PLANNED",
        route_zone: data?.route_zone || selectedRoutes[0],
        total_stops: selectedRows.length,
        total_cod: selectedCod,
        vehicle_type: vehicleType,
        vehicle_code: vehicleCode,
        vehicle_name: vehicleName,
        rider_code: riderCode,
        rider_name: riderName,
        driver_code: driverCode,
        driver_name: driverName,
        helper_code: helperCode,
        helper_name: helperName,
        stops: selectedRows,
        created_at: new Date().toISOString(),
      };
      setActiveWayplan(synthetic);
      setSelected({});
      setNotice(`${createdId} created with ${selectedRows.length} parcel(s). Next: prepare it for mandatory Dispatch scanning.`);
      await loadAll(true);
    } catch (caught: any) {
      setError(caught?.message || "Could not create the Wayplan.");
    } finally {
      setActionBusy("");
    }
  }

  async function prepareForDispatch() {
    const id = text(activeWayplan?.wayplan_id || activeWayplan?.wayplan_code);
    if (!id) {
      setError("Select or create a Wayplan first.");
      return;
    }

    setActionBusy("handoff");
    setError("");
    setNotice("");
    try {
      const actor = await actorEmail();
      const { data, error: rpcError } = await supabase.rpc("be_wayplan_prepare_dispatch_v40", {
        p_wayplan_id: id,
        p_actor_email: actor,
      });
      if (rpcError) throw rpcError;
      setNotice(data?.message || `${id} is ready for mandatory Dispatch scanning.`);
      window.setTimeout(() => {
        window.location.hash = `#/dispatch-command?wayplan=${encodeURIComponent(id)}`;
      }, 450);
    } catch (caught: any) {
      setError(caught?.message || "Could not hand the Wayplan to Dispatch scanning.");
    } finally {
      setActionBusy("");
    }
  }

  function openDispatch() {
    window.location.hash = "#/dispatch-command";
  }

  if (loading && !rows.length) {
    return (
      <main style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 32 }}>
        <Loader2 className="animate-spin" /> Loading Warehouse Ready parcels and Wayplans…
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 22 }}>
      <div style={{ maxWidth: 1540, margin: "0 auto", display: "grid", gap: 16 }}>
        <section style={cardStyle({ padding: 18 })}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ color: C.gold, fontSize: 11, fontWeight: 900, letterSpacing: "0.19em" }}>WAYPLAN COMMAND · {BUILD_MARKER}</div>
              <h1 style={{ margin: "7px 0 3px", fontSize: 25 }}>Warehouse Ready → Wayplan → Dispatch Scan</h1>
              <p style={{ margin: 0, color: C.sub, fontSize: 12 }}>
                Warehouse receiving is complete. Create one route-group Wayplan, assign the Rider and permitted vehicle, then continue to mandatory Dispatch scanning.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => void loadAll()} disabled={!!actionBusy} style={buttonStyle("plain")}><RefreshCw size={15} />Refresh</button>
              <button onClick={openDispatch} style={buttonStyle("blue")}><Truck size={15} />Dispatch Command</button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(130px, 1fr))", gap: 10, marginTop: 16 }} className="wayplan-kpis">
            {[
              ["Warehouse Ready", stats.warehouse_ready || rows.length, C.gold],
              ["Unplanned", stats.unplanned || 0, C.blue],
              ["Already Planned", stats.already_planned || 0, C.green],
              ["Selected", selectedRows.length, C.gold],
              ["Route Groups", stats.route_group_count || routes.length, C.blue],
              ["Unassigned Route", stats.unassigned_route || 0, C.red],
            ].map(([label, value, color]) => (
              <div key={String(label)} style={cardStyle({ padding: 12, background: C.panel2 })}>
                <div style={{ color: C.sub, fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>{label}</div>
                <div style={{ color: String(color), fontSize: 24, fontWeight: 950, marginTop: 4 }}>{String(value)}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, color: C.sub, fontSize: 11, flexWrap: "wrap" }}>
            <PackageCheck size={14} color={C.green} /> Warehouse Ready
            <ChevronRight size={14} />
            <Route size={14} color={C.gold} /> Wayplan Planned
            <ChevronRight size={14} />
            <Send size={14} color={C.blue} /> Mandatory Dispatch Scan
            <ChevronRight size={14} /> Publish / Out for Delivery
          </div>
        </section>

        {error ? <div style={{ ...cardStyle({ background: "rgba(251,113,133,0.12)", borderColor: "rgba(251,113,133,0.55)" }), color: C.red }}><AlertTriangle size={16} style={{ verticalAlign: "middle", marginRight: 8 }} />{error}</div> : null}
        {notice ? <div style={{ ...cardStyle({ background: "rgba(52,211,153,0.10)", borderColor: "rgba(52,211,153,0.45)" }), color: C.green }}><CheckCircle2 size={16} style={{ verticalAlign: "middle", marginRight: 8 }} />{notice}</div> : null}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.45fr) minmax(360px, 0.75fr)", gap: 16 }} className="wayplan-main-grid">
          <section style={cardStyle()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17 }}>Warehouse Ready Parcel Selection</h2>
                <p style={{ margin: "4px 0 0", color: C.sub, fontSize: 11 }}>Select only one route group for each Wayplan.</p>
              </div>
              <button onClick={toggleVisible} style={buttonStyle("gold")}><CheckCircle2 size={15} />{selectableRows.length && selectableRows.every((row) => selected[wayId(row)]) ? "Clear Visible" : "Select Visible"}</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.5fr", gap: 8, marginTop: 12 }} className="wayplan-filters">
              <label style={{ color: C.sub, fontSize: 11, fontWeight: 800 }}>
                Pickup
                <select value={selectedPickup} onChange={(event) => setSelectedPickup(event.target.value)} style={inputStyle({ marginTop: 5 })}>
                  <option value="">All pickups</option>
                  {pickups.map((pickup) => <option key={pickup} value={pickup}>{pickup}</option>)}
                </select>
              </label>
              <label style={{ color: C.sub, fontSize: 11, fontWeight: 800 }}>
                Route Group
                <select value={selectedRoute} onChange={(event) => setSelectedRoute(event.target.value)} style={inputStyle({ marginTop: 5 })}>
                  <option value="">All route groups</option>
                  {routes.map((route) => <option key={route} value={route}>{route}</option>)}
                </select>
              </label>
              <label style={{ color: C.sub, fontSize: 11, fontWeight: 800 }}>
                Search
                <div style={{ position: "relative", marginTop: 5 }}>
                  <Search size={15} style={{ position: "absolute", left: 10, top: 13, color: C.muted }} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Way ID, recipient, phone, township…" style={inputStyle({ paddingLeft: 34 })} />
                </div>
              </label>
            </div>

            <div style={{ overflow: "auto", maxHeight: 600, marginTop: 12, border: `1px solid ${C.border}`, borderRadius: 13 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 2, background: C.panel3 }}>
                  <tr>
                    {["Select", "Way ID", "Pickup", "Recipient", "Township", "Route Group", "COD", "State"].map((heading) => (
                      <th key={heading} style={{ textAlign: "left", padding: "10px 9px", color: C.sub, fontSize: 10, borderBottom: `1px solid ${C.border}` }}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const id = wayId(row);
                    const disabled = Boolean(row.already_planned) || routeZone(row) === "UNASSIGNED";
                    return (
                      <tr key={`${row.pickup_id}-${id}`} onClick={() => toggleOne(row)} style={{ borderTop: `1px solid ${C.border}`, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.58 : 1, background: selected[id] ? "rgba(246,184,75,0.08)" : "transparent" }}>
                        <td style={{ padding: 9 }}><input type="checkbox" checked={Boolean(selected[id])} readOnly disabled={disabled} /></td>
                        <td style={{ padding: 9, color: C.gold, fontWeight: 900 }}>{id}</td>
                        <td style={{ padding: 9, fontSize: 11 }}>{text(row.pickup_id, "-")}</td>
                        <td style={{ padding: 9 }}>
                          <div style={{ fontWeight: 800 }}>{text(row.recipient_name, "-")}</div>
                          <div style={{ color: C.sub, fontSize: 10 }}>{text(row.recipient_phone, "-")}</div>
                        </td>
                        <td style={{ padding: 9 }}>{text(row.township, "-")}</td>
                        <td style={{ padding: 9 }}><span style={{ border: `1px solid ${routeZone(row) === "UNASSIGNED" ? C.red : C.border}`, borderRadius: 999, padding: "4px 8px", color: routeZone(row) === "UNASSIGNED" ? C.red : C.blue, fontSize: 10, fontWeight: 900 }}>{routeZone(row)}</span></td>
                        <td style={{ padding: 9, textAlign: "right" }}>{money(row.cod_amount)}</td>
                        <td style={{ padding: 9, fontSize: 10, color: row.already_planned ? C.green : C.sub }}>{row.already_planned ? `PLANNED · ${text(row.wayplan_id)}` : "AVAILABLE"}</td>
                      </tr>
                    );
                  })}
                  {!filteredRows.length ? <tr><td colSpan={8} style={{ padding: 30, textAlign: "center", color: C.sub }}>No Warehouse Ready parcels match the selected filters.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
            <section style={cardStyle()}>
              <h2 style={{ margin: "0 0 12px", fontSize: 17 }}><Users size={17} style={{ verticalAlign: "middle", marginRight: 7 }} />Route Assignment</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                <label style={{ color: C.sub, fontSize: 10, fontWeight: 800 }}>Branch<input value={branchCode} onChange={(event) => setBranchCode(event.target.value)} style={inputStyle({ marginTop: 4 })} /></label>
                <label style={{ color: C.sub, fontSize: 10, fontWeight: 800 }}>Route Date<input type="date" value={routeDate} onChange={(event) => setRouteDate(event.target.value)} style={inputStyle({ marginTop: 4 })} /></label>
                <label style={{ color: C.sub, fontSize: 10, fontWeight: 800 }}>Cut-off<input type="time" value={cutoff} onChange={(event) => setCutoff(event.target.value)} style={inputStyle({ marginTop: 4 })} /></label>
                <label style={{ color: C.sub, fontSize: 10, fontWeight: 800 }}>Vehicle Type<select value={vehicleType} onChange={(event) => setVehicleType(event.target.value)} style={inputStyle({ marginTop: 4 })}><option value="delivery_van">Delivery Van</option><option value="van">Van</option><option value="bike">Bike</option><option value="bicycle">Bicycle</option></select></label>
                <label style={{ color: C.sub, fontSize: 10, fontWeight: 800 }}>Vehicle Code<input value={vehicleCode} onChange={(event) => setVehicleCode(event.target.value)} placeholder="Required" style={inputStyle({ marginTop: 4 })} /></label>
                <label style={{ color: C.sub, fontSize: 10, fontWeight: 800 }}>Vehicle / Plate<input value={vehicleName} onChange={(event) => setVehicleName(event.target.value)} placeholder="Required" style={inputStyle({ marginTop: 4 })} /></label>
                <label style={{ color: C.sub, fontSize: 10, fontWeight: 800 }}>Rider Code<input value={riderCode} onChange={(event) => setRiderCode(event.target.value)} placeholder="Required" style={inputStyle({ marginTop: 4 })} /></label>
                <label style={{ color: C.sub, fontSize: 10, fontWeight: 800 }}>Rider Name<input value={riderName} onChange={(event) => setRiderName(event.target.value)} placeholder="Required" style={inputStyle({ marginTop: 4 })} /></label>
                <label style={{ color: C.sub, fontSize: 10, fontWeight: 800 }}>Driver Code<input value={driverCode} onChange={(event) => setDriverCode(event.target.value)} style={inputStyle({ marginTop: 4 })} /></label>
                <label style={{ color: C.sub, fontSize: 10, fontWeight: 800 }}>Driver Name<input value={driverName} onChange={(event) => setDriverName(event.target.value)} style={inputStyle({ marginTop: 4 })} /></label>
                <label style={{ color: C.sub, fontSize: 10, fontWeight: 800 }}>Helper Code<input value={helperCode} onChange={(event) => setHelperCode(event.target.value)} style={inputStyle({ marginTop: 4 })} /></label>
                <label style={{ color: C.sub, fontSize: 10, fontWeight: 800 }}>Helper Name<input value={helperName} onChange={(event) => setHelperName(event.target.value)} style={inputStyle({ marginTop: 4 })} /></label>
              </div>

              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                <div style={cardStyle({ padding: 10, background: C.panel2 })}><div style={{ color: C.sub, fontSize: 10 }}>Selected Parcels</div><div style={{ color: C.gold, fontSize: 22, fontWeight: 950 }}>{selectedRows.length}</div></div>
                <div style={cardStyle({ padding: 10, background: C.panel2 })}><div style={{ color: C.sub, fontSize: 10 }}>Route Group</div><div style={{ color: selectedRoutes.length === 1 ? C.blue : C.red, fontSize: 12, fontWeight: 950, marginTop: 6 }}>{selectedRoutes.join(", ") || "-"}</div></div>
                <div style={cardStyle({ padding: 10, background: C.panel2 })}><div style={{ color: C.sub, fontSize: 10 }}>Selected COD</div><div style={{ color: C.green, fontSize: 14, fontWeight: 950, marginTop: 6 }}>{money(selectedCod)}</div></div>
                <div style={cardStyle({ padding: 10, background: C.panel2 })}><div style={{ color: C.sub, fontSize: 10 }}>Selected Weight</div><div style={{ color: C.text, fontSize: 14, fontWeight: 950, marginTop: 6 }}>{selectedWeight.toLocaleString("en-US")} kg</div></div>
              </div>

              <button onClick={() => void createWayplan()} disabled={!!actionBusy} style={{ ...buttonStyle("gold"), width: "100%", marginTop: 12, opacity: actionBusy ? 0.6 : 1 }}>
                {actionBusy === "create" ? <Loader2 size={15} className="animate-spin" /> : <Route size={15} />} Create Wayplan
              </button>
            </section>

            <section style={cardStyle()}>
              <h2 style={{ margin: "0 0 10px", fontSize: 17 }}>Generated Wayplans</h2>
              <select value={text(activeWayplan?.wayplan_id || activeWayplan?.wayplan_code)} onChange={(event) => setActiveWayplan(wayplans.find((item) => text(item.wayplan_id || item.wayplan_code) === event.target.value) || activeWayplan)} style={inputStyle()}>
                <option value="">Choose Wayplan…</option>
                {wayplans.map((item) => {
                  const id = text(item.wayplan_id || item.wayplan_code);
                  return <option key={id} value={id}>{id} · {text(item.wayplan_status || item.status, "PLANNED")} · {Number(item.total_stops || item.parcel_count || 0)} parcels</option>;
                })}
                {activeWayplan && !wayplans.some((item) => text(item.wayplan_id || item.wayplan_code) === text(activeWayplan.wayplan_id || activeWayplan.wayplan_code)) ? <option value={text(activeWayplan.wayplan_id || activeWayplan.wayplan_code)}>{text(activeWayplan.wayplan_id || activeWayplan.wayplan_code)} · newly created</option> : null}
              </select>

              <div style={cardStyle({ background: C.panel2, padding: 11, marginTop: 10 })}>
                <div style={{ color: C.sub, fontSize: 10 }}>Active Wayplan</div>
                <div style={{ color: C.gold, fontWeight: 950, marginTop: 3 }}>{text(activeWayplan?.wayplan_id || activeWayplan?.wayplan_code, "-")}</div>
                <div style={{ color: C.sub, fontSize: 11, marginTop: 3 }}>{text(activeWayplan?.wayplan_status || activeWayplan?.status, "PLANNED")} · {Number(activeWayplan?.total_stops || activeWayplan?.parcel_count || manifestStops.length || 0)} parcels</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                <button onClick={() => activeWayplan && printManifest(activeWayplan, manifestStops)} disabled={!activeWayplan || !manifestStops.length} style={{ ...buttonStyle("plain"), opacity: !activeWayplan || !manifestStops.length ? 0.45 : 1 }}><Printer size={15} />Print Manifest</button>
                <button onClick={() => void prepareForDispatch()} disabled={!activeWayplan || !!actionBusy} style={{ ...buttonStyle("green"), opacity: !activeWayplan || actionBusy ? 0.45 : 1 }}>{actionBusy === "handoff" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}Dispatch Scan</button>
              </div>

              <div style={{ marginTop: 10, color: C.sub, fontSize: 10, lineHeight: 1.6 }}>
                “Dispatch Scan” does not release the route. It validates the Wayplan handoff and opens Dispatch Command, where every parcel must be scanned before Publish.
              </div>
            </section>
          </div>
        </div>

        <section style={cardStyle()}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 17 }}>Manifest Preview</h2>
              <div style={{ color: C.sub, fontSize: 11, marginTop: 3 }}>{text(activeWayplan?.wayplan_id || activeWayplan?.wayplan_code, "No Wayplan selected")} · {manifestStops.length} parcel(s)</div>
            </div>
            <div style={{ color: C.sub, fontSize: 10 }}><Filter size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />Route-group manifest only</div>
          </div>

          <div style={{ overflow: "auto", marginTop: 10, border: `1px solid ${C.border}`, borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1050 }}>
              <thead style={{ background: C.panel3 }}><tr>{["Seq", "Way ID", "Recipient", "Phone", "Township", "Address", "COD", "Weight", "Remarks"].map((heading) => <th key={heading} style={{ textAlign: "left", padding: 9, color: C.sub, fontSize: 10 }}>{heading}</th>)}</tr></thead>
              <tbody>
                {manifestStops.map((row, index) => (
                  <tr key={`${wayId(row)}-${index}`} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: 9 }}>{index + 1}</td>
                    <td style={{ padding: 9, color: C.gold, fontWeight: 900 }}>{wayId(row)}</td>
                    <td style={{ padding: 9 }}>{text(row.recipient_name, "-")}</td>
                    <td style={{ padding: 9 }}>{text(row.recipient_phone, "-")}</td>
                    <td style={{ padding: 9 }}>{text(row.township || row.delivery_township, "-")}</td>
                    <td style={{ padding: 9, color: C.sub }}><MapPin size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />{text(row.recipient_address || row.address, "-")}</td>
                    <td style={{ padding: 9, textAlign: "right" }}>{money(row.cod_amount || row.actual_collect)}</td>
                    <td style={{ padding: 9, textAlign: "right" }}>{Number(row.weight_kg || row.parcel_weight_kg || 0).toLocaleString("en-US")} kg</td>
                    <td style={{ padding: 9 }}>{text(row.remarks || row.remark, "-")}</td>
                  </tr>
                ))}
                {!manifestStops.length ? <tr><td colSpan={9} style={{ padding: 28, textAlign: "center", color: C.sub }}>Create or select a Wayplan to preview its manifest.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <style>{`
        @media (max-width: 1180px) {
          .wayplan-main-grid { grid-template-columns: 1fr !important; }
          .wayplan-kpis { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 760px) {
          .wayplan-kpis { grid-template-columns: repeat(2, 1fr) !important; }
          .wayplan-filters { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}
