import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const page = fs.readFileSync(path.join(root, "src/pages/WarehousePage.tsx"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260919121000_continuous_dispatch_scan_v64.sql"), "utf8");

const checks = [
  ["fast dispatch RPC used", page.includes("be_warehouse_dispatch_scan_fast_v64")],
  ["dispatch queue exists", page.includes("dispatchQueue") && page.includes("processDispatchQueue")],
  ["scanner stays focused", page.includes("focusScanner") && page.includes("scanner remains ready")],
  ["dispatch input stays enabled while saving", page.includes('disabled={loading && scanMode!=="dispatch"}')],
  ["background refresh is deferred", page.includes("scheduleBackgroundRefresh") && page.includes("900")],
  ["full snapshot is not awaited after every dispatch scan", page.includes("applyDispatchScanLocally")],
  ["camera dispatch can auto-enqueue", page.includes('if(scanMode==="dispatch") enqueueDispatchScan(code)')],
  ["enter dispatch can auto-enqueue", page.includes('if(scanMode==="dispatch") enqueueDispatchScan(value)')],
  ["source-waybill functional index exists", migration.includes("be_data_entry_source_waybill_upper_v64_idx")],
  ["alias functional index exists", migration.includes("be_delivery_way_alias_upper_v64_idx")],
  ["active Wayplan resolution is preferred", migration.includes("exact_active") && migration.includes("active_candidates")],
  ["V64 build marker exists", migration.includes("WAREHOUSE_DISPATCH_SCAN_FAST_V64")],
];

const failed = checks.filter(([,ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error("Continuous dispatch scan V64 contract FAILED:");
  failed.forEach((name) => console.error(" - " + name));
  process.exit(1);
}
console.log("Continuous dispatch scan V64 contract PASS");
