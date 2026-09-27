const DELIVERY_WAY_ID = /^D\d{4}-[A-Z0-9]+-\d+$/i;

export function normalizeDeliveryWayId(value: unknown): string {
  const id = String(value || "").trim().toUpperCase();
  return DELIVERY_WAY_ID.test(id) ? id : "";
}

/**
 * Canonical operational Way ID contract.
 * P... identifiers are Pickup IDs and must never be surfaced as Way ID.
 */
export function canonicalDeliveryWayId(row: any): string {
  const candidates = [
    row?.delivery_way_id,
    row?.canonical_delivery_way_id,
    row?.waybill_no,
    row?.source_waybill_no,
    row?.display_way_id,
    row?.tracking_no,
    row?.way_id,
    row?.id,
  ];
  for (const candidate of candidates) {
    const id = normalizeDeliveryWayId(candidate);
    if (id) return id;
  }
  return "";
}

export function isCanonicalDeliveryWayId(value: unknown): boolean {
  return Boolean(normalizeDeliveryWayId(value));
}
