import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260919133100_duplicate_way_timestamp_v65a.sql"), "utf8");

const checks = [
  ["duplicate archive table exists", migration.includes("be_duplicate_way_archive_v65")],
  ["known wrong duplicates archived", migration.includes("P0911-BLK-289-250") && migration.includes("P0911-BLK-289-251") && migration.includes("P0911-BLK-289-252")],
  ["correct survivors preserved", migration.includes("P0912-BLK-001-229") && migration.includes("P0912-BLK-001-228") && migration.includes("D0906-GRS-028")],
  ["Warehouse queue canonicalization exists", migration.includes("create or replace view public.be_v_warehouse_receipt_v36") && migration.includes("canonical_rank=1")],
  ["Wayplan queue canonicalization exists", migration.includes("WAYPLAN_REGION_QUEUE_V65_CANONICAL")],
  ["dispatch timestamp trigger exists", migration.includes("be_sync_dispatch_scan_timestamp_v65") && migration.includes("dispatch_scanned_at=new.scanned_at")],
];

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error("Duplicate/timestamp V65A contract FAILED:");
  failed.forEach((name) => console.error(" - " + name));
  process.exit(1);
}
console.log("Duplicate/auth/timestamp V65 contract PASS");
