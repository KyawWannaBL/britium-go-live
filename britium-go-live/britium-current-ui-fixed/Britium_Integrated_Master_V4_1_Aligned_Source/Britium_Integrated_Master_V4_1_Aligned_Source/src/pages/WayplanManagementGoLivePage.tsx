import { Navigate } from "react-router-dom";

export default function RedirectToWayplanCommandCenter() {
  return <Navigate to="/wayplan-command" replace />;
}
