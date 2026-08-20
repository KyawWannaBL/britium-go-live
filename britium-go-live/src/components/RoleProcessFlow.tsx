import React from "react";

type ProcessStep = {
  key: string;
  label: string;
  owner: string;
  responsibility: string;
};

const PROCESS_FLOW: ProcessStep[] = [
  { key: "request", label: "1. Request", owner: "Merchant / Customer Service", responsibility: "Create the pickup or delivery request and confirm shipment details." },
  { key: "assignment", label: "2. Assignment", owner: "Supervisor", responsibility: "Validate the request and assign the required rider, driver, helper, and fleet resources." },
  { key: "pickup", label: "3. Pickup", owner: "Rider / Driver", responsibility: "Collect the shipment, capture pickup proof, and hand it over to operations." },
  { key: "dispatch", label: "4. Dispatch", owner: "Dispatch / Branch", responsibility: "Plan the route or wayplan, consolidate loads, and dispatch shipments to the next node." },
  { key: "warehouse", label: "5. Warehouse", owner: "Warehouse", responsibility: "Scan intake, sort, stage, transfer, and release shipments through the hub." },
  { key: "delivery", label: "6. Delivery", owner: "Rider / Driver", responsibility: "Complete last-mile delivery and capture proof of delivery or the delivery exception." },
  { key: "data", label: "7. Data Verification", owner: "Data Entry", responsibility: "Verify proofs, waybills, COD information, and supporting operational records." },
  { key: "finance", label: "8. Settlement", owner: "Finance", responsibility: "Reconcile COD, settlements, commissions, and financial exceptions." },
  { key: "oversight", label: "9. Oversight", owner: "Management / Admin", responsibility: "Monitor KPIs, exceptions, compliance, approvals, and end-to-end performance." },
];

function normalizeRole(role?: string) {
  return String(role || "").trim().toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
}

function resolveProcessKey(role?: string, activeKey?: string) {
  const r = normalizeRole(role);
  const active = String(activeKey || "").toLowerCase();

  if (["merchant", "vip-customer", "cs", "customer-service", "support"].includes(r)) return "request";
  if (["supervisor", "fleet-manager"].includes(r)) return "assignment";
  if (["rider", "driver"].includes(r)) return active.includes("deliver") ? "delivery" : "pickup";
  if (["dispatch", "dispatcher", "branch-manager", "branch-staff", "branch-admin"].includes(r)) return "dispatch";
  if (["warehouse", "warehouse-staff", "sorter"].includes(r)) return "warehouse";
  if (["data-entry", "encoder"].includes(r)) return "data";
  if (["finance", "finance-admin", "accountant"].includes(r)) return "finance";
  if (["admin", "superadmin", "super-admin", "management", "director"].includes(r)) return "oversight";
  return "";
}

export default function RoleProcessFlow({ role, activeKey }: { role?: string; activeKey?: string }) {
  const currentKey = resolveProcessKey(role, activeKey);
  const currentIndex = PROCESS_FLOW.findIndex((step) => step.key === currentKey);

  return (
    <section aria-label="Standard role process guide" style={{ background: "#ffffff", borderBottom: "1px solid #e2e8f0", padding: "12px 24px 14px", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 9, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Standard Process Guide</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>Follow the responsibilities from left to right. This is a role guide, not live shipment status.</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>Current role: {role || "Unassigned"}</div>
      </div>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
        {PROCESS_FLOW.map((step, index) => {
          const isCurrent = index === currentIndex;
          const isPrevious = currentIndex >= 0 && index < currentIndex;
          const relation = isCurrent ? "Your responsibility" : isPrevious ? "Preceding process" : "Following process";

          return (
            <React.Fragment key={step.key}>
              <div style={{ minWidth: 180, maxWidth: 220, border: isCurrent ? "2px solid #2563eb" : "1px solid #cbd5e1", borderRadius: 10, padding: "9px 10px", background: isCurrent ? "#eff6ff" : isPrevious ? "#f8fafc" : "#ffffff", boxShadow: isCurrent ? "0 2px 8px rgba(37,99,235,0.12)" : "none" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: isCurrent ? "#1d4ed8" : isPrevious ? "#64748b" : "#94a3b8" }}>{relation}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginTop: 3 }}>{step.label}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#334155", marginTop: 2 }}>{step.owner}</div>
                <div style={{ fontSize: 10.5, lineHeight: 1.45, color: "#64748b", marginTop: 4 }}>{step.responsibility}</div>
              </div>
              {index < PROCESS_FLOW.length - 1 && <div aria-hidden="true" style={{ alignSelf: "center", color: "#94a3b8", fontSize: 18, fontWeight: 700, flexShrink: 0 }}>→</div>}
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
}
