import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../integrations/supabase/client";

type PickupOption = {
  pickup_id?: string;
  canonical_pickup_id?: string;
  label?: string;
  merchant_code?: string;
  merchant_name?: string;
  branch_code?: string;
  status?: string;
  workflow_status?: string;
  contact_phone?: string;
  pickup_address?: string;
  parcel_count?: number;
  cod_amount?: number;
  service_type?: string;
};

const fieldStyle: React.CSSProperties = {
  height: 52,
  minHeight: 52,
  width: "100%",
  borderRadius: 18,
  border: "1px solid rgba(60, 184, 255, 0.42)",
  background: "rgba(7, 18, 32, 0.88)",
  color: "#ffffff",
  fontWeight: 900,
  fontSize: 16,
  padding: "0 18px",
  outline: "none",
};

const panelStyle: React.CSSProperties = {
  margin: "18px 0 22px",
  padding: 22,
  borderRadius: 24,
  border: "1px solid rgba(60, 184, 255, 0.34)",
  background: "linear-gradient(180deg, rgba(8, 39, 65, 0.94), rgba(6, 23, 39, 0.94))",
  boxShadow: "0 18px 50px rgba(0,0,0,0.28)",
};

function pickupIdOf(p: PickupOption): string {
  return p.pickup_id || p.canonical_pickup_id || "";
}

function labelOf(p: PickupOption): string {
  return p.label || [pickupIdOf(p), p.merchant_name || p.merchant_code || "Merchant", p.status || p.workflow_status || "PICKUP_REQUESTED"].filter(Boolean).join(" - ");
}

export default function PickupOrderRequiredPanel() {
  const [rows, setRows] = useState<PickupOption[]>([]);
  const [selected, setSelected] = useState<string>(() => {
    try { return localStorage.getItem("be_selected_pickup_id") || ""; } catch { return ""; }
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Loading pickup orders from backend...");

  const selectedRow = useMemo(() => rows.find((row) => pickupIdOf(row) === selected), [rows, selected]);

  async function loadPickups() {
    setLoading(true);
    try {
      const branch = localStorage.getItem("be_branch_code") || "HQ";
      const { data, error } = await supabase.rpc("be_get_pickup_order_options", {
        p_payload: { branch_code: branch, limit: 200 },
      });
      if (error) throw error;
      const payload = data as any;
      const nextRows = Array.isArray(payload?.rows) ? payload.rows : [];
      setRows(nextRows);
      setMessage(nextRows.length ? `${nextRows.length} pickup order(s) available from backend.` : "No pickup order found. Create pickup first from Create Delivery / CS Portal / Merchant Portal.");
    } catch (err: any) {
      setRows([]);
      setMessage(err?.message || "Unable to load pickup orders. Run be_get_pickup_order_options SQL first.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPickups();
  }, []);

  function choose(value: string) {
    setSelected(value);
    try { localStorage.setItem("be_selected_pickup_id", value); } catch {}
    const row = rows.find((item) => pickupIdOf(item) === value) || null;
    window.dispatchEvent(new CustomEvent("be:pickup-selected", { detail: { pickup_id: value, pickup: row } }));
  }

  return (
    <section style={panelStyle} data-be-pickup-required="true">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ color: "#f6c915", fontWeight: 950, letterSpacing: "0.12em", fontSize: 13, textTransform: "uppercase" }}>
            Pickup Order Selection Required
          </div>
          <h3 style={{ margin: "8px 0 8px", color: "#ffffff", fontSize: 26 }}>Select Picking Order Request</h3>
          <p style={{ margin: 0, color: "#aed8ff", fontSize: 16, maxWidth: 880 }}>
            Data Entry and Warehouse cannot proceed without one live pickup order. Select one CS pickup request first; merchant, branch, status, tariff and IDs will sync automatically.
          </p>
        </div>
        <button type="button" onClick={loadPickups} disabled={loading} style={{ ...fieldStyle, width: "auto", minWidth: 180, background: "rgba(246, 201, 21, 0.92)", color: "#07111f" }}>
          {loading ? "Refreshing..." : "Refresh Pickups"}
        </button>
      </div>

      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "minmax(260px, 1fr) minmax(260px, 1fr)", gap: 18 }}>
        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ color: "#83b9e8", fontWeight: 950, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 12 }}>Pickup Request</span>
          <select value={selected} onChange={(e) => choose(e.target.value)} style={fieldStyle}>
            <option value="">Select pickup request</option>
            {rows.map((row) => {
              const id = pickupIdOf(row);
              return <option key={id} value={id}>{labelOf(row)}</option>;
            })}
          </select>
        </label>
        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ color: "#83b9e8", fontWeight: 950, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 12 }}>Selected Order Context</span>
          <input readOnly value={selectedRow ? `${selectedRow.merchant_name || selectedRow.merchant_code || "Merchant"} / ${selectedRow.branch_code || "HQ"} / ${selectedRow.status || selectedRow.workflow_status || "PICKUP_REQUESTED"}` : "No pickup selected"} style={fieldStyle} />
        </label>
      </div>

      <div style={{ marginTop: 14, color: selected ? "#8ff0b3" : "#ffbf66", fontWeight: 800 }}>
        {selected ? `Selected pickup: ${selected}` : message}
      </div>
    </section>
  );
}
