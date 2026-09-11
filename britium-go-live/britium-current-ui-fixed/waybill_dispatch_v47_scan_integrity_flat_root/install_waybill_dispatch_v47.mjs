import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const build = "WAYBILL_DISPATCH_V47_SCAN_INTEGRITY_2026-07-30";
const mappings = [
  ["src/pages/WaybillStudioPage.V47.tsx", "src/pages/WaybillStudioPage.tsx"],
  ["src/pages/DispatchCommandCenterPage.V47.tsx", "src/pages/DispatchCommandCenterPage.tsx"],
  ["src/lib/wayIdScanV47.ts", "src/lib/wayIdScanV47.ts"],
];

function mustRead(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Missing package file: ${relative}`);
  return fs.readFileSync(file, "utf8");
}

function backup(destination) {
  if (!fs.existsSync(destination)) return;
  const suffix = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(destination, `${destination}.before-v47-${suffix}`);
}

for (const [sourceRelative, destinationRelative] of mappings) {
  const source = path.join(root, sourceRelative);
  const destination = path.join(root, destinationRelative);
  const content = mustRead(sourceRelative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (source !== destination) backup(destination);
  fs.writeFileSync(destination, content, "utf8");
  console.log(`Installed V47 into ${destinationRelative}`);
}

const checks = [
  ["src/pages/WaybillStudioPage.tsx", "WAYBILL_STUDIO_V47_CANONICAL_BARCODE_QR_INTEGRITY_2026-07-30"],
  ["src/pages/DispatchCommandCenterPage.tsx", "DISPATCH_V47_CANONICAL_WAY_ID_MULTI_SCAN_2026-07-30"],
  ["src/lib/wayIdScanV47.ts", "WAY_ID_SCAN_V47_CANONICAL_PARCEL_CODE_2026-07-30"],
];
for (const [relative, marker] of checks) {
  const content = mustRead(relative);
  if (!content.includes(marker)) throw new Error(`${relative} is missing ${marker}`);
  console.log(`PASS active source: ${relative}`);
}

console.log(`PASS installer ${build}`);
console.log("Next: run the V47 SQL, clear dist/node_modules/.vite, build, then verify.");
