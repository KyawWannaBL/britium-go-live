// @ts-nocheck
import PortalLiveSnapshotPage from "@/components/PortalLiveSnapshotPage";

export default function SupervisorWayplanReviewPage() {
  return (
    <PortalLiveSnapshotPage
      title="Supervisor Wayplan"
      subtitle="Wayplan review from live wayplan, warehouse, and dispatch workflow."
      rpcName="be_supervisor_wayplan_snapshot"
      rpcArgs={{}}
      rowsKey="wayplans"
    />
  );
}
