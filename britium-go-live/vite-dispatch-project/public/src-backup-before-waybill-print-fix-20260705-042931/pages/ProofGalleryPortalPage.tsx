// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import { Camera, RefreshCw, Search } from "lucide-react";
import { loadProofGallerySummary, loadProofMedia } from "@/lib/proofMediaApi";

const C = {
  bg: "#061524",
  panel: "#0b2236",
  panel2: "#081b2e",
  border: "#1f4966",
  text: "#eef8ff",
  sub: "#a8c4da",
  muted: "#7ea0b8",
  orange: "#ff8a4c",
  gold: "#f6b84b",
  blue: "#38bdf8",
  green: "#22c55e",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function input(extra: any = {}) {
  return {
    width: "100%",
    minHeight: 44,
    border: `1px solid ${C.border}`,
    background: "#071827",
    color: C.text,
    borderRadius: 12,
    padding: "0 12px",
    fontWeight: 850,
    outline: "none",
    ...extra,
  };
}

function btn(tone = C.orange, extra: any = {}) {
  return {
    border: `1px solid ${tone}88`,
    background: tone,
    color: "#061524",
    borderRadius: 12,
    padding: "9px 12px",
    minHeight: 42,
    fontWeight: 950,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...extra,
  };
}

export default function ProofGalleryPortalPage() {
  const [businessDate, setBusinessDate] = useState(today());
  const [merchantCode, setMerchantCode] = useState("");
  const [pickupId, setPickupId] = useState("");
  const [scope, setScope] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setBusy(true);
    setError("");

    try {
      const data = await loadProofMedia({
        business_date: businessDate || undefined,
        merchant_code: merchantCode || undefined,
        pickup_id: pickupId || undefined,
        proof_scope: scope || undefined,
        limit: 500,
      });

      setRows(data);
      setSummary(await loadProofGallerySummary());
    } catch (e: any) {
      setError(e?.message || "Failed to load proof gallery.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const grouped = useMemo(() => {
    return rows.reduce((acc: any, r: any) => {
      const key = `${r.business_date || "NO_DATE"}|${r.merchant_code || "NO_MERCHANT"}|${r.merchant_name || ""}`;
      acc[key] ||= [];
      acc[key].push(r);
      return acc;
    }, {});
  }, [rows]);

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 22, fontFamily: "Poppins, Inter, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1500, margin: "0 auto", display: "grid", gap: 16 }}>
        <section style={{ border: `1px solid ${C.border}`, background: `linear-gradient(135deg, ${C.panel}, ${C.panel2})`, borderRadius: 24, padding: 22 }}>
          <div style={{ color: C.orange, fontWeight: 950, letterSpacing: ".24em", fontSize: 12 }}>
            BRITIUM PROOF CONTROL CENTER
          </div>
          <h1 style={{ margin: "8px 0 0", fontSize: 32, display: "flex", alignItems: "center", gap: 10 }}>
            <Camera color={C.gold} /> Proof Gallery
          </h1>
          <p style={{ color: C.sub }}>
            Day-by-day and merchant-by-merchant pickup, delivery, warehouse, and exception proof photos.
          </p>
        </section>

        <section style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 20, padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <label>
              <div style={{ color: C.muted, fontWeight: 950, fontSize: 11, letterSpacing: ".14em" }}>DATE</div>
              <input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} style={input()} />
            </label>

            <label>
              <div style={{ color: C.muted, fontWeight: 950, fontSize: 11, letterSpacing: ".14em" }}>MERCHANT CODE</div>
              <input value={merchantCode} onChange={(e) => setMerchantCode(e.target.value.toUpperCase())} placeholder="POC" style={input()} />
            </label>

            <label>
              <div style={{ color: C.muted, fontWeight: 950, fontSize: 11, letterSpacing: ".14em" }}>PICKUP ID</div>
              <input value={pickupId} onChange={(e) => setPickupId(e.target.value.toUpperCase())} placeholder="P0611-POC-003" style={input()} />
            </label>

            <label>
              <div style={{ color: C.muted, fontWeight: 950, fontSize: 11, letterSpacing: ".14em" }}>SCOPE</div>
              <select value={scope} onChange={(e) => setScope(e.target.value)} style={input()}>
                <option value="">All</option>
                <option value="PICKUP">Pickup</option>
                <option value="DELIVERY">Delivery</option>
                <option value="WAREHOUSE">Warehouse</option>
                <option value="SUPPORT">Support</option>
              </select>
            </label>

            <button onClick={load} disabled={busy} style={btn(C.blue, { alignSelf: "end" })}>
              {busy ? <RefreshCw size={16} /> : <Search size={16} />}
              {busy ? "Loading..." : "Search Proofs"}
            </button>
          </div>
        </section>

        {error ? (
          <section style={{ border: "1px solid #ff4f86", color: "#ff4f86", borderRadius: 16, padding: 14, fontWeight: 900 }}>
            {error}
          </section>
        ) : null}

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 16, padding: 14 }}>
            <div style={{ color: C.muted, fontWeight: 950 }}>Proof Records</div>
            <div style={{ color: C.gold, fontSize: 30, fontWeight: 950 }}>{rows.length}</div>
          </div>
          <div style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 16, padding: 14 }}>
            <div style={{ color: C.muted, fontWeight: 950 }}>Merchant-Day Groups</div>
            <div style={{ color: C.blue, fontSize: 30, fontWeight: 950 }}>{Object.keys(grouped).length}</div>
          </div>
          <div style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 16, padding: 14 }}>
            <div style={{ color: C.muted, fontWeight: 950 }}>Summary Rows</div>
            <div style={{ color: C.green, fontSize: 30, fontWeight: 950 }}>{summary.length}</div>
          </div>
        </section>

        <section style={{ display: "grid", gap: 16 }}>
          {rows.length === 0 ? (
            <div style={{ border: `1px dashed ${C.border}`, background: C.panel, borderRadius: 18, padding: 22, color: C.muted }}>
              No proof photos found for the selected filters.
            </div>
          ) : null}

          {Object.entries(grouped).map(([key, items]: any) => {
            const [date, merchant, merchantName] = key.split("|");

            return (
              <section key={key} style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 20, padding: 16 }}>
                <h2 style={{ margin: 0, color: C.gold }}>
                  {date} · {merchant} · {merchantName}
                </h2>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginTop: 14 }}>
                  {items.map((r: any) => (
                    <a key={r.id} href={r.view_url || "#"} target="_blank" rel="noreferrer" style={{ color: C.text, textDecoration: "none" }}>
                      <article style={{ border: `1px solid ${C.border}`, background: "#071827", borderRadius: 14, overflow: "hidden" }}>
                        {r.view_url ? (
                          <img src={r.view_url} style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
                        ) : (
                          <div style={{ height: 160, display: "grid", placeItems: "center", color: C.muted }}>No preview</div>
                        )}

                        <div style={{ padding: 11 }}>
                          <b style={{ color: C.orange }}>{r.proof_scope} · {r.proof_type}</b>
                          <div style={{ color: C.sub, marginTop: 5 }}>Pickup: {r.pickup_id || "-"}</div>
                          <div style={{ color: C.sub }}>Parcel: {r.parcel_sequence || "-"} · {r.parcel_reference || "-"}</div>
                          <div style={{ color: C.sub }}>Delivery: {r.delivery_way_id || "-"}</div>
                          <div style={{ color: C.muted, fontSize: 12, marginTop: 5 }}>
                            {r.captured_by_code || r.rider_code || "-"} · {String(r.created_at || "").slice(0, 19).replace("T", " ")}
                          </div>
                        </div>
                      </article>
                    </a>
                  ))}
                </div>
              </section>
            );
          })}
        </section>
      </div>
    </main>
  );
}
