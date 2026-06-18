import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Download,
  Loader2,
  MapPinned,
  RefreshCw,
  Route,
  Search,
  Send,
  Truck,
  Users,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type AnyRow = Record<string, any>;

type WayplanSnapshot = {
  kpis: {
    total_wayplans: number;
    active_wayplans: number;
    planned_wayplans: number;
    completed_wayplans: number;
    total_stops: number;
    completed_stops: number;
    exception_stops: number;
  };
  wayplans: AnyRow[];
  stops: AnyRow[];
  exceptions: AnyRow[];
  riders: AnyRow[];
  vehicles: AnyRow[];
  last_synced_at: string;
};

const EMPTY_SNAPSHOT: WayplanSnapshot = {
  kpis: {
    total_wayplans: 0,
    active_wayplans: 0,
    planned_wayplans: 0,
    completed_wayplans: 0,
    total_stops: 0,
    completed_stops: 0,
    exception_stops: 0,
  },
  wayplans: [],
  stops: [],
  exceptions: [],
  riders: [],
  vehicles: [],
  last_synced_at: "",
};

const WAYPLAN_STATUSES = ["planned", "active", "completed", "cancelled"] as const;
const STOP_STATUSES = [
  "planned",
  "arrived",
  "out_for_delivery",
  "completed",
  "failed",
  "hold",
  "exception",
] as const;

const C = {
  page: "#061524",
  panel: "#0b2236",
  panel2: "#102b45",
  panel3: "#071827",
  border: "#1f4966",
  border2: "#315f81",
  text: "#eef8ff",
  sub: "#a8c4da",
  muted: "#7ea0b8",
  orange: "#ff8a4c",
  gold: "#f6b84b",
  green: "#22c55e",
  red: "#ff4f86",
  blue: "#38bdf8",
  purple: "#a78bfa",
};

function safe(value: unknown, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function numberValue(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function lower(value: unknown) {
  return safe(value, "").trim().toLowerCase();
}

function formatDateTime(value: unknown) {
  if (!value) return "-";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function wayplanCode(row: AnyRow) {
  return safe(row.wayplan_code || row.wayplan_no || row.route_name || row.id);
}

function stopSequence(row: AnyRow) {
  return numberValue(row.stop_sequence ?? row.stop_seq ?? row.sequence_number, 0);
}

function stopTracking(row: AnyRow) {
  return safe(row.tracking_no || row.delivery_way_id || row.waybill_id || row.shipment_id || row.id);
}

function stopStatus(row: AnyRow) {
  return safe(row.stop_status || row.status || "planned");
}

function wayplanStatus(row: AnyRow) {
  return safe(row.status || row.dispatch_status || "planned");
}

function normalizeSnapshot(raw: any): WayplanSnapshot {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    kpis: {
      total_wayplans: numberValue(data.kpis?.total_wayplans),
      active_wayplans: numberValue(data.kpis?.active_wayplans),
      planned_wayplans: numberValue(data.kpis?.planned_wayplans),
      completed_wayplans: numberValue(data.kpis?.completed_wayplans),
      total_stops: numberValue(data.kpis?.total_stops),
      completed_stops: numberValue(data.kpis?.completed_stops),
      exception_stops: numberValue(data.kpis?.exception_stops),
    },
    wayplans: Array.isArray(data.wayplans) ? data.wayplans : [],
    stops: Array.isArray(data.stops) ? data.stops : [],
    exceptions: Array.isArray(data.exceptions) ? data.exceptions : [],
    riders: Array.isArray(data.riders) ? data.riders : [],
    vehicles: Array.isArray(data.vehicles) ? data.vehicles : [],
    last_synced_at: safe(data.last_synced_at || new Date().toISOString(), ""),
  };
}

async function rpc<T = any>(name: string, args?: AnyRow): Promise<T> {
  const { data, error } = await (supabase as any).rpc(name, args || {});
  if (error) throw error;
  return data as T;
}

async function selectRows(table: string, limit = 100, orderColumn = "created_at") {
  const query = await (supabase as any)
    .from(table)
    .select("*")
    .order(orderColumn, { ascending: false, nullsFirst: false })
    .limit(limit);
  if (query.error) return [];
  return Array.isArray(query.data) ? query.data : [];
}

async function fallbackSnapshot(searchToken: string, activeWayplanId: string | null): Promise<WayplanSnapshot> {
  const [wayplans, stops, exceptions, riders, vehicles] = await Promise.all([
    selectRows("wayplans", 100, "created_at"),
    selectRows("wayplan_stops", 300, "created_at"),
    selectRows("exception_events", 100, "created_at"),
    selectRows("riders", 150, "created_at"),
    selectRows("vehicles", 150, "created_at"),
  ]);

  const token = lower(searchToken);
  const filteredWayplans = token
    ? wayplans.filter((w) =>
        [
          w.id,
          w.wayplan_code,
          w.wayplan_no,
          w.route_name,
          w.assigned_rider_name,
          w.assigned_driver_name,
          w.assigned_vehicle_plate,
          w.assigned_vehicle_no,
          w.status,
        ]
          .map((v) => lower(v))
          .join(" ")
          .includes(token),
      )
    : wayplans;

  const selectedWayplanId = activeWayplanId || filteredWayplans[0]?.id || null;
  const filteredStops = selectedWayplanId
    ? stops.filter((s) => safe(s.wayplan_id, "") === safe(selectedWayplanId, ""))
    : stops.slice(0, 120);

  const completedStops = filteredStops.filter((s) => ["completed", "delivered"].includes(lower(stopStatus(s)))).length;
  const exceptionStops = filteredStops.filter((s) =>
    ["failed", "hold", "exception", "cancelled", "damaged", "lost"].includes(lower(stopStatus(s))),
  ).length;

  return {
    kpis: {
      total_wayplans: filteredWayplans.length,
      active_wayplans: filteredWayplans.filter((w) => lower(wayplanStatus(w)) === "active").length,
      planned_wayplans: filteredWayplans.filter((w) => lower(wayplanStatus(w)) === "planned").length,
      completed_wayplans: filteredWayplans.filter((w) => lower(wayplanStatus(w)) === "completed").length,
      total_stops: filteredStops.length,
      completed_stops: completedStops,
      exception_stops: exceptionStops,
    },
    wayplans: filteredWayplans,
    stops: filteredStops.sort((a, b) => stopSequence(a) - stopSequence(b)),
    exceptions: exceptions.filter((e) => lower(e.process_type || e.event_process_type || "").includes("delivery") || lower(e.process_type || e.event_process_type || "").includes("warehouse")),
    riders,
    vehicles,
    last_synced_at: new Date().toISOString(),
  };
}

function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function toCsv(rows: AnyRow[]) {
  const headers = [
    "wayplan_id",
    "wayplan_code",
    "route_name",
    "status",
    "stop_sequence",
    "delivery_way_id",
    "waybill_id",
    "customer_name",
    "customer_phone",
    "township",
    "address",
    "stop_status",
    "rider_name",
  ];
  const escape = (v: unknown) => `"${safe(v, "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

export default function WayplanCommandCenterPage() {
  const [snapshot, setSnapshot] = useState<WayplanSnapshot>(EMPTY_SNAPSHOT);
  const [searchToken, setSearchToken] = useState("");
  const [activeWayplanId, setActiveWayplanId] = useState<string | null>(null);
  const [selectedRiderId, setSelectedRiderId] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<(typeof WAYPLAN_STATUSES)[number]>("planned");
  const [selectedStopStatus, setSelectedStopStatus] = useState<(typeof STOP_STATUSES)[number]>("planned");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [autoSync, setAutoSync] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const mounted = useRef(true);

  const activeWayplan = useMemo(() => {
    if (!activeWayplanId) return snapshot.wayplans[0] || null;
    return snapshot.wayplans.find((w) => safe(w.id, "") === activeWayplanId) || snapshot.wayplans[0] || null;
  }, [activeWayplanId, snapshot.wayplans]);

  const sortedStops = useMemo(() => {
    return [...snapshot.stops].sort((a, b) => stopSequence(a) - stopSequence(b));
  }, [snapshot.stops]);

  const readiness = useMemo(() => {
    const checks = [
      { label: "Wayplan data sync", ok: snapshot.wayplans.length > 0, actual: snapshot.wayplans.length, expected: "> 0" },
      { label: "Stop sequence sync", ok: snapshot.stops.length > 0, actual: snapshot.stops.length, expected: "> 0" },
      { label: "Rider master sync", ok: snapshot.riders.length > 0, actual: snapshot.riders.length, expected: "> 0" },
      { label: "Fleet master sync", ok: snapshot.vehicles.length > 0, actual: snapshot.vehicles.length, expected: "> 0" },
    ];
    return { ok: checks.every((c) => c.ok), checks };
  }, [snapshot]);

  const addLog = useCallback((line: string) => {
    setLog((prev) => [`${new Date().toLocaleTimeString()} — ${line}`, ...prev].slice(0, 12));
  }, []);

  const loadSnapshot = useCallback(async (opts?: { token?: string; wayplanId?: string | null; silent?: boolean }) => {
    const token = opts?.token ?? searchToken;
    const wayplanId = opts?.wayplanId ?? activeWayplanId;

    if (!opts?.silent) setLoading(true);
    setError(null);

    try {
      let next: WayplanSnapshot;
      try {
        next = normalizeSnapshot(
          await rpc("be_wayplan_command_center_snapshot", {
            p_search_token: token.trim() || null,
            p_active_wayplan_id: wayplanId || null,
          }),
        );
      } catch {
        next = await fallbackSnapshot(token, wayplanId);
      }

      if (!mounted.current) return;
      setSnapshot(next);
      if (!wayplanId && next.wayplans[0]?.id) {
        setActiveWayplanId(safe(next.wayplans[0].id, ""));
      }
      addLog("Wayplan command data synchronized.");
    } catch (e: any) {
      if (!mounted.current) return;
      setError(e?.message || "Wayplan synchronization failed.");
    } finally {
      if (!opts?.silent && mounted.current) setLoading(false);
    }
  }, [activeWayplanId, addLog, searchToken]);

  useEffect(() => {
    mounted.current = true;
    void loadSnapshot({ token: "", wayplanId: null });
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!autoSync) return undefined;
    const t = window.setInterval(() => {
      void loadSnapshot({ silent: true });
    }, 45_000);
    return () => window.clearInterval(t);
  }, [autoSync, loadSnapshot]);

  function validateNote() {
    if (note.length > 500) return "Note must not exceed 500 characters.";
    return null;
  }

  async function updateWayplanStatus() {
    if (!activeWayplan) {
      setError("Select a wayplan first.");
      return;
    }
    const noteError = validateNote();
    if (noteError) {
      setError(noteError);
      return;
    }

    setActionBusy("wayplan_status");
    setError(null);
    try {
      await rpc("be_wayplan_update_status", {
        p_wayplan_id: activeWayplan.id,
        p_status: selectedStatus,
        p_note: note.trim() || null,
      });
      setNotice(`Wayplan status updated to ${selectedStatus}.`);
      setNote("");
      addLog(`Wayplan ${wayplanCode(activeWayplan)} status → ${selectedStatus}`);
      await loadSnapshot({ wayplanId: safe(activeWayplan.id, "") });
    } catch (e: any) {
      setError(e?.message || "Wayplan status update failed.");
    } finally {
      setActionBusy(null);
    }
  }

  async function assignDispatchTeam() {
    if (!activeWayplan) {
      setError("Select a wayplan first.");
      return;
    }
    if (!selectedRiderId && !selectedVehicleId) {
      setError("Select at least rider or vehicle.");
      return;
    }
    const noteError = validateNote();
    if (noteError) {
      setError(noteError);
      return;
    }

    setActionBusy("assign");
    setError(null);
    try {
      await rpc("be_wayplan_assign_dispatch_team", {
        p_wayplan_id: activeWayplan.id,
        p_rider_id: selectedRiderId || null,
        p_vehicle_id: selectedVehicleId || null,
        p_note: note.trim() || null,
      });
      setNotice("Dispatch team assigned.");
      addLog(`Dispatch team updated for ${wayplanCode(activeWayplan)}.`);
      setNote("");
      await loadSnapshot({ wayplanId: safe(activeWayplan.id, "") });
    } catch (e: any) {
      setError(e?.message || "Dispatch assignment failed.");
    } finally {
      setActionBusy(null);
    }
  }

  async function updateStopStatus(stop: AnyRow) {
    const noteError = validateNote();
    if (noteError) {
      setError(noteError);
      return;
    }
    setActionBusy(`stop_${safe(stop.id)}`);
    setError(null);
    try {
      await rpc("be_wayplan_update_stop_status", {
        p_stop_id: stop.id,
        p_stop_status: selectedStopStatus,
        p_note: note.trim() || null,
      });
      setNotice(`Stop ${stopTracking(stop)} updated.`);
      addLog(`Stop ${stopTracking(stop)} status → ${selectedStopStatus}`);
      setNote("");
      await loadSnapshot({ wayplanId: safe(stop.wayplan_id || activeWayplan?.id, "") });
    } catch (e: any) {
      setError(e?.message || "Stop status update failed.");
    } finally {
      setActionBusy(null);
    }
  }

  async function resequenceStop(stop: AnyRow, direction: "up" | "down") {
    const current = stopSequence(stop);
    const next = direction === "up" ? Math.max(1, current - 1) : current + 1;
    setActionBusy(`seq_${safe(stop.id)}`);
    setError(null);
    try {
      await rpc("be_wayplan_resequence_stop", {
        p_stop_id: stop.id,
        p_new_sequence: next,
      });
      addLog(`Stop ${stopTracking(stop)} sequence ${current} → ${next}`);
      await loadSnapshot({ wayplanId: safe(stop.wayplan_id || activeWayplan?.id, "") });
    } catch (e: any) {
      setError(e?.message || "Stop resequence failed.");
    } finally {
      setActionBusy(null);
    }
  }

  function runSearch() {
    setActiveWayplanId(null);
    void loadSnapshot({ token: searchToken, wayplanId: null });
  }

  function exportStops() {
    const rows = sortedStops.map((s) => ({
      ...s,
      wayplan_id: activeWayplan?.id || s.wayplan_id,
      wayplan_code: wayplanCode(activeWayplan || {}),
      route_name: safe(activeWayplan?.route_name || activeWayplan?.wayplan_no || ""),
      status: wayplanStatus(activeWayplan || {}),
    }));
    downloadText("britium-wayplan-stops-export.csv", toCsv(rows));
  }

  function downloadTemplate() {
    downloadText(
      "britium-wayplan-stop-update-template.csv",
      [
        "wayplan_code,stop_id,delivery_way_id,stop_sequence,stop_status,dispatch_note",
        "D0609-AKK-001,00000000-0000-0000-0000-000000000000,D0609-AKK-001,1,planned,",
      ].join("\n"),
    );
  }

  return (
    <main style={sx({ minHeight: "100vh", background: C.page, color: C.text, padding: 24, fontFamily: "Pyidaungsu, Inter, system-ui, sans-serif" })}>
      <div style={sx({ maxWidth: 1800, margin: "0 auto", display: "grid", gap: 18 })}>
        <Header
          loading={loading}
          autoSync={autoSync}
          setAutoSync={setAutoSync}
          onRefresh={() => loadSnapshot()}
          readinessOk={readiness.ok}
          lastSyncedAt={snapshot.last_synced_at}
        />

        {error ? <Banner tone="error" message={error} onClose={() => setError(null)} /> : null}
        {notice ? <Banner tone="success" message={notice} onClose={() => setNotice(null)} /> : null}

        <KpiStrip kpis={snapshot.kpis} />

        <section style={sx({ display: "grid", gridTemplateColumns: "minmax(340px, 430px) minmax(0, 1fr) minmax(360px, 460px)", gap: 18, alignItems: "start" })}>
          <WayplanQueue
            rows={snapshot.wayplans}
            activeId={safe(activeWayplan?.id, "")}
            searchToken={searchToken}
            setSearchToken={setSearchToken}
            onSearch={runSearch}
            onSelect={(id) => {
              setActiveWayplanId(id);
              void loadSnapshot({ wayplanId: id });
            }}
            loading={loading}
          />

          <StopSequence
            wayplan={activeWayplan}
            stops={sortedStops}
            selectedStopStatus={selectedStopStatus}
            setSelectedStopStatus={setSelectedStopStatus}
            busy={actionBusy}
            onUpdateStop={updateStopStatus}
            onResequence={resequenceStop}
            onExport={exportStops}
            onTemplate={downloadTemplate}
          />

          <CommandPanel
            activeWayplan={activeWayplan}
            riders={snapshot.riders}
            vehicles={snapshot.vehicles}
            selectedRiderId={selectedRiderId}
            setSelectedRiderId={setSelectedRiderId}
            selectedVehicleId={selectedVehicleId}
            setSelectedVehicleId={setSelectedVehicleId}
            selectedStatus={selectedStatus}
            setSelectedStatus={setSelectedStatus}
            note={note}
            setNote={setNote}
            busy={actionBusy}
            onAssign={assignDispatchTeam}
            onUpdateStatus={updateWayplanStatus}
            readiness={readiness}
            exceptions={snapshot.exceptions}
            log={log}
          />
        </section>
      </div>
    </main>
  );
}

function Header({ loading, autoSync, setAutoSync, onRefresh, readinessOk, lastSyncedAt }: any) {
  return (
    <section style={panelStyle({ padding: 22 })}>
      <div style={sx({ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" })}>
        <div style={sx({ display: "flex", gap: 16, alignItems: "center" })}>
          <div style={sx({ width: 58, height: 58, borderRadius: 20, background: "rgba(255,138,76,.14)", border: `1px solid ${C.orange}66`, display: "grid", placeItems: "center" })}>
            <Route size={30} color={C.orange} />
          </div>
          <div>
            <div style={sx({ color: C.orange, fontWeight: 950, letterSpacing: ".32em", fontSize: 12 })}>BRITIUM WAYPLAN</div>
            <h1 style={sx({ margin: "6px 0 0", fontSize: 34, lineHeight: 1.1, fontWeight: 950 })}>Wayplan Command Center</h1>
            <p style={sx({ margin: "7px 0 0", color: C.sub, maxWidth: 900, lineHeight: 1.6 })}>
              Live route planning, stop sequence control, dispatch team assignment and wayplan execution monitoring.
            </p>
          </div>
        </div>
        <div style={sx({ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" })}>
          <span style={badge(readinessOk ? C.green : C.gold, "#061524")}>{readinessOk ? "GO-LIVE READY" : "CHECK REQUIRED"}</span>
          <span style={sx({ color: C.sub, fontSize: 13 })}>Last sync: {formatDateTime(lastSyncedAt)}</span>
          <button type="button" onClick={() => setAutoSync((v: boolean) => !v)} style={secondaryButton()}>
            <Zap size={16} />
            Auto Sync {autoSync ? "On" : "Off"}
          </button>
          <button type="button" onClick={() => void onRefresh()} disabled={loading} style={primaryButton()}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Refresh
          </button>
        </div>
      </div>
    </section>
  );
}

function KpiStrip({ kpis }: { kpis: WayplanSnapshot["kpis"] }) {
  return (
    <section style={sx({ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 12 })}>
      <Kpi label="Wayplans" value={kpis.total_wayplans} tone={C.blue} />
      <Kpi label="Active" value={kpis.active_wayplans} tone={C.green} />
      <Kpi label="Planned" value={kpis.planned_wayplans} tone={C.gold} />
      <Kpi label="Completed" value={kpis.completed_wayplans} tone={C.green} />
      <Kpi label="Stops" value={kpis.total_stops} tone={C.blue} />
      <Kpi label="Done Stops" value={kpis.completed_stops} tone={C.green} />
      <Kpi label="Exception Stops" value={kpis.exception_stops} tone={C.red} />
    </section>
  );
}

function Kpi({ label, value, tone }: any) {
  return (
    <div style={panelStyle({ padding: 14 })}>
      <div style={sx({ color: C.sub, fontSize: 12, fontWeight: 900 })}>{label}</div>
      <div style={sx({ marginTop: 5, color: tone, fontSize: 28, lineHeight: 1, fontWeight: 950 })}>{Number(value || 0).toLocaleString()}</div>
    </div>
  );
}

function WayplanQueue({ rows, activeId, searchToken, setSearchToken, onSearch, onSelect, loading }: any) {
  return (
    <section style={panelStyle({ padding: 18 })}>
      <PanelTitle icon={<MapPinned size={22} />} title="Wayplan Queue" desc="Search and select a live wayplan." />
      <div style={sx({ marginTop: 14, display: "grid", gridTemplateColumns: "1fr auto", gap: 10 })}>
        <div style={sx({ position: "relative" })}>
          <Search size={17} style={sx({ position: "absolute", top: 15, left: 13, color: C.muted })} />
          <input
            value={searchToken}
            onChange={(e) => setSearchToken(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearch();
            }}
            placeholder="Wayplan / vehicle / rider / route"
            style={inputStyle({ paddingLeft: 42 })}
          />
        </div>
        <button type="button" onClick={onSearch} style={iconButton()} title="Search">
          <Search size={17} />
        </button>
      </div>
      <div style={sx({ marginTop: 14, display: "grid", gap: 10, maxHeight: 700, overflow: "auto" })}>
        {loading ? <LoadingBlock /> : null}
        {!loading && rows.length === 0 ? <Empty text="No wayplans found." /> : null}
        {!loading && rows.map((row: AnyRow) => {
          const active = safe(row.id, "") === activeId;
          return (
            <button
              key={safe(row.id || wayplanCode(row))}
              type="button"
              onClick={() => onSelect(safe(row.id, ""))}
              style={sx({
                border: `1px solid ${active ? C.orange : C.border}`,
                background: active ? "rgba(255,138,76,.14)" : C.panel3,
                color: C.text,
                borderRadius: 18,
                padding: 14,
                textAlign: "left",
                cursor: "pointer",
              })}
            >
              <div style={sx({ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" })}>
                <div>
                  <div style={mono(C.orange)}>{wayplanCode(row)}</div>
                  <div style={sx({ marginTop: 4, fontWeight: 950 })}>{safe(row.route_name || row.wayplan_no || "Route")}</div>
                </div>
                <span style={badge(lower(wayplanStatus(row)) === "active" ? C.green : C.blue, "#061524")}>{wayplanStatus(row)}</span>
              </div>
              <div style={sx({ marginTop: 8, color: C.sub, lineHeight: 1.5, fontSize: 13 })}>
                {safe(row.assigned_rider_name || row.assigned_driver_name || row.rider_id, "Unassigned rider")} ·{" "}
                {safe(row.assigned_vehicle_plate || row.assigned_vehicle_no || row.assigned_vehicle_no, "No vehicle")}
              </div>
              <div style={sx({ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" })}>
                <span style={badge(C.panel2, C.sub)}>{safe(row.total_stops || row.stop_count || 0)} stops</span>
                <span style={badge(C.panel2, C.sub)}>{formatDateTime(row.plan_date || row.planned_date || row.created_at)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function StopSequence({ wayplan, stops, selectedStopStatus, setSelectedStopStatus, busy, onUpdateStop, onResequence, onExport, onTemplate }: any) {
  return (
    <section style={panelStyle({ padding: 18, minHeight: 720 })}>
      <div style={sx({ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, flexWrap: "wrap" })}>
        <PanelTitle icon={<Route size={22} />} title="Stop Sequence Control" desc={wayplan ? `${wayplanCode(wayplan)} · ${safe(wayplan.route_name || wayplan.wayplan_no || "")}` : "Select a wayplan to view stops."} />
        <div style={sx({ display: "flex", gap: 8, flexWrap: "wrap" })}>
          <button type="button" onClick={onTemplate} style={secondaryButton()}>
            <Download size={16} />
            Template
          </button>
          <button type="button" onClick={onExport} disabled={!stops.length} style={secondaryButton()}>
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      <div style={sx({ marginTop: 14, display: "grid", gridTemplateColumns: "1fr auto", gap: 10 })}>
        <select value={selectedStopStatus} onChange={(e) => setSelectedStopStatus(e.target.value as (typeof STOP_STATUSES)[number])} style={inputStyle()}>
          {STOP_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={sx({ color: C.sub, alignSelf: "center", fontSize: 13 })}>Selected stop action</span>
      </div>

      <div style={sx({ marginTop: 14, border: `1px solid ${C.border}`, borderRadius: 18, overflow: "hidden" })}>
        <div style={sx({ display: "grid", gridTemplateColumns: "70px 1fr 140px 140px 120px", gap: 10, padding: "12px 14px", background: C.panel2, color: C.sub, fontSize: 12, fontWeight: 950 })}>
          <div>Seq</div>
          <div>Shipment / Customer</div>
          <div>Township</div>
          <div>Status</div>
          <div>Actions</div>
        </div>
        <div style={sx({ maxHeight: 650, overflow: "auto" })}>
          {stops.length === 0 ? <Empty text="No stops found for selected wayplan." /> : null}
          {stops.map((s: AnyRow) => {
            const activeBusy = busy === `stop_${safe(s.id)}` || busy === `seq_${safe(s.id)}`;
            return (
              <div
                key={safe(s.id || s.shipment_id || stopTracking(s))}
                style={sx({
                  display: "grid",
                  gridTemplateColumns: "70px 1fr 140px 140px 120px",
                  gap: 10,
                  padding: "13px 14px",
                  borderTop: `1px solid ${C.border}`,
                  alignItems: "center",
                })}
              >
                <div>
                  <div style={mono(C.orange)}>{stopSequence(s) || "-"}</div>
                  <div style={sx({ display: "flex", gap: 4, marginTop: 5 })}>
                    <button type="button" onClick={() => onResequence(s, "up")} disabled={activeBusy || stopSequence(s) <= 1} style={miniButton()}><ArrowUp size={13} /></button>
                    <button type="button" onClick={() => onResequence(s, "down")} disabled={activeBusy} style={miniButton()}><ArrowDown size={13} /></button>
                  </div>
                </div>
                <div>
                  <div style={mono(C.blue)}>{stopTracking(s)}</div>
                  <div style={sx({ marginTop: 4, fontWeight: 900 })}>{safe(s.customer_name || s.receiver_name || s.merchant_name || "-")}</div>
                  <div style={sx({ marginTop: 3, color: C.sub, fontSize: 12 })}>{safe(s.address || s.delivery_address || "-")}</div>
                </div>
                <div style={sx({ color: C.sub, fontWeight: 800 })}>{safe(s.township)}</div>
                <div><span style={badge(["completed", "delivered"].includes(lower(stopStatus(s))) ? C.green : ["failed", "hold", "exception"].includes(lower(stopStatus(s))) ? C.red : C.gold, "#061524")}>{stopStatus(s)}</span></div>
                <button type="button" onClick={() => onUpdateStop(s)} disabled={activeBusy} style={miniActionButton()}>
                  {activeBusy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Update
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function CommandPanel(props: any) {
  const {
    activeWayplan,
    riders,
    vehicles,
    selectedRiderId,
    setSelectedRiderId,
    selectedVehicleId,
    setSelectedVehicleId,
    selectedStatus,
    setSelectedStatus,
    note,
    setNote,
    busy,
    onAssign,
    onUpdateStatus,
    readiness,
    exceptions,
    log,
  } = props;

  return (
    <div style={sx({ display: "grid", gap: 18 })}>
      <section style={panelStyle({ padding: 18 })}>
        <PanelTitle icon={<Truck size={22} />} title="Dispatch Assignment" desc="Assign rider and vehicle to the selected wayplan." />
        <div style={sx({ marginTop: 14, display: "grid", gap: 10 })}>
          <select value={selectedRiderId} onChange={(e) => setSelectedRiderId(e.target.value)} style={inputStyle()}>
            <option value="">Select rider</option>
            {riders.map((r: AnyRow) => (
              <option key={safe(r.id || r.rider_code)} value={safe(r.id, "")}>
                {safe(r.rider_code || r.code)} · {safe(r.name || r.full_name || r.rider_name || r.profile_id || r.id)}
              </option>
            ))}
          </select>
          <select value={selectedVehicleId} onChange={(e) => setSelectedVehicleId(e.target.value)} style={inputStyle()}>
            <option value="">Select vehicle</option>
            {vehicles.map((v: AnyRow) => (
              <option key={safe(v.id || v.vehicle_code || v.plate_no)} value={safe(v.id, "")}>
                {safe(v.vehicle_code || v.registration_number || v.plate_no || v.vehicle_plate || v.id)} · {safe(v.type || v.vehicle_type || "")}
              </option>
            ))}
          </select>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Dispatcher note / operational instruction, max 500 chars" style={textareaStyle()} />
          <button type="button" onClick={() => void onAssign()} disabled={!activeWayplan || busy === "assign"} style={primaryButton({ width: "100%" })}>
            {busy === "assign" ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />}
            Assign Dispatch Team
          </button>
        </div>
      </section>

      <section style={panelStyle({ padding: 18 })}>
        <PanelTitle icon={<CheckCircle2 size={22} />} title="Wayplan Status" desc="Change route lifecycle with audit event." />
        <div style={sx({ marginTop: 14, display: "grid", gap: 10 })}>
          <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value as (typeof WAYPLAN_STATUSES)[number])} style={inputStyle()}>
            {WAYPLAN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button" onClick={() => void onUpdateStatus()} disabled={!activeWayplan || busy === "wayplan_status"} style={primaryButton({ width: "100%" })}>
            {busy === "wayplan_status" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Update Wayplan
          </button>
        </div>
      </section>

      <section style={panelStyle({ padding: 18 })}>
        <PanelTitle icon={<AlertTriangle size={22} />} title="Go-Live Validation" desc="Required data health checks." />
        <div style={sx({ marginTop: 12, display: "grid", gap: 10 })}>
          {readiness.checks.map((c: any) => (
            <div key={c.label} style={sx({ display: "flex", justifyContent: "space-between", gap: 10, padding: 12, borderRadius: 14, border: `1px solid ${c.ok ? C.green : C.gold}55`, background: c.ok ? "rgba(34,197,94,.08)" : "rgba(246,184,75,.10)" })}>
              <div>
                <div style={sx({ fontWeight: 950 })}>{c.label}</div>
                <div style={sx({ color: C.sub, fontSize: 12 })}>Expected {safe(c.expected)} · Actual {safe(c.actual)}</div>
              </div>
              <span style={badge(c.ok ? C.green : C.gold, "#061524")}>{c.ok ? "Ready" : "Warning"}</span>
            </div>
          ))}
          <div style={sx({ color: C.sub, fontSize: 13 })}>Open operational exceptions: {exceptions.length}</div>
        </div>
      </section>

      <section style={panelStyle({ padding: 18 })}>
        <PanelTitle icon={<Zap size={22} />} title="Automation Log" desc="Latest synchronization and command events." />
        <div style={sx({ marginTop: 12, display: "grid", gap: 8 })}>
          {log.length === 0 ? <div style={sx({ color: C.sub })}>No activity yet.</div> : null}
          {log.map((line: string, i: number) => (
            <div key={`${line}-${i}`} style={sx({ color: C.sub, fontSize: 13, borderTop: i ? `1px solid ${C.border}` : "none", paddingTop: i ? 8 : 0 })}>{line}</div>
          ))}
        </div>
      </section>
    </div>
  );
}

function PanelTitle({ icon, title, desc }: any) {
  return (
    <div style={sx({ display: "flex", alignItems: "start", gap: 10 })}>
      <div style={sx({ color: C.orange, marginTop: 2 })}>{icon}</div>
      <div>
        <h2 style={sx({ margin: 0, fontSize: 20, fontWeight: 950, lineHeight: 1.25 })}>{title}</h2>
        {desc ? <p style={sx({ margin: "4px 0 0", color: C.sub, fontSize: 13, lineHeight: 1.5 })}>{desc}</p> : null}
      </div>
    </div>
  );
}

function Banner({ tone, message, onClose }: { tone: "success" | "error"; message: string; onClose: () => void }) {
  const color = tone === "success" ? C.green : C.red;
  return (
    <div style={sx({ border: `1px solid ${color}66`, background: `${color}12`, color, borderRadius: 18, padding: 14, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" })}>
      <div style={sx({ display: "flex", alignItems: "center", gap: 10, fontWeight: 900 })}>
        {tone === "success" ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
        {message}
      </div>
      <button type="button" onClick={onClose} style={ghostButton(color)}>Dismiss</button>
    </div>
  );
}

function LoadingBlock() {
  return (
    <div style={sx({ minHeight: 180, display: "grid", placeItems: "center", color: C.sub })}>
      <div style={sx({ display: "flex", alignItems: "center", gap: 10, fontWeight: 900 })}>
        <Loader2 size={22} className="animate-spin" />
        Loading…
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={sx({ padding: 26, textAlign: "center", color: C.sub, border: `1px dashed ${C.border2}`, borderRadius: 18 })}>{text}</div>;
}

function sx(style: React.CSSProperties) {
  return style;
}

function panelStyle(extra: React.CSSProperties = {}) {
  return sx({
    border: `1px solid ${C.border}`,
    background: `linear-gradient(180deg, ${C.panel}, #081b2b)`,
    borderRadius: 24,
    boxShadow: "0 18px 50px rgba(0,0,0,.25)",
    ...extra,
  });
}

function inputStyle(extra: React.CSSProperties = {}) {
  return sx({
    width: "100%",
    minHeight: 48,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    background: C.panel3,
    color: C.text,
    outline: "none",
    padding: "0 14px",
    fontWeight: 800,
    boxSizing: "border-box",
    ...extra,
  });
}

function textareaStyle(extra: React.CSSProperties = {}) {
  return sx({
    ...inputStyle(extra),
    minHeight: 92,
    paddingTop: 12,
    resize: "vertical",
    lineHeight: 1.5,
  });
}

function primaryButton(extra: React.CSSProperties = {}) {
  return sx({
    minHeight: 48,
    border: "none",
    borderRadius: 14,
    background: C.orange,
    color: "#1b0b05",
    padding: "0 18px",
    fontWeight: 950,
    cursor: "pointer",
    display: "inline-flex",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    ...extra,
  });
}

function secondaryButton(extra: React.CSSProperties = {}) {
  return sx({
    ...primaryButton(extra),
    background: C.panel2,
    color: C.text,
    border: `1px solid ${C.border2}`,
  });
}

function iconButton(extra: React.CSSProperties = {}) {
  return sx({
    width: 48,
    minHeight: 48,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    background: C.panel3,
    color: C.text,
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    ...extra,
  });
}

function miniButton(extra: React.CSSProperties = {}) {
  return sx({
    width: 26,
    height: 24,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    background: C.panel2,
    color: C.text,
    cursor: "pointer",
    display: "inline-grid",
    placeItems: "center",
    ...extra,
  });
}

function miniActionButton(extra: React.CSSProperties = {}) {
  return sx({
    minHeight: 36,
    border: `1px solid ${C.border2}`,
    borderRadius: 12,
    background: C.panel2,
    color: C.text,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontWeight: 900,
    ...extra,
  });
}

function ghostButton(color = C.text) {
  return sx({
    minHeight: 38,
    border: `1px solid ${color}66`,
    borderRadius: 12,
    background: "transparent",
    color,
    padding: "0 12px",
    fontWeight: 900,
    cursor: "pointer",
  });
}

function mono(color = C.orange) {
  return sx({
    color,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontWeight: 950,
    fontSize: 13,
    wordBreak: "break-all",
  });
}

function badge(bg: string, color: string) {
  return sx({
    display: "inline-flex",
    borderRadius: 999,
    padding: "4px 10px",
    background: bg,
    color,
    fontWeight: 950,
    fontSize: 11,
    whiteSpace: "nowrap",
  });
}