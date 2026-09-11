// @ts-nocheck
import { useEffect } from "react";
export default function RedirectToDispatchCommand() {
  useEffect(() => { window.location.hash = "#/dispatch-command"; }, []);
  return <div className="p-6 text-slate-300">Redirecting to Dispatch Command Center...</div>;
}
