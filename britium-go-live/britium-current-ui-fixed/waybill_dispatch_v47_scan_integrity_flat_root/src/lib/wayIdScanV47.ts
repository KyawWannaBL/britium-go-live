export const WAY_ID_SCAN_V47_BUILD = "WAY_ID_SCAN_V47_CANONICAL_PARCEL_CODE_2026-07-30";

const WAY_ID_GLOBAL = /D\d{4}-[A-Z0-9]{2,12}-\d{3,6}/gi;
const WAY_ID_EXACT = /^D\d{4}-[A-Z0-9]{2,12}-\d{3,6}$/i;

export type WayIdCarrier = Record<string, unknown> | null | undefined;

export function normalizeWayId(value: unknown): string {
  const raw = String(value ?? "").trim().toUpperCase();
  return WAY_ID_EXACT.test(raw) ? raw : "";
}

export function extractWayIds(raw: unknown): string[] {
  const input = String(raw ?? "").toUpperCase();
  const matches = input.match(WAY_ID_GLOBAL) || [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const match of matches) {
    const id = normalizeWayId(match);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  return result;
}

export function countWayIdOccurrences(raw: unknown): number {
  return (String(raw ?? "").toUpperCase().match(WAY_ID_GLOBAL) || []).length;
}

export function canonicalWayIdFromRow(row: WayIdCarrier): string {
  if (!row) return "";
  const candidates = [
    row.delivery_way_id,
    row.way_id,
    row.tracking_code,
    row.tracking_no,
    row.parcel_way_id,
    row.delivery_id,
  ];

  for (const candidate of candidates) {
    const exact = normalizeWayId(candidate);
    if (exact) return exact;
  }

  return "";
}

export function describeScanPayload(raw: unknown) {
  const ids = extractWayIds(raw);
  const occurrences = countWayIdOccurrences(raw);
  return {
    ids,
    uniqueCount: ids.length,
    occurrenceCount: occurrences,
    duplicateCount: Math.max(occurrences - ids.length, 0),
  };
}
