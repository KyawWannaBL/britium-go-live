import { Navigate } from "react-router-dom";

export default function DispatchDuplicateRedirect() {
  return <Navigate to="/dispatch-command" replace />;
}
