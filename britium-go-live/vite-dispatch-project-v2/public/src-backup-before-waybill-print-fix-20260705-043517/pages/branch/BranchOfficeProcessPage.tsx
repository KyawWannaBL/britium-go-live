import React from "react";

export default function BranchOfficeProcessPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Branch Office Operations</h1>
      <p>
        Branch pickup order request, assignment, wayplan, waybill, order picking,
        pickup verification, delivery, data entry, workforce commission and settlement
        will be operated from the same Head Office workflow backend.
      </p>

      <section style={{ marginTop: 20, display: "grid", gap: 12 }}>
        <div style={{ padding: 16, background: "white", borderRadius: 10 }}>
          <strong>Yangon Head Office</strong>
          <div>Central management, waybill control, print permission and finance settlement.</div>
        </div>

        <div style={{ padding: 16, background: "white", borderRadius: 10 }}>
          <strong>Mandalay Branch</strong>
          <div>Lat: 21.956116019017543, Lng: 96.07492645095482</div>
        </div>

        <div style={{ padding: 16, background: "white", borderRadius: 10 }}>
          <strong>Naypyitaw Branch</strong>
          <div>Lat: 19.73537445987814, Lng: 96.1527056747248</div>
        </div>
      </section>
    </main>
  );
}
