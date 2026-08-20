// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Search, ShieldCheck } from "lucide-react";

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

function money(v: any) {
  return `${Number(v || 0).toLocaleString()} Ks`;
}

function text(v: any, fallback = "") {
  const out = String(v ?? "").trim();
  return out || fallback;
}

function dateText(v: any) {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

function input() {
  return {
    width: "100%",
    minHeight: 42,
    borderRadius: 12,
    border: `1px solid ${C.border}`,
    background: "#061524",
    color: C.text,
    padding: "10px 12px",
    outline: "none",
  } as React.CSSProperties;
}

function btn() {
  return {
    border: `1px solid ${C.border}`,
    background: C.panel2,
    color: C.text,
    borderRadius: 12,
    padding: "10px 14px",
    minHeight: 42,
    fontWeight: 900,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontSize: 12,
  } as React.CSSProperties;
}

function Card({ children, style }: any) {
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

function Badge({ status }: any) {
  const s = String(status || "").toUpperCase();
  const color =
    s === "FINANCE_SETTLED" ? C.green :
    s === "DELIVERED_PENDING_FINANCE" ? C.gold :
    s === "HANDED_TO_RIDER" ? C.blue :
    s.includes("FAILED") || s.includes("RETURN") ? C.red :
    C.sub;

  return (
    <span
      style={{
        display: "inline-flex",
        border: `1px solid ${color}`,
        background: `${color}22`,
        color,
        borderRadius: 999,
        padding: "4px 9px",
        fontSize: 11,
        fontWeight: 900,
      }}
    >
      {s || "-"}
    </span>
  );
}

export default function EnterpriseControlTowerPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [activeRow, setActiveRow] = useState<any>(null);
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter((r) => {
      const status = String(r.enterprise_status || "").toUpperCase();
      const statusOk = filter === "ALL" || status === filter;
      const qOk =
        !q ||
        [
          r.pickup_id,
          r.delivery_way_id,
          r.waybill_no,
          r.wayplan_id,
          r.rider_code,
          r.rider_name,
          r.vehicle_code,
          r.recipient_name,
          r.township,
          r.address,
          r.settlement_reference,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);

      return statusOk && qOk;
    });
  }, [rows, filter, query]);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const { data, error } = await supabase.rpc("be_enterprise_control_tower", {
        p_limit: 500,
      });

      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.error || "Control tower load failed.");

      const out = Array.isArray(data?.rows) ? data.rows : [];
      setRows(out);
      setSummary(data?.summary || {});
      if (!activeRow && out.length) setActiveRow(out[0]);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not load enterprise control tower.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 20 }}>
      <div style={{ display: "grid", gap: 16 }}>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ color: C.green, fontSize: 12, fontWeight: 900, letterSpacing: "0.28em" }}>
                ENTERPRISE CONTROL
              </div>
              <h1 style={{ margin: "8px 0 4px", fontSize: 24 }}>Enterprise Control Tower</h1>
              <p style={{ margin: 0, color: C.sub }}>
                End-to-end visibility across warehouse, wayplan, rider delivery, and finance settlement.
              </p>
            </div>

            <button onClick={loadData} disabled={loading} style={btn()}>
              <RefreshCw size={16} /> {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </Card>

        {error && (
          <div style={{ border: `1px solid ${C.red}`, background: "rgba(248,113,113,0.12)", color: C.red, borderRadius: 14, padding: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(130px, 1fr))", gap: 12 }}>
          <Card style={{ padding: 12 }}>
            <div style={{ color: C.sub, fontSize: 11 }}>Total</div>
            <strong style={{ color: C.gold, fontSize: 22 }}>{summary.total_records || 0}</strong>
          </Card>
          <Card style={{ padding: 12 }}>
            <div style={{ color: C.sub, fontSize: 11 }}>Handover</div>
            <strong style={{ color: C.blue, fontSize: 22 }}>{summary.handed_to_rider || 0}</strong>
          </Card>
          <Card style={{ padding: 12 }}>
            <div style={{ color: C.sub, fontSize: 11 }}>Delivered Pending Finance</div>
            <strong style={{ color: C.gold, fontSize: 22 }}>{summary.delivered_pending_finance || 0}</strong>
          </Card>
          <Card style={{ padding: 12 }}>
            <div style={{ color: C.sub, fontSize: 11 }}>Finance Settled</div>
            <strong style={{ color: C.green, fontSize: 22 }}>{summary.finance_settled || 0}</strong>
          </Card>
          <Card style={{ padding: 12 }}>
            <div style={{ color: C.sub, fontSize: 11 }}>Failed / Return</div>
            <strong style={{ color: C.red, fontSize: 22 }}>{summary.failed_or_returned || 0}</strong>
          </Card>
          <Card style={{ padding: 12 }}>
            <div style={{ color: C.sub, fontSize: 11 }}>COD Collected</div>
            <strong style={{ color: C.green, fontSize: 16 }}>{money(summary.total_cod_collected)}</strong>
          </Card>
        </div>

        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 10, marginBottom: 12 }}>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} style={input()}>
              <option value="ALL">All Status</option>
              <option value="HANDED_TO_RIDER">Handed to Rider</option>
              <option value="DELIVERED_PENDING_FINANCE">Delivered Pending Finance</option>
              <option value="FINANCE_SETTLED">Finance Settled</option>
              <option value="FAILED_DELIVERY">Failed Delivery</option>
              <option value="RETURN_TO_WAREHOUSE">Return to Warehouse</option>
            </select>

            <div style={{ position: "relative" }}>
              <Search size={16} style={{ position: "absolute", left: 12, top: 13, color: C.sub }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                field="Search pickup, waybill, wayplan, rider, customer..."
                style={{ ...input(), paddingLeft: 36 }}
              />
            </div>
          </div>

          <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1500 }}>
              <thead>
                <tr style={{ background: C.gold, color: C.bg, textTransform: "uppercase", fontSize: 11 }}>
                  <th style={{ padding: 10, textAlign: "left" }}>Status</th>
                  <th style={{ padding: 10, textAlign: "left" }}>Pickup / Waybill</th>
                  <th style={{ padding: 10, textAlign: "left" }}>Wayplan</th>
                  <th style={{ padding: 10, textAlign: "left" }}>Recipient</th>
                  <th style={{ padding: 10, textAlign: "left" }}>Warehouse</th>
                  <th style={{ padding: 10, textAlign: "left" }}>Rider / Vehicle</th>
                  <th style={{ padding: 10, textAlign: "right" }}>COD</th>
                  <th style={{ padding: 10, textAlign: "left" }}>Finance</th>
                  <th style={{ padding: 10, textAlign: "left" }}>Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length ? (
                  visibleRows.map((r, i) => (
                    <tr
                      key={`${r.delivery_way_id}-${i}`}
                      onClick={() => setActiveRow(r)}
                      style={{
                        borderTop: `1px solid ${C.border}`,
                        background: activeRow?.delivery_way_id === r.delivery_way_id ? "rgba(246,184,75,0.08)" : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <td style={{ padding: 10 }}><Badge status={r.enterprise_status} /></td>
                      <td style={{ padding: 10 }}>
                        <div style={{ color: C.gold, fontWeight: 900 }}>{text(r.pickup_id)}</div>
                        <div style={{ color: C.sub, fontSize: 11 }}>{text(r.delivery_way_id || r.waybill_no)}</div>
                      </td>
                      <td style={{ padding: 10 }}>
                        <div>{text(r.wayplan_id, "-")}</div>
                        <div style={{ color: C.sub, fontSize: 11 }}>Stop {text(r.stop_sequence, "-")}</div>
                      </td>
                      <td style={{ padding: 10 }}>
                        <div>{text(r.recipient_name, "Customer")}</div>
                        <div style={{ color: C.sub, fontSize: 11 }}>{text(r.township, "-")}</div>
                      </td>
                      <td style={{ padding: 10 }}>
                        <div>{text(r.wayplan_status, "-")}</div>
                        <div style={{ color: C.sub, fontSize: 11 }}>{text(r.stop_status, "-")}</div>
                      </td>
                      <td style={{ padding: 10 }}>
                        <div>{text(r.rider_code)} / {text(r.rider_name)}</div>
                        <div style={{ color: C.sub, fontSize: 11 }}>{text(r.vehicle_code)} / {text(r.vehicle_name)}</div>
                      </td>
                      <td style={{ padding: 10, textAlign: "right", color: C.green, fontWeight: 900 }}>
                        {money(r.cod_collected || r.cod_amount)}
                      </td>
                      <td style={{ padding: 10 }}>
                        <div>{text(r.settlement_status, "-")}</div>
                        <div style={{ color: C.sub, fontSize: 11 }}>{text(r.settlement_reference, "-")}</div>
                      </td>
                      <td style={{ padding: 10 }}>{dateText(r.last_activity_at)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} style={{ padding: 28, color: C.sub, textAlign: "center" }}>
                      No enterprise control tower rows found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>
            <ShieldCheck size={16} /> Active Parcel Control Detail
          </h2>
          {activeRow ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, color: C.sub }}>
              <div><strong style={{ color: C.text }}>Enterprise Status:</strong><br /><Badge status={activeRow.enterprise_status} /></div>
              <div><strong style={{ color: C.text }}>Pickup:</strong><br />{activeRow.pickup_id}</div>
              <div><strong style={{ color: C.text }}>Waybill:</strong><br />{activeRow.delivery_way_id}</div>
              <div><strong style={{ color: C.text }}>Wayplan:</strong><br />{activeRow.wayplan_id}</div>
              <div><strong style={{ color: C.text }}>Recipient:</strong><br />{activeRow.recipient_name}</div>
              <div><strong style={{ color: C.text }}>Rider:</strong><br />{activeRow.rider_code} / {activeRow.rider_name}</div>
              <div><strong style={{ color: C.text }}>Vehicle:</strong><br />{activeRow.vehicle_code} / {activeRow.vehicle_name}</div>
              <div><strong style={{ color: C.text }}>Finance:</strong><br />{text(activeRow.settlement_status, "-")} / {text(activeRow.settlement_reference, "-")}</div>
            </div>
          ) : (
            <div style={{ color: C.sub }}>Select a parcel row.</div>
          )}
        </Card>
      </div>
    </main>
  );
}
