// @ts-nocheck
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Calculator, RefreshCw } from "lucide-react";

const C = {
  bg: "#061524",
  panel: "#0b2236",
  border: "#1a3a5c",
  text: "#eef8ff",
  sub: "#9cc2d9",
  gold: "#f6b84b",
  red: "#f87171",
};

export default function TariffPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase
        .from("be_master_data_options")
        .select("*")
        .or("option_type.ilike.%tariff%,master_type.ilike.%tariff%,dropdown_name.ilike.%tariff%,value.ilike.%tariff%")
        .limit(300);

      if (error) throw error;
      setRows(data || []);
    } catch (e: any) {
      setErr(e?.message || "Could not load tariff master data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 20, overflow: "auto" }}>
      <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 22, padding: 20, marginBottom: 16 }}>
        <div style={{ color: C.gold, fontWeight: 900, letterSpacing: "0.22em", fontSize: 12 }}>TARIFF</div>
        <h1 style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0" }}>
          <Calculator size={24} /> Tariff Master Data
        </h1>
        <p style={{ color: C.sub, margin: 0 }}>
          Live tariff-related records from master data options.
        </p>
        <button onClick={load} disabled={loading} style={{ marginTop: 14, background: C.gold, border: 0, borderRadius: 12, padding: "10px 14px", fontWeight: 900 }}>
          <RefreshCw size={15} /> {loading ? "Loading..." : "Refresh"}
        </button>
      </section>

      {err && <div style={{ color: C.red, marginBottom: 16 }}>{err}</div>}

      <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 18, padding: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: C.gold, color: C.bg }}>
              <th style={{ padding: 10, textAlign: "left" }}>Dropdown</th>
              <th style={{ padding: 10, textAlign: "left" }}>Value</th>
              <th style={{ padding: 10, textAlign: "left" }}>Myanmar Label</th>
              <th style={{ padding: 10, textAlign: "left" }}>Type</th>
              <th style={{ padding: 10, textAlign: "left" }}>Active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || i} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ padding: 10 }}>{r.dropdown_name || "-"}</td>
                <td style={{ padding: 10, color: C.gold }}>{r.value || "-"}</td>
                <td style={{ padding: 10 }}>{r.myanmar_label || r.label_mm || "-"}</td>
                <td style={{ padding: 10 }}>{r.option_type || r.master_type || "-"}</td>
                <td style={{ padding: 10 }}>{r.is_active === false ? "No" : "Yes"}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} style={{ padding: 30, textAlign: "center", color: C.sub }}>
                  No tariff master data found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
