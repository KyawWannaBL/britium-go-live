// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  RefreshCw,
  PackageCheck,
  Truck,
  AlertTriangle,
  ShieldCheck,
  Upload,
  History,
  Search,
  CheckCircle2,
  XCircle,
} from "lucide-react";

const C = {
  bg: "#061524",
  panel: "#0b2236",
  panel2: "#0f2d46",
  border: "#1d4569",
  text: "#eef8ff",
  sub: "#9cc2d9",
  gold: "#f6b84b",
  green: "#34d399",
  red: "#fb7185",
  orange: "#fb923c",
};

function arr(v: any) {
  if (Array.isArray(v)) return v;
  if (Array.isArray(v?.rows)) return v.rows;
  return [];
}

function val(row: any, keys: string[], fallback = "-") {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() && !["null", "undefined", "nan", "-"].includes(String(v).toLowerCase())) {
      return String(v).trim();
    }
  }
  return fallback;
}

function badge(status: string) {
  const s = String(status || "").toUpperCase();
  const color =
    s.includes("HOLD") || s.includes("DAMAGED") || s.includes("LOST") || s.includes("EXCEPTION")
      ? C.red
      : s.includes("READY") || s.includes("LOADED") || s.includes("OUT_FOR_DELIVERY")
      ? C.green
      : C.gold;

  return (
    <span style={{ border: `1px solid ${color}`, color, borderRadius: 999, padding: "3px 8px", fontSize: 11, fontWeight: 900 }}>
      {s || "PENDING"}
    </span>
  );
}

const ACTIONS = [
  ["SCAN", "Scan"],
  ["RECEIVE", "Receive"],
  ["SORT", "Sort"],
  ["READY_DISPATCH", "Ready Dispatch"],
  ["LOAD_VEHICLE", "Load Vehicle"],
  ["HANDOVER_RIDER", "Handover Rider"],
  ["RELEASE_HOLD", "Release Hold"],
];

export default function WarehouseWayplanCenterPage() {
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<any>({});
  const [rows, setRows] = useState<any[]>([]);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [imports, setImports] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [reason, setReason] = useState("");
  const [exceptionCode, setExceptionCode] = useState("WAYBILL_MISMATCH");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const { data, error } = await supabase.rpc("be_warehouse_wayplan_center", { p_limit: 300 });
      if (error) throw error;

      setPayload(data || {});
      setRows(arr(data));
      setExceptions(Array.isArray(data?.exceptions) ? data.exceptions : []);
      setImports(Array.isArray(data?.recent_imports) ? data.recent_imports : []);

      const ruleRes = await supabase
        .from("be_logistics_exception_rules")
        .select("*")
        .eq("process_type", "WAREHOUSE")
        .eq("active", true)
        .order("exception_code", { ascending: true });

      if (!ruleRes.error) setRules(ruleRes.data || []);
    } catch (e: any) {
      setMessage(e?.message || "Failed to load warehouse center.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter((r) =>
      [
        "wayplan_id",
        "delivery_way_id",
        "waybill_no",
        "invoice_no",
        "tracking_no",
        "pickup_id",
        "recipient_name",
        "township",
        "live_warehouse_status",
        "warehouse_status",
        "stop_status",
      ].some((k) => String(r?.[k] || "").toLowerCase().includes(q))
    );
  }, [rows, query]);

  const summary = payload?.summary || {};

  async function runAction(action: string, row = selected) {
    if (!row && action !== "SCAN") {
      setMessage("Select one row first.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase.rpc("be_warehouse_wayplan_action", {
        p_payload: {
          action,
          wayplan_id: row?.wayplan_id,
          delivery_way_id: row?.delivery_way_id || row?.tracking_no || row?.waybill_no,
          pickup_id: row?.pickup_id,
          actor_email: "warehouse@britiumexpress.com",
          reason: reason || `${action} from warehouse screen`,
        },
      });

      if (error) throw error;
      setMessage(`${data?.status || action} completed. Affected rows: ${data?.affected_rows ?? 0}`);
      await load();
    } catch (e: any) {
      setMessage(e?.message || "Action failed.");
    } finally {
      setLoading(false);
    }
  }

  async function runException(row = selected) {
    if (!row) {
      setMessage("Select one row first.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { data, error } = await supabase.rpc("be_warehouse_wayplan_action", {
        p_payload: {
          action: "EXCEPTION",
          exception_code: exceptionCode,
          wayplan_id: row?.wayplan_id,
          delivery_way_id: row?.delivery_way_id || row?.tracking_no || row?.waybill_no,
          pickup_id: row?.pickup_id,
          actor_email: "warehouse@britiumexpress.com",
          reason: reason || exceptionCode,
        },
      });

      if (error) throw error;
      setMessage(`${data?.status || "EXCEPTION"} / ${data?.next_action || ""} / ${data?.approval_team || ""}`);
      await load();
    } catch (e: any) {
      setMessage(e?.message || "Exception failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 20, overflow: "auto" }}>
      <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28 }}>Warehouse Wayplan Center</h1>
            <p style={{ color: C.sub, marginTop: 6 }}>
              Live warehouse lifecycle wired to Data Entry, Wayplan, Dispatch, Rider Delivery, Exception Rules, and Audit.
            </p>
          </div>

          <button
            onClick={load}
            disabled={loading}
            style={{ background: C.gold, color: "#1a1205", border: 0, borderRadius: 14, padding: "10px 16px", fontWeight: 900, height: 44 }}
          >
            <RefreshCw size={16} /> {loading ? "Syncing..." : "Sync"}
          </button>
        </div>

        {message && (
          <div style={{ marginTop: 12, padding: 12, border: `1px solid ${message.includes("failed") ? C.red : C.green}`, borderRadius: 14 }}>
            {message}
          </div>
        )}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
        {[
          ["Total Stops", summary.total_stops ?? rows.length],
          ["Received", summary.warehouse_received ?? 0],
          ["Sorting", summary.sorting ?? 0],
          ["Ready", summary.ready_for_dispatch ?? 0],
          ["Loaded", summary.loaded_to_vehicle ?? 0],
          ["Out / Handover", summary.handed_over_to_rider ?? 0],
          ["Delivered", summary.delivered ?? 0],
          ["On Hold", summary.on_hold ?? 0],
          ["Open Exceptions", summary.open_exceptions ?? 0],
        ].map(([k, v]) => (
          <div key={k} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 18, padding: 14 }}>
            <div style={{ color: C.sub, fontSize: 12 }}>{k}</div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{v}</div>
          </div>
        ))}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }}>
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 22, padding: 16, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>Live Warehouse Rows</h2>
            <div style={{ display: "flex", alignItems: "center", background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 14, padding: "8px 10px", minWidth: 280 }}>
              <Search size={16} color={C.sub} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search waybill, tracking, pickup, status..."
                style={{ background: "transparent", border: 0, outline: 0, color: C.text, marginLeft: 8, width: "100%" }}
              />
            </div>
          </div>

          <div style={{ overflow: "auto", maxHeight: "68vh" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr style={{ color: C.sub, textAlign: "left", fontSize: 12 }}>
                  <th style={{ padding: 10 }}>Select</th>
                  <th>Wayplan</th>
                  <th>Delivery / Waybill / Tracking</th>
                  <th>Pickup</th>
                  <th>Rider / Vehicle</th>
                  <th>Status</th>
                  <th>Exception</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => {
                  const active = selected === r;
                  return (
                    <tr
                      key={`${r.wayplan_id}-${r.delivery_way_id}-${idx}`}
                      onClick={() => setSelected(r)}
                      style={{
                        borderTop: `1px solid ${C.border}`,
                        background: active ? "#143b5a" : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <td style={{ padding: 10 }}>{active ? <CheckCircle2 color={C.green} /> : <XCircle color={C.sub} />}</td>
                      <td style={{ padding: 10 }}>{val(r, ["wayplan_id"])}</td>
                      <td style={{ padding: 10 }}>
                        <div style={{ fontWeight: 900 }}>{val(r, ["delivery_way_id"])}</div>
                        <div style={{ color: C.sub, fontSize: 12 }}>{val(r, ["waybill_no"])} / {val(r, ["tracking_no"])}</div>
                      </td>
                      <td style={{ padding: 10 }}>{val(r, ["pickup_id"])}</td>
                      <td style={{ padding: 10 }}>
                        <div>{val(r, ["rider_name", "rider_code"])}</div>
                        <div style={{ color: C.sub, fontSize: 12 }}>{val(r, ["vehicle_name", "vehicle_code"])}</div>
                      </td>
                      <td style={{ padding: 10 }}>{badge(val(r, ["live_warehouse_status", "warehouse_status", "stop_status"], "PENDING"))}</td>
                      <td style={{ padding: 10 }}>
                        {r.has_open_exception ? (
                          <span style={{ color: C.red, fontWeight: 900 }}>OPEN</span>
                        ) : (
                          <span style={{ color: C.sub }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <aside style={{ display: "grid", gap: 16 }}>
          <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 22, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>Action Panel</h2>
            <div style={{ color: C.sub, fontSize: 13, marginBottom: 10 }}>
              Selected: {selected ? val(selected, ["delivery_way_id", "tracking_no", "waybill_no"]) : "None"}
            </div>

            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason / note"
              style={{
                width: "100%",
                minHeight: 70,
                background: C.panel2,
                color: C.text,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                padding: 10,
                resize: "vertical",
                marginBottom: 12,
              }}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {ACTIONS.map(([code, label]) => (
                <button
                  key={code}
                  onClick={() => runAction(code)}
                  disabled={loading || !selected}
                  style={{ background: C.gold, border: 0, borderRadius: 12, padding: 10, fontWeight: 900 }}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 22, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>
              <AlertTriangle size={18} /> Exception Rules
            </h2>

            <select
              value={exceptionCode}
              onChange={(e) => setExceptionCode(e.target.value)}
              style={{
                width: "100%",
                background: C.panel2,
                color: C.text,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                padding: 10,
                marginBottom: 10,
              }}
            >
              {rules.map((r) => (
                <option key={r.exception_code} value={r.exception_code}>
                  {r.exception_code} — {r.exception_name_en}
                </option>
              ))}
            </select>

            <button
              onClick={() => runException()}
              disabled={loading || !selected}
              style={{ width: "100%", background: C.red, color: "white", border: 0, borderRadius: 12, padding: 11, fontWeight: 900 }}
            >
              Put on Exception / Hold
            </button>

            <div style={{ color: C.sub, fontSize: 12, marginTop: 10 }}>
              Rules are loaded from <b>be_logistics_exception_rules</b>.
            </div>
          </section>

          <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 22, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>
              <Upload size={18} /> Recent Imports
            </h2>
            {imports.length ? imports.map((i) => (
              <div key={i.import_batch_id} style={{ borderTop: `1px solid ${C.border}`, padding: "8px 0" }}>
                <div style={{ fontWeight: 900 }}>{i.source_file_name || i.import_batch_id}</div>
                <div style={{ color: C.sub, fontSize: 12 }}>
                  {i.total_rows} rows / {i.valid_rows} valid / {i.invalid_rows} invalid
                </div>
              </div>
            )) : <div style={{ color: C.sub }}>No warehouse imports yet.</div>}
          </section>

          <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 22, padding: 16 }}>
            <h2 style={{ marginTop: 0 }}>
              <History size={18} /> Open Exceptions
            </h2>
            {exceptions.length ? exceptions.map((e) => (
              <div key={e.id} style={{ borderTop: `1px solid ${C.border}`, padding: "8px 0" }}>
                <div style={{ color: C.red, fontWeight: 900 }}>{e.exception_code}</div>
                <div>{e.delivery_way_id || e.tracking_no || e.pickup_id}</div>
                <div style={{ color: C.sub, fontSize: 12 }}>{e.reason}</div>
              </div>
            )) : <div style={{ color: C.sub }}>No open warehouse exceptions.</div>}
          </section>
        </aside>
      </section>
    </main>
  );
}
