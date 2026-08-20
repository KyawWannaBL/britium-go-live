// @ts-nocheck
/**
 * Rider pickup grouping helper.
 *
 * The rider assignment backend may return one row per delivery way / parcel.
 * Pickup verification must be shown once per pickup_id, not once per delivery way.
 */
function text(v: any, fallback = "") {
  return v === null || v === undefined || v === "" ? fallback : String(v);
}

function number(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function pickupGroupKey(row: any) {
  return (
    text(row?.pickup_id) ||
    text(row?.pickup_request_id) ||
    text(row?.request_code) ||
    text(row?.waybill_no) ||
    text(row?.wayplan_code) ||
    text(row?.id)
  );
}

function deliveryKey(row: any) {
  return (
    text(row?.delivery_way_id) ||
    text(row?.tracking_no) ||
    text(row?.pickup_way_id) ||
    text(row?.parcel_id) ||
    text(row?.id)
  );
}

function uniquePush(target: string[], value: any) {
  const v = text(value).trim();
  if (v && !target.includes(v)) target.push(v);
}

function latestStatus(rows: any[]) {
  const statuses = rows.map((r) => text(r?.delivery_status || r?.dispatch_status || r?.status || r?.pickup_status || r?.workflow_stage).toUpperCase());
  const delivered = statuses.filter((s) => s === "DELIVERED").length;
  const rto = statuses.filter((s) => s === "RTO").length;
  const failed = statuses.filter((s) => s.includes("FAIL") || s.includes("RETURN")).length;
  const pending = statuses.length - delivered - rto - failed;

  if (statuses.length > 1) {
    if (pending > 0) return "ASSIGNED";
    if (failed > 0) return "RETURN / FAILED";
    if (rto > 0) return "RTO";
    if (delivered === statuses.length) return "DELIVERED";
  }

  return statuses[0] || "ASSIGNED";
}

export function aggregateAssignedPickups(rows: any[] = []) {
  const groups = new Map<string, any>();

  for (const source of Array.isArray(rows) ? rows : []) {
    const key = pickupGroupKey(source);
    if (!key) continue;

    let g = groups.get(key);
    if (!g) {
      g = {
        ...source,
        id: key,
        pickup_id: text(source?.pickup_id) || key,
        pickup_way_id: text(source?.pickup_id) || key,
        delivery_way_ids: [],
        tracking_nos: [],
        townships: [],
        phone_numbers: [],
        addresses: [],
        child_rows: [],
        delivery_way_count: 0,
        parcel_count: 0,
        delivered_count: 0,
        pending_count: 0,
        failed_count: 0,
        rto_count: 0,
      };
      groups.set(key, g);
    }

    g.child_rows.push(source);
    uniquePush(g.delivery_way_ids, deliveryKey(source));
    uniquePush(g.tracking_nos, source?.tracking_no || source?.delivery_way_id);
    uniquePush(g.townships, source?.pickup_township || source?.township || source?.delivery_township);
    uniquePush(g.phone_numbers, source?.phone_number || source?.recipient_phone || source?.contact_phone);
    uniquePush(g.addresses, source?.pickup_address || source?.recipient_address || source?.address);

    const status = text(source?.delivery_status || source?.dispatch_status || source?.status || source?.pickup_status || source?.workflow_stage).toUpperCase();
    if (status === "DELIVERED") g.delivered_count += 1;
    else if (status === "RTO") g.rto_count += 1;
    else if (status.includes("FAIL") || status.includes("RETURN")) g.failed_count += 1;
    else g.pending_count += 1;
  }

  for (const g of groups.values()) {
    const uniqueDeliveryWays = g.delivery_way_ids.length || g.tracking_nos.length;
    const rawParcelSum = g.child_rows.reduce((sum: number, r: any) => {
      const cnt = number(r?.parcel_count || r?.expected_parcels || r?.collected_parcels, 0);
      return sum + (cnt > 1 ? cnt : 0);
    }, 0);

    // If backend rows are delivery-way rows, each unique delivery way is one parcel.
    // If backend already sends a pickup-level row with parcel_count > 1, keep that count.
    g.delivery_way_count = uniqueDeliveryWays || g.child_rows.length;
    g.parcel_count = Math.max(rawParcelSum, g.delivery_way_count, number(g.parcel_count, 0), 1);

    g.pickup_township = g.townships.join(", ") || g.pickup_township || g.township || "-";
    g.phone_number = g.phone_numbers[0] || g.phone_number || g.recipient_phone || "-";
    g.pickup_address = g.addresses[0] || g.pickup_address || g.recipient_address || "-";
    g.merchant_name = g.merchant_name || g.merchant_code || g.waybill_no || "-";
    g.status = latestStatus(g.child_rows);
    g.status_summary =
      g.child_rows.length > 1
        ? `${g.delivered_count} delivered / ${g.pending_count} pending / ${g.failed_count + g.rto_count} return`
        : g.status;
  }

  return Array.from(groups.values()).sort((a, b) => {
    const av = text(a.pickup_id || a.id);
    const bv = text(b.pickup_id || b.id);
    return av.localeCompare(bv);
  });
}
