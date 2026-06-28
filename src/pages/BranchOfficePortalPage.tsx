// @ts-nocheck
import React, { useState } from "react";
import PortalLiveSnapshotPage from "@/components/PortalLiveSnapshotPage";

export default function BranchOfficePortalPage() {
  const [branch, setBranch] = useState("YGN");
  const [query, setQuery] = useState({ p_branch_code: "YGN", p_actor_email: null });

  return (
    <div>
      <div className="p-4 bg-[#0b2236] border border-[#1a3a5c] rounded-2xl mx-4 mt-4">
        <div className="text-[#f6b84b] font-semibold">Branch Office Portal</div>
        <div className="text-[#8ab0c9] text-sm mt-1">Branch merchant onboarding, service areas, and branch dashboard from live backend.</div>
        <div className="flex gap-2 mt-3">
          <input value={branch} onChange={(e) => setBranch(e.target.value.toUpperCase())} placeholder="Branch Code" className="bg-[#061524] border border-[#1a3a5c] rounded-lg px-3 py-2 text-sm flex-1" />
          <button onClick={() => setQuery({ p_branch_code: branch, p_actor_email: null })} className="bg-[#f6b84b] text-[#061524] px-4 py-2 rounded-lg font-semibold">Load Branch</button>
        </div>
      </div>
      <PortalLiveSnapshotPage
        title="Branch Office"
        subtitle="Live branch office and merchant onboarding records. No backend access required for branch users."
        rpcName="be_branch_office_portal_snapshot"
        rpcArgs={query}
        rowsKey="merchants"
      />
    </div>
  );
}
