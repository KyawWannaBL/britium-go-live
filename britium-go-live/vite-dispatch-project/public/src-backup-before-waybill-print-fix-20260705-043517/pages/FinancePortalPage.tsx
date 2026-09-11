// @ts-nocheck
import PortalLiveSnapshotPage from "@/components/PortalLiveSnapshotPage";

export default function FinancePortalPage() {
  return (
    <PortalLiveSnapshotPage
      title="Finance Portal"
      subtitle="Live COD, delivery fee and settlement summary from dispatch jobs."
      rpcName="be_finance_portal_snapshot"
      rpcArgs={{}}
      rowsKey="rows"
    />
  );
}
