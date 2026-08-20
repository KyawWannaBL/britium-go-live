import WayplanMapboxPanel from "@/components/wayplan/WayplanMapboxPanel";
import BaseWayplanCommandCenterPage from "@/pages/WayplanCommandCenterPage.base";

export default function WayplanCommandCenterPage() {
  return (
    <div className="space-y-4">
      <WayplanMapboxPanel />
      <BaseWayplanCommandCenterPage />
    </div>
  );
}
