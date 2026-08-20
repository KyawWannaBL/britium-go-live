import fs from "node:fs";

const target = "src/pages/WayplanCommandCenterPage.tsx";

if (!fs.existsSync(target)) {
  console.error(`ERROR: ${target} was not found. Run from the Enterprise Portal repository root.`);
  process.exit(1);
}

let source = fs.readFileSync(target, "utf8");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = `${target}.before-v53-9-route-scope-${stamp}`;
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
  source = source.replace(oldText, () => newText);
}

replaceOnce(
  "V53.8 build marker",
  'const BUILD_MARKER = "WAYPLAN_V53_8_CANONICAL_PICKUP_LINEAGE_GUARD_2026-07-31";',
  'const BUILD_MARKER = "WAYPLAN_V53_9_ROUTE_GROUP_MULTI_PICKUP_SCOPE_2026-07-31";',
);

replaceOnce(
  "selectedRows pickup restriction",
`  const selectedRows = useMemo(() => {
    const normalizedPickup = text(selectedPickup).toUpperCase();

    return rows.filter((row) =>
      selected[wayId(row)] &&
      !row.already_planned &&
      hasValidPickupDeliveryLineage(row) &&
      (!normalizedPickup || pickupId(row) === normalizedPickup)
    );
  }, [rows, selected, selectedPickup]);
`,
`  const selectedRows = useMemo(
    () => rows.filter((row) =>
      selected[wayId(row)] &&
      !row.already_planned &&
      hasValidPickupDeliveryLineage(row)
    ),
    [rows, selected],
  );
`,
);

replaceOnce(
  "automatic first-pickup selection",
  '      setSelectedPickup((current) => current || nextPickups[0] || "");',
  '      setSelectedPickup((current) => current && nextPickups.includes(current) ? current : "");',
);

replaceOnce(
  "Wayplan scope instruction",
  '<p style={{ margin: "4px 0 0", color: C.sub, fontSize: 11 }}>Select only one route group for each Wayplan.</p>',
  '<p style={{ margin: "4px 0 0", color: C.sub, fontSize: 11 }}>A Wayplan may include multiple parent Pickup IDs, but every selected Delivery Way must belong to one route group. Use Pickup only as an optional narrowing filter.</p>',
);

replaceOnce(
  "Pickup filter label",
`              <label style={{ color: C.sub, fontSize: 11, fontWeight: 800 }}>
                Pickup
`,
`              <label style={{ color: C.sub, fontSize: 11, fontWeight: 800 }}>
                Pickup Scope
`,
);

replaceOnce(
  "All pickups option",
  '<option value="">All pickups</option>',
  '<option value="">All pickups in selected route group</option>',
);

replaceOnce(
  "table headings",
  '{["Select", "Way ID", "Pickup", "Recipient", "Township", "Route Group", "COD", "State"].map((heading) => (',
  '{["Select", "Delivery Way ID", "Parent Pickup ID", "Recipient", "Township", "Route Group", "COD", "State"].map((heading) => (',
);

fs.writeFileSync(target, source, "utf8");

console.log("Installed Wayplan V53.9 route-group multi-pickup scope.");
console.log(`Target: ${target}`);
console.log(`Backup: ${backup}`);
console.log("Default Pickup scope is now All pickups.");
console.log("Exact Pickup filtering remains available when an operator selects one Pickup ID.");
console.log("Next: npm run build");
console.log("Then: node verify_wayplan_route_scope_v53_9.mjs");
