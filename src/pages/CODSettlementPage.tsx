// @ts-nocheck
import PortalLiveSnapshotPage from "@/components/PortalLiveSnapshotPage";

export default function CODSettlementPage() {
  return (
    <PortalLiveSnapshotPage
      title="COD Settlement"
      subtitle="COD settlement rows from delivered/drop-off/RTO workflow."
      rpcName="be_cod_settlement_snapshot"
      rpcArgs={{}}
      rowsKey="rows"
    />
  );
}
