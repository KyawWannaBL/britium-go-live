// @ts-nocheck
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MapPinned, RefreshCw, Navigation } from "lucide-react";

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

const headOffice = {
  label: "Britium Ventures Head Office",
  lat: 16.88955881695471,
  lng: 96.1970999756031,
};

export default function SupervisorLiveGpsPage() {
  const [data, setData] = useState<any>({});
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase.rpc("be_supervisor_live_gps_snapshot");
      if (error) throw error;
      setData(data || {});
      setRows(Array.isArray(data?.riders) ? data.riders : []);
    } catch (e: any) {
      setErr(e?.message || "Could not load GPS snapshot.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function openDirections(r: any) {
    const destination = encodeURIComponent(r.address || r.township || "Yangon Myanmar");
    const url = `https://www.google.com/maps/dir/?api=1&origin=${headOffice.lat},${headOffice.lng}&destination=${destination}&travelmode=driving`;
    window.open(url, "_blank");
  }

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 20, overflow: "auto" }}>
      <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 22, padding: 20, marginBottom: 16 }}>
        <div style={{ color: C.gold, fontWeight: 900, letterSpacing: "0.22em", fontSize: 12 }}>SUPERVISOR GPS</div>
        <h1 style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0" }}>
          <MapPinned size={24} /> Live GPS / Rider Wayplan Monitor
        </h1>
        <p style={{ color: C.sub, margin: 0 }}>
          Active rider, vehicle, driver, helper, and wayplan snapshot. Google directions are available as fallback until Mapbox token is configured.
        </p>
        <button onClick={load} disabled={loading} style={{ marginTop: 14, background: C.gold, border: 0, borderRadius: 12, padding: "10px 14px", fontWeight: 900 }}>
          <RefreshCw size={15} /> {loading ? "Loading..." : "Refresh"}
        </button>
      </section>

      {err && <div style={{ color: C.red, border: `1px solid ${C.red}`, borderRadius: 12, padding: 12, marginBottom: 16 }}>{err}</div>}

      <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 18, padding: 16, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>{headOffice.label}</h2>
        <iframe
          title="Britium Head Office Map"
          width="100%"
          height="320"
          style={{ border: 0, borderRadius: 16 }}
          loading="lazy"
          src={`https://www.google.com/maps?q=${headOffice.lat},${headOffice.lng}&z=15&output=embed`}
        />
      </section>

      <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 18, padding: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 1050, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: C.gold, color: C.bg }}>
              <th style={{ padding: 10, textAlign: "left" }}>Rider</th>
              <th style={{ padding: 10, textAlign: "left" }}>Wayplan</th>
              <th style={{ padding: 10, textAlign: "left" }}>Vehicle</th>
              <th style={{ padding: 10, textAlign: "left" }}>Driver</th>
              <th style={{ padding: 10, textAlign: "left" }}>Helper</th>
              <th style={{ padding: 10, textAlign: "right" }}>Stops</th>
              <th style={{ padding: 10, textAlign: "right" }}>Delivered</th>
              <th style={{ padding: 10, textAlign: "left" }}>Map</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.rider_code}-${i}`} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ padding: 10 }}>{r.rider_code || "-"} / {r.rider_name || "-"}</td>
                <td style={{ padding: 10, color: C.gold, fontWeight: 800 }}>{r.wayplan_id || "-"}</td>
                <td style={{ padding: 10 }}>{r.vehicle_code || "-"} / {r.vehicle_name || "-"}</td>
                <td style={{ padding: 10 }}>{r.driver_code || "-"} / {r.driver_name || "-"}</td>
                <td style={{ padding: 10 }}>{r.helper_code || "-"} / {r.helper_name || "-"}</td>
                <td style={{ padding: 10, textAlign: "right" }}>{r.total_stops || 0}</td>
                <td style={{ padding: 10, textAlign: "right", color: C.green }}>{r.delivered_stops || 0}</td>
                <td style={{ padding: 10 }}>
                  <button onClick={() => openDirections(r)} style={{ background: C.gold, border: 0, borderRadius: 10, padding: "7px 10px", fontWeight: 800 }}>
                    <Navigation size={14} /> Directions
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8} style={{ padding: 30, color: C.sub, textAlign: "center" }}>No active rider GPS rows found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
