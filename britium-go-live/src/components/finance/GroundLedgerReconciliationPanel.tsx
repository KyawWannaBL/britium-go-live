import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Read-only reconciliation of management-supplied October 2026 ground delivery sheets.
 * Never posts cash, changes parcel state, or marks a merchant settlement paid.
 * Access is additionally enforced by be_finance_ground_ledger_review_v1.
 */
type LedgerRow = {
  delivery_way_id: string;
  source_sheet: string;
  source_row: number;
  sheet_date: string;
  final_cod_mmk: number | string | null;
  cash_mmk: number | string | null;
  kpay_mmk: number | string | null;
  system_cod_amount: number | string | null;
  review_state: string;
};
const reviewTypes = [
  "MISSING_PRODUCTION_PARCEL",
  "RETURN_HISTORY_CONFLICT",
  "COD_AMOUNT_MISMATCH",
  "PAYMENT_SPLIT_EXCEPTION",
  "DELIVERY_RECONCILIATION_REQUIRED",
  "FINANCE_RECEIPT_REVIEW",
];
const mmk = (amount: unknown) =>
  amount == null ? "—" : `${Number(amount).toLocaleString("en-US")} MMK`;
const label = (state: string) => state.replaceAll("_", " ");

export default function GroundLedgerReconciliationPanel() {
  const [status, setStatus] = useState("ALL");
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const { data, error: rpcError } = await (supabase as any).rpc(
        "be_finance_ground_ledger_review_v1",
        { p_status: status, p_limit: 320 },
      );
      if (rpcError) throw rpcError;
      if (!data?.ok) throw new Error(data?.code || "Reconciliation unavailable");
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setSummary(data.summary || {});
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section aria-label="Ground delivery reconciliation" style={{ padding: 16, border: "1px solid #28445d", borderRadius: 12, marginBottom: 16 }}>
      <h2 style={{ margin: "0 0 8px" }}>Ground Delivered &amp; Settlement Reconciliation</h2>
      <p style={{ fontSize: 12, opacity: 0.82 }}>
        20–22 October 2026. The spreadsheet records management-reported collection, not independently verified
        Finance receipt or merchant disbursement. This screen cannot post payments or clear settlement holds.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {reviewTypes.map((type) => (
          <span key={type} style={{ padding: 6, border: "1px solid #33536f", borderRadius: 8, fontSize: 11 }}>
            {label(type)}: {summary[type] ?? 0}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <label htmlFor="ground-ledger-filter">Review category</label>
        <select id="ground-ledger-filter" value={status} onChange={(event) => setStatus(event.target.value)} style={{ color: "#fff", background: "#102b45", padding: 8, borderRadius: 8 }}>
          <option value="ALL">All records</option>
          {reviewTypes.map(type => <option key={type} value={type}>{label(type)}</option>)}
        </select>
        <button type="button" disabled={busy} onClick={() => void load()} style={{ padding: 8, borderRadius: 8 }}>
          {busy ? "Loading…" : "Refresh"}
        </button>
      </div>
      {error && <p role="alert" style={{ color: "#fca5a5" }}>{error}</p>}
      <div style={{ overflow: "auto", maxHeight: 460 }}>
        <table style={{ borderCollapse: "collapse", minWidth: 900, width: "100%", fontSize: 12 }}>
          <thead><tr>{["Sheet", "Row", "Way ID", "Ground COD", "Cash", "KPay", "System COD", "Review status"].map(col =>
            <th key={col} style={{ textAlign: "left", padding: 8, position: "sticky", top: 0, background: "#102b45" }}>{col}</th>
          )}</tr></thead>
          <tbody>{rows.map(row =>
            <tr key={row.delivery_way_id}>
              <td style={{ padding: 8 }}>{row.source_sheet}</td>
              <td style={{ padding: 8 }}>{row.source_row}</td>
              <td style={{ padding: 8 }}>{row.delivery_way_id}</td>
              <td style={{ padding: 8 }}>{mmk(row.final_cod_mmk)}</td>
              <td style={{ padding: 8 }}>{mmk(row.cash_mmk)}</td>
              <td style={{ padding: 8 }}>{mmk(row.kpay_mmk)}</td>
              <td style={{ padding: 8 }}>{mmk(row.system_cod_amount)}</td>
              <td style={{ padding: 8 }}>{label(row.review_state || "UNKNOWN")}</td>
            </tr>
          )}</tbody>
        </table>
      </div>
      {!busy && !error && <p style={{ fontSize: 12, opacity: 0.8 }}>Showing {rows.length} source-grounded Way IDs. Payment postings require the standard Finance verification process.</p>}
    </section>
  );
}
