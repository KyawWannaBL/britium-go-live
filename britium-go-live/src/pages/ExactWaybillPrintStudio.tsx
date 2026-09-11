
function resolvePrintableWaybillNo(row: any) {
  return String(
    row?.waybill_no ||
    row?.waybillNo ||
    row?.waybill ||
    row?.delivery_way_id ||
    row?.tracking_no ||
    ""
  ).trim();
}

async function printWaybillWithGuard(row: any) {
  const documentNo = resolvePrintableWaybillNo(row);
  await guardedBrowserPrint({
    document_type: "WAYBILL",
    document_no: documentNo,
    document_ref: row?.delivery_way_id || row?.tracking_no || documentNo,
    reason: "Waybill print from Waybill Print Studio",
  });
}

import { guardedBrowserPrint } from "@/lib/documentPrintGuard";
export { default } from "@/pages/BritiumExactWaybillPrintStudioV15";
