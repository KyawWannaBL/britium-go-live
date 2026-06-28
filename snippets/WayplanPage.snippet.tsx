import { loadOperationalQueue, createWayplanForWaybill } from "@/lib/britiumOperationalApi";

async function loadWayplanQueue() {
  setRows(await loadOperationalQueue("wayplan"));
}

async function onCreateWayplan(row: any) {
  await createWayplanForWaybill({
    waybillNo: row.waybill_no,
    branchCode: row.branch_code || "YGN",
    routeCode: selectedRouteCode || "ROUTE",
    routeName: selectedRouteName || "Route",
    vehicleId: selectedVehicleId,
    riderEmail: selectedRiderEmail,
    driverEmail: selectedDriverEmail,
    helperEmail: selectedHelperEmail,
    actorEmail: currentUserEmail,
  });
  await loadWayplanQueue();
}
