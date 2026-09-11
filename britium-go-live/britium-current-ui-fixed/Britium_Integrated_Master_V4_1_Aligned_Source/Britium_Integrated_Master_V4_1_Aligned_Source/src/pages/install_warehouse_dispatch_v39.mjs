import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pagesDir = path.join(root, "src", "pages");
const marker = "WAREHOUSE_DISPATCH_V39_OPTIONAL_RECEIVING_SCAN_RTO_ALERTS_2026-07-30";

if (!fs.existsSync(path.join(root, "package.json")) || !fs.existsSync(pagesDir)) {
  throw new Error("Run this installer from the repository root beside package.json and src.");
}

const installs = [
  {
    source: "WarehousePage.V39.tsx",
    active: "WarehousePage.tsx",
    versioned: "WarehousePage.V39.tsx",
    required: [marker, "be_warehouse_skip_receiving_scan_v39", "be_set_warehouse_scan_policy_v39", "be_warehouse_receipt_snapshot_v39"],
  },
  {
    source: "WarehouseOperationPage.V39.tsx",
    active: "WarehouseOperationPage.tsx",
    versioned: "WarehouseOperationPage.V39.tsx",
    required: ["WAREHOUSE_OPS_V39_FAILED_RETURN_SCAN_DWELL_ALERTS_2026-07-30", "be_warehouse_return_scan_v39", "be_warehouse_lifecycle_alerts_v39"],
  },
  {
    source: "DispatchCommandCenterPage.V39.tsx",
    active: "DispatchCommandCenterPage.tsx",
    versioned: "DispatchCommandCenterPage.V39.tsx",
    required: ["DISPATCH_V39_MANDATORY_SCAN_AUTO_RTO_2026-07-30", "be_dispatch_scan_parcel_v39", "be_publish_wayplan_with_dispatch_scan_v39", "be_dispatch_update_delivery_status_v39"],
  },
  {
    source: "RiderAppPage.V39.tsx",
    active: "RiderAppPage.tsx",
    versioned: "RiderAppPage.V39.tsx",
    required: ["RIDER_V39_CONSECUTIVE_FAILURE_AUTO_RTO_2026-07-30", "be_record_delivery_failure_v39", "be_record_delivery_success_v39"],
  },
];

for (const item of installs) {
  const sourcePath = path.join(root, item.source);
  if (!fs.existsSync(sourcePath)) throw new Error(`${item.source} was not found beside package.json.`);
  const source = fs.readFileSync(sourcePath, "utf8");
  for (const required of item.required) {
    if (!source.includes(required)) throw new Error(`${item.source} is missing ${required}`);
  }

  for (const targetName of [item.active, item.versioned]) {
    const targetPath = path.join(pagesDir, targetName);
    const backupPath = `${targetPath}.pre-v39.bak`;
    if (fs.existsSync(targetPath) && !fs.existsSync(backupPath)) {
      fs.copyFileSync(targetPath, backupPath);
    }
    fs.writeFileSync(targetPath, source, "utf8");
    console.log(`Installed V39 into ${path.relative(root, targetPath)}`);
  }
}

console.log(`PASS: installed ${marker} and the Dispatch/Rider/Warehouse V39 integration.`);
console.log("Next: run the V39 SQL, clear dist/node_modules/.vite, build, then run verify_warehouse_dispatch_v39.mjs.");
