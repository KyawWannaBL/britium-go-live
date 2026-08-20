// @ts-nocheck
// Route/menu cleanup snippet for src/App.tsx
// Replace old mock/static pages with live API-backed pages.

import SupervisorPortalPage from "@/pages/SupervisorPortalPage";
import SupervisorPickupPage from "@/pages/SupervisorPickupPage";
import SupervisorWayplanReviewPage from "@/pages/SupervisorWayplanReviewPage";
import FinancePortalPage from "@/pages/FinancePortalPage";
import InvoiceStudioPage from "@/pages/InvoiceStudioPage";
import CODSettlementPage from "@/pages/CODSettlementPage";
import RiderSettlementPage from "@/pages/RiderSettlementPage";
import CustomerPortalPage from "@/pages/CustomerPortalPage";
import BranchOfficePortalPage from "@/pages/BranchOfficePortalPage";

// Existing pages already patched earlier:
import WarehousePage from "@/pages/WarehousePage";
import ExceptionsPage from "@/pages/ExceptionsPage";
import DispatchCommandCenterPage from "@/pages/DispatchCommandCenterPage";
import WayplanCommandCenterPage from "@/pages/WayplanCommandCenterPage";

export const pageMap = {
  "supervisor": <SupervisorPortalPage />,
  "supervisor-pickup": <SupervisorPickupPage />,
  "supervisor-wayplan": <SupervisorWayplanReviewPage />,

  "finance": <FinancePortalPage />,
  "invoice-studio": <InvoiceStudioPage />,
  "cod-settlement": <CODSettlementPage />,
  "rider-settlement": <RiderSettlementPage />,

  "customer-portal": <CustomerPortalPage />,
  "branch-office": <BranchOfficePortalPage />,

  "warehouse": <WarehousePage />,
  "exceptions": <ExceptionsPage />,
  "dispatch-command": <DispatchCommandCenterPage />,
  "wayplan-command": <WayplanCommandCenterPage />,

  // Redirect duplicate pages to the canonical pages:
  "dispatch": <DispatchCommandCenterPage />,
  "dispatch-center": <DispatchCommandCenterPage />,
  "live-dispatch": <DispatchCommandCenterPage />,
  "delivery-dispatch": <DispatchCommandCenterPage />,
  "delivery-workflow": <DispatchCommandCenterPage />,
  "ops-command": <DispatchCommandCenterPage />,
  "ops-manager": <DispatchCommandCenterPage />,
  "exec-ops": <DispatchCommandCenterPage />,

  "way-management": <WayplanCommandCenterPage />,
  "way-management-plan": <WayplanCommandCenterPage />,
  "wayplan-zone": <WayplanCommandCenterPage />,
  "wayplan-management": <WayplanCommandCenterPage />,
};

// Sidebar recommendation:
// Keep these operational items visible:
// - Supervisor
// - Supervisor Pickup
// - Supervisor Wayplan
// - Warehouse
// - Wayplan Command
// - Dispatch Command
// - Exceptions
// - Finance Portal
// - Invoice Studio
// - COD Settlement
// - Rider Settlement
// - Customer Portal
// - Branch Office
//
// Remove/hide duplicate dispatch/wayplan labels listed above.
