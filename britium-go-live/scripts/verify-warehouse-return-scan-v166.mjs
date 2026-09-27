import assert from "node:assert/strict";
import fs from "node:fs";
const page=fs.readFileSync("britium-go-live/src/pages/WarehousePage.tsx","utf8");
assert.match(page,/be_warehouse_scan_lifecycle_snapshot_v164/);
assert.match(page,/physical_return_scan_number/);
assert.match(page,/Third physical return recorded/);
assert.match(page,/disabled=\{scanMode!==\"return\"\}/);
console.log("Warehouse Return Scan V166 UI PASS");