/** Scanner payloads contain identifiers, never executable URLs or commands. */
export function normalizeWarehouseScan(raw: string): string {
  const code=String(raw??"").trim().replace(/^\][A-Za-z][0-9]/,"").trim();
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(code))
    throw new Error("Scan the waybill barcode or QR code containing its ID, or type the ID manually.");
  return code;
}
