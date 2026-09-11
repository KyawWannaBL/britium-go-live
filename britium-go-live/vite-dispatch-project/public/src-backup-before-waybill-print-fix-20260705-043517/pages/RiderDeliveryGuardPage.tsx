import { lazy, Suspense } from "react";
import { Link, useLocation } from "react-router-dom";
import { AlertTriangle, Bike, ArrowRight } from "lucide-react";

const RiderDeliveryPage = lazy(() => import("@/pages/RiderDeliveryPage"));

export default function RiderDeliveryGuardPage() {
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const pickupId = query.get("pickup_id") || query.get("pickupId") || query.get("job") || "";

  if (!pickupId) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center bg-[#061524] text-[#eef8ff]">
        <div className="max-w-xl rounded-3xl border border-[#1a3a5c] bg-[#0b2236] p-8 shadow-2xl">
          <div className="text-[#f6b84b] text-[13px] font-black uppercase tracking-[0.18em] flex items-center gap-2 mb-3">
            <Bike size={18} /> Rider Delivery Route
          </div>
          <div className="rounded-2xl border border-[#ff4f86]/50 bg-[#061524] p-4 text-[#ff4f86] text-[13px] flex items-start gap-2 mb-5">
            <AlertTriangle size={18} /> No delivery assignment is selected. This screen will not crash anymore; open Rider Workflow Portal and select an assigned delivery job first.
          </div>
          <Link to="/rider-app" className="inline-flex items-center gap-2 rounded-xl bg-[#f6b84b] px-5 py-3 text-[#061524] text-[12px] font-black uppercase tracking-widest">
            Open Rider Workflow Portal <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="p-6 text-[#4d7a9b]">Loading delivery job...</div>}>
      <RiderDeliveryPage />
    </Suspense>
  );
}
