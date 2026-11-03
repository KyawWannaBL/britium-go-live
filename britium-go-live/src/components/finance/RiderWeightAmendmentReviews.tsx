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
  const [quotes,setQuotes]=useState<Record<string,any>>({});
  const [policies,setPolicies]=useState<Record<string,"KEEP_COD"|"UPDATE_COD">>({});
  const [previewBusy,setPreviewBusy]=useState("");

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

  async function preview(row:Review) {
    setPreviewBusy(row.id);setError("");setMessage("");
    try {
      const {data,error}=await (supabase as any).rpc("be_finance_weight_review_quote_v2",{p_request_id:row.id});
      if(error||data?.ok!==true)throw new Error(error?.message||data?.error||"Calculation failed");
      setQuotes(previous=>({...previous,[row.id]:data}));
    }catch(e:any){setError(e?.message||"Unable to calculate new financial amounts")}
    finally{setPreviewBusy("")}
  }
  async function decide(row: Review, decision: "APPROVED" | "REJECTED") {
    const reason = (notes[row.id] || "").trim();
    if (reason.length < 8) { setError("Enter a review reason of at least eight characters."); return; }
    const policy=policies[row.id];
    const quote=quotes[row.id];
    if(decision==="APPROVED"&&(!quote||!policy)){setError("Preview recalculation and select the COD decision before approval.");return;}
    if(decision==="APPROVED"&&policy==="UPDATE_COD"&&quote?.cod_change_allowed!==true){
      setError("Collected or closed COD cannot be changed. Select Keep COD Unchanged.");return;
    }
    const newCod=policy==="UPDATE_COD"?quote?.proposed_cod_mmk:quote?.current_cod_mmk;
    if (!window.confirm(decision==="REJECTED"
      ? `Reject weight change for ${row.delivery_way_id||row.id}?`
      : `Approve ${row.requested_weight_kg} kg for ${row.delivery_way_id}? COD: ${Number(newCod||0).toLocaleString()} MMK (${policy}). Calculated delivery charge: ${Number(quote?.new_system_charge_mmk||0).toLocaleString()} MMK. ${quote?.cash_or_settlement_locked?"Existing financial balances remain locked; separate adjustment required.":"Review updated financial amounts before proceeding."}`))return;
    setBusy(row.id); setError(""); setMessage("");
    try {
      const { data, error } = await (supabase as any).rpc("be_finance_decide_weight_review_v2", {
        p_request_id: row.id, p_decision: decision,
        p_cod_policy: decision==="REJECTED"?"NOT_APPLICABLE":policy,p_reason:reason
      });
      if (error || data?.ok !== true) throw new Error(error?.message || data?.error || "Decision failed");
      setMessage(`${decision} saved with audit trail. ${data.application||"NO_CHANGE"}. ${decision==="APPROVED"?"Approved COD: "+Number(data.approved_cod_mmk||0).toLocaleString()+" MMK.":""} No automatic payment or settlement was posted.`);
      setQuotes(prev=>{const next={...prev};delete next[row.id];return next;});
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
      <p style={{ fontSize: 13, color: "#f6b84b" }}>Finance must preview the revised weight charges and explicitly choose whether COD changes. Collected or financially closed parcels require a separate adjustment, not direct cash rewriting.</p>
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
              <label style={{display:"block",marginBottom:5,fontWeight:700}} htmlFor={`weight-review-reason-${row.id}`}>Finance decision reason (minimum 8 characters)</label>
              <textarea id={`weight-review-reason-${row.id}`} aria-label={`Decision reason for ${row.delivery_way_id || row.id}`} aria-describedby={`weight-review-reason-help-${row.id}`} value={notes[row.id] || ""} onChange={e => setNotes(v => ({ ...v, [row.id]: e.target.value }))} placeholder="Example: Verified revised weight and COD against parcel evidence" style={{ width: "100%", padding: 8, borderRadius: 6, color: "#111", background: "white" }} />
              <p id={`weight-review-reason-help-${row.id}`} role="status" style={{fontSize:12,margin:"4px 0 8px",color:(notes[row.id]||"").trim().length>=8?"#86efac":"#fcd34d"}}>
                {(notes[row.id]||"").trim().length}/8 characters required. {(notes[row.id]||"").trim().length>=8?"Reason accepted.":"Enter a specific Finance justification to enable Approve or Reject."}
              </p>
              <button type="button" style={{...button,background:"#93c5fd",marginTop:6}}
                disabled={!!busy||!!previewBusy||loading} onClick={()=>void preview(row)}>
                {previewBusy===row.id?"Calculating...":"Preview recalculated amount"}
              </button>
              {quotes[row.id]&&<div style={{padding:9,marginTop:8,border:"1px solid #4b7997",borderRadius:8}}>
                <div>Registered weight: {quotes[row.id].registered_weight_kg} kg → Requested: {quotes[row.id].requested_weight_kg} kg</div>
                <div>Current COD: <strong>{Number(quotes[row.id].current_cod_mmk||0).toLocaleString()} MMK</strong></div>
                <div>Recalculated COD: <strong>{Number(quotes[row.id].proposed_cod_mmk||0).toLocaleString()} MMK</strong></div>
                <div>Delivery charge: {Number(quotes[row.id].old_system_charge_mmk||0).toLocaleString()} → <strong>{Number(quotes[row.id].new_system_charge_mmk||0).toLocaleString()} MMK</strong></div>
                <div>Weight surcharge: {Number(quotes[row.id].old_weight_surcharge_mmk||0).toLocaleString()} → {Number(quotes[row.id].new_weight_surcharge_mmk||0).toLocaleString()} MMK</div>
                <div style={{marginTop:8,fontWeight:700}}>Finance COD decision:</div>
                <label style={{display:"block"}}><input type="radio" name={`cod-policy-${row.id}`}
                  checked={policies[row.id]==="KEEP_COD"}
                  onChange={()=>setPolicies(v=>({...v,[row.id]:"KEEP_COD"}))}/>
                  Keep COD unchanged — {Number(quotes[row.id].current_cod_mmk||0).toLocaleString()} MMK
                </label>
                <label style={{display:"block"}}><input type="radio" name={`cod-policy-${row.id}`}
                  disabled={!quotes[row.id].cod_change_allowed}
                  checked={policies[row.id]==="UPDATE_COD"}
                  onChange={()=>setPolicies(v=>({...v,[row.id]:"UPDATE_COD"}))}/>
                  Change COD to recalculated amount — {Number(quotes[row.id].proposed_cod_mmk||0).toLocaleString()} MMK
                </label>
                <div>Merchant settlement if COD unchanged: {Number(quotes[row.id].keep_cod_merchant_settlement_mmk||0).toLocaleString()} MMK</div>
                <div>Merchant settlement if COD changed: {Number(quotes[row.id].update_cod_merchant_settlement_mmk||0).toLocaleString()} MMK</div>
                {quotes[row.id].cash_or_settlement_locked&&<p style={{color:"#fcd34d"}}>Cash or settlement is locked. Approval records a required Finance adjustment; no existing collected COD is overwritten.</p>}
              </div>}
              <p style={{fontSize:12,color:"#dbeafe",margin:"8px 0 4px"}}>
                {!(notes[row.id]||"").trim() || (notes[row.id]||"").trim().length<8
                  ? "Approval locked: enter at least 8 characters in the Finance decision reason."
                  : !quotes[row.id] ? "Approval locked: preview the recalculated amount first."
                  : !policies[row.id] ? "Approval locked: select Change COD or Keep COD unchanged."
                  : quotes[row.id].cash_or_settlement_locked && policies[row.id]==="UPDATE_COD"
                    ? "Approval locked: collected/closed COD cannot be changed."
                    : busy || previewBusy || loading ? "Approval locked: another operation is in progress."
                    : "Ready for Finance approval. Review the COD decision before confirming."}
              </p>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button type="button" title="Requires a recalculation preview, COD policy and Finance reason of at least 8 characters" style={button} disabled={!!busy || !!previewBusy || loading || !quotes[row.id] || !policies[row.id] || (notes[row.id] || "").trim().length < 8 || (policies[row.id]==="UPDATE_COD" && quotes[row.id]?.cod_change_allowed!==true)} onClick={() => void decide(row, "APPROVED")}>Approve</button>
                <button type="button" style={{ ...button, background: "#fecaca" }} disabled={!!busy || loading || (notes[row.id] || "").trim().length < 8} onClick={() => void decide(row, "REJECTED")}>Reject</button>
              </div>
            </td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </section>;
}
