// ─────────────────────────────────────────────────────────────────────────────
// CustomerPortal.tsx — Britium Express Customer Portal
// Parcel tracking, notification preferences, saved addresses, support
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import {
  useTrackShipment,
  useMyShipments,
  useSavedAddresses,
  useCreateAddress,
  useDeleteAddress,
  useShipmentTimeline,
} from "../hooks/useApi";
import { useAuth } from "../contexts/AuthContext";
import { StatusPill } from "../components/PortalLayout";
import type { Shipment, ShipmentTimeline, SavedAddress } from "../types";

// ── Style helpers ─────────────────────────────────────────────────────────────
const card = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 20,
  boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  marginBottom: 16,
} as React.CSSProperties;

// ── Track by AWB (public search) ──────────────────────────────────────────────
function TrackSearch() {
  const [awb, setAwb] = useState("");
  const [query, setQuery] = useState("");
  const { data, isLoading, error } = useTrackShipment(query);
  const shipment = data as unknown as Shipment | undefined;
  const { data: timelineData } = useShipmentTimeline(shipment?.id ?? "");
  const timeline = (timelineData as unknown as ShipmentTimeline[] | undefined) ?? [];

  const handleTrack = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(awb.trim().toUpperCase());
  };

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>📦 Track Your Parcel</h2>
      <form onSubmit={handleTrack} style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          value={awb}
          onChange={(e) => setAwb(e.target.value.toUpperCase())}
          placeholder="Enter AWB / tracking number…"
          style={{
            flex: 1,
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 14,
            fontFamily: "inherit",
            fontWeight: 600,
            letterSpacing: 1,
          }}
        />
        <button
          type="submit"
          style={{
            background: "#1a56db",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 22px",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          🔍 Track
        </button>
      </form>

      {isLoading && query && (
        <div style={card}>⏳ Looking up {query}…</div>
      )}
      {error && query && (
        <div style={{ ...card, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b" }}>
          ❌ Parcel not found for AWB: <strong>{query}</strong>
        </div>
      )}
      {shipment && (
        <div style={card}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 15, color: "#1e293b" }}>{shipment.tracking_no}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
                Created {new Date(shipment.created_at).toLocaleDateString()}
              </div>
            </div>
            <StatusPill status={shipment.status} />
          </div>

          {/* Details grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 6, textTransform: "uppercase" }}>Sender</div>
              <div style={{ fontWeight: 600 }}>{shipment.sender_name}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{shipment.sender_phone}</div>
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 6, textTransform: "uppercase" }}>Receiver</div>
              <div style={{ fontWeight: 600 }}>{shipment.receiver_name}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{shipment.receiver_phone}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{shipment.receiver_address}, {shipment.receiver_township}</div>
            </div>
          </div>

          {shipment.cod_amount > 0 && (
            <div style={{ background: "#fff8ed", border: "1px solid #fbbf24", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#92400e", marginBottom: 16 }}>
              💰 COD Amount: <strong>MMK {shipment.cod_amount.toLocaleString()}</strong>
            </div>
          )}

          {/* Timeline */}
          {timeline.length > 0 && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: "#475569" }}>📍 Delivery Timeline</div>
              <div style={{ position: "relative", paddingLeft: 20 }}>
                {timeline.map((t, i) => (
                  <div key={t.id} style={{ position: "relative", paddingBottom: 12, paddingLeft: 16 }}>
                    <div style={{
                      position: "absolute",
                      left: -8,
                      top: 4,
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: i === 0 ? "#1a56db" : "#cbd5e1",
                      border: "2px solid #fff",
                      boxShadow: "0 0 0 2px " + (i === 0 ? "#1a56db" : "#cbd5e1"),
                    }} />
                    {i < timeline.length - 1 && (
                      <div style={{ position: "absolute", left: -3, top: 14, width: 2, height: "100%", background: "#e2e8f0" }} />
                    )}
                    <div style={{ fontWeight: i === 0 ? 700 : 500, fontSize: 13, color: i === 0 ? "#1e293b" : "#475569" }}>
                      {t.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </div>
                    {t.location && <div style={{ fontSize: 12, color: "#64748b" }}>{t.location}</div>}
                    {t.notes && <div style={{ fontSize: 12, color: "#94a3b8" }}>{t.notes}</div>}
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(t.created_at).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── My Shipments ──────────────────────────────────────────────────────────────
function MyShipmentsView() {
  const { data, isLoading, error } = useMyShipments();
  const shipments = (data as Shipment[] | undefined) ?? [];

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>📦 My Shipments</h2>
      {isLoading ? (
        <div style={card}>⏳ Loading…</div>
      ) : error ? (
        <div style={{ ...card, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b" }}>
          ❌ Failed to load shipments.
        </div>
      ) : shipments.length === 0 ? (
        <div style={{ ...card, textAlign: "center", color: "#94a3b8" }}>
          No shipments found for your account.
        </div>
      ) : (
        shipments.map((s) => (
          <div key={s.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{s.tracking_no}</span>
                <span style={{ marginLeft: 10, fontSize: 12, color: "#64748b" }}>
                  from {s.sender_name}
                </span>
              </div>
              <StatusPill status={s.status} />
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: "#475569" }}>
              📍 {s.receiver_address}, {s.receiver_township}
            </div>
            {s.cod_amount > 0 && (
              <div style={{ marginTop: 4, fontSize: 12, color: "#92400e" }}>
                💰 COD: MMK {s.cod_amount.toLocaleString()}
              </div>
            )}
            <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8" }}>
              Created {new Date(s.created_at).toLocaleDateString()}
              {s.delivered_at && ` · Delivered ${new Date(s.delivered_at).toLocaleDateString()}`}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Saved Addresses ───────────────────────────────────────────────────────────
function AddressesView() {
  const { data, isLoading } = useSavedAddresses();
  const create = useCreateAddress();
  const del = useDeleteAddress();
  const addresses = (data as SavedAddress[] | undefined) ?? [];
  const [form, setForm] = useState({ label: "", full_address: "", township: "", city: "" });
  const [showForm, setShowForm] = useState(false);

  const handleSave = () => {
    if (!form.label || !form.full_address || !form.township || !form.city) return;
    create.mutate({ ...form, is_default: addresses.length === 0 });
    setForm({ label: "", full_address: "", township: "", city: "" });
    setShowForm(false);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>📍 Saved Addresses</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{ background: "#1a56db", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          + Add Address
        </button>
      </div>

      {showForm && (
        <div style={{ ...card, border: "1px solid #bfdbfe", background: "#eff6ff" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            {[
              { key: "label",        placeholder: "Label (e.g. Home, Office)" },
              { key: "full_address", placeholder: "Full address" },
              { key: "township",     placeholder: "Township" },
              { key: "city",         placeholder: "City" },
            ].map(({ key, placeholder }) => (
              <input
                key={key}
                placeholder={placeholder}
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit" }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleSave} disabled={create.isPending}
              style={{ background: "#059669", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              💾 Save
            </button>
            <button onClick={() => setShowForm(false)}
              style={{ background: "none", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? <div style={card}>⏳ Loading…</div> : addresses.length === 0 ? (
        <div style={{ ...card, textAlign: "center", color: "#94a3b8" }}>No saved addresses yet.</div>
      ) : (
        addresses.map((a) => (
          <div key={a.id} style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {a.label}
                {a.is_default && (
                  <span style={{ marginLeft: 8, background: "#d1fae5", color: "#065f46", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>
                    Default
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: "#475569", marginTop: 3 }}>{a.full_address}</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>{a.township}, {a.city}</div>
            </div>
            <button
              onClick={() => del.mutate(a.id)}
              style={{ background: "none", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
            >
              🗑️ Remove
            </button>
          </div>
        ))
      )}
    </div>
  );
}

// ── Main Portal ───────────────────────────────────────────────────────────────
const TABS = [
  { key: "track",     label: "🔍 Track Parcel" },
  { key: "shipments", label: "📦 My Shipments" },
  { key: "addresses", label: "📍 Saved Addresses" },
];

export default function CustomerPortal() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("track");

  const viewMap: Record<string, React.ReactNode> = {
    track:     <TrackSearch />,
    shipments: <MyShipmentsView />,
    addresses: <AddressesView />,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f0f4f8", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {/* Top bar */}
      <header style={{ background: "#0f172a", color: "#fff", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, letterSpacing: 0.5 }}>Britium Express</div>
          <div style={{ fontSize: 11, opacity: 0.55, marginTop: 1 }}>Customer Portal</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, opacity: 0.8 }}>{user?.full_name}</span>
          <button onClick={logout}
            style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 24px", display: "flex", gap: 4 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              background: "none",
              border: "none",
              borderBottom: activeTab === t.key ? "3px solid #1a56db" : "3px solid transparent",
              padding: "14px 16px",
              fontSize: 13,
              fontWeight: activeTab === t.key ? 700 : 500,
              color: activeTab === t.key ? "#1a56db" : "#64748b",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "28px 20px" }}>
        {viewMap[activeTab]}
      </main>
    </div>
  );
}
