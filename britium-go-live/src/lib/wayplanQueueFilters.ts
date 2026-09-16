export type WayplanQueueGroupBy = "NONE" | "TOWNSHIP" | "MERCHANT" | "PROVIDER";

export type WayplanQueueFilters = {
  township: string;
  merchant: string;
  provider: string;
  status: string;
  search: string;
};

type Row = Record<string, any>;

function clean(value: any, fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

export function wayplanQueueRowId(row: Row) {
  return clean(row.delivery_way_id || row.waybill_no || row.tracking_no || row.id);
}

export function wayplanQueueMerchant(row: Row) {
  return clean(row.merchant_name || row.merchant_code || row.sender_name, "Unknown Merchant");
}

export function wayplanQueueGroupLabel(row: Row, groupBy: WayplanQueueGroupBy) {
  if (groupBy === "TOWNSHIP") return clean(row.township, "Unknown Township");
  if (groupBy === "MERCHANT") return wayplanQueueMerchant(row);
  if (groupBy === "PROVIDER") return clean(row.service_provider_code, "Unassigned Provider");
  return "All Ways";
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export function getWayplanQueueFilterOptions(rows: Row[]) {
  return {
    townships: uniqueSorted(rows.map((row) => clean(row.township)).filter(Boolean)),
    merchants: uniqueSorted(rows.map(wayplanQueueMerchant)),
    providers: uniqueSorted(rows.map((row) => clean(row.service_provider_code, "Unassigned Provider"))),
    statuses: uniqueSorted(rows.flatMap((row) => [clean(row.dispatch_status), clean(row.warehouse_status)]).filter(Boolean)),
  };
}

export function filterWayplanQueueRows(rows: Row[], filters: WayplanQueueFilters) {
  const query = clean(filters.search).toLocaleLowerCase();
  return rows.filter((row) => {
    const township = clean(row.township, "Unknown Township");
    const merchant = wayplanQueueMerchant(row);
    const provider = clean(row.service_provider_code, "Unassigned Provider");
    const statuses = [clean(row.dispatch_status), clean(row.warehouse_status)].filter(Boolean);

    if (filters.township !== "ALL" && township !== filters.township) return false;
    if (filters.merchant !== "ALL" && merchant !== filters.merchant) return false;
    if (filters.provider !== "ALL" && provider !== filters.provider) return false;
    if (filters.status !== "ALL" && !statuses.includes(filters.status)) return false;
    if (!query) return true;

    const haystack = [
      wayplanQueueRowId(row),
      row.waybill_no,
      row.delivery_way_id,
      row.recipient_name,
      merchant,
      township,
      row.address,
      provider,
      row.delivery_route_mode,
      row.dispatch_status,
      row.warehouse_status,
    ]
      .map((value) => clean(value).toLocaleLowerCase())
      .join(" ");

    return haystack.includes(query);
  });
}

export function groupWayplanQueueRows(rows: Row[], groupBy: WayplanQueueGroupBy) {
  if (groupBy === "NONE") return [{ label: "All Ways", rows: [...rows] }];

  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const label = wayplanQueueGroupLabel(row, groupBy);
    const current = groups.get(label) || [];
    current.push(row);
    groups.set(label, current);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, groupRows]) => ({
      label,
      rows: [...groupRows].sort((a, b) => wayplanQueueRowId(a).localeCompare(wayplanQueueRowId(b))),
    }));
}

export function toggleVisibleWayplanSelection(current: Record<string, boolean>, visibleRows: Row[]) {
  const visibleIds = visibleRows.map(wayplanQueueRowId).filter(Boolean);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => Boolean(current[id]));
  const next = { ...current };

  for (const id of visibleIds) {
    if (allVisibleSelected) delete next[id];
    else next[id] = true;
  }

  return next;
}
