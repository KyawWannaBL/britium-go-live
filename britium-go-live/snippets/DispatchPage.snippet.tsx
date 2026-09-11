import { loadOperationalQueue, dispatchStart, markDelivered } from "@/lib/britiumOperationalApi";

async function loadDispatchQueue() {
  setRows(await loadOperationalQueue("dispatch"));
}

async function onDispatch(row: any) {
  await dispatchStart({
    wayplanId: row.wayplan_id,
    actorEmail: currentUserEmail,
  });
  await loadDispatchQueue();
}

async function onDelivered(row: any) {
  await markDelivered({
    waybillNo: row.waybill_no,
    collectedCodAmount: Number(row.cod_amount || 0),
    actorEmail: currentUserEmail,
  });
  await loadDispatchQueue();
}
