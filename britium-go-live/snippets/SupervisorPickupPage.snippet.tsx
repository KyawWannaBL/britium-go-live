import { loadOperationalQueue, assignPickup } from "@/lib/britiumOperationalApi";

async function loadSupervisorQueue() {
  setRows(await loadOperationalQueue("supervisor"));
}

async function onAssign(row: any) {
  await assignPickup({
    pickupId: row.pickup_id,
    riderEmail: selectedRiderEmail,
    driverEmail: selectedDriverEmail,
    helperEmail: selectedHelperEmail,
    vehicleId: selectedVehicleId,
    actorEmail: currentUserEmail,
  });
  await loadSupervisorQueue();
}
