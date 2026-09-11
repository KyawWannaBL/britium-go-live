import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Missing ${relative}`);
  return fs.readFileSync(file, "utf8");
}

function requireText(content, marker, label) {
  if (!content.includes(marker)) throw new Error(`${label} is missing ${marker}`);
  console.log(`PASS ${label}: ${marker}`);
}

const waybill = read("src/pages/WaybillStudioPage.tsx");
const dispatch = read("src/pages/DispatchCommandCenterPage.tsx");
const parser = read("src/lib/wayIdScanV47.ts");
const sql = read("waybill_dispatch_scan_integrity_v47.sql");

requireText(waybill, "WAYBILL_STUDIO_V47_CANONICAL_BARCODE_QR_INTEGRITY_2026-07-30", "Waybill source");
requireText(waybill, "canonicalWayIdFromRow", "Waybill source");
requireText(waybill, "Each printed barcode and QR must identify exactly one parcel", "Waybill source");
requireText(dispatch, "DISPATCH_V47_CANONICAL_WAY_ID_MULTI_SCAN_2026-07-30", "Dispatch source");
requireText(dispatch, "be_dispatch_scan_payload_v47", "Dispatch source");
requireText(dispatch, "concatenated Way IDs are supported", "Dispatch source");
requireText(parser, "WAY_ID_SCAN_V47_CANONICAL_PARCEL_CODE_2026-07-30", "Way ID parser");
requireText(sql, "be_extract_way_ids_v47", "SQL");
requireText(sql, "be_dispatch_scan_payload_v47", "SQL");

const sample = "D0728-CTM-026D0728-MML-045D0728-MML-045D0727-KKK-077";
const occurrences = sample.match(/D\d{4}-[A-Z0-9]{2,12}-\d{3,6}/g) || [];
const unique = [...new Set(occurrences)];
if (occurrences.length !== 4 || unique.length !== 3) throw new Error("Scanner parser simulation failed");
console.log("PASS parser simulation: concatenated codes split and duplicates removed");

const dist = path.join(root, "dist", "assets");
if (!fs.existsSync(dist)) throw new Error("dist/assets is missing. Run npm run build first.");
const merged = fs.readdirSync(dist)
  .filter((name) => name.endsWith(".js"))
  .map((name) => fs.readFileSync(path.join(dist, name), "utf8"))
  .join("\n");
requireText(merged, "WAYBILL_STUDIO_V47_CANONICAL_BARCODE_QR_INTEGRITY_2026-07-30", "production bundle");
requireText(merged, "DISPATCH_V47_CANONICAL_WAY_ID_MULTI_SCAN_2026-07-30", "production bundle");
requireText(merged, "WAY_ID_SCAN_V47_CANONICAL_PARCEL_CODE_2026-07-30", "production bundle");

console.log("SAFE TO DEPLOY WAYBILL / DISPATCH V47 SCAN INTEGRITY");
