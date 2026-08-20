// @ts-nocheck
import PortalLiveSnapshotPage from "@/components/PortalLiveSnapshotPage";

import { guardedBrowserPrint } from "@/lib/documentPrintGuard";


function resolvePrintableInvoiceNo(row: any) {
  return String(
    row?.invoice_no ||
    row?.invoiceNo ||
    row?.invoice ||
    row?.delivery_way_id?.replace(/^D/, "INV") ||
    row?.waybill_no?.replace(/^WB/, "INV") ||
    ""
  ).trim();
}

async function printInvoiceWithGuard(row: any) {
  const documentNo = resolvePrintableInvoiceNo(row);
  await guardedBrowserPrint({
    document_type: "INVOICE",
    document_no: documentNo,
    document_ref: row?.delivery_way_id || row?.waybill_no || documentNo,
    reason: "Invoice print from Finance Invoice Studio",
  });
}

export default function InvoiceStudioPage() {
  return (
    <PortalLiveSnapshotPage
      title="Invoice Studio"
      subtitle="Invoice-ready grouped waybill rows from live delivery workflow."
      rpcName="be_invoice_studio_snapshot"
      rpcArgs={{}}
      rowsKey="invoices"
    />
  );
}
