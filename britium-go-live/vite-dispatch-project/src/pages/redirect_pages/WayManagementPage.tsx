// @ts-nocheck
import { useEffect } from "react";
export default function RedirectToWayplanCommand() {
  useEffect(() => { window.location.hash = "#/wayplan-command"; }, []);
  return <div className="p-6 text-slate-300">Redirecting to Wayplan Command Center...</div>;
}
