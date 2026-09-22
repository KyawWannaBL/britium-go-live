export type ConsolidatedBulkPickupIdentity = {
  pickup_id?: unknown;
  merchant_id?: unknown;
  merchant_code?: unknown;
  merchant_name?: unknown;
};

function normalized(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

export function consolidatedBulkCode(pickup: ConsolidatedBulkPickupIdentity): "BBB" | "BLK" | "" {
  const merchantCode = normalized(pickup.merchant_code);
  if (merchantCode === "BBB" || merchantCode === "BLK") return merchantCode;

  const merchantId = normalized(pickup.merchant_id);
  if (merchantId === "BBB" || merchantId === "BLK") return merchantId;

  const pickupId = normalized(pickup.pickup_id);
  if (/(^|-)BBB(-|$)/.test(pickupId)) return "BBB";
  if (/(^|-)BLK(-|$)/.test(pickupId)) return "BLK";

  const merchantName = normalized(pickup.merchant_name);
  if (/\bBBB\b/.test(merchantName)) return "BBB";
  if (/\bBLK\b/.test(merchantName)) return "BLK";

  return "";
}

export function isConsolidatedBulkPickup(pickup: ConsolidatedBulkPickupIdentity): boolean {
  return consolidatedBulkCode(pickup) !== "";
}

export const OS_BULK_REASON_FIELD_STYLE = {
  backgroundColor: "#ffffff",
  color: "#061524",
  WebkitTextFillColor: "#061524",
  colorScheme: "light",
} as const;
