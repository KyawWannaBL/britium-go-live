import fs from "node:fs";

const target = "src/pages/WayplanCommandCenterPage.tsx";

if (!fs.existsSync(target)) {
  console.error(`ERROR: ${target} was not found. Run this installer from the Enterprise Portal repository root.`);
  process.exit(1);
}

let source = fs.readFileSync(target, "utf8");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = `${target}.before-v53-8-pickup-lineage-${stamp}`;
fs.copyFileSync(target, backup);

function replaceOnce(label, oldText, newText) {
  const first = source.indexOf(oldText);
  if (first < 0) {
    console.error(`ERROR: Could not find ${label}. No changes were written.`);
    process.exit(1);
  }
  if (source.indexOf(oldText, first + oldText.length) >= 0) {
    console.error(`ERROR: ${label} occurs more than once. Refusing an ambiguous replacement.`);
    process.exit(1);
  }
  source = source.replace(oldText, newText);
}

const wayIdAnchor = `function wayId(row: Row) {
  return text(row.delivery_way_id || row.waybill_no || row.tracking_no || row.way_id);
}
`;

const wayIdReplacement = `function wayId(row: Row) {
  return text(row.delivery_way_id || row.waybill_no || row.tracking_no || row.way_id).toUpperCase();
}

function pickupId(row: Row) {
  return text(row.pickup_way_id || row.pickup_id || row.request_code).toUpperCase();
}

function identifierCore(value: any, prefix: "P" | "D") {
  const match = text(value).toUpperCase().match(
    new RegExp(\`^\${prefix}([0-9]{4}-[A-Z0-9]+)-[0-9]{3}$\`),
  );
  return match?.[1] || "";
}

function hasValidPickupDeliveryLineage(row: Row) {
  const pickupCore = identifierCore(pickupId(row), "P");
  const deliveryCore = identifierCore(wayId(row), "D");
  return Boolean(pickupCore && deliveryCore && pickupCore === deliveryCore);
}
`;

replaceOnce("wayId helper", wayIdAnchor, wayIdReplacement);

const oldFilter = `  const filteredRows = useMemo(() => {
    const search = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (selectedPickup && text(row.pickup_id) !== selectedPickup) return false;
      if (selectedRoute && routeZone(row) !== selectedRoute) return false;
      if (!search) return true;
      return [
        wayId(row), row.pickup_id, row.batch_waybill_no, row.recipient_name,
        row.recipient_phone, row.township, row.recipient_address, row.route_zone,
      ].some((value) => text(value).toLowerCase().includes(search));
    });
  }, [rows, selectedPickup, selectedRoute, query]);
`;

const newFilter = `  const filteredRows = useMemo(() => {
    const normalizedPickup = text(selectedPickup).toUpperCase();
    const search = query.trim().toLowerCase();

    return rows.filter((row) => {
      const canonicalPickupId = pickupId(row);

      if (normalizedPickup && canonicalPickupId !== normalizedPickup) return false;
      if (!hasValidPickupDeliveryLineage(row)) return false;
      if (selectedRoute && routeZone(row) !== selectedRoute) return false;
      if (!search) return true;

      return [
        wayId(row),
        canonicalPickupId,
        row.batch_waybill_no,
        row.recipient_name,
        row.recipient_phone,
        row.township,
        row.recipient_address,
        row.route_zone,
      ].some((value) => text(value).toLowerCase().includes(search));
    });
  }, [rows, selectedPickup, selectedRoute, query]);
`;

replaceOnce("filteredRows block", oldFilter, newFilter);

const oldSelectedRows = `  const selectedRows = useMemo(
    () => rows.filter((row) => selected[wayId(row)] && !row.already_planned),
    [rows, selected],
  );
`;

const newSelectedRows = `  const selectedRows = useMemo(() => {
    const normalizedPickup = text(selectedPickup).toUpperCase();

    return rows.filter((row) =>
      selected[wayId(row)] &&
      !row.already_planned &&
      hasValidPickupDeliveryLineage(row) &&
      (!normalizedPickup || pickupId(row) === normalizedPickup)
    );
  }, [rows, selected, selectedPickup]);
`;

replaceOnce("selectedRows block", oldSelectedRows, newSelectedRows);

replaceOnce(
  "table row key",
  '<tr key={`${row.pickup_id}-${id}`}',
  '<tr key={`${pickupId(row)}-${id}`}',
);

replaceOnce(
  "Pickup table cell",
  '<td style={{ padding: 9, fontSize: 11 }}>{text(row.pickup_id, "-")}</td>',
  '<td style={{ padding: 9, fontSize: 11 }}>{pickupId(row) || "-"}</td>',
);

const marker = 'const BUILD_MARKER = "WAYPLAN_V45_MAPBOX_HEAD_OFFICE_ROUTE_2026-07-30";';
replaceOnce(
  "build marker",
  marker,
  'const BUILD_MARKER = "WAYPLAN_V53_8_CANONICAL_PICKUP_LINEAGE_GUARD_2026-07-31";',
);

fs.writeFileSync(target, source, "utf8");

console.log("Installed Wayplan V53.8 canonical Pickup lineage guard.");
console.log(`Target: ${target}`);
console.log(`Backup: ${backup}`);
console.log("Next: npm run build");
console.log("Then: node verify_wayplan_pickup_lineage_v53_8.mjs");
