// @ts-nocheck
import PortalLiveSnapshotPage from "@/components/PortalLiveSnapshotPage";

export default function CODSettlementPage() {
  return (
    <PortalLiveSnapshotPage
      title="COD Settlement"
      subtitle="Finance V48 COD reconciliation from Rider delivery proof, COD collection, remittance and settlement workflow."
      rpcName="be_finance_cod_snapshot_v48"
      rpcArgs={{ p_status: "ALL", p_limit: 500 }}
      rowsKey="rows"
    />
  );
}
