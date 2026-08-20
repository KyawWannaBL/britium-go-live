// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  RefreshCw,
  Banknote,
  CheckCircle2,
  Download,
  FileText,
  Search,
} from "lucide-react";

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
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
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

function btn(kind: "gold" | "blue" | "green" | "red" | "plain" = "plain") {
  const map: any = {
    gold: { bg: C.gold, fg: C.bg, border: C.gold },
    blue: { bg: C.blue, fg: C.bg, border: C.blue },
    green: { bg: C.green, fg: C.bg, border: C.green },
    red: { bg: "rgba(248,113,113,0.12)", fg: C.red, border: "rgba(248,113,113,0.65)" },
    plain: { bg: C.panel2, fg: C.text, border: C.border },
  };
  const v = map[kind];
  return {
    border: `1px solid ${v.border}`,
    background: v.bg,
    color: v.fg,
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

function Badge({ status }: { status: string }) {
  const s = String(status || "").toUpperCase();
  const color = s === "SETTLED" ? C.green : s.includes("PENDING") ? C.gold : C.blue;
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

export default function FinanceCodCenterPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Row>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [activeRow, setActiveRow] = useState<Row | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [settlementReference, setSettlementReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const statusOk = filter === "ALL" || String(r.settlement_status || "").toUpperCase() === filter;
      const qOk =
        !q ||
        [
          r.wayplan_id,
          r.delivery_way_id,
          r.waybill_no,
          r.rider_code,
          r.rider_name,
          r.recipient_name,
          r.recipient_phone,
          r.settlement_reference,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      return statusOk && qOk;
    });
  }, [rows, filter, query]);

  const selectedRows = useMemo(
    () => visibleRows.filter((r) => selected[`${r.wayplan_id}|${r.delivery_way_id}`]),
    [visibleRows, selected]
  );

  const selectedTotal = selectedRows.reduce((sum, r) => sum + Number(r.cod_collected || 0), 0);

  async function loadData() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const { data, error } = await supabase.rpc("be_finance_wayplan_cod_center", {
        p_limit: 500,
      });

      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.error || "Finance COD load failed.");

      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setSummary(data?.summary || {});
      if (!activeRow && Array.isArray(data?.rows) && data.rows.length) {
        setActiveRow(data.rows[0]);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not load finance COD center.");
    } finally {
      setLoading(false);
    }
  }

  function toggleRow(row: Row) {
    const key = `${row.wayplan_id}|${row.delivery_way_id}`;
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
    setActiveRow(row);
  }

  function toggleAll() {
    const all = visibleRows.length > 0 && selectedRows.length === visibleRows.length;
    if (all) {
      setSelected({});
      return;
    }

    const next: Record<string, boolean> = {};
    visibleRows.forEach((r) => {
      next[`${r.wayplan_id}|${r.delivery_way_id}`] = true;
    });
    setSelected(next);
  }

  async function settleSelected() {
    const targets = selectedRows.length ? selectedRows : activeRow ? [activeRow] : [];

    if (!targets.length) {
      setError("Select at least one COD row to settle.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      let settledCount = 0;
      const baseRef =
        settlementReference.trim() ||
        `CASH-${targets[0]?.rider_code || "RIDER"}-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")}`;

      for (const row of targets) {
        const { data, error } = await supabase.rpc("be_finance_settle_wayplan_cod", {
          p_payload: {
            wayplan_id: row.wayplan_id,
            delivery_way_id: row.delivery_way_id,
            settlement_reference: targets.length > 1 ? `${baseRef}-${settledCount + 1}` : baseRef,
            actor: "finance_cod_center",
          },
        });

        if (error) throw error;
        if (data?.ok === false) throw new Error(data?.error || "Settlement failed.");
        settledCount += Number(data?.settled_count || 0);
      }

      setMessage(`Settled ${settledCount} COD row(s).`);
      setSelected({});
      await loadData();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not settle COD.");
    } finally {
      setLoading(false);
    }
  }

  async function settleWholeWayplan() {
    if (!activeRow?.wayplan_id) {
      setError("Select a wayplan row first.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const ref =
        settlementReference.trim() ||
        `CASH-${activeRow.rider_code || "RIDER"}-${String(activeRow.wayplan_id).replace(/[^A-Z0-9]/gi, "")}`;

      const { data, error } = await supabase.rpc("be_finance_settle_wayplan_cod", {
        p_payload: {
          wayplan_id: activeRow.wayplan_id,
          settlement_reference: ref,
          actor: "finance_cod_center",
        },
      });

      if (error) throw error;
      if (data?.ok === false) throw new Error(data?.error || "Wayplan settlement failed.");

      setMessage(`Wayplan ${activeRow.wayplan_id} settled. Rows updated: ${data?.settled_count || 0}.`);
      setSelected({});
      await loadData();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not settle whole wayplan.");
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    const data = visibleRows;
    const headers = [
      "wayplan_id",
      "delivery_way_id",
      "waybill_no",
      "rider_code",
      "rider_name",
      "recipient_name",
      "recipient_phone",
      "cod_expected",
      "cod_collected",
      "delivery_fee",
      "settlement_status",
      "settlement_reference",
      "delivered_at",
      "settled_at",
    ];

    const csv = [
      headers.join(","),
      ...data.map((r) =>
        headers
          .map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "finance-cod-settlement.csv";
    a.click();
    URL.revokeObjectURL(url);
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
              <div style={{ color: C.green, fontSize: 12, fontWeight: 900, letterSpacing: "0.28em" }}>FINANCE OPERATIONS</div>
              <h1 style={{ margin: "8px 0 4px", fontSize: 24 }}>Finance COD Settlement Center</h1>
              <p style={{ margin: 0, color: C.sub }}>Settle rider COD collections from delivered wayplan stops.</p>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={loadData} disabled={loading} style={btn("plain")}>
                <RefreshCw size={16} /> Refresh
              </button>
              <button onClick={settleSelected} disabled={loading} style={btn("green")}>
                <CheckCircle2 size={16} /> Settle Selected
              </button>
              <button onClick={settleWholeWayplan} disabled={loading || !activeRow} style={btn("gold")}>
                <Banknote size={16} /> Settle Whole Wayplan
              </button>
              <button onClick={exportCsv} style={btn("blue")}>
                <Download size={16} /> Export CSV
              </button>
            </div>
          </div>
        </Card>

        {error && <div style={{ border: `1px solid ${C.red}`, background: "rgba(248,113,113,0.12)", color: C.red, borderRadius: 14, padding: 12 }}>{error}</div>}
        {message && <div style={{ border: `1px solid ${C.green}`, background: "rgba(52,211,153,0.12)", color: C.green, borderRadius: 14, padding: 12 }}>{message}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(140px, 1fr))", gap: 12 }}>
          <Card style={{ padding: 12 }}><div style={{ color: C.sub, fontSize: 11 }}>Rows</div><strong style={{ color: C.gold, fontSize: 22 }}>{rows.length}</strong></Card>
          <Card style={{ padding: 12 }}><div style={{ color: C.sub, fontSize: 11 }}>Total Expected</div><strong style={{ color: C.gold, fontSize: 16 }}>{money(summary.total_expected)}</strong></Card>
          <Card style={{ padding: 12 }}><div style={{ color: C.sub, fontSize: 11 }}>Total Collected</div><strong style={{ color: C.green, fontSize: 16 }}>{money(summary.total_collected)}</strong></Card>
          <Card style={{ padding: 12 }}><div style={{ color: C.sub, fontSize: 11 }}>Pending</div><strong style={{ color: C.red, fontSize: 16 }}>{money(summary.pending_settlement)}</strong></Card>
          <Card style={{ padding: 12 }}><div style={{ color: C.sub, fontSize: 11 }}>Settled</div><strong style={{ color: C.green, fontSize: 16 }}>{money(summary.settled)}</strong></Card>
        </div>

        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 260px auto auto", gap: 10, marginBottom: 12, alignItems: "center" }}>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} style={input()}>
              <option value="ALL">All Status</option>
              <option value="PENDING_SETTLEMENT">Pending Settlement</option>
              <option value="SETTLED">Settled</option>
            </select>

            <div style={{ position: "relative" }}>
              <Search size={16} style={{ position: "absolute", left: 12, top: 13, color: C.sub }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                field="Search wayplan, waybill, rider, customer..."
                style={{ ...input(), paddingLeft: 36 }}
              />
            </div>

            <input
              value={settlementReference}
              onChange={(e) => setSettlementReference(e.target.value)}
              field="Settlement reference"
              style={input()}
            />

            <button onClick={toggleAll} style={btn("plain")}>
              {selectedRows.length === visibleRows.length && visibleRows.length ? "Clear" : "Select All"}
            </button>

            <div style={{ color: C.sub, fontSize: 12 }}>
              Selected: <strong style={{ color: C.gold }}>{selectedRows.length}</strong> / {money(selectedTotal)}
            </div>
          </div>

          <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1200 }}>
              <thead>
                <tr style={{ background: C.gold, color: C.bg, textTransform: "uppercase", fontSize: 11 }}>
                  <th style={{ padding: 10, textAlign: "left" }}>Select</th>
                  <th style={{ padding: 10, textAlign: "left" }}>Wayplan / Waybill</th>
                  <th style={{ padding: 10, textAlign: "left" }}>Rider</th>
                  <th style={{ padding: 10, textAlign: "left" }}>Recipient</th>
                  <th style={{ padding: 10, textAlign: "right" }}>COD</th>
                  <th style={{ padding: 10, textAlign: "right" }}>Fee</th>
                  <th style={{ padding: 10, textAlign: "left" }}>Status</th>
                  <th style={{ padding: 10, textAlign: "left" }}>Reference</th>
                  <th style={{ padding: 10, textAlign: "left" }}>Delivered</th>
                  <th style={{ padding: 10, textAlign: "left" }}>Settled</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length ? visibleRows.map((r) => {
                  const key = `${r.wayplan_id}|${r.delivery_way_id}`;
                  return (
                    <tr
                      key={key}
                      onClick={() => setActiveRow(r)}
                      style={{
                        borderTop: `1px solid ${C.border}`,
                        background: activeRow?.delivery_way_id === r.delivery_way_id ? "rgba(246,184,75,0.08)" : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <td style={{ padding: 10 }}>
                        <input type="checkbox" checked={Boolean(selected[key])} onChange={() => toggleRow(r)} onClick={(e) => e.stopPropagation()} />
                      </td>
                      <td style={{ padding: 10 }}>
                        <div style={{ color: C.gold, fontWeight: 900 }}>{r.wayplan_id}</div>
                        <div style={{ color: C.sub, fontSize: 11 }}>{r.delivery_way_id}</div>
                      </td>
                      <td style={{ padding: 10 }}>
                        <div>{text(r.rider_code)}</div>
                        <div style={{ color: C.sub, fontSize: 11 }}>{text(r.rider_name)}</div>
                      </td>
                      <td style={{ padding: 10 }}>
                        <div>{text(r.recipient_name)}</div>
                        <div style={{ color: C.sub, fontSize: 11 }}>{text(r.recipient_phone, "-")}</div>
                      </td>
                      <td style={{ padding: 10, textAlign: "right", color: C.green, fontWeight: 900 }}>{money(r.cod_collected)}</td>
                      <td style={{ padding: 10, textAlign: "right" }}>{money(r.delivery_fee)}</td>
                      <td style={{ padding: 10 }}><Badge status={r.settlement_status} /></td>
                      <td style={{ padding: 10 }}>{text(r.settlement_reference, "-")}</td>
                      <td style={{ padding: 10 }}>{dateText(r.delivered_at)}</td>
                      <td style={{ padding: 10 }}>{dateText(r.settled_at)}</td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={10} style={{ padding: 28, color: C.sub, textAlign: "center" }}>
                      No Finance COD records yet. Delivered COD stops will appear here automatically.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>
            <FileText size={16} /> Active Settlement Detail
          </h2>
          {activeRow ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, color: C.sub }}>
              <div><strong style={{ color: C.text }}>Wayplan:</strong><br />{activeRow.wayplan_id}</div>
              <div><strong style={{ color: C.text }}>Waybill:</strong><br />{activeRow.delivery_way_id}</div>
              <div><strong style={{ color: C.text }}>Rider:</strong><br />{activeRow.rider_code} / {activeRow.rider_name}</div>
              <div><strong style={{ color: C.text }}>Status:</strong><br /><Badge status={activeRow.settlement_status} /></div>
              <div><strong style={{ color: C.text }}>COD Expected:</strong><br />{money(activeRow.cod_expected)}</div>
              <div><strong style={{ color: C.text }}>COD Collected:</strong><br />{money(activeRow.cod_collected)}</div>
              <div><strong style={{ color: C.text }}>Delivery Fee:</strong><br />{money(activeRow.delivery_fee)}</div>
              <div><strong style={{ color: C.text }}>Reference:</strong><br />{text(activeRow.settlement_reference, "-")}</div>
            </div>
          ) : (
            <div style={{ color: C.sub }}>Select a COD row.</div>
          )}
        </Card>
      </div>
    </main>
  );
}
