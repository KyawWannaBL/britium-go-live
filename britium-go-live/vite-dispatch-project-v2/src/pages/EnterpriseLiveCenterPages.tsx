// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  RefreshCw,
  Search,
  Truck,
  Send,
  Banknote,
  Download,
  CheckCircle2,
  Activity,
} from "lucide-react";

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

function text(v: any, fallback = "-") {
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

function btn(kind: "plain" | "gold" | "blue" | "green" | "red" = "plain") {
  const map: any = {
    plain: { bg: C.panel2, fg: C.text, border: C.border },
    gold: { bg: C.gold, fg: C.bg, border: C.gold },
    blue: { bg: C.blue, fg: C.bg, border: C.blue },
    green: { bg: C.green, fg: C.bg, border: C.green },
    red: { bg: "rgba(248,113,113,0.12)", fg: C.red, border: "rgba(248,113,113,0.65)" },
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
    s === "SETTLED" || s === "FINANCE_SETTLED" || s === "DELIVERED" || s === "PAID" ? C.green :
    s.includes("PENDING") || s === "LOADED_TO_VEHICLE" ? C.gold :
    s === "HANDOVER_TO_RIDER" || s === "HANDED_TO_RIDER" ? C.blue :
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

function exportCsv(filename: string, rows: any[]) {
  const allKeys = Array.from(new Set(rows.flatMap((r) => Object.keys(r || {}))));
  const safeKeys = allKeys.filter((k) => typeof rows[0]?.[k] !== "object");
  const csv = [
    safeKeys.join(","),
    ...rows.map((r) => safeKeys.map((k) => `"${String(r?.[k] ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Header({ title, subtitle, tag, onRefresh, loading, actions }: any) {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={{ color: C.gold, fontSize: 12, fontWeight: 900, letterSpacing: "0.28em" }}>{tag}</div>
          <h1 style={{ margin: "8px 0 4px", fontSize: 24 }}>{title}</h1>
          <p style={{ margin: 0, color: C.sub }}>{subtitle}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {actions}
          <button onClick={onRefresh} disabled={loading} style={btn("plain")}>
            <RefreshCw size={16} /> {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>
    </Card>
  );
}

function SummaryCards({ cards }: any) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 12 }}>
      {cards.map((c: any) => (
        <Card key={c.label} style={{ padding: 12 }}>
          <div style={{ color: C.sub, fontSize: 11 }}>{c.label}</div>
          <strong style={{ color: c.color || C.gold, fontSize: 18 }}>{c.value}</strong>
        </Card>
      ))}
    </div>
  );
}

function SearchBar({ query, setQuery, placeholder }: any) {
  return (
    <div style={{ position: "relative" }}>
      <Search size={16} style={{ position: "absolute", left: 12, top: 13, color: C.sub }} />
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} style={{ ...input(), paddingLeft: 36 }} />
    </div>
  );
}

function LiveTable({ rows, activeRow, setActiveRow, columns, emptyText }: any) {
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 14 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1200 }}>
        <thead>
          <tr style={{ background: C.gold, color: C.bg, textTransform: "uppercase", fontSize: 11 }}>
            {columns.map((c: any) => (
              <th key={c.key} style={{ padding: 10, textAlign: c.align || "left" }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((r: any, i: number) => (
            <tr
              key={`${r.delivery_way_id || r.code || r.rule_id || i}-${i}`}
              onClick={() => setActiveRow(r)}
              style={{
                borderTop: `1px solid ${C.border}`,
                background: activeRow === r ? "rgba(246,184,75,0.08)" : "transparent",
                cursor: "pointer",
              }}
            >
              {columns.map((c: any) => (
                <td key={c.key} style={{ padding: 10, textAlign: c.align || "left" }}>
                  {c.render ? c.render(r) : text(r[c.key])}
                </td>
              ))}
            </tr>
          )) : (
            <tr>
              <td colSpan={columns.length} style={{ padding: 28, color: C.sub, textAlign: "center" }}>
                {emptyText || "No rows found."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function useRows(loader: () => Promise<any>, rowSelector: (data: any) => any[]) {
  const [data, setData] = useState<any>({});
  const [rows, setRows] = useState<any[]>([]);
  const [activeRow, setActiveRow] = useState<any>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const out = await loader();
      if (out?.ok === false) throw new Error(out?.error || "Load failed.");
      const nextRows = rowSelector(out);
      setData(out || {});
      setRows(nextRows);
      if (!activeRow && nextRows.length) setActiveRow(nextRows[0]);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not load data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return { data, rows, setRows, activeRow, setActiveRow, query, setQuery, loading, error, message, setMessage, setError, load };
}

export function WarehouseLifecycleLivePage() {
  const state = useRows(
    async () => {
      const { data, error } = await supabase.rpc("be_warehouse_wayplan_center", { p_limit: 500 });
      if (error) throw error;
      return data;
    },
    (d) => Array.isArray(d?.rows) ? d.rows : []
  );

  const filtered = useMemo(() => {
    const q = state.query.toLowerCase().trim();
    return state.rows.filter((r) => !q || [r.wayplan_id, r.delivery_way_id, r.pickup_id, r.rider_code, r.vehicle_code, r.recipient_name, r.address].join(" ").toLowerCase().includes(q));
  }, [state.rows, state.query]);

  async function run(action: string, whole = false) {
    const row = state.activeRow;
    if (!row?.wayplan_id) {
      state.setError("Select a wayplan row first.");
      return;
    }
    state.setError("");
    const payload: any = { wayplan_id: row.wayplan_id, action, actor: "warehouse_lifecycle", notes: `Warehouse Lifecycle ${action}` };
    if (!whole) payload.delivery_way_id = row.delivery_way_id;

    const { data, error } = await supabase.rpc("be_warehouse_wayplan_action", { p_payload: payload });
    if (error || data?.ok === false) {
      state.setError(error?.message || data?.error || "Warehouse action failed.");
      return;
    }
    state.setMessage(`${action} completed. Affected stops: ${data?.affected_stops || 0}`);
    await state.load();
  }

  const s = state.data?.summary || {};

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 20 }}>
      <div style={{ display: "grid", gap: 16 }}>
        <Header
          tag="WAREHOUSE OPERATIONS"
          title="Warehouse Lifecycle"
          subtitle="Live wayplan loading, handover, dispatch and warehouse stop status."
          loading={state.loading}
          onRefresh={state.load}
          actions={
            <>
              <button onClick={() => run("load_vehicle", true)} style={btn("gold")}><Truck size={16} /> Load Wayplan</button>
              <button onClick={() => run("handover_rider", true)} style={btn("green")}><Send size={16} /> Handover Wayplan</button>
              <button onClick={() => run("dispatch", true)} style={btn("blue")}><CheckCircle2 size={16} /> Mark Dispatched</button>
            </>
          }
        />
        {state.error && <div style={{ border: `1px solid ${C.red}`, color: C.red, borderRadius: 14, padding: 12 }}>{state.error}</div>}
        {state.message && <div style={{ border: `1px solid ${C.green}`, color: C.green, borderRadius: 14, padding: 12 }}>{state.message}</div>}
        <SummaryCards cards={[
          { label: "Total Stops", value: s.total_stops || 0 },
          { label: "Loaded", value: s.loaded_to_vehicle || 0, color: C.gold },
          { label: "Handover", value: s.handed_over_to_rider || 0, color: C.blue },
          { label: "Delivered", value: s.delivered || 0, color: C.green },
          { label: "Pending Field", value: s.pending_field_action || 0, color: C.red },
        ]} />
        <Card><SearchBar query={state.query} setQuery={state.setQuery} placeholder="Search wayplan, waybill, rider, vehicle, customer..." /></Card>
        <Card>
          <LiveTable
            rows={filtered}
            activeRow={state.activeRow}
            setActiveRow={state.setActiveRow}
            columns={[
              { key: "stop_status", label: "Status", render: (r) => <Badge status={r.stop_status} /> },
              { key: "delivery_way_id", label: "Waybill", render: (r) => <><div style={{ color: C.gold, fontWeight: 900 }}>{r.delivery_way_id}</div><div style={{ color: C.sub, fontSize: 11 }}>{r.wayplan_id}</div></> },
              { key: "stop_sequence", label: "Stop" },
              { key: "recipient_name", label: "Recipient" },
              { key: "address", label: "Address", render: (r) => <div style={{ maxWidth: 360, whiteSpace: "normal" }}>{text(r.address, "No address")}</div> },
              { key: "rider_code", label: "Rider / Vehicle", render: (r) => <><div>{text(r.rider_code)} / {text(r.rider_name)}</div><div style={{ color: C.sub, fontSize: 11 }}>{text(r.vehicle_code)} / {text(r.vehicle_name)}</div></> },
              { key: "cod_amount", label: "COD", align: "right", render: (r) => money(r.cod_amount) },
              { key: "handed_over_to_rider_at", label: "Handover", render: (r) => dateText(r.handed_over_to_rider_at) },
            ]}
          />
        </Card>
      </div>
    </main>
  );
}

export function FinancePortalLivePage() {
  const state = useRows(
    async () => {
      const { data, error } = await supabase.rpc("be_finance_portal_center");
      if (error) throw error;
      return data;
    },
    (d) => Array.isArray(d?.cod_rows) ? d.cod_rows : []
  );

  const s = state.data || {};
  const fs = s.finance_summary || {};
  const ws = s.wallet_summary || {};

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 20 }}>
      <div style={{ display: "grid", gap: 16 }}>
        <Header tag="FINANCE OPERATIONS" title="Finance Portal" subtitle="Live COD, settlement, wallet and operations finance summary." loading={state.loading} onRefresh={state.load} />
        {state.error && <div style={{ border: `1px solid ${C.red}`, color: C.red, borderRadius: 14, padding: 12 }}>{state.error}</div>}
        <SummaryCards cards={[
          { label: "Today Revenue", value: money(s.today_revenue), color: C.green },
          { label: "Pending COD", value: money(s.pending_cod_collection), color: C.red },
          { label: "Settlement Rows", value: s.settlement_queue || 0, color: C.gold },
          { label: "Settled COD", value: money(fs.settled), color: C.green },
          { label: "Workforce Pending", value: money(ws.pending_amount), color: C.gold },
        ]} />
        <Card>
          <LiveTable
            rows={state.rows}
            activeRow={state.activeRow}
            setActiveRow={state.setActiveRow}
            columns={[
              { key: "settlement_status", label: "Status", render: (r) => <Badge status={r.settlement_status} /> },
              { key: "delivery_way_id", label: "Waybill" },
              { key: "rider_name", label: "Rider" },
              { key: "recipient_name", label: "Recipient" },
              { key: "cod_collected", label: "COD", align: "right", render: (r) => money(r.cod_collected) },
              { key: "delivery_fee", label: "Fee", align: "right", render: (r) => money(r.delivery_fee) },
              { key: "settlement_reference", label: "Reference" },
              { key: "settled_at", label: "Settled At", render: (r) => dateText(r.settled_at) },
            ]}
          />
        </Card>
      </div>
    </main>
  );
}

export function CodSettlementLivePage() {
  const state = useRows(
    async () => {
      const { data, error } = await supabase.rpc("be_finance_wayplan_cod_center", { p_limit: 500 });
      if (error) throw error;
      return data;
    },
    (d) => Array.isArray(d?.rows) ? d.rows : []
  );

  const filtered = useMemo(() => {
    const q = state.query.toLowerCase().trim();
    return state.rows.filter((r) => !q || [r.wayplan_id, r.delivery_way_id, r.rider_code, r.recipient_name, r.settlement_status].join(" ").toLowerCase().includes(q));
  }, [state.rows, state.query]);

  async function settle() {
    const r = state.activeRow;
    if (!r?.delivery_way_id) {
      state.setError("Select a COD settlement row first.");
      return;
    }

    const ref = r.settlement_reference || `CASH-${r.rider_code || "RIDER"}-${String(r.delivery_way_id).replace(/[^A-Z0-9]/gi, "")}`;
    const { data, error } = await supabase.rpc("be_finance_settle_wayplan_cod", {
      p_payload: { wayplan_id: r.wayplan_id, delivery_way_id: r.delivery_way_id, settlement_reference: ref, actor: "cod_settlement_center" },
    });

    if (error || data?.ok === false) {
      state.setError(error?.message || data?.error || "Settlement failed.");
      return;
    }

    state.setMessage(`Settled rows: ${data?.settled_count || 0}`);
    await state.load();
  }

  const s = state.data?.summary || {};

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 20 }}>
      <div style={{ display: "grid", gap: 16 }}>
        <Header
          tag="COD SETTLEMENT"
          title="COD Settlement Center"
          subtitle="Settle rider COD cash collections with finance reference tracking."
          loading={state.loading}
          onRefresh={state.load}
          actions={<button onClick={settle} style={btn("green")}><Banknote size={16} /> Settle Selected</button>}
        />
        {state.error && <div style={{ border: `1px solid ${C.red}`, color: C.red, borderRadius: 14, padding: 12 }}>{state.error}</div>}
        {state.message && <div style={{ border: `1px solid ${C.green}`, color: C.green, borderRadius: 14, padding: 12 }}>{state.message}</div>}
        <SummaryCards cards={[
          { label: "Collected", value: money(s.total_collected), color: C.green },
          { label: "Pending", value: money(s.pending_settlement), color: C.red },
          { label: "Settled", value: money(s.settled), color: C.green },
          { label: "Delivered COD", value: s.delivered_cod_count || 0, color: C.gold },
        ]} />
        <Card><SearchBar query={state.query} setQuery={state.setQuery} placeholder="Search wayplan, waybill, rider, customer..." /></Card>
        <Card>
          <LiveTable
            rows={filtered}
            activeRow={state.activeRow}
            setActiveRow={state.setActiveRow}
            columns={[
              { key: "settlement_status", label: "Status", render: (r) => <Badge status={r.settlement_status} /> },
              { key: "delivery_way_id", label: "Waybill" },
              { key: "rider_name", label: "Rider" },
              { key: "recipient_name", label: "Recipient" },
              { key: "cod_collected", label: "COD", align: "right", render: (r) => money(r.cod_collected) },
              { key: "delivery_fee", label: "Fee", align: "right", render: (r) => money(r.delivery_fee) },
              { key: "settlement_reference", label: "Reference" },
              { key: "settled_at", label: "Settled At", render: (r) => dateText(r.settled_at) },
            ]}
          />
        </Card>
      </div>
    </main>
  );
}

export function FinanceReportLivePage() {
  const state = useRows(
    async () => {
      const { data, error } = await supabase.rpc("be_finance_report_center");
      if (error) throw error;
      return data;
    },
    (d) => Array.isArray(d?.daily_revenue) ? d.daily_revenue : []
  );

  const profit = state.data?.profit_summary || {};
  const cod = state.data?.cod_status_report || {};
  const wallets = Array.isArray(state.data?.workforce_earnings) ? state.data.workforce_earnings : [];

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 20 }}>
      <div style={{ display: "grid", gap: 16 }}>
        <Header
          tag="FINANCE REPORTS"
          title="Finance Report Center"
          subtitle="Live revenue, COD, delivery fee, workforce payout and gross margin report."
          loading={state.loading}
          onRefresh={state.load}
          actions={<button onClick={() => exportCsv("finance-report.csv", [...state.rows, ...wallets])} style={btn("blue")}><Download size={16} /> Export CSV</button>}
        />
        {state.error && <div style={{ border: `1px solid ${C.red}`, color: C.red, borderRadius: 14, padding: 12 }}>{state.error}</div>}
        <SummaryCards cards={[
          { label: "Total Collected", value: money(profit.total_collected), color: C.green },
          { label: "Delivery Fees", value: money(profit.delivery_fees), color: C.gold },
          { label: "Workforce Pending", value: money(profit.workforce_pending), color: C.red },
          { label: "Gross Margin", value: money(profit.estimated_gross_margin), color: C.green },
          { label: "Pending COD", value: money(cod.pending_settlement), color: C.red },
        ]} />
        <Card>
          <h2 style={{ marginTop: 0 }}>COD Settlement Report</h2>
          <LiveTable
            rows={state.rows}
            activeRow={state.activeRow}
            setActiveRow={state.setActiveRow}
            columns={[
              { key: "settlement_status", label: "Status", render: (r) => <Badge status={r.settlement_status} /> },
              { key: "delivery_way_id", label: "Waybill" },
              { key: "rider_name", label: "Rider" },
              { key: "cod_collected", label: "COD", align: "right", render: (r) => money(r.cod_collected) },
              { key: "delivery_fee", label: "Fee", align: "right", render: (r) => money(r.delivery_fee) },
              { key: "settlement_reference", label: "Reference" },
            ]}
          />
        </Card>
        <Card>
          <h2 style={{ marginTop: 0 }}>Workforce Earnings</h2>
          <LiveTable
            rows={wallets}
            activeRow={state.activeRow}
            setActiveRow={state.setActiveRow}
            columns={[
              { key: "wallet_status", label: "Status", render: (r) => <Badge status={r.wallet_status} /> },
              { key: "worker_code", label: "Worker" },
              { key: "worker_name", label: "Name" },
              { key: "worker_role", label: "Role" },
              { key: "amount", label: "Amount", align: "right", render: (r) => money(r.amount) },
              { key: "reference_no", label: "Reference" },
            ]}
          />
        </Card>
      </div>
    </main>
  );
}

export function WorkforceWalletsLivePage() {
  const state = useRows(
    async () => {
      const { data, error } = await supabase.rpc("be_workforce_wallet_center", { p_limit: 500 });
      if (error) throw error;
      return data;
    },
    (d) => Array.isArray(d?.rows) ? d.rows : []
  );

  const s = state.data?.summary || {};

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 20 }}>
      <div style={{ display: "grid", gap: 16 }}>
        <Header tag="WORKFORCE PAYOUTS" title="Workforce Wallets" subtitle="Live rider, driver and helper earnings from delivered wayplan operations." loading={state.loading} onRefresh={state.load} />
        {state.error && <div style={{ border: `1px solid ${C.red}`, color: C.red, borderRadius: 14, padding: 12 }}>{state.error}</div>}
        <SummaryCards cards={[
          { label: "Wallet Records", value: s.total_records || 0 },
          { label: "Pending", value: money(s.pending_amount), color: C.gold },
          { label: "Paid", value: money(s.paid_amount), color: C.green },
          { label: "Rider", value: money(s.rider_amount), color: C.blue },
          { label: "Driver", value: money(s.driver_amount), color: C.green },
          { label: "Helper", value: money(s.helper_amount), color: C.gold },
        ]} />
        <Card>
          <LiveTable
            rows={state.rows}
            activeRow={state.activeRow}
            setActiveRow={state.setActiveRow}
            columns={[
              { key: "wallet_status", label: "Status", render: (r) => <Badge status={r.wallet_status} /> },
              { key: "worker_code", label: "Code" },
              { key: "worker_name", label: "Name" },
              { key: "worker_role", label: "Role" },
              { key: "earning_type", label: "Type" },
              { key: "amount", label: "Amount", align: "right", render: (r) => money(r.amount) },
              { key: "delivery_way_id", label: "Waybill / Wayplan" },
              { key: "earned_at", label: "Earned At", render: (r) => dateText(r.earned_at) },
            ]}
          />
        </Card>
      </div>
    </main>
  );
}

export function CommissionCenterLivePage() {
  const state = useRows(
    async () => {
      const { data, error } = await supabase.rpc("be_commission_center", { p_limit: 500 });
      if (error) throw error;
      return data;
    },
    (d) => Array.isArray(d?.wallets) ? d.wallets : []
  );

  const s = state.data?.summary || {};
  const rules = Array.isArray(state.data?.rules) ? state.data.rules : [];

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 20 }}>
      <div style={{ display: "grid", gap: 16 }}>
        <Header tag="COMMISSION CONTROL" title="Commission Center" subtitle="Active commission rules and calculated workforce commissions." loading={state.loading} onRefresh={state.load} />
        {state.error && <div style={{ border: `1px solid ${C.red}`, color: C.red, borderRadius: 14, padding: 12 }}>{state.error}</div>}
        <SummaryCards cards={[
          { label: "Active Rules", value: s.active_rules || 0, color: C.gold },
          { label: "Wallet Records", value: s.wallet_records || 0, color: C.blue },
          { label: "Pending Commission", value: money(s.total_commission_pending), color: C.gold },
          { label: "Paid Commission", value: money(s.total_commission_paid), color: C.green },
        ]} />
        <Card>
          <h2 style={{ marginTop: 0 }}>Active Rules</h2>
          <LiveTable
            rows={rules}
            activeRow={state.activeRow}
            setActiveRow={state.setActiveRow}
            columns={[
              { key: "rule_id", label: "Rule" },
              { key: "role", label: "Role" },
              { key: "rate_type", label: "Rate Type" },
              { key: "base_rate", label: "Base Rate", align: "right", render: (r) => money(r.base_rate) },
              { key: "is_active", label: "Active", render: (r) => <Badge status={r.is_active ? "ACTIVE" : "INACTIVE"} /> },
            ]}
          />
        </Card>
        <Card>
          <h2 style={{ marginTop: 0 }}>Calculated Commissions</h2>
          <LiveTable
            rows={state.rows}
            activeRow={state.activeRow}
            setActiveRow={state.setActiveRow}
            columns={[
              { key: "wallet_status", label: "Status", render: (r) => <Badge status={r.wallet_status} /> },
              { key: "worker_code", label: "Worker" },
              { key: "worker_name", label: "Name" },
              { key: "worker_role", label: "Role" },
              { key: "earning_type", label: "Type" },
              { key: "amount", label: "Amount", align: "right", render: (r) => money(r.amount) },
              { key: "reference_no", label: "Reference" },
            ]}
          />
        </Card>
      </div>
    </main>
  );
}
