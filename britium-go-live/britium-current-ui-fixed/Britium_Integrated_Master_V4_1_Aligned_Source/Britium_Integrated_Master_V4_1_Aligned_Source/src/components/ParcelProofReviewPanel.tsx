// @ts-nocheck
import React, { useEffect, useState } from "react";
import { Camera, Eye, RefreshCw } from "lucide-react";
import { loadProofMedia } from "@/lib/proofMediaApi";

const C = {
  panel: "#0b2236",
  border: "#1f4966",
  text: "#eef8ff",
  sub: "#a8c4da",
  muted: "#7ea0b8",
  orange: "#ff8a4c",
  gold: "#f6b84b",
  blue: "#38bdf8",
};

function btn(tone = C.orange, extra: any = {}) {
  return {
    border: `1px solid ${tone}88`,
    background: tone,
    color: "#061524",
    borderRadius: 12,
    padding: "9px 12px",
    minHeight: 38,
    fontWeight: 950,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    ...extra,
  };
}

export default function ParcelProofReviewPanel({ pickupId, merchantCode }: any) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (!pickupId && !merchantCode) return;

    setBusy(true);
    setError("");

    try {
      const data = await loadProofMedia({
        pickup_id: pickupId || undefined,
        merchant_code: merchantCode || undefined,
        limit: 200,
      });
      setRows(data);
      setOpen(true);
    } catch (e: any) {
      setError(e?.message || "Failed to load proof photos.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (open) void load();
  }, [pickupId]);

  const grouped = rows.reduce((acc: any, r: any) => {
    const key = `${r.parcel_sequence || "NA"}-${r.parcel_reference || ""}`;
    acc[key] ||= [];
    acc[key].push(r);
    return acc;
  }, {});

  return (
    <section style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 18, padding: 14, marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <b style={{ color: C.gold, display: "flex", gap: 8, alignItems: "center" }}>
            <Camera size={17} /> Pickup Proof Review
          </b>
          <div style={{ color: C.sub, marginTop: 5 }}>
            Data Entry can review rider pickup photos/signatures before registering delivery rows.
          </div>
        </div>

        <button type="button" onClick={load} disabled={busy} style={btn(C.blue)}>
          {busy ? <RefreshCw size={15} /> : <Eye size={15} />}
          {busy ? "Loading..." : "Check Photos"}
        </button>
      </div>

      {error ? (
        <div style={{ color: "#ff4f86", marginTop: 10, fontWeight: 850 }}>
          {error}
        </div>
      ) : null}

      {open ? (
        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {rows.length === 0 ? (
            <div style={{ border: `1px dashed ${C.border}`, borderRadius: 14, padding: 14, color: C.muted }}>
              No proof photos/signatures uploaded yet for this pickup.
            </div>
          ) : null}

          {Object.entries(grouped).map(([key, items]: any) => (
            <div key={key} style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, background: "#071827" }}>
              <b style={{ color: C.orange }}>
                Parcel {items[0]?.parcel_sequence || "-"} · {items[0]?.parcel_reference || ""}
              </b>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginTop: 10 }}>
                {items.map((r: any) => (
                  <a
                    key={r.id}
                    href={r.view_url || "#"}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: C.text, textDecoration: "none" }}
                  >
                    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", background: "#061524" }}>
                      {r.view_url ? (
                        <img src={r.view_url} style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }} />
                      ) : (
                        <div style={{ height: 130, display: "grid", placeItems: "center", color: C.muted }}>
                          No preview
                        </div>
                      )}
                      <div style={{ padding: 9 }}>
                        <b style={{ color: C.gold }}>{r.proof_scope} · {r.proof_type}</b>
                        <div style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>
                          {r.rider_code || "-"} · {String(r.created_at || "").slice(0, 19).replace("T", " ")}
                        </div>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
