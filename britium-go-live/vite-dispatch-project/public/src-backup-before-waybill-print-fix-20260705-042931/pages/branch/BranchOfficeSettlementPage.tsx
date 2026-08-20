import React from "react";

export default function BranchOfficeSettlementPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Branch ↔ Head Office Settlement</h1>
      <p>
        Settlement rules: highway drop-off sender side receives 55% of delivery charges,
        receiver/last-mile side receives 45%, and every branch pays 10% gross revenue
        management fee to Head Office.
      </p>

      <section style={{ marginTop: 20, display: "grid", gap: 12 }}>
        <div style={{ padding: 16, background: "white", borderRadius: 10 }}>
          <strong>COD Settlement</strong>
          <div>COD collection, remittance and payable/receivable summary.</div>
        </div>

        <div style={{ padding: 16, background: "white", borderRadius: 10 }}>
          <strong>Prepaid Settlement</strong>
          <div>Prepaid delivery fee and branch share calculation.</div>
        </div>

        <div style={{ padding: 16, background: "white", borderRadius: 10 }}>
          <strong>Penalties</strong>
          <div>Cargo damage, loss, wrong handoff and other penalties will deduct from responsible branch.</div>
        </div>
      </section>
    </main>
  );
}
