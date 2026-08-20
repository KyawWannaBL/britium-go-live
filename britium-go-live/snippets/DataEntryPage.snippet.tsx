import { loadOperationalQueue, createWaybill } from "@/lib/britiumOperationalApi";

async function loadDataEntryQueue() {
  setQueue(await loadOperationalQueue("dataEntry"));
}

async function onCreateWaybill(row: any) {
  await createWaybill({
    pickupId: row.pickup_id,
    receiverName: row.receiver_name || row.recipient_name || "Receiver",
    receiverPhone: row.receiver_phone || "09999999999",
    receiverAddress: row.receiver_address || row.address || "",
    destinationCity: row.destination_city || row.destination || "Yangon",
    destinationTownship: row.destination_township || row.township || "Tamwe",
    codAmount: Number(row.cod_amount || row.cod || 0),
    actorEmail: currentUserEmail,
  });
  await loadDataEntryQueue();
}
