// @ts-nocheck
import React from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { aggregateAssignedPickups } from "./riderPickupGrouping";

export const riderStyles: any = {
  page: {
    minHeight: "100vh",
    background: "#061524",
    color: "#eef8ff",
    padding: "16px",
    fontFamily: "Poppins, Inter, sans-serif",
  },
  shell: {
    maxWidth: 860,
    margin: "0 auto",
    display: "grid",
    gap: 16,
  },
  brand: {
    color: "#f6b84b",
    fontWeight: 900,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontSize: 12,
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 900,
  },
  sub: {
    margin: 0,
    color: "#8bb0c8",
    fontSize: 14,
  },
  panel: {
    border: "1px solid #1a3a5c",
    background: "#0b2236",
    borderRadius: 16,
    padding: 16,
  },
  card: {
    border: "1px solid #1a3a5c",
    background: "#0b2236",
    borderRadius: 16,
    padding: 16,
  },
  pickupId: {
    color: "#4ea8de",
    fontWeight: 900,
    fontSize: 14,
  },
  meta: {
    color: "#eef8ff",
    lineHeight: 1.55,
    fontSize: 14,
    marginTop: 10,
  },
  badge: {
    color: "#eef8ff",
    border: "1px solid #1a3a5c",
    background: "#071b2b",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  button: {
    border: "1px solid #f6b84b",
    background: "#f6b84b",
    color: "#061524",
    fontWeight: 900,
    borderRadius: 999,
    padding: "8px 14px",
    cursor: "pointer",
  },
  empty: {
    border: "1px dashed #1a3a5c",
    background: "#071b2b",
    borderRadius: 16,
    padding: 18,
    color: "#8bb0c8",
    textAlign: "center",
  },
  btn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #1a3a5c",
    background: "#071b2b",
    color: "#eef8ff",
    textDecoration: "none",
    fontWeight: 800,
    fontSize: 13,
  },
};

export function RiderNav() {
  const links = [
    ["/rider/dashboard", "Dashboard"],
    ["/rider/pickups", "Pickups"],
    ["/rider/delivery", "Delivery"],
    ["/rider/live-map", "Live Map"],
    ["/rider/wallet", "Wallet"],
    ["/rider/settlement", "Settlement"],
  ];
  return (
    <nav style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {links.map(([to, label]) => (
        <Link key={to} to={to} style={riderStyles.btn}>{label}</Link>
      ))}
    </nav>
  );
}

function storedEmail() {
  try {
    return (
      localStorage.getItem("be_user_email") ||
      localStorage.getItem("be_rider_email") ||
      "testrider@britiumexpress.com"
    );
  } catch {
    return "testrider@britiumexpress.com";
  }
}

export async function loadRiderSnapshot() {
  const email = storedEmail();

  let assigned_pickups: any[] = [];

  // Prefer the new go-live grouped pickup RPC when installed.
  try {
    const { data, error } = await (supabase as any).rpc("be_rider_assigned_pickup_snapshot", {
      p_rider_email: email,
    });
    const rows = Array.isArray(data?.pickups) ? data.pickups : Array.isArray(data) ? data : [];
    if (!error && rows.length > 0) assigned_pickups = rows;
  } catch {}

  // Existing supervisor/rider operational pickup queue.
  if (assigned_pickups.length === 0) {
    try {
      const { data, error } = await (supabase as any)
        .from("be_v_mobile_workforce_jobs")
        .select("*")
        .or(`workforce_email.eq.${email},rider_email.eq.${email}`)
        .order("assigned_at", { ascending: false });
      if (!error && Array.isArray(data)) assigned_pickups = data;
    } catch {}
  }

  // Fallback to delivery jobs so older pages never appear blank.
  if (assigned_pickups.length === 0) {
    try {
      const { data, error } = await (supabase as any)
        .from("be_v_rider_delivery_jobs")
        .select("*")
        .or(`rider_email.eq.${email},driver_email.eq.${email},helper_email.eq.${email}`)
        .order("parcel_sequence", { ascending: true });
      if (!error && Array.isArray(data)) {
        assigned_pickups = data.map((j: any) => ({
          id: j.id,
          pickup_id: j.pickup_id,
          pickup_way_id: j.delivery_way_id || j.tracking_no,
          tracking_no: j.tracking_no,
          delivery_way_id: j.delivery_way_id,
          waybill_no: j.waybill_no,
          merchant_name: j.merchant_name || j.merchant_code || j.waybill_no,
          pickup_address: j.pickup_address || j.recipient_address,
          pickup_township: j.pickup_township || j.delivery_township,
          phone_number: j.pickup_phone || j.recipient_phone || j.phone_number,
          parcel_count: 1,
          status: j.delivery_status || j.dispatch_status,
        }));
      }
    } catch {}
  }

  const grouped = aggregateAssignedPickups(assigned_pickups);

  return {
    rider_email: email,
    assigned_pickups: grouped,
    raw_assigned_pickup_rows: assigned_pickups,
    kpis: {
      assigned_pickups: grouped.length,
      delivery_way_rows: assigned_pickups.length,
      active_wayplans: 0,
    },
    active_wayplans: [],
  };
}

export function pickupTitle(p: any) {
  return p?.pickup_id || p?.pickup_way_id || p?.tracking_no || p?.delivery_way_id || "-";
}
export function pickupMerchant(p: any) {
  return p?.merchant_name || p?.merchant_code || p?.waybill_no || "-";
}
export function pickupPhone(p: any) {
  return p?.phone_number || p?.recipient_phone || p?.contact_phone || "-";
}
export function pickupParcelCount(p: any) {
  return Number(p?.parcel_count || p?.delivery_way_count || p?.expected_parcels || p?.collected_parcels || 0);
}
