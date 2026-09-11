// @ts-nocheck
import React, { useState } from "react";
import PortalLiveSnapshotPage from "@/components/PortalLiveSnapshotPage";

export default function CustomerPortalPage() {
  const [tracking, setTracking] = useState("");
  const [phone, setPhone] = useState("");
  const [query, setQuery] = useState({ p_tracking_no: "", p_phone: "", p_actor_email: null });

  return (
    <div>
      <div className="p-4 bg-[#0b2236] border border-[#1a3a5c] rounded-2xl mx-4 mt-4">
        <div className="text-[#f6b84b] font-semibold">Customer Tracking</div>
        <div className="text-[#8ab0c9] text-sm mt-1">Search live shipment status by Way ID / Waybill / phone.</div>
        <div className="flex gap-2 mt-3">
          <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Way ID / Waybill" className="bg-[#061524] border border-[#1a3a5c] rounded-lg px-3 py-2 text-sm flex-1" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="bg-[#061524] border border-[#1a3a5c] rounded-lg px-3 py-2 text-sm flex-1" />
          <button onClick={() => setQuery({ p_tracking_no: tracking, p_phone: phone, p_actor_email: null })} className="bg-[#35bdf4] text-[#061524] px-4 py-2 rounded-lg font-semibold">Search</button>
        </div>
      </div>
      <PortalLiveSnapshotPage
        title="Customer Portal"
        subtitle="Customer-visible status data is filtered from the canonical warehouse/dispatch lifecycle."
        rpcName="be_customer_portal_snapshot"
        rpcArgs={query}
        rowsKey="shipments"
      />
    </div>
  );
}
