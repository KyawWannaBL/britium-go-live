// @ts-nocheck
import PortalLiveSnapshotPage from "@/components/PortalLiveSnapshotPage";

export default function RiderSettlementPage() {
  return (
    <PortalLiveSnapshotPage
      title="Rider Settlement"
      subtitle="Rider/driver settlement rows from live dispatch jobs."
      rpcName="be_rider_settlement_snapshot"
      rpcArgs={{ p_rider_email: null, p_work_date: new Date().toISOString().slice(0, 10) }}
      rowsKey="rows"
    />
  );
}
