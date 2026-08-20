import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const marker = "WAYBILL_STUDIO_V38_BATCH_AUTH_OS_TOWNSHIP_REMARKS_2026-07-30";
const requiredSource = [
  marker,
  "be_waybill_print_rows_v38",
  "be_waybill_authorize_batch_print_v38",
  "loadCanonicalParcels",
  "currentActorEmail",
  'd.township || d.region || "Delivery"',
  '<b>Remarks:</b>',
  'text(canonical, "os", "sender_name"',
  'text(canonical, "recipient_township", "township"',
  'text(canonical, "remarks", "remark"',
  "authorizeBatchPrint(targetRows",
  "void guardedPrint(selectedRows)",
  "void guardedPrint(rows)",
  "Print all (${rows.length})",
  "Print selected (${selectedRows.length})",
];
const forbiddenSource = [
  "await authorizeRows(targetRows",
  "BRITIUM EXPRESS DELIVERY SERVICE",
  '<aside class="w42-side">${esc(d.region || "Delivery")}</aside>',
  'merchant: text(row, "merchant_name", "merchantName", "os"',
];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return [fullPath];
  });
}

const sourceFiles = walk(path.join(root, "src")).filter((filePath) => {
  if (!filePath.endsWith(".tsx") || /\.bak(?:\.|$)/i.test(filePath)) return false;
  return fs.readFileSync(filePath, "utf8").includes(marker);
});
if (!sourceFiles.length) throw new Error("No V38 Waybill Studio source was found under src.");

for (const filePath of sourceFiles) {
  const body = fs.readFileSync(filePath, "utf8");
  for (const item of requiredSource) {
    if (!body.includes(item)) throw new Error(`${path.relative(root, filePath)} is missing ${item}`);
  }
  for (const item of forbiddenSource) {
    if (body.includes(item)) throw new Error(`${path.relative(root, filePath)} still contains forbidden text: ${item}`);
  }
  console.log(`PASS source: ${path.relative(root, filePath)}`);
}

const distFiles = walk(path.join(root, "dist")).filter((filePath) => /\.(js|mjs|html)$/.test(filePath));
if (!distFiles.length) throw new Error("dist was not found. Run npm run build first.");

const activeBundles = distFiles.filter((filePath) => fs.readFileSync(filePath, "utf8").includes(marker));
if (!activeBundles.length) throw new Error("Production bundle does not contain the V38 Waybill Studio marker.");

const requiredBundleStrings = [
  marker,
  "be_waybill_print_rows_v38",
  "be_waybill_authorize_batch_print_v38",
  "Authorizing batch Waybill print",
  "Remarks:",
  "OS not provided",
  "be_data_entry_parcel_details",
];
for (const filePath of activeBundles) {
  const body = fs.readFileSync(filePath, "utf8");
  for (const item of requiredBundleStrings) {
    if (!body.includes(item)) throw new Error(`${path.relative(root, filePath)} is missing ${item}`);
  }
  if (body.includes("BRITIUM EXPRESS DELIVERY SERVICE")) {
    throw new Error(`${path.relative(root, filePath)} restored the overlapping brand text.`);
  }
  console.log(`PASS active bundle: ${path.relative(root, filePath)}`);
}

console.log("PASS bundle: batch authorization, OS enrichment, recipient township mapping, remarks, Print Selected and Print All are present.");
console.log("SAFE TO DEPLOY WAYBILL STUDIO V38");
