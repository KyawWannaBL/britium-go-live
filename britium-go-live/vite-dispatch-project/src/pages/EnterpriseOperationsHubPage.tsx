// @ts-nocheck
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity, RefreshCw, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";

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

const links = [
  ["Enterprise Control Tower", "/enterprise-control-tower"],
  ["Supervisor Pickup", "/supervisor-pickup"],
  ["Wayplan Command Center", "/wayplan-command-center"],
  ["Warehouse Wayplan Center", "/warehouse-wayplan-center"],
  ["Finance COD Center", "/finance-cod-center"],
  ["Finance Reports", "/finance-reports"],
  ["Workforce Wallets", "/workforce-wallets"],
  ["Commission Center", "/commission-center"],
  ["Exceptions", "/exceptions"],
  ["Data Entry", "/data-entry"],
  ["Master Data", "/master-data"],
  ["Admin HR", "/admin-hr"],
];

export default function EnterpriseOperationsHubPage() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase.rpc("be_portal_wiring_health");
      if (error) throw error;
      setHealth(data);
    } catch (e: any) {
      setErr(e?.message || "Failed to load portal health.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const checks = Array.isArray(health?.checks) ? health.checks : [];

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 20, overflow: "auto" }}>
      <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 22, padding: 20, marginBottom: 16 }}>
        <div style={{ color: C.gold, fontWeight: 900, letterSpacing: "0.22em", fontSize: 12 }}>ENTERPRISE OPERATIONS</div>
        <h1 style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0" }}>
          <Activity size={24} /> Live Operations Hub
        </h1>
        <p style={{ color: C.sub, margin: 0 }}>
          Portal-wide launcher and backend wiring health monitor.
        </p>
        <button
          onClick={load}
          disabled={loading}
          style={{ marginTop: 14, background: C.gold, border: 0, borderRadius: 12, padding: "10px 14px", fontWeight: 900, cursor: "pointer" }}
        >
          <RefreshCw size={15} /> {loading ? "Checking..." : "Refresh Health"}
        </button>
      </section>

      {err && <div style={{ color: C.red, border: `1px solid ${C.red}`, borderRadius: 12, padding: 12, marginBottom: 16 }}>{err}</div>}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14 }}>
          <div style={{ color: C.sub, fontSize: 12 }}>Portal Status</div>
          <strong style={{ color: health?.ok ? C.green : C.red, fontSize: 22 }}>{health?.ok ? "READY" : "CHECKING"}</strong>
        </div>
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14 }}>
          <div style={{ color: C.sub, fontSize: 12 }}>Modules Checked</div>
          <strong style={{ color: C.gold, fontSize: 22 }}>{health?.total_modules || checks.length || 0}</strong>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginBottom: 16 }}>
        {checks.map((x: any) => (
          <div key={x.module} style={{ background: C.panel, border: `1px solid ${x.ok ? C.border : C.red}`, borderRadius: 16, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {x.ok ? <CheckCircle2 size={18} color={C.green} /> : <AlertTriangle size={18} color={C.red} />}
              <strong>{x.module}</strong>
            </div>
            <div style={{ color: C.sub, fontSize: 12, marginTop: 8 }}>Source: {x.source || "-"}</div>
            {"count" in x && <div style={{ color: C.gold, fontSize: 12, marginTop: 4 }}>Count: {x.count}</div>}
          </div>
        ))}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        {links.map(([label, path]) => (
          <a
            key={path}
            href={`#${path}`}
            style={{
              background: C.panel,
              border: `1px solid ${C.border}`,
              color: C.text,
              textDecoration: "none",
              borderRadius: 16,
              padding: 16,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{label}</span>
            <ArrowRight size={18} color={C.gold} />
          </a>
        ))}
      </section>
    </main>
  );
}
