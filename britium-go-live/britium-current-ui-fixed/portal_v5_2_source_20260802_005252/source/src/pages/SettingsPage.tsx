// @ts-nocheck
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Settings, RefreshCw, ShieldCheck } from "lucide-react";

const C = {
  bg: "#061524",
  panel: "#0b2236",
  border: "#1a3a5c",
  text: "#eef8ff",
  sub: "#9cc2d9",
  gold: "#f6b84b",
  green: "#34d399",
  red: "#f87171",
};

export default function SettingsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase
        .from("be_user_account_registry")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setRows(data || []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 20, overflow: "auto" }}>
      <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 22, padding: 20, marginBottom: 16 }}>
        <div style={{ color: C.gold, fontWeight: 900, letterSpacing: "0.22em", fontSize: 12 }}>SETTINGS</div>
        <h1 style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0" }}>
          <Settings size={24} /> Portal Settings
        </h1>
        <p style={{ color: C.sub, margin: 0 }}>
          Backend-managed access and account registry overview.
        </p>
        <button
          onClick={load}
          disabled={loading}
          style={{ marginTop: 14, background: C.gold, border: 0, borderRadius: 12, padding: "10px 14px", fontWeight: 900, cursor: "pointer" }}
        >
          <RefreshCw size={15} /> {loading ? "Loading..." : "Refresh"}
        </button>
      </section>

      {err && <div style={{ color: C.red, border: `1px solid ${C.red}`, borderRadius: 12, padding: 12, marginBottom: 16 }}>{err}</div>}

      <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 18, padding: 16, overflowX: "auto" }}>
        <h2 style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <ShieldCheck size={18} color={C.gold} /> User Account Registry
        </h2>

        <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: C.gold, color: C.bg }}>
              <th style={{ padding: 10, textAlign: "left" }}>Email</th>
              <th style={{ padding: 10, textAlign: "left" }}>Role</th>
              <th style={{ padding: 10, textAlign: "left" }}>Status</th>
              <th style={{ padding: 10, textAlign: "left" }}>Name</th>
              <th style={{ padding: 10, textAlign: "left" }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || i} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ padding: 10 }}>{r.email || r.user_email || "-"}</td>
                <td style={{ padding: 10, color: C.gold, fontWeight: 800 }}>{r.role || r.account_role || "-"}</td>
                <td style={{ padding: 10, color: r.is_active === false ? C.red : C.green }}>{r.is_active === false ? "inactive" : "active"}</td>
                <td style={{ padding: 10 }}>{r.full_name || r.name || "-"}</td>
                <td style={{ padding: 10 }}>{r.created_at ? new Date(r.created_at).toLocaleString() : "-"}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} style={{ padding: 30, color: C.sub, textAlign: "center" }}>No registry rows found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
