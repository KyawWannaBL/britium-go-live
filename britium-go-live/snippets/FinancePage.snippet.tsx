import { loadOperationalQueue, settleCod } from "@/lib/britiumOperationalApi";

async function loadFinanceQueue() {
  setRows(await loadOperationalQueue("finance"));
}

async function onSettle(row: any) {
  await settleCod({
    waybillNo: row.waybill_no,
    settledAmount: Number(row.collected_amount || row.cod_amount || 0),
    method: "CASH_HANDOVER",
    referenceNo: settlementReferenceNo,
    actorEmail: currentUserEmail,
  });
  await loadFinanceQueue();
}
