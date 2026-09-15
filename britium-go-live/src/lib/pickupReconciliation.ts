export type ReconciliationParcelRow = {
  pickup_id?: string;
  parcel_sequence?: number;
  delivery_way_id?: string;
  saved?: boolean;
  sourceMerchantName?: string;
  recipient_name?: string;
  recipient_phone?: string;
  delivery_address?: string;
  township?: string;
  sourceWard?: string;
  sourcePostalCode?: string;
  item_price?: number | string;
  delivery_charges?: number | string;
  amount_entry_type?: string;
  merchant_stated_total_amount?: number | string;
  service_provider_code?: string;
  handoffStationName?: string;
  locationStatus?: string;
  remarks?: string;
  message?: string;
  [key: string]: unknown;
};

export type PickupReconciliation = {
  pickupId: string;
  expected: number;
  warehouseReceived: number;
  registered: number;
  dataEntryUnresolved: number;
  warehouseOutstanding: number;
  warehouseTrackingGap: number;
  balanced: boolean;
};

function nonNegativeInt(value: unknown): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function valueText(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function hasOwn(row: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, key);
}

function numericCell(value: unknown): number | "" {
  if (value == null || value === "") return "";
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : "";
}

export function buildPickupReconciliation(input: {
  pickupId: string;
  expected: number;
  warehouseReceived: number;
  registered: number;
  rows?: ReconciliationParcelRow[];
}): PickupReconciliation {
  const expected = nonNegativeInt(input.expected);
  const warehouseReceived = Math.min(expected || Number.MAX_SAFE_INTEGER, nonNegativeInt(input.warehouseReceived));
  const registered = Math.min(expected || Number.MAX_SAFE_INTEGER, nonNegativeInt(input.registered));
  const dataEntryUnresolved = Math.max(expected - registered, 0);
  const warehouseOutstanding = Math.max(expected - warehouseReceived, 0);
  const warehouseTrackingGap = Math.abs(warehouseReceived - registered);
  return {
    pickupId: valueText(input.pickupId),
    expected,
    warehouseReceived,
    registered,
    dataEntryUnresolved,
    warehouseOutstanding,
    warehouseTrackingGap,
    balanced: expected > 0 && warehouseReceived === expected && registered === expected,
  };
}

export function buildUnresolvedExportRows(rows: ReconciliationParcelRow[]): Record<string, unknown>[] {
  return rows
    .filter((row) => !row.saved)
    .sort((a, b) => nonNegativeInt(a.parcel_sequence) - nonNegativeInt(b.parcel_sequence))
    .map((row) => ({
      "Pickup ID": valueText(row.pickup_id),
      "Parcel Sequence": nonNegativeInt(row.parcel_sequence),
      "Delivery Way ID": valueText(row.delivery_way_id),
      "Original Merchant": valueText(row.sourceMerchantName),
      "Recipient Name": valueText(row.recipient_name),
      "Recipient Phone": valueText(row.recipient_phone),
      "Address": valueText(row.delivery_address),
      "Township": valueText(row.township),
      "Ward": valueText(row.sourceWard),
      "Postal Code": valueText(row.sourcePostalCode),
      "Item Price": row.item_price ?? "",
      "Delivery Charge": row.delivery_charges ?? "",
      "Amount Entry Type": valueText(row.amount_entry_type),
      "Exact Collection": row.merchant_stated_total_amount ?? "",
      "Provider": valueText(row.service_provider_code),
      "Highway Station": valueText(row.handoffStationName),
      "Location Status": valueText(row.locationStatus),
      "Current Error": valueText(row.message),
      "Resolution": "",
      "Remarks": valueText(row.remarks),
    }));
}

export function parseCorrectedWorkbookRows(
  workbookRows: Record<string, unknown>[],
  pickupId: string,
  allowedSequences: Set<number>,
): { updates: Array<{ parcel_sequence: number; patch: Record<string, unknown> }>; errors: string[] } {
  const expectedPickupId = valueText(pickupId);
  const seen = new Set<number>();
  const updates: Array<{ parcel_sequence: number; patch: Record<string, unknown> }> = [];
  const errors: string[] = [];

  workbookRows.forEach((raw, index) => {
    const excelRow = index + 2;
    const rowPickupId = valueText(raw["Pickup ID"]);
    const sequence = nonNegativeInt(raw["Parcel Sequence"]);
    if (!sequence) {
      errors.push(`Excel row ${excelRow}: Parcel Sequence is required.`);
      return;
    }
    if (rowPickupId && rowPickupId !== expectedPickupId) {
      errors.push(`Excel row ${excelRow}: parcel ${sequence} belongs to ${rowPickupId}, not ${expectedPickupId}.`);
      return;
    }
    if (!allowedSequences.has(sequence)) {
      errors.push(`Excel row ${excelRow}: parcel sequence ${sequence} is not an unresolved parcel in ${expectedPickupId}.`);
      return;
    }
    if (seen.has(sequence)) {
      errors.push(`Excel row ${excelRow}: Duplicate parcel sequence ${sequence}.`);
      return;
    }
    seen.add(sequence);

    const patch: Record<string, unknown> = {
      saved: false,
      skipped: false,
      calculationFailed: false,
      calculation: {},
      message: "Corrected from reconciliation workbook. Recalculate and Save All to consolidate this parcel.",
    };
    const textMappings: Array<[string, string]> = [
      ["Delivery Way ID", "delivery_way_id"],
      ["Original Merchant", "sourceMerchantName"],
      ["Recipient Name", "recipient_name"],
      ["Recipient Phone", "recipient_phone"],
      ["Address", "delivery_address"],
      ["Township", "township"],
      ["Ward", "sourceWard"],
      ["Postal Code", "sourcePostalCode"],
      ["Amount Entry Type", "amount_entry_type"],
      ["Provider", "service_provider_code"],
      ["Highway Station", "handoffStationName"],
      ["Remarks", "remarks"],
    ];
    for (const [column, field] of textMappings) {
      if (hasOwn(raw, column)) patch[field] = valueText(raw[column]);
    }
    const numericMappings: Array<[string, string]> = [
      ["Item Price", "item_price"],
      ["Delivery Charge", "delivery_charges"],
      ["Exact Collection", "merchant_stated_total_amount"],
    ];
    for (const [column, field] of numericMappings) {
      if (hasOwn(raw, column)) patch[field] = numericCell(raw[column]);
    }
    const resolution = valueText(raw["Resolution"]);
    if (resolution) patch.reconciliationResolution = resolution.toUpperCase();
    updates.push({ parcel_sequence: sequence, patch });
  });

  return { updates, errors };
}
