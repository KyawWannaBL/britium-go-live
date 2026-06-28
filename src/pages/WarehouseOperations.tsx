import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, PackageCheck, QrCode, RefreshCw, ScanLine, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const C = { bg: "#061524", panel: "#0b2236", border: "#1a3a5c", gold: "#f6b84b", text: "#eef8ff", success: "#22c55e", error: "#ff4f86", info: "#38bdf8" };

// EXACT MAPPING FROM YOUR PROCESS_STATUS_MASTER JSON
const EVENTS = [
  { key: "RECEIVED_AT_ORIGIN", label: "Receive at Hub" },
  { key: "SORTING", label: "Start Sorting" },
  { key: "READY_FOR_DISPATCH", label: "Ready for Dispatch" },
  { key: "WAREHOUSE_HOLD", label: "Warehouse Hold (Exception)" },
];

export default function WarehouseOperations() {
  const [rows, setRows] = useState<any[]>([]);
  const [scanCode, setScanCode] = useState("");
  const [eventType, setEventType] = useState("RECEIVED_AT_ORIGIN");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<any>(null);

  async function load() {
    setLoading(true); setMessage(null);
    try {
      const { data, error } = await supabase
        .from("be_portal_pickup_requests")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      setRows(data || []);
    } catch (e: any) {
      setMessage({ type: "error", text: e?.message || "Failed to load queue." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  // --- THE UNIVERSAL WORKFLOW ENGINE CONNECTION ---
  async function runScan(code = scanCode) {
    const clean = String(code || "").trim();
    if (!clean) return setMessage({ type: "error", text: "Scan ID required." });

    setLoading(true); setMessage(null);

    try {
      const { error: rpcError } = await supabase.rpc("be_logistics_apply_workflow_event_strict", {
        p_pickup_id: clean,
        p_process_type: "WAREHOUSE",
        p_new_status: eventType,
        p_actor_role: "warehouse",
        p_actor_id: "warehouse_operator", // Link to actual user email if available
        p_notes: `Warehouse Scanner Action: ${eventType}`
      });

      if (rpcError) throw rpcError;
      setMessage({ type: "success", text: `Success! ${clean} updated to ${eventType}.` });
      setScanCode("");
      await load();
    } catch (e: any) {
      setMessage({ type: "error", text: e?.message || "Warehouse scan failed." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 18 }}>
        <header style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 22, display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: C.gold, fontSize: 12, fontWeight: 900 }}>WAREHOUSE OPERATIONS</div>
            <h1 style={{ margin: "8px 0", fontSize: 24 }}>Scan & Sort Hub</h1>
          </div>
          <button onClick={load} style={{ padding: "10px 16px", background: C.border, color: '#fff', borderRadius: 8, border: 'none', cursor: 'pointer' }}>Refresh</button>
        </header>

        {message && (
          <div style={{ padding: 14, borderRadius: 12, background: message.type === 'error' ? '#4a0521' : '#052e16', color: message.type === 'error' ? C.error : C.success }}>
            <strong>{message.type === 'error' ? 'ERROR: ' : 'SUCCESS: '}</strong> {message.text}
          </div>
        )}

        <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 22 }}>
          <h2 style={{ marginTop: 0 }}>QR / Barcode Terminal</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12 }}>
            <input 
              value={scanCode} 
              onChange={(e) => setScanCode(e.target.value)} 
              placeholder="Scan Pickup ID or Waybill..." 
              style={{ background: C.bg, border: `1px solid ${C.border}`, color: '#fff', padding: 14, borderRadius: 12 }} 
            />
            <select 
              value={eventType} 
              onChange={(e) => setEventType(e.target.value)} 
              style={{ background: C.bg, border: `1px solid ${C.border}`, color: '#fff', padding: 14, borderRadius: 12 }}
            >
              {EVENTS.map((e) => <option key={e.key} value={e.key}>{e.label} ({e.key})</option>)}
            </select>
            <button 
              disabled={loading} 
              onClick={() => runScan()} 
              style={{ background: C.gold, color: '#000', padding: "0 24px", borderRadius: 12, border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
            >
              {loading ? "Processing..." : "Process Scan"}
            </button>
          </div>
        </section>

        <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 20, padding: 22 }}>
          <h2 style={{ marginTop: 0 }}>Recent Warehouse Activity</h2>
          <table style={{ width: "100%", textAlign: "left" }}>
            <thead>
              <tr style={{ color: C.info }}>
                <th style={{ padding: 12 }}>ID</th>
                <th style={{ padding: 12 }}>Status</th>
                <th style={{ padding: 12 }}>Last Updated</th>
                <th style={{ padding: 12 }}>Quick Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.pickup_id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: 12 }}>{r.pickup_id}</td>
                  <td style={{ padding: 12, color: C.gold }}>{r.status}</td>
                  <td style={{ padding: 12 }}>{new Date(r.updated_at).toLocaleString()}</td>
                  <td style={{ padding: 12 }}>
                    <button onClick={() => { setScanCode(r.pickup_id); setEventType('RECEIVED_AT_ORIGIN'); }} style={{ background: C.border, color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}>
                      Load to Scanner
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}