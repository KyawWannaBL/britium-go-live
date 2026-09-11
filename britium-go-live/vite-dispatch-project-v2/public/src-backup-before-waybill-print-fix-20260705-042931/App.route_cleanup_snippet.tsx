// Route/menu cleanup snippet for App.tsx
// Keep only these two operational dispatch routes:
//   /dispatch-command  -> DispatchCommandCenterPage
//   /wayplan-command   -> WayplanCommandCenterPage
//
// Import:
import DispatchCommandCenterPage from "@/pages/DispatchCommandCenterPage";
import WayplanCommandCenterPage from "@/pages/WayplanCommandCenterPage";
import WarehousePage from "@/pages/WarehousePage";
import ExceptionsPage from "@/pages/ExceptionsPage";

// Example hash router entries:
const pageMap = {
  "dispatch-command": <DispatchCommandCenterPage />,
  "wayplan-command": <WayplanCommandCenterPage />,
  "warehouse": <WarehousePage />,
  "exceptions": <ExceptionsPage />,
  // duplicate dispatch pages redirect to dispatch-command:
  "dispatch": <DispatchCommandCenterPage />,
  "dispatch-center": <DispatchCommandCenterPage />,
  "live-dispatch": <DispatchCommandCenterPage />,
  "delivery-dispatch": <DispatchCommandCenterPage />,
  "delivery-workflow": <DispatchCommandCenterPage />,
  "ops-command": <DispatchCommandCenterPage />,
  "ops-manager": <DispatchCommandCenterPage />,
  "exec-ops": <DispatchCommandCenterPage />,
  // duplicate wayplan pages redirect to wayplan-command:
  "way-management": <WayplanCommandCenterPage />,
  "way-management-plan": <WayplanCommandCenterPage />,
  "wayplan-zone": <WayplanCommandCenterPage />,
  "wayplan-management": <WayplanCommandCenterPage />,
};

// Sidebar: hide/remove duplicated labels and keep only:
// - Dispatch Command
// - Wayplan Command
// - Warehouse
// - Exceptions
