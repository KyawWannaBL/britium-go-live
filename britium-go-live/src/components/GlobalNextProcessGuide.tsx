import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

type Requirement = "Mandatory" | "Conditional" | "Skippable";

type ProcessStep = {
  key: string;
  title: string;
  owner: string;
  responsibility: string;
  route: string;
  requirement: Requirement;
  skipReasons?: string[];
};

type ViewMode = "hidden" | "compact" | "expanded";

const STORAGE_KEY = "be.process-directory.view-mode";

const PROCESS_FLOW: ProcessStep[] = [
  {
    key: "request",
    title: "1. Request / Pickup Approval",
    owner: "Merchant / Customer Service / Supervisor",
    responsibility:
      "Confirm shipment request, merchant/customer details, pickup location, service requirement and pickup approval.",
    route: "/pickup-form",
    requirement: "Conditional",
    skipReasons: [
      "Parcel is registered directly at a Britium branch or warehouse.",
      "Approved bulk-import workflow already contains validated pickup information.",
    ],
  },
  {
    key: "data-entry",
    title: "2. Data Entry & Registration",
    owner: "Data Entry",
    responsibility:
      "Validate parcel information, proof, charges, COD values and operational fields before registration.",
    route: "/data-entry",
    requirement: "Mandatory",
  },
  {
    key: "waybill",
    title: "3. Waybill / Document Generation",
    owner: "Data Entry / Document Control",
    responsibility:
      "Generate the delivery way ID and waybill, verify printable information and prepare the parcel for operational handover.",
    route: "/waybill-studio",
    requirement: "Mandatory",
  },
  {
    key: "warehouse",
    title: "4. Warehouse Intake & Readiness",
    owner: "Warehouse",
    responsibility:
      "Scan inbound parcels, verify physical receipt, sort/stage shipments, record exceptions and confirm dispatch readiness.",
    route: "/warehouse",
    requirement: "Mandatory",
  },
  {
    key: "wayplan",
    title: "5. Wayplan Creation & Assignment",
    owner: "Supervisor / Dispatch",
    responsibility:
      "Create the wayplan and assign the required rider or vehicle crew and fleet resources under the applicable assignment rules.",
    route: "/wayplan/create",
    requirement: "Mandatory",
  },
  {
    key: "review",
    title: "6. Wayplan Review & Release",
    owner: "Supervisor",
    responsibility:
      "Review assignments, route readiness and operational exceptions before releasing the wayplan to Dispatch.",
    route: "/supervisor-wayplan",
    requirement: "Conditional",
    skipReasons: [
      "Auto-approved wayplan under an authorized operating rule.",
      "Emergency release approved by an authorized supervisor.",
    ],
  },
  {
    key: "dispatch",
    title: "7. Dispatch & Field Execution",
    owner: "Dispatch / Rider / Driver / Helper",
    responsibility:
      "Release the route, execute pickup/delivery work, update movement and status, and maintain the required field evidence.",
    route: "/dispatch-command",
    requirement: "Mandatory",
  },
  {
    key: "proof",
    title: "8. Delivery Proof / Exception Resolution",
    owner: "Field Operations / Customer Service / Supervisor",
    responsibility:
      "Confirm delivery proof or record the failed-delivery/return exception and complete the required operational resolution.",
    route: "/proof-gallery",
    requirement: "Conditional",
    skipReasons: [
      "No delivery exception exists and proof was captured successfully in the field workflow.",
    ],
  },
  {
    key: "cod",
    title: "9. COD Reconciliation",
    owner: "Finance / Operations",
    responsibility:
      "Reconcile collected COD, rider/driver handover and supporting parcel records before settlement.",
    route: "/cod-settlement",
    requirement: "Conditional",
    skipReasons: [
      "Shipment is prepaid or non-COD.",
      "No cash collection or settlement liability exists for the shipment.",
    ],
  },
  {
    key: "finance",
    title: "10. Finance Review & Settlement",
    owner: "Finance",
    responsibility:
      "Complete financial review, merchant/customer settlement, approvals, payment status and financial exception handling.",
    route: "/finance",
    requirement: "Conditional",
    skipReasons: [
      "No financial settlement is required for the applicable service type.",
    ],
  },
  {
    key: "close",
    title: "11. Operational Close & Oversight",
    owner: "Management / Admin / Audit",
    responsibility:
      "Monitor completion, KPI/audit visibility, unresolved exceptions and end-to-end operational compliance.",
    route: "/dashboard",
    requirement: "Mandatory",
  },
];

function resolveStepKey(pathname: string): string {
  const p = pathname.toLowerCase();

  if (
    p === "/" ||
    p === "/login" ||
    p === "/signup" ||
    p === "/forgot-password"
  ) return "";

  // Request, pickup approval and pickup assignment.
  if (
    p === "/pickup-form" ||
    p === "/cs-command" ||
    p === "/cs-portal" ||
    p === "/merchant-portal" ||
    p === "/customer-portal" ||
    p === "/supervisor-pickup" ||
    p === "/supervisor-portal" ||
    p === "/supervisor"
  ) return "request";

  // Parcel registration and validation.
  if (
    p === "/data-entry" ||
    p === "/data-entry-excel" ||
    p === "/data-entry-photo" ||
    p === "/data-entry-sync" ||
    p === "/data-entry-uat"
  ) return "data-entry";

  // Waybill and operational document generation.
  if (
    p === "/waybill-studio" ||
    p === "/data-entry-waybill" ||
    p === "/waybill-invoice" ||
    p === "/doc-print-room" ||
    p === "/doc-print"
  ) return "waybill";

  // Warehouse / branch physical handling and manifest preparation.
  if (
    p === "/warehouse" ||
    p === "/warehouse-operations" ||
    p === "/warehouse-ops-alt" ||
    p === "/warehouse-reg" ||
    p === "/warehouse-uat" ||
    p === "/manifest-print" ||
    p === "/branch-office"
  ) return "warehouse";

  // Wayplan creation and route planning.
  if (
    p === "/wayplan/create" ||
    p === "/wayplan-command" ||
    p === "/wayplan-detail"
  ) return "wayplan";

  // Wayplan review is distinct from pickup supervision.
  if (p === "/supervisor-wayplan") return "review";

  // Dispatch and field execution.
  if (
    p === "/dispatch-command" ||
    p === "/rider" ||
    p === "/rider-app" ||
    p === "/driver"
  ) return "dispatch";

  // Proof and exception resolution.
  if (
    p === "/proof-gallery" ||
    p === "/exceptions"
  ) return "proof";

  // COD handover / reconciliation.
  if (
    p === "/cod-settlement" ||
    p === "/rider-settlement"
  ) return "cod";

  // Finance review, invoices, accounts and settlement-related screens.
  if (
    p === "/finance" ||
    p === "/finance/data-entry-review" ||
    p === "/accounts" ||
    p === "/invoice-studio" ||
    p === "/workforce-commission"
  ) return "finance";

  // Enterprise support, governance, configuration and oversight screens
  // anchor to the final oversight stage rather than being mistaken for
  // an operational parcel-processing step.
  if (
    p === "/dashboard" ||
    p === "/admin-hr" ||
    p === "/analytics" ||
    p === "/audit-logs" ||
    p === "/biz-dev" ||
    p === "/branch-admin" ||
    p === "/exec-ops" ||
    p === "/go-live-control" ||
    p === "/marketing" ||
    p === "/marketing-portal" ||
    p === "/master-data" ||
    p === "/profile" ||
    p === "/settings" ||
    p === "/tariff" ||
    p === "/templates" ||
    p === "/go-live-readiness" ||
    p === "/ops-workflow" ||
    p === "/reporting"
  ) return "close";

  return "close";
}

function requirementStyle(requirement: Requirement) {
  if (requirement === "Mandatory") {
    return { background: "#fee2e2", color: "#991b1b", borderColor: "#fecaca" };
  }
  if (requirement === "Skippable") {
    return { background: "#dcfce7", color: "#166534", borderColor: "#bbf7d0" };
  }
  return { background: "#fef3c7", color: "#92400e", borderColor: "#fde68a" };
}

export default function GlobalNextProcessGuide() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const currentKey = useMemo(() => resolveStepKey(pathname), [pathname]);
  const currentIndex = PROCESS_FLOW.findIndex((step) => step.key === currentKey);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "compact";
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "hidden" || saved === "expanded" || saved === "compact"
      ? saved
      : "compact";
  });

  const [openStepKey, setOpenStepKey] = useState<string>(currentKey);

  useEffect(() => {
    if (currentKey) setOpenStepKey(currentKey);
  }, [currentKey]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, viewMode);
    }
  }, [viewMode]);

  if (!currentKey || currentIndex < 0) return null;

  const current = PROCESS_FLOW[currentIndex];
  const previous = currentIndex > 0 ? PROCESS_FLOW[currentIndex - 1] : null;
  const next =
    currentIndex < PROCESS_FLOW.length - 1
      ? PROCESS_FLOW[currentIndex + 1]
      : null;

  if (viewMode === "hidden") {
    return (
      <button
        type="button"
        onClick={() => setViewMode("compact")}
        className="fixed bottom-4 right-4 z-[200] rounded-full border border-amber-300 bg-slate-950 px-4 py-2 text-xs font-bold text-white shadow-xl"
        title="Show Process Directory"
      >
        Process Directory · Show
      </button>
    );
  }

  return (
    <section
      data-global-process-directory="true"
      className="mx-4 mb-5 mt-4 rounded-xl border border-slate-300 bg-white text-slate-900 shadow-md"
      aria-label="Britium Express Process Directory"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">
            Process Directory
          </div>
          <div className="mt-1 text-sm font-bold text-slate-950">
            {current.title}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Current user: {user?.full_name || "User"} · Role: {user?.role || "Unassigned"} · Step {currentIndex + 1} of {PROCESS_FLOW.length}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              setViewMode((mode) =>
                mode === "expanded" ? "compact" : "expanded"
              )
            }
            className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800"
          >
            {viewMode === "expanded" ? "Compact View" : "Show Full Process"}
          </button>
          <button
            type="button"
            onClick={() => setViewMode("hidden")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-600"
          >
            Hide
          </button>
        </div>
      </div>

      <div className="grid gap-3 px-4 py-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Previous Process
          </div>
          <div className="mt-1 text-sm font-bold">
            {previous?.title || "Starting Point"}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            {previous ? `Owner: ${previous.owner}` : "No preceding operational process."}
          </div>
          {previous && (
            <button
              type="button"
              onClick={() => navigate(previous.route)}
              className="mt-2 text-xs font-bold text-blue-700 underline"
            >
              Open previous screen
            </button>
          )}
        </div>

        <div className="rounded-lg border-2 border-blue-500 bg-blue-50 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
            Current Process
          </div>
          <div className="mt-1 text-sm font-bold text-slate-950">
            {current.title}
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-700">
            Responsible: {current.owner}
          </div>
          <div className="mt-2 text-xs leading-5 text-slate-700">
            {current.responsibility}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Next Process
          </div>
          <div className="mt-1 text-sm font-bold">
            {next?.title || "Ending Point"}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            {next ? `Owner: ${next.owner}` : "Workflow reaches operational close."}
          </div>
          {next && (
            <button
              type="button"
              onClick={() => navigate(next.route)}
              className="mt-2 text-xs font-bold text-blue-700 underline"
            >
              Open next screen
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-slate-200 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
            style={requirementStyle(current.requirement)}
          >
            {current.requirement}
          </span>
          <span className="text-xs font-semibold text-slate-700">
            Start: {PROCESS_FLOW[0].title}
          </span>
          <span className="text-xs text-slate-400">→</span>
          <span className="text-xs font-semibold text-slate-700">
            End: {PROCESS_FLOW[PROCESS_FLOW.length - 1].title}
          </span>
        </div>

        <div className="mt-2 text-xs leading-5 text-slate-600">
          {current.skipReasons?.length ? (
            <>
              <strong>Skip / exception rule:</strong>{" "}
              {current.skipReasons.join(" ")}
              {" "}Skipping is only valid when the applicable reason is recorded and the required approval/audit rule is satisfied.
            </>
          ) : (
            <>
              <strong>Skip / exception rule:</strong> No normal skip is permitted for this process. Complete the required handover before continuing.
            </>
          )}
        </div>
      </div>

      {viewMode === "expanded" && (
        <div className="border-t border-slate-200 px-4 py-4">
          <div className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-600">
            Full End-to-End Chain
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2">
            {PROCESS_FLOW.map((step, index) => {
              const isCurrent = step.key === current.key;
              const isOpen = openStepKey === step.key;

              return (
                <div
                  key={step.key}
                  className={`min-w-[220px] max-w-[260px] rounded-lg border p-3 ${
                    isCurrent
                      ? "border-blue-500 bg-blue-50"
                      : index < currentIndex
                      ? "border-slate-300 bg-slate-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenStepKey(isOpen ? "" : step.key)
                    }
                    className="w-full text-left"
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {index < currentIndex
                        ? "Preceding"
                        : isCurrent
                        ? "Current"
                        : "Following"}
                    </div>
                    <div className="mt-1 text-sm font-bold text-slate-950">
                      {step.title}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold text-slate-600">
                      {step.owner}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="mt-3 border-t border-slate-200 pt-3">
                      <div className="text-xs leading-5 text-slate-700">
                        {step.responsibility}
                      </div>
                      <div className="mt-2">
                        <span
                          className="rounded-full border px-2 py-1 text-[10px] font-bold"
                          style={requirementStyle(step.requirement)}
                        >
                          {step.requirement}
                        </span>
                      </div>
                      <div className="mt-2 text-[11px] leading-4 text-slate-500">
                        {step.skipReasons?.length
                          ? `Skip only when: ${step.skipReasons.join(" ")}`
                          : "Skip: Not normally permitted."}
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate(step.route)}
                        className="mt-3 rounded-md bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white"
                      >
                        Open screen
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
