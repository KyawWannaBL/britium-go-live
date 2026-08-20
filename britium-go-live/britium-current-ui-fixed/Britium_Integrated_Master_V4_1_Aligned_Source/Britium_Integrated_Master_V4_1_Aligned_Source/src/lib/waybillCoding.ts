export type AnyWaybillSource = Record<string, any>;

export type WaybillCodingInput = {
  date?: string | Date | null;
  merchantName?: string | null;
  merchantCode?: string | null;
  sequence?: number | string | null;
  pickupId?: string | null;
};

export const WAYBILL_ID_PATTERN = /^D\d{4}-[A-Z0-9]{3,}-\d{3}$/i;
export const PICKUP_ID_PATTERN = /^P(\d{4})-([A-Z0-9]{3,})-(\d{3,})$/i;

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function firstPresent(...values: unknown[]): string {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return "";
}

export function dateToWaybillDateCode(value?: string | Date | null): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return `${String(value.getMonth() + 1).padStart(2, "0")}${String(value.getDate()).padStart(2, "0")}`;
  }

  const raw = clean(value);
  if (/^\d{4}$/.test(raw)) return raw;

  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[2]}${ymd[3]}`;

  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) return `${String(Number(dmy[2])).padStart(2, "0")}${String(Number(dmy[1])).padStart(2, "0")}`;

  const parsed = raw ? new Date(raw) : new Date();
  if (Number.isFinite(parsed.getTime())) {
    return `${String(parsed.getMonth() + 1).padStart(2, "0")}${String(parsed.getDate()).padStart(2, "0")}`;
  }

  const today = new Date();
  return `${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
}

export function merchantCodeFromName(merchantName?: string | null, merchantCode?: string | null): string {
  const existingCode = clean(merchantCode).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (existingCode.length >= 3) return existingCode.slice(0, 3);

  const name = clean(merchantName);
  const lowerName = name.toLowerCase();

  if (lowerName.includes("baby genius")) return "BBG";
  if (lowerName.includes("beauty cos") || lowerName.includes("bca")) return "BCA";

  const alpha = name.replace(/[^a-zA-Z]/g, "").toUpperCase();
  if (alpha.length >= 3) return alpha.slice(0, 3);
  if (alpha.length > 0) return alpha.padEnd(3, "X");
  return "XXX";
}

export function parsePickupCode(pickupId?: string | null): { dateCode: string; merchantCode: string; count: number } | null {
  const match = clean(pickupId).toUpperCase().match(PICKUP_ID_PATTERN);
  if (!match) return null;

  return {
    dateCode: match[1],
    merchantCode: match[2],
    count: Number(match[3]),
  };
}

export function normalizeSequence(value?: number | string | null, fallback = 1): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed);
  return Math.max(1, Math.trunc(fallback || 1));
}

export function generateWaybillId(input: WaybillCodingInput): string {
  const pickupParts = parsePickupCode(input.pickupId);
  const dateCode = pickupParts?.dateCode || dateToWaybillDateCode(input.date);
  const merchantCode = pickupParts?.merchantCode || merchantCodeFromName(input.merchantName, input.merchantCode);
  const sequence = String(normalizeSequence(input.sequence)).padStart(3, "0");

  return `D${dateCode}-${merchantCode}-${sequence}`;
}

export function extractExistingWaybillId(source: AnyWaybillSource): string {
  const existing = firstPresent(
    source.delivery_way_id,
    source.waybill_id,
    source.waybill_no,
    source.tracking_no,
    source.delivery_id,
    source.id,
  ).toUpperCase();

  return WAYBILL_ID_PATTERN.test(existing) ? existing : "";
}

export function resolveWaybillId(source: AnyWaybillSource, index = 0): string {
  const existing = extractExistingWaybillId(source);
  if (existing) return existing;

  const pickupId = firstPresent(
    source.pickup_id,
    source.pickup_way_id,
    source.canonical_pickup_id,
    source.pickup_request_id,
    source.pickup_waybill_id,
  );

  return generateWaybillId({
    pickupId,
    date: firstPresent(source.date, source.created_at, source.createdAt, source.pickup_date, source.submitted_at),
    merchantName: firstPresent(source.merchant_name, source.merchant, source.sender_name, source.customer_name),
    merchantCode: firstPresent(source.merchant_code, source.merchantCode),
    sequence: firstPresent(source.delivery_sequence, source.sequence, source.seq, source.line_no, source.item_no) || index + 1,
  });
}

export function buildWaybillRowsFromPickup(pickup: AnyWaybillSource): AnyWaybillSource[] {
  const count = normalizeSequence(
    firstPresent(pickup.delivery_count, pickup.expected_parcels, pickup.parcel_count, pickup.qty, pickup.quantity),
    1,
  );

  return Array.from({ length: count }, (_, index) => {
    const sequence = index + 1;
    const delivery_way_id = generateWaybillId({
      pickupId: firstPresent(pickup.pickup_id, pickup.pickup_way_id, pickup.canonical_pickup_id),
      date: firstPresent(pickup.date, pickup.created_at, pickup.pickup_date),
      merchantName: firstPresent(pickup.merchant_name, pickup.merchant, pickup.sender_name),
      merchantCode: firstPresent(pickup.merchant_code),
      sequence,
    });

    return {
      ...pickup,
      delivery_sequence: sequence,
      delivery_way_id,
      tracking_no: delivery_way_id,
      waybill_id: delivery_way_id,
    };
  });
}
