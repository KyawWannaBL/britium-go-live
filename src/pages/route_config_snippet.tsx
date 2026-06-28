import { Navigate, Route } from "react-router-dom";
import WayplanCommandCenterPage from "@/pages/WayplanCommandCenterPage";

export const wayplanRoutes = (
  <>
    <Route path="/wayplan-command" element={<WayplanCommandCenterPage />} />
    <Route path="/way-management" element={<Navigate to="/wayplan-command" replace />} />
    <Route path="/way-management-plan" element={<Navigate to="/wayplan-command" replace />} />
    <Route path="/wayplan-zone" element={<Navigate to="/wayplan-command" replace />} />
    <Route path="/wayplan-go-live" element={<Navigate to="/wayplan-command" replace />} />
  </>
);
