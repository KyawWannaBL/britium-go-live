import { recordHighwayDropoffBags } from '@/lib/commissionApi';

// Call this function when dispatching/dropping off at Aung Mingalar or Dagon Ayar
export const handleHighwayDropoff = async (wayplanCode, bagCount, vehicleCode, driverEmail) => {
  try {
    await recordHighwayDropoffBags({
      wayplanCode,
      bagCount,
      assetCode: vehicleCode,
      driverEmail: driverEmail,
      actorEmail: "warehouse@britiumexpress.com"
    });
    alert(`Successfully recorded ${bagCount} bags for highway drop-off commission.`);
  } catch (error) {
    alert(error.message);
  }
};
