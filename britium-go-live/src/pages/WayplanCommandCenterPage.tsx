// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Printer,
  Send,
  MapPin,
  CheckCircle2,
  Search,
  SlidersHorizontal,
  RotateCcw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import MultiVanPlanner from "@/components/MultiVanPlanner";
import CreatedWayplanRevisionPlanner from "@/components/CreatedWayplanRevisionPlanner";
import MultiSelectQueueFilter from "@/components/MultiSelectQueueFilter";
import { guardedBrowserPrint } from "@/lib/documentPrintGuard";
import {
  filterWayplanQueueRows,
  getWayplanQueueFilterOptions,
  groupWayplanQueueRows,
  toggleVisibleWayplanSelection,
  type WayplanQueueGroupBy,
} from "@/lib/wayplanQueueFilters";

type Row = Record<string, any>;
type WayplanRegionCode = "YANGON" | "MANDALAY" | "NAYPYITAW";
type WayplanRegionOption = {
  region_code: WayplanRegionCode;
  display_name: string;
  branch_code: string;
  is_active: boolean;
  map_enabled: boolean;
  updated_at?: string;
};

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

function Card({ children, style, id }: { children: React.ReactNode; style?: React.CSSProperties; id?: string }) {
  return (
    <section
      id={id}
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

export default function WayplanCommandCenterPage() {
  const [loading, setLoading] = useState(false);
  const [readyRows, setReadyRows] = useState<Row[]>([]);
  const [wayplans, setWayplans] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [activeWayplan, setActiveWayplan] = useState<Row | null>(null);
  const [regions, setRegions] = useState<WayplanRegionOption[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<WayplanRegionCode>("YANGON");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [townshipFilters, setTownshipFilters] = useState<string[]>([]);
  const [merchantFilters, setMerchantFilters] = useState<string[]>([]);
  const [providerFilters, setProviderFilters] = useState<string[]>([]);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [queueSearch, setQueueSearch] = useState("");
  const [groupBy, setGroupBy] = useState<WayplanQueueGroupBy>("NONE");
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  const [revisionSource, setRevisionSource] = useState<Row | null>(null);
  const [revisionRows, setRevisionRows] = useState<Row[]>([]);
  const [revisionRemoveSelected, setRevisionRemoveSelected] = useState<Record<string, boolean>>({});

  const WAYPLAN_MULTI_VAN_ENTRY_V50 = true;

  const selectedRows = useMemo(
    () => readyRows.filter((row) => selected[text(row.delivery_way_id || row.waybill_no)]),
    [readyRows, selected]
  );
  const selectedRegionOption = useMemo(
    () => regions.find((region) => region.region_code === selectedRegion) || null,
    [regions, selectedRegion]
  );
  const queueFilterOptions = useMemo(() => getWayplanQueueFilterOptions(readyRows), [readyRows]);
  const filteredReadyRows = useMemo(
    () => filterWayplanQueueRows(readyRows, {
      townships: townshipFilters,
      merchants: merchantFilters,
      providers: providerFilters,
      statuses: statusFilters,
      search: queueSearch,
    }),
    [readyRows, townshipFilters, merchantFilters, providerFilters, statusFilters, queueSearch]
  );
  const filteredSelectedRows = useMemo(
    () => filteredReadyRows.filter((row) => selected[text(row.delivery_way_id || row.waybill_no)]),
    [filteredReadyRows, selected]
  );
  const plannerRows = selectedRows;
  const revisionPlannerRows = revisionRows;
  const groupedReadyRows = useMemo(
    () => groupWayplanQueueRows(filteredReadyRows, groupBy),
    [filteredReadyRows, groupBy]
  );
  const allVisibleSelected = filteredReadyRows.length > 0 && filteredSelectedRows.length === filteredReadyRows.length;
  const canEditCreatedWayplan = activeWayplan?.wayplan_status === "CREATED";
  const removeCount = Object.values(revisionRemoveSelected).filter(Boolean).length;

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

  function resetQueueFilters() {
    setTownshipFilters([]);
    setMerchantFilters([]);
    setProviderFilters([]);
    setStatusFilters([]);
    setQueueSearch("");
    setGroupBy("NONE");
    setFiltersExpanded(true);
  }

  function cancelRevision() {
    setRevisionSource(null);
    setRevisionRows([]);
    setRevisionRemoveSelected({});
  }

  async function loadAll(preferredWayplanId: unknown = "") {
    const preferredId = typeof preferredWayplanId === "string" ? preferredWayplanId : "";
    setLoading(true);
    setError("");
    try {
      const [regionResult, queueResult, wayplanResult] = await Promise.all([
        supabase.rpc("be_wayplan_region_options_v19"),
        supabase.rpc("be_multi_van_queue", { p_region: selectedRegion }),
        supabase.rpc("be_wayplan_command_center", { p_limit: 100 }),
      ]);
      if (regionResult.error) throw regionResult.error;
      if (queueResult.error) throw queueResult.error;
      if (wayplanResult.error) throw wayplanResult.error;

      const q = queueResult.data?.queue || queueResult.data?.data || [];
      const w = wayplanResult.data?.wayplans || wayplanResult.data?.data || [];
      const regionRows = regionResult.data?.regions || regionResult.data?.data || [];
      const filteredWayplans = (Array.isArray(w) ? w : []).filter((wayplan) => {
        const code = text(wayplan?.metadata?.region_code || wayplan?.region_code || "YANGON").toUpperCase();
        return code === selectedRegion;
      });

      setRegions(Array.isArray(regionRows) ? regionRows : []);
      setReadyRows(Array.isArray(q) ? q : []);
      setSelected({});
      setWayplans(filteredWayplans);
      setActiveWayplan((previous) => {
        if (preferredId) {
          const preferred = filteredWayplans.find((wayplan) => wayplan.wayplan_id === preferredId);
          if (preferred) return preferred;
        }
        if (previous?.wayplan_id) {
          const fresh = filteredWayplans.find((wayplan) => wayplan.wayplan_id === previous.wayplan_id);
          if (fresh) return fresh;
        }
        return filteredWayplans.find((wayplan) => wayplan.wayplan_status !== "CANCELLED") || null;
      });
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not load dispatch / wayplan data.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleRegionActive(region: WayplanRegionOption) {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const { data, error } = await supabase.rpc("be_wayplan_region_set_active_v19", {
        p_payload: {
          region_code: region.region_code,
          is_active: !region.is_active,
          reason: `Wayplan Command Center ${region.is_active ? "disable" : "activate"}`,
        },
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.error || "Could not update the Wayplan region.");
      setMessage(`${region.display_name} Wayplan is now ${region.is_active ? "disabled" : "active"}.`);
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Could not update the Wayplan region.");
    } finally {
      setLoading(false);
    }
  }

  function focusRegion(region: WayplanRegionOption) {
    if (!region.is_active) {
      setError(`${region.display_name} Wayplan is disabled. Activate it before opening its queue.`);
      return;
    }
    setError("");
    if (region.region_code === selectedRegion) void loadAll();
    else setSelectedRegion(region.region_code);
  }

  function toggleOne(row: Row) {
    const id = text(row.delivery_way_id || row.waybill_no);
    if (!id) return;
    const selecting = !selected[id];
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
    if (selecting) setFiltersExpanded(false);
  }

  function toggleAllVisible() {
    const selecting = !allVisibleSelected;
    setSelected((prev) => toggleVisibleWayplanSelection(prev, filteredReadyRows));
    if (selecting) setFiltersExpanded(false);
  }

  async function cancelCreatedWayplan() {
    if (!activeWayplan?.wayplan_id) {
      setError("Select a CREATED Wayplan first.");
      return;
    }
    if (String(activeWayplan.wayplan_status || "").toUpperCase() !== "CREATED") {
      setError("Only a CREATED Wayplan can be cancelled and returned to READY.");
      return;
    }
    const confirmed = window.confirm(`Cancel ${activeWayplan.wayplan_id} and return its parcels to the READY Wayplan queue?`);
    if (!confirmed) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const requestId = crypto.randomUUID();
      const { data, error } = await supabase.rpc("be_delete_created_wayplan_v55", {
        p_payload: {
          wayplan_id: activeWayplan.wayplan_id,
          request_id: requestId,
          reason: "Cancelled from Wayplan Command Center before dispatch",
        },
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.error || "Could not cancel the CREATED Wayplan.");
      cancelRevision();
      setMessage(`${activeWayplan.wayplan_id} cancelled. ${data?.released_count || 0} way(s) were returned to the READY queue.`);
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Could not cancel the CREATED Wayplan.");
    } finally {
      setLoading(false);
    }
  }


  // Compatibility alias retained for the V47 build-time revision/delete patch.
  // Both actions use the guarded V55 pre-dispatch cancellation/purge RPC.
  async function deleteCreatedWayplan() {
    return cancelCreatedWayplan();
  }

  async function beginRevision() {
    if (!activeWayplan?.wayplan_id || activeWayplan.wayplan_status !== "CREATED") {
      setError("Only a CREATED Wayplan can be edited before dispatch.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const { data, error } = await supabase.rpc("be_created_wayplan_revision_snapshot_v46", { p_wayplan_id: activeWayplan.wayplan_id });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Could not load the CREATED Wayplan for revision.");
      const stops = Array.isArray(data.stops) ? data.stops : [];
      if (!stops.length) throw new Error("This Wayplan has no active stops to revise.");
      setRevisionSource({ ...activeWayplan, ...data });
      setRevisionRows(stops);
      setRevisionRemoveSelected({});
      setSelected({});
      setMessage(`Editing ${data.wayplan_id}: ${stops.length} current ways loaded. Add READY ways from the filtered queue or mark current ways for removal.`);
    } catch (err: any) {
      setError(err?.message || "Could not start Wayplan revision.");
    } finally {
      setLoading(false);
    }
  }

  function addSelectedToRevision() {
    if (!revisionSource) return;
    if (!filteredSelectedRows.length) {
      setError("Select one or more filtered READY ways to add.");
      return;
    }
    const merged = new Map(revisionRows.map((row) => [text(row.delivery_way_id), row]));
    filteredSelectedRows.forEach((row) => merged.set(text(row.delivery_way_id), row));
    const next = Array.from(merged.values()).filter((row) => text(row.delivery_way_id));
    if (next.length > 75) {
      setError(`The revised Wayplan would contain ${next.length} ways. Maximum is 75.`);
      return;
    }
    const added = next.length - revisionRows.length;
    setRevisionRows(next);
    setSelected({});
    setError("");
    setMessage(`${Math.max(added, 0)} way(s) added. Revised membership now contains ${next.length} ways.`);
  }

  function toggleRevisionRemove(row: Row) {
    const id = text(row.delivery_way_id);
    setRevisionRemoveSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function removeSelectedFromRevision() {
    if (!revisionSource || !removeCount) {
      setError("Select one or more current ways to remove.");
      return;
    }
    const next = revisionRows.filter((row) => !revisionRemoveSelected[text(row.delivery_way_id)]);
    if (!next.length) {
      setError("A revised Wayplan must keep at least one way.");
      return;
    }
    setRevisionRows(next);
    setRevisionRemoveSelected({});
    setError("");
    setMessage(`${removeCount} way(s) removed from the revision. They will return to the READY queue only when the replacement saves successfully.`);
  }

  async function handleRevisionSaved(result: any) {
    const replacementId = text(result?.replacement_wayplan_id);
    const sourceId = text(result?.replaces_wayplan_id || revisionSource?.wayplan_id);
    cancelRevision();
    await loadAll(replacementId);
    if (replacementId) {
      setMessage(`Revision saved: ${replacementId} replaces ${sourceId}. The replacement remains CREATED. Next: review its manifest, complete Supervisor approval + mandatory Dispatch scan, then Dispatch.`);
      requestAnimationFrame(() => document.getElementById("generated-wayplans")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  async function handleMultiVanSaved(result: any) {
    const ids = Array.isArray(result?.created_wayplan_ids)
      ? result.created_wayplan_ids.map((id: any) => text(id)).filter(Boolean)
      : Array.isArray(result?.wayplans)
        ? result.wayplans.map((wayplan: any) => text(wayplan?.wayplan_id)).filter(Boolean)
        : [];
    const firstId = ids[0] || "";
    setError("");
    await loadAll(firstId);
    setMessage(
      ids.length
        ? `${ids.length} reviewed Wayplan${ids.length === 1 ? "" : "s"} created: ${ids.join(", ")}. Status is CREATED. Next: review manifest → Supervisor approval → mandatory Dispatch scan → Dispatch Wayplan.`
        : "Reviewed Wayplans created. Status is CREATED. Next: review manifest → Supervisor approval → mandatory Dispatch scan → Dispatch Wayplan."
    );
    requestAnimationFrame(() => document.getElementById("generated-wayplans")?.scrollIntoView({ behavior: "smooth", block: "start" }));
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
        p_payload: { wayplan_id: activeWayplan.wayplan_id, status: nextStatus, actor: "wayplan_command_center" },
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error([data?.error || "Could not update wayplan status.", data?.next_step].filter(Boolean).join(" Next: "));
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
        p_payload: { wayplan_id: activeWayplan.wayplan_id, actor: "wayplan_command_center" },
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error([data?.error || "Could not dispatch wayplan.", data?.next_step].filter(Boolean).join(" Next: "));
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
      documentNo: activeWayplan.wayplan_id || "MANIFEST-UNKNOWN",
      actorEmail: "operator@britiumexpress.com",
      actorRole: "operator",
      reason: "Wayplan Command Center manifest print",
    });
  }

  useEffect(() => {
    resetQueueFilters();
    cancelRevision();
    void loadAll();
  }, [selectedRegion]);

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 20 }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #wayplan-manifest, #wayplan-manifest * { visibility: visible !important; }
          #wayplan-manifest { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; background: white !important; color: black !important; padding: 20px !important; }
          #wayplan-manifest table { width: 100%; border-collapse: collapse; }
          #wayplan-manifest th, #wayplan-manifest td { border: 1px solid #111; padding: 6px; font-size: 11px; color: black !important; }
        }
      `}</style>

      <div style={{ display: "grid", gap: 16 }}>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ color: C.blue, fontSize: 12, fontWeight: 900, letterSpacing: "0.28em" }}>WAREHOUSE & WAYPLAN</div>
              <h1 style={{ margin: "8px 0 4px", fontSize: 24 }}>Wayplan Command Center</h1>
              <p style={{ margin: 0, color: C.sub }}>Generate, revise before dispatch, produce manifest, and dispatch to warehouse / field team.</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={loadAll} disabled={loading} style={btn("plain")}><RefreshCw size={16} /> Refresh</button>
              <button onClick={printManifest} style={btn("gold")}><Printer size={16} /> Print Manifest</button>
              <button onClick={dispatchWayplan} disabled={loading || !activeWayplan || activeWayplan.wayplan_status === "CANCELLED"} style={btn("green")}><Send size={16} /> Dispatch Wayplan</button>
            </div>
          </div>
        </Card>

        {error && <div style={{ border: `1px solid ${C.red}`, background: "rgba(248,113,113,0.12)", color: C.red, borderRadius: 14, padding: 12 }}>{error}</div>}
        {message && <div style={{ border: `1px solid ${C.green}`, background: "rgba(52,211,153,0.12)", color: C.green, borderRadius: 14, padding: 12 }}>{message}</div>}

        <Card>
          <div style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Wayplan Region Control</h2>
            <p style={{ margin: "4px 0 0", color: C.sub, fontSize: 12 }}>Only active regions can expose a queue or generate a wayplan. Yangon is the current operational focus.</p>
          </div>
          <div data-wayplan-region-control-v19="true" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
            {regions.map((region) => {
              const focused = selectedRegion === region.region_code;
              return (
                <div key={region.region_code} style={{ border: `1px solid ${focused ? C.gold : C.border}`, background: focused ? "rgba(246,184,75,0.10)" : C.panel2, borderRadius: 14, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <div><strong style={{ display: "block" }}>{region.display_name}</strong><small style={{ color: C.sub }}>{region.branch_code} · Google Map {region.map_enabled ? "enabled" : "disabled"}</small></div>
                    <span style={{ borderRadius: 999, padding: "5px 9px", fontSize: 10, fontWeight: 900, color: region.is_active ? C.green : C.red, border: `1px solid ${region.is_active ? C.green : C.red}` }}>{region.is_active ? "ACTIVE" : "DISABLED"}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button type="button" onClick={() => focusRegion(region)} disabled={!region.is_active || loading} style={{ ...btn(focused ? "gold" : "plain"), flex: 1, opacity: region.is_active ? 1 : 0.45 }}>Open queue</button>
                    <button type="button" onClick={() => void toggleRegionActive(region)} disabled={loading} style={btn(region.is_active ? "red" : "green")}>{region.is_active ? "Disable" : "Activate"}</button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {revisionSource ? <>
          <Card style={{ borderColor: "#8f5a2a" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ color: C.gold, fontWeight: 900 }}>CREATED Wayplan Membership Editor</div>
                <div style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>Editing {revisionSource.wayplan_id}. Add selected filtered READY ways below, or check current ways here and remove them. No change reaches Production data until the replacement saves transactionally.</div>
              </div>
              <button data-wayplan-cancel-edit-v87="true" style={btn("plain")} onClick={cancelRevision}>Cancel Edit / Back</button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <button style={btn("gold")} disabled={!filteredSelectedRows.length} onClick={addSelectedToRevision}>Add Selected ({filteredSelectedRows.length})</button>
              <button style={btn("red")} disabled={!removeCount} onClick={removeSelectedFromRevision}>Remove Selected ({removeCount})</button>
              <span style={{ alignSelf: "center", color: C.sub }}>{revisionRows.length} ways will remain in the revised Wayplan.</span>
            </div>
            <div style={{ maxHeight: 260, overflow: "auto", marginTop: 12, border: `1px solid ${C.border}`, borderRadius: 12 }}>
              {revisionRows.map((row, index) => {
                const id = text(row.delivery_way_id);
                return <label key={id} style={{ padding: "8px 10px", display: "grid", gridTemplateColumns: "28px 40px 1fr", gap: 8, borderTop: index ? `1px solid ${C.border}` : "none", alignItems: "center" }}>
                  <input type="checkbox" checked={Boolean(revisionRemoveSelected[id])} onChange={() => toggleRevisionRemove(row)} />
                  <strong>{index + 1}</strong>
                  <span><strong style={{ color: C.gold }}>{text(row.waybill_no, id)}</strong> · {text(row.township, "-")} · {text(row.address, "No address")}</span>
                </label>;
              })}
            </div>
          </Card>
          <CreatedWayplanRevisionPlanner sourceWayplan={revisionSource} rows={revisionPlannerRows} region={selectedRegion} onSaved={handleRevisionSaved} />
        </> : <>
          <Card style={{ padding: 12 }}>
            <div style={{ fontWeight: 900, color: C.gold }}>Filtered Wayplan Task</div>
            <div style={{ marginTop: 4, color: C.sub, fontSize: 12 }}>
              Select the filtered ways below, then optimize only those selected ways from <strong style={{ color: C.text }}>Britium Ventures Head Office</strong>. The route planner uses the configured Yangon Head Office origin and automatically assigns the available <strong style={{ color: C.text }}>Driver / Rider / Helper</strong> roster before Google road optimization and operator review.
            </div>
          </Card>
          <MultiVanPlanner rows={plannerRows} region={selectedRegion} onSaved={handleMultiVanSaved} />
        </>}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px", gap: 16 }} className="wayplan-grid">
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16 }}>{selectedRegionOption?.display_name || selectedRegion} Ready for Wayplan Queue</h2>
                <p style={{ margin: "4px 0 0", color: C.sub, fontSize: 12 }}>{filteredReadyRows.length} filtered / {readyRows.length} ready stops / {selectedRows.length} selected</p>
              </div>
              <button data-wayplan-select-all-filtered-v52="true" onClick={toggleAllVisible} disabled={!filteredReadyRows.length} style={btn("gold")}>
                <CheckCircle2 size={15} /> {allVisibleSelected ? "Clear Filtered (" + filteredReadyRows.length + ")" : "Select All Filtered (" + filteredReadyRows.length + ")"}
              </button>
            </div>

            <div data-wayplan-queue-filters="true" style={{ border: `1px solid ${C.border}`, background: C.panel2, borderRadius: 14, padding: 12, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", color: C.gold, fontSize: 12, fontWeight: 900 }}><SlidersHorizontal size={15} /> FILTER & GROUP WAYS</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ alignSelf: "center", color: C.sub, fontSize: 11 }}>{filteredReadyRows.length} filtered · {filteredSelectedRows.length} filtered selected · {selectedRows.length} total selected</span>
                  <button type="button" onClick={() => setFiltersExpanded((value) => !value)} style={btn("plain")}>{filtersExpanded ? "Hide Filters" : "Show Filters"}</button>
                </div>
              </div>
              {filtersExpanded ? <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 8, marginTop: 10 }}>
                  <MultiSelectQueueFilter label="Township" allLabel="All Townships" options={queueFilterOptions.townships} values={townshipFilters} onChange={setTownshipFilters} filterKey="township" />
                  <MultiSelectQueueFilter label="Merchant" allLabel="All Merchants" options={queueFilterOptions.merchants} values={merchantFilters} onChange={setMerchantFilters} filterKey="merchant" />
                  <MultiSelectQueueFilter label="Service Provider" allLabel="All Providers" options={queueFilterOptions.providers} values={providerFilters} onChange={setProviderFilters} filterKey="provider" />
                  <MultiSelectQueueFilter label="Status" allLabel="All Statuses" options={queueFilterOptions.statuses} values={statusFilters} onChange={setStatusFilters} filterKey="status" />
                  <label style={{ color: C.sub, fontSize: 11 }}>Group By<select value={groupBy} onChange={(e) => setGroupBy(e.target.value as WayplanQueueGroupBy)} style={input()}><option value="NONE">None</option><option value="TOWNSHIP">Township</option><option value="MERCHANT">Merchant</option><option value="PROVIDER">Service Provider</option></select></label>
                  <label style={{ color: C.sub, fontSize: 11 }}>Search<div style={{ position: "relative" }}><Search size={15} style={{ position: "absolute", left: 11, top: 13, color: C.sub }} /><input value={queueSearch} onChange={(e) => setQueueSearch(e.target.value)} placeholder="Waybill, recipient, address..." style={{ ...input(), paddingLeft: 34 }} /></div></label>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <div style={{ color: C.sub, fontSize: 11, alignSelf: "center" }}>Choose the filters, then use Select All Filtered. The filter panel collapses automatically so it does not cover the operation table.</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={toggleAllVisible} disabled={!filteredReadyRows.length} style={btn("gold")}><CheckCircle2 size={14} /> {allVisibleSelected ? "Clear Filtered (" + filteredReadyRows.length + ")" : "Select All Filtered (" + filteredReadyRows.length + ")"}</button>
                    <button onClick={resetQueueFilters} style={btn("plain")}><RotateCcw size={14} /> Reset Filters</button>
                  </div>
                </div>
              </> : <div data-wayplan-filter-summary-v52="true" style={{ marginTop: 8, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ color: C.sub, fontSize: 11 }}>
                  Filters minimized · Townships {townshipFilters.length || "All"} · Merchants {merchantFilters.length || "All"} · Providers {providerFilters.length || "All"} · Statuses {statusFilters.length || "All"} · {filteredReadyRows.length} matching ways.
                </div>
                <button type="button" onClick={() => setFiltersExpanded(true)} style={btn("blue")}>Edit Filters</button>
              </div>}
            </div>

            <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1050 }}>
                <thead><tr style={{ background: C.gold, color: C.bg, textTransform: "uppercase", fontSize: 11 }}><th style={{ padding: 10, textAlign: "left" }}>Select</th><th style={{ padding: 10, textAlign: "left" }}>Waybill / Stage</th><th style={{ padding: 10, textAlign: "left" }}>Customer / Address</th><th style={{ padding: 10, textAlign: "left" }}>Township</th><th style={{ padding: 10, textAlign: "left" }}>Provider / Route</th><th style={{ padding: 10, textAlign: "right" }}>COD</th><th style={{ padding: 10, textAlign: "right" }}>Weight</th></tr></thead>
                <tbody>
                  {filteredReadyRows.length ? groupedReadyRows.map((group) => (
                    <React.Fragment key={group.label}>
                      {groupBy !== "NONE" && <tr><td colSpan={7} style={{ padding: "9px 12px", background: "rgba(78,168,222,0.12)", color: C.blue, fontWeight: 900, borderTop: `1px solid ${C.border}` }}>{group.label} <span style={{ color: C.sub, fontWeight: 600 }}>· {group.rows.length} ways</span></td></tr>}
                      {group.rows.map((row) => {
                        const id = text(row.delivery_way_id || row.waybill_no);
                        return <tr key={id} style={{ borderTop: `1px solid ${C.border}` }}><td style={{ padding: 10 }}><input type="checkbox" checked={Boolean(selected[id])} onChange={() => toggleOne(row)} /></td><td style={{ padding: 10 }}><div style={{ color: C.gold, fontWeight: 900 }}>{text(row.waybill_no, id)}</div><div style={{ color: C.sub, fontSize: 11 }}>{text(row.dispatch_status)} / {text(row.warehouse_status)}</div></td><td style={{ padding: 10 }}><div style={{ fontWeight: 800 }}>{text(row.recipient_name || row.merchant_name, "Customer")}</div><div style={{ color: C.sub, fontSize: 11, maxWidth: 520, whiteSpace: "normal" }}>{text(row.address, "No address")}</div><div style={{ color: C.blue, fontSize: 10, marginTop: 3 }}>{text(row.merchant_name, "Unknown Merchant")}</div></td><td style={{ padding: 10 }}>{text(row.township, "-")}</td><td style={{ padding: 10 }}><div style={{ fontWeight: 800 }}>{text(row.service_provider_code, "-")}</div><div style={{ color: C.sub, fontSize: 11 }}>{text(row.delivery_route_mode, "DOORSTEP_MAP")}</div></td><td style={{ padding: 10, textAlign: "right", color: C.green, fontWeight: 900 }}>{money(row.cod_amount)}</td><td style={{ padding: 10, textAlign: "right", color: C.gold, fontWeight: 900 }}>{Number(row.parcel_weight_kg || 0).toLocaleString()} kg</td></tr>;
                      })}
                    </React.Fragment>
                  )) : <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: C.sub }}>{readyRows.length ? "No ways match the current filters. Reset or change the filters to continue." : selectedRegionOption?.is_active ? "No parcels are ready for this regional wayplan. In Warehouse, mark received parcels ready for Wayplan, then click Open queue again." : "This regional Wayplan queue is disabled."}</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          <div style={{ display: "grid", gap: 16 }}>
            <Card id="generated-wayplans">
              <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Generated Wayplans</h2>
              <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
                <label style={{ color: C.sub, fontSize: 12, fontWeight: 800 }}>Select Wayplan<select value={activeWayplan?.wayplan_id || ""} onChange={(e) => { cancelRevision(); setActiveWayplan(wayplans.find((x) => x.wayplan_id === e.target.value) || null); }} style={input()}><option value="">Choose wayplan...</option>{wayplans.map((wp) => <option key={wp.wayplan_id} value={wp.wayplan_id}>{wp.wayplan_id} / {wp.wayplan_status} / {wp.total_stops || 0} stops</option>)}</select></label>
                <button onClick={beginRevision} disabled={loading || !canEditCreatedWayplan || Boolean(revisionSource)} style={{ ...btn("blue"), opacity: canEditCreatedWayplan ? 1 : 0.45 }}>Edit CREATED Wayplan</button>
                {revisionSource ? <button data-wayplan-cancel-edit-v87="true" onClick={cancelRevision} disabled={loading} style={btn("plain")}>Cancel Edit / Back</button> : null}
                <button data-wayplan-cancel-created-v87="true" onClick={()=>void cancelCreatedWayplan()} disabled={loading || !canEditCreatedWayplan || Boolean(revisionSource)} style={{ ...btn("red"), opacity: canEditCreatedWayplan && !revisionSource ? 1 : 0.45 }}>Cancel CREATED Wayplan & Return Ways to Queue</button>
                {!canEditCreatedWayplan && activeWayplan && <div style={{ color: C.sub, fontSize: 11 }}>Add/remove editing and cancellation are locked after the Wayplan leaves CREATED status.</div>}
                <div data-wayplan-lifecycle-controls-v61="true" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button
                    onClick={() => updateWayplanStatus("DISPATCHED")}
                    disabled={loading || !activeWayplan || !["CREATED","ON_HOLD"].includes(String(activeWayplan.wayplan_status || "").toUpperCase()) || Boolean(revisionSource)}
                    style={{ ...btn("green"), opacity: activeWayplan && ["CREATED","ON_HOLD"].includes(String(activeWayplan.wayplan_status || "").toUpperCase()) ? 1 : 0.45 }}
                  >Dispatch</button>
                  <button
                    onClick={() => updateWayplanStatus("COMPLETED")}
                    disabled={loading || !activeWayplan || String(activeWayplan.wayplan_status || "").toUpperCase() !== "DISPATCHED" || Boolean(revisionSource)}
                    style={{ ...btn("blue"), opacity: activeWayplan && String(activeWayplan.wayplan_status || "").toUpperCase() === "DISPATCHED" ? 1 : 0.45 }}
                  >Complete</button>
                  <button
                    onClick={() => updateWayplanStatus("ON_HOLD")}
                    disabled={loading || !activeWayplan || !["CREATED","DISPATCHED"].includes(String(activeWayplan.wayplan_status || "").toUpperCase()) || Boolean(revisionSource)}
                    style={{ ...btn("plain"), opacity: activeWayplan && ["CREATED","DISPATCHED"].includes(String(activeWayplan.wayplan_status || "").toUpperCase()) ? 1 : 0.45 }}
                  >Hold</button>
                  <button
                    onClick={() => updateWayplanStatus("CREATED")}
                    disabled={loading || !activeWayplan || String(activeWayplan.wayplan_status || "").toUpperCase() !== "ON_HOLD" || Boolean(revisionSource)}
                    style={{ ...btn("gold"), opacity: activeWayplan && String(activeWayplan.wayplan_status || "").toUpperCase() === "ON_HOLD" ? 1 : 0.45 }}
                  >Reopen</button>
                </div>
                {!revisionSource && <div data-wayplan-multivan-entry-v50="true" style={{ border: `1px solid ${C.blue}`, background: "rgba(78,168,222,0.10)", borderRadius: 12, padding: 10, color: C.sub, fontSize: 11 }}>Create new delivery Wayplans through the Multi-Van Planner above. It assigns the selected queue across available DELIVERY vans and creates separate Wayplans per van/route.</div>}
                <div style={{ border: `1px solid ${C.border}`, background: C.panel2, borderRadius: 14, padding: 10 }}><div style={{ color: C.sub, fontSize: 11 }}>Active Wayplan</div><div style={{ color: C.gold, fontWeight: 900 }}>{activeWayplan?.wayplan_id || "-"}</div><div style={{ color: C.green, fontSize: 12 }}>{activeWayplan?.wayplan_status || "-"} / {activeWayplan?.total_stops || 0} stops / {money(activeWayplan?.total_cod)}</div></div>
                {activeWayplan?.wayplan_status === "CREATED" && <div data-wayplan-lifecycle-note-v61="true" style={{ border: `1px solid ${C.gold}`, background: "rgba(246,184,75,0.08)", borderRadius: 14, padding: 10, fontSize: 11, lineHeight: 1.55 }}>
                  <strong style={{ color: C.gold }}>LIFECYCLE CONTROL</strong>
                  <div>CREATED Wayplans must go to <strong>Supervisor Wayplan</strong> first. Dispatch remains backend-guarded until Supervisor approval and mandatory Dispatch scanning are complete.</div>
                  <div><strong>Complete</strong> is unavailable until the Wayplan has actually been DISPATCHED and all route stops reach terminal delivery/return outcomes.</div>
                </div>}
                {activeWayplan?.wayplan_status === "CREATED" && <div data-wayplan-next-process-v51="true" style={{ border: `1px solid ${C.blue}`, background: "rgba(78,168,222,0.10)", borderRadius: 14, padding: 10, fontSize: 11, lineHeight: 1.55 }}>
                  <strong style={{ color: C.blue }}>NEXT PROCESS</strong>
                  <div>1. Review this generated Wayplan and its manifest.</div>
                  <div>2. Complete Supervisor approval.</div>
                  <div>3. Complete mandatory Dispatch parcel scan.</div>
                  <div>4. Click <strong>Dispatch</strong>. The backend blocks dispatch until approval and scanning are complete.</div>
                  <div>5. After dispatch, Rider/Driver executes the route; live status/tracking follows the dispatched Wayplan.</div>
                </div>}
              </div>
              <div style={{ display: "grid", gap: 8, maxHeight: 360, overflowY: "auto" }}>{wayplans.length ? wayplans.map((wp) => <button key={wp.wayplan_id} onClick={() => { cancelRevision(); setActiveWayplan(wp); }} style={{ textAlign: "left", border: `1px solid ${activeWayplan?.wayplan_id === wp.wayplan_id ? C.gold : C.border}`, background: activeWayplan?.wayplan_id === wp.wayplan_id ? "rgba(246,184,75,0.12)" : C.panel2, color: C.text, borderRadius: 14, padding: 12, cursor: "pointer" }}><div style={{ color: C.gold, fontWeight: 900 }}>{wp.wayplan_id}</div><div style={{ color: C.sub, fontSize: 11 }}>{wp.wayplan_status} / {compactDate(wp.created_at)}</div><div style={{ color: C.green, fontSize: 12 }}>{wp.total_stops || 0} stops / {money(wp.total_cod)}</div></button>) : <div style={{ color: C.sub }}>No generated wayplans yet.</div>}</div>
            </Card>
          </div>
        </div>

        <Card id="wayplan-manifest">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 12 }}><div><div style={{ color: C.gold, fontSize: 12, fontWeight: 900, letterSpacing: "0.22em" }}>BRITIUM EXPRESS</div><h2 style={{ margin: "6px 0", fontSize: 20 }}>Wayplan Manifest</h2><div style={{ color: C.sub }}>Wayplan: <strong style={{ color: C.text }}>{activeWayplan?.wayplan_id || "-"}</strong></div></div><div style={{ color: C.sub, fontSize: 12 }}><div>Status: {activeWayplan?.wayplan_status || "-"}</div><div>Vehicle: {activeWayplan?.vehicle_code || "-"} / {activeWayplan?.vehicle_name || "-"}</div><div>Driver: {activeWayplan?.driver_code || "-"} / {activeWayplan?.driver_name || "-"}</div><div>Rider: {activeWayplan?.rider_code || "-"} / {activeWayplan?.rider_name || "-"}</div><div>Printed: {compactDate(new Date().toISOString())}</div></div></div>
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1050 }}><thead><tr style={{ background: C.gold, color: C.bg, fontSize: 11, textTransform: "uppercase" }}><th style={{ padding: 8, textAlign: "left" }}>Seq</th><th style={{ padding: 8, textAlign: "left" }}>Waybill</th><th style={{ padding: 8, textAlign: "left" }}>Recipient</th><th style={{ padding: 8, textAlign: "left" }}>Phone</th><th style={{ padding: 8, textAlign: "left" }}>Township</th><th style={{ padding: 8, textAlign: "left" }}>Address</th><th style={{ padding: 8, textAlign: "right" }}>COD</th><th style={{ padding: 8, textAlign: "right" }}>Weight</th><th style={{ padding: 8, textAlign: "left" }}>Signature</th></tr></thead><tbody>{manifestStops.length ? manifestStops.map((stop: Row, i: number) => <tr key={stop.id || `${stop.delivery_way_id}-${i}`} style={{ borderTop: `1px solid ${C.border}` }}><td style={{ padding: 8 }}>{stop.stop_sequence || i + 1}</td><td style={{ padding: 8, color: C.gold, fontWeight: 900 }}>{text(stop.waybill_no || stop.delivery_way_id)}</td><td style={{ padding: 8 }}>{text(stop.recipient_name)}</td><td style={{ padding: 8 }}>{text(stop.recipient_phone)}</td><td style={{ padding: 8 }}>{text(stop.township)}</td><td style={{ padding: 8, whiteSpace: "normal" }}><MapPin size={12} /> {text(stop.address)}</td><td style={{ padding: 8, textAlign: "right" }}>{money(stop.cod_amount)}</td><td style={{ padding: 8, textAlign: "right" }}>{Number(stop.parcel_weight_kg || 0).toLocaleString()} kg</td><td style={{ padding: 8 }}>________________</td></tr>) : <tr><td colSpan={9} style={{ padding: 24, textAlign: "center", color: C.sub }}>Select or generate a wayplan to show manifest.</td></tr>}</tbody></table></div>
        </Card>
      </div>
    </main>
  );
}
