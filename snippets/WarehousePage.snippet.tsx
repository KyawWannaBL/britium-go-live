import { loadOperationalQueue, warehouseReceive } from "@/lib/britiumOperationalApi";

async function loadWarehouseQueue() {
  setRows(await loadOperationalQueue("warehouse"));
}

async function onReceive(row: any) {
  await warehouseReceive({
    waybillNo: row.waybill_no,
    actorEmail: currentUserEmail,
    branchCode: row.branch_code || "YGN",
    note: "Warehouse received",
  });
  await loadWarehouseQueue();
}
