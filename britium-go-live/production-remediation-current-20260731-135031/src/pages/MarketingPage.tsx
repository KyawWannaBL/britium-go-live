// @ts-nocheck
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, RefreshCw } from "lucide-react";

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

export default function MarketingPage() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase.rpc("be_enterprise_control_tower", { p_limit: 300 });
      if (error) throw error;
      setData(data || {});
    } catch (e: any) {
      setErr(e?.message || "Failed to load marketing summary.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const summary = data?.summary || {};
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const merchants = [...new Set(rows.map((r: any) => r.merchant_name || r.merchant_code).filter(Boolean))];

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 20, overflow: "auto" }}>
      <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 22, padding: 20, marginBottom: 16 }}>
        <div style={{ color: C.gold, fontWeight: 900, letterSpacing: "0.22em", fontSize: 12 }}>MARKETING</div>
        <h1 style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0" }}>
          <Megaphone size={24} /> Live Marketing Summary
        </h1>
        <p style={{ color: C.sub, margin: 0 }}>Merchant and parcel activity summary from live enterprise operations.</p>
        <button onClick={load} disabled={loading} style={{ marginTop: 14, background: C.gold, border: 0, borderRadius: 12, padding: "10px 14px", fontWeight: 900 }}>
          <RefreshCw size={15} /> {loading ? "Loading..." : "Refresh"}
        </button>
      </section>

      {err && <div style={{ color: C.red, marginBottom: 12 }}>{err}</div>}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        {[
          ["Total Records", summary.total_records || rows.length || 0],
          ["Active Merchants", merchants.length],
          ["COD Collected", `${Number(summary.total_cod_collected || 0).toLocaleString()} Ks`],
          ["Finance Settled", summary.finance_settled || 0],
        ].map(([a, b]) => (
          <div key={a} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14 }}>
            <div style={{ color: C.sub, fontSize: 12 }}>{a}</div>
            <strong style={{ color: C.gold, fontSize: 22 }}>{b}</strong>
          </div>
        ))}
      </section>

      <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 18, padding: 16 }}>
        <h2>Active Merchant Names</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {merchants.map((m) => (
            <span key={m} style={{ border: `1px solid ${C.border}`, borderRadius: 999, padding: "6px 10px", color: C.gold }}>
              {m}
            </span>
          ))}
          {!merchants.length && <span style={{ color: C.sub }}>No merchant activity found.</span>}
        </div>
      </section>
    </main>
  );
}
