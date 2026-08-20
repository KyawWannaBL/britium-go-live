// @ts-nocheck
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FileText, ArrowRight, RefreshCw, CheckCircle2 } from "lucide-react";

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
  ["Waybill Print Studio", "/waybill-studio", "Print waybills and mark printed."],
  ["Invoice Print Studio", "/invoice-studio", "Print invoice documents from invoice queue."],
  ["Manifest Print Studio", "/manifest-print", "Print wayplan manifests."],
];

export default function DocumentPrintRoomPage() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    setErr("");

    try {
      const { data, error } = await supabase.rpc("be_portal_wiring_health");
      if (error) throw error;
      setHealth(data || {});
    } catch (e: any) {
      setErr(e?.message || "Could not load document room health.");
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
        <div style={{ color: C.gold, fontWeight: 900, letterSpacing: "0.22em", fontSize: 12 }}>DOCUMENT STUDIO</div>
        <h1 style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0" }}>
          <FileText size={24} /> Document Print Room
        </h1>
        <p style={{ color: C.sub, margin: 0 }}>
          Central launcher for waybill, invoice, and manifest printing.
        </p>

        <button
          onClick={load}
          disabled={loading}
          style={{ marginTop: 14, background: C.gold, border: 0, borderRadius: 12, padding: "10px 14px", fontWeight: 900, cursor: "pointer" }}
        >
          <RefreshCw size={15} /> {loading ? "Checking..." : "Refresh"}
        </button>
      </section>

      {err && (
        <div style={{ color: C.red, border: `1px solid ${C.red}`, borderRadius: 12, padding: 12, marginBottom: 16 }}>
          {err}
        </div>
      )}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14 }}>
          <div style={{ color: C.sub, fontSize: 12 }}>Portal Health</div>
          <strong style={{ color: health?.ok ? C.green : C.gold, fontSize: 22 }}>
            {health?.ok ? "READY" : "CHECKING"}
          </strong>
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14 }}>
          <div style={{ color: C.sub, fontSize: 12 }}>Modules Checked</div>
          <strong style={{ color: C.gold, fontSize: 22 }}>{health?.total_modules || 0}</strong>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        {links.map(([label, path, desc]) => (
          <a
            key={path}
            href={`#${path}`}
            style={{
              background: C.panel,
              border: `1px solid ${C.border}`,
              borderRadius: 18,
              padding: 18,
              color: C.text,
              textDecoration: "none",
              display: "flex",
              justifyContent: "space-between",
              gap: 14,
            }}
          >
            <span>
              <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CheckCircle2 size={16} color={C.green} /> {label}
              </strong>
              <div style={{ color: C.sub, marginTop: 6, fontSize: 13 }}>{desc}</div>
            </span>
            <ArrowRight color={C.gold} />
          </a>
        ))}
      </section>
    </main>
  );
}
