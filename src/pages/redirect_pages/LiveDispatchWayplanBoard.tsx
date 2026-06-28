import { Navigate } from "react-router-dom";

export default function RedirectPage() {
  return <Navigate to="/dispatch-command" replace />;
}
