import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Review = {
  id: string;
  delivery_way_id?: string;
  wayplan_id?: string;
  requested_weight_kg?: number;
  current_data_entry_weight_kg?: number;
  current_data_entry_cod?: number;
  reason?: string;
  requested_worker_code?: string;
  created_at?: string;
};
const panel: React.CSSProperties = { padding: 20, margin: "16px 0", background: "#102b45", color: "#eef8ff", border: "1px solid #1a3a5c", borderRadius: 16 };
const button: React.CSSProperties = { padding: "9px 14px", border: 0, borderRadius: 8, cursor: "pointer", fontWeight: 700, background: "#f6b84b", color: "#061524" };

export default function RiderWeightAmendmentReviews() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    setLoading(true); setError("");
    try {
      const { data, error } = await (supabase as any).rpc("be_finance_field_weight_review_queue_v1");
      if (error || data?.ok !== true) throw new Error(error?.message || data?.error || "Weight review queue unavailable");
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (e: any) { setError(e?.message || "Unable to load requests"); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (open) void refresh(); }, [open]);

  async function decide(row: Review, decision: "APPROVED" | "REJECTED") {
    const reason = (notes[row.id] || "").trim();
    if (reason.length < 5) { setError("Enter a review reason of at least five characters."); return; }
    if (!window.confirm(`${decision === "APPROVED" ? "Approve" : "Reject"} weight amendment for ${row.delivery_way_id || row.id}? This approval will NOT change COD or settlement balances.`)) return;
    setBusy(row.id); setError(""); setMessage("");
    try {
      const { data, error } = await (supabase as any).rpc("be_finance_decide_field_weight_review_v1", {
        p_request_id: row.id, p_decision: decision, p_reason: reason,
      });
      if (error || data?.ok !== true) throw new Error(error?.message || data?.error || "Decision failed");
      setMessage(`${decision} saved with audit trail. COD and settlement balances remain unchanged.`);
      await refresh();
    } catch (e: any) { setError(e?.message || "Unable to save decision"); }
    finally { setBusy(""); }
  }

  return <section style={panel} aria-label="Parcel Weight Reviews">
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20 }}>⚖️ Parcel Weight Reviews</h2>
        <p style={{ color: "#9cc2d9", margin: "6px 0 0", fontSize: 13 }}>Rider / Driver / Helper KG amendments — Finance approval queue</p>
      </div>
      <button type="button" style={button} onClick={() => setOpen(v => !v)} aria-expanded={open}>
        {open ? "Hide requests" : "Open weight amendment requests"}
      </button>
    </div>
    {open && <>
      <p style={{ fontSize: 13, color: "#f6b84b" }}>Approval records the weight-review decision only. COD and settlement corrections require the authorized Finance workflow.</p>
      <button type="button" style={button} disabled={loading || !!busy} onClick={() => void refresh()}>{loading ? "Loading..." : "Refresh requests"}</button>
      {error && <p role="alert" style={{ color: "#fca5a5" }}>{error}</p>}
      {message && <p role="status" style={{ color: "#86efac" }}>{message}</p>}
      {!loading && !error && rows.length === 0 && <p>No pending weight review requests were returned.</p>}
      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>{["Way ID / Wayplan", "Requested KG", "Registered KG", "Current COD", "Rider reason", "Submitted", "Finance decision"].map(h => <th key={h} style={{ borderBottom: "1px solid #35536b", padding: 10, textAlign: "left" }}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}>
            <td style={{ padding: 10 }}>{row.delivery_way_id || "—"}<div style={{ opacity: .7 }}>{row.wayplan_id || ""}</div></td>
            <td style={{ padding: 10 }}>{row.requested_weight_kg ?? "—"}</td>
            <td style={{ padding: 10 }}>{row.current_data_entry_weight_kg ?? "—"}</td>
            <td style={{ padding: 10 }}>{Number(row.current_data_entry_cod || 0).toLocaleString()} MMK</td>
            <td style={{ padding: 10 }}>{row.reason || "—"}<div style={{ opacity: .7 }}>{row.requested_worker_code || ""}</div></td>
            <td style={{ padding: 10 }}>{row.created_at ? new Date(row.created_at).toLocaleString() : "—"}</td>
            <td style={{ padding: 10, minWidth: 215 }}>
              <textarea aria-label={`Decision reason for ${row.delivery_way_id || row.id}`} value={notes[row.id] || ""} onChange={e => setNotes(v => ({ ...v, [row.id]: e.target.value }))} placeholder="Reason / evidence (required)" style={{ width: "100%", padding: 8, borderRadius: 6, color: "#111", background: "white" }} />
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button type="button" style={button} disabled={!!busy || loading || (notes[row.id] || "").trim().length < 5} onClick={() => void decide(row, "APPROVED")}>Approve</button>
                <button type="button" style={{ ...button, background: "#fecaca" }} disabled={!!busy || loading || (notes[row.id] || "").trim().length < 5} onClick={() => void decide(row, "REJECTED")}>Reject</button>
              </div>
            </td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </section>;
}
