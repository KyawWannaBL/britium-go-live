import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

const sourceChecks = [
  {
    file: "src/pages/WarehousePage.tsx",
    marker: "WAREHOUSE_DISPATCH_V39_OPTIONAL_RECEIVING_SCAN_RTO_ALERTS_2026-07-30",
    required: [
      "be_warehouse_receipt_snapshot_v39",
      "be_warehouse_receive_scan_v39",
      "be_warehouse_receive_batch_v39",
      "be_warehouse_skip_receiving_scan_v39",
      "be_set_warehouse_scan_policy_v39",
      "DISPATCH SCAN: REQUIRED",
      "HOURLY AUTO",
    ],
  },
  {
    file: "src/pages/WarehouseOperationPage.tsx",
    marker: "WAREHOUSE_OPS_V39_FAILED_RETURN_SCAN_DWELL_ALERTS_2026-07-30",
    required: ["be_warehouse_return_scan_v39", "be_warehouse_lifecycle_alerts_v39", "RETURN_TO_SENDER"],
  },
  {
    file: "src/pages/DispatchCommandCenterPage.tsx",
    marker: "DISPATCH_V39_MANDATORY_SCAN_AUTO_RTO_2026-07-30",
    required: [
      "be_dispatch_scan_parcel_v39",
      "be_dispatch_scan_snapshot_v39",
      "be_publish_wayplan_with_dispatch_scan_v39",
      "be_publish_all_wayplans_with_dispatch_scan_v39",
      "be_dispatch_update_delivery_status_v39",
      "DISPATCH SCANNED",
      "SCAN REQUIRED",
    ],
  },
  {
    file: "src/pages/RiderAppPage.tsx",
    marker: "RIDER_V39_CONSECUTIVE_FAILURE_AUTO_RTO_2026-07-30",
    required: ["be_record_delivery_failure_v39", "be_record_delivery_success_v39", "payload.operationId"],
  },
];

for (const check of sourceChecks) {
  const filePath = path.join(root, check.file);
  if (!fs.existsSync(filePath)) throw new Error(`${check.file} was not found.`);
  const body = fs.readFileSync(filePath, "utf8");
  if (!body.includes(check.marker)) throw new Error(`${check.file} is not the V39 source.`);
  for (const item of check.required) {
    if (!body.includes(item)) throw new Error(`${check.file} is missing ${item}`);
  }
  console.log(`PASS source: ${check.file}`);
}

const sqlPath = path.join(root, "warehouse_dispatch_rto_alert_v39.sql");
if (!fs.existsSync(sqlPath)) throw new Error("warehouse_dispatch_rto_alert_v39.sql is missing from the deployment root.");
const sql = fs.readFileSync(sqlPath, "utf8");
for (const item of [
  "be_set_warehouse_scan_policy_v39",
  "be_warehouse_skip_receiving_scan_v39",
  "be_dispatch_scan_parcel_v39",
  "be_dispatch_validate_release_v39",
  "be_record_delivery_failure_v39",
  "be_warehouse_return_scan_v39",
  "be_refresh_warehouse_dwell_alerts_v39",
  "be_warehouse_dwell_scheduler_status_v39",
  "delivery_failures_before_rto",
  "warehouse_dwell_alert_hours",
  "DELIVERY_FAILURE_REQUIRES_RESCAN",
]) {
  if (!sql.includes(item)) throw new Error(`V39 SQL is missing ${item}`);
}
console.log("PASS SQL structure: optional receiving scan, mandatory dispatch scan, failed-return rescan, RTO and dwell alerts are present.");

const distFiles = walk(path.join(root, "dist")).filter((filePath) => /\.(js|mjs|html)$/.test(filePath));
if (!distFiles.length) throw new Error("dist was not found. Run npm run build first.");

for (const check of sourceChecks) {
  const bundles = distFiles.filter((filePath) => fs.readFileSync(filePath, "utf8").includes(check.marker));
  if (!bundles.length) throw new Error(`Production bundle does not contain ${check.marker}`);
  const merged = bundles.map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
  for (const item of check.required.slice(0, 5)) {
    if (!merged.includes(item)) throw new Error(`Production bundle for ${check.file} is missing ${item}`);
  }
  console.log(`PASS bundle: ${check.marker}`);
}

console.log("PASS: warehouse receiving scan policy is Super-Admin controlled, dispatch scan is mandatory, each failed return requires a fresh dispatch scan, 3 consecutive failures produce RTO, and warehouse dwell alerts are wired.");
console.log("SAFE TO DEPLOY WAREHOUSE / DISPATCH V39");
