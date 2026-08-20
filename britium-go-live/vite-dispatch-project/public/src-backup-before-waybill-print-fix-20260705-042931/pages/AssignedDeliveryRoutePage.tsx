// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import {
  loadRiderSnapshot,
  pickupMerchant,
  pickupParcelCount,
  pickupPhone,
  pickupTitle,
  RiderNav,
  riderStyles as s,
} from "../lib/riderRuntime";
import { aggregateAssignedPickups } from "../lib/riderPickupGrouping";

export default function AssignedDeliveryRoutePage() {
  const [snapshot, setSnapshot] = useState<any>(null);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      setSnapshot(await loadRiderSnapshot());
    } catch (e: any) {
      setError(e?.message || "Unable to load assigned pickups.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const sourcePickups = Array.isArray(snapshot?.assigned_pickups) ? snapshot.assigned_pickups : [];
  const rawRows = Array.isArray(snapshot?.raw_assigned_pickup_rows) ? snapshot.raw_assigned_pickup_rows : sourcePickups;
  const pickups = useMemo(() => aggregateAssignedPickups(sourcePickups), [sourcePickups]);

  return (
    <main style={s.page}>
      <div style={s.shell}>
        <div style={s.brand}>Britium Rider UAT</div>
        <h1 style={s.title}>Assigned Pickups</h1>
        <p style={s.sub}>
          Pickup verification is grouped once per pickup order. Delivery-way rows are counted under the same pickup.
        </p>
        <RiderNav />

        <div style={s.panel}>
          <strong>{pickups.length}</strong> pickup verification order{pickups.length === 1 ? "" : "s"}
          <span style={{ color: "#8bb0c8" }}> • {rawRows.length} backend delivery-way row{rawRows.length === 1 ? "" : "s"}</span>
        </div>

        {error ? <div style={s.empty}>{error}</div> : null}

        {pickups.length === 0 ? (
          <div style={s.empty}>No assigned pickup orders for this rider account.</div>
        ) : (
          pickups.map((p: any) => {
            const id = pickupTitle(p);
            return (
              <article key={id} style={s.card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={s.pickupId}>{id}</div>
                    <div style={{ color: "#8bb0c8", fontSize: 12, marginTop: 4 }}>
                      {p.waybill_no ? `${p.waybill_no} • ` : ""}
                      {p.delivery_way_count || p.parcel_count || 0} delivery way{(p.delivery_way_count || p.parcel_count || 0) === 1 ? "" : "s"}
                    </div>
                  </div>
                  <span style={s.badge}>{p.status || p.process_status || "ASSIGNED"}</span>
                </div>

                <div style={s.meta}>
                  <strong>Merchant:</strong> {pickupMerchant(p)}
                  <br />
                  <strong>Pickup verification:</strong> one verification popup for this pickup order
                  <br />
                  <strong>Townships:</strong> {Array.isArray(p.townships) && p.townships.length ? p.townships.slice(0, 5).join(", ") : p.pickup_township || p.township || "-"}
                  <br />
                  <strong>Phone:</strong> {pickupPhone(p)}
                  <br />
                  <strong>Parcels:</strong> {pickupParcelCount(p)}
                  <br />
                  <strong>Progress:</strong> {p.status_summary || "-"}
                </div>

                <div style={{ marginTop: 12 }}>
                  <button
                    style={s.button}
                    onClick={() => (location.href = `/#/rider/pickup/${encodeURIComponent(id)}`)}
                  >
                    Open Pickup Verification Once
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </main>
  );
}
