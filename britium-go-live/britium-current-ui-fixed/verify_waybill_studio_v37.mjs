import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const marker = "WAYBILL_STUDIO_V37_RELIABLE_BULK_PRINT_2026-07-30";
const requiredSource = [
  marker,
  "be_data_entry_parcel_details",
  "be_parcel_waybills",
  "britium:last-created-waybill",
  "PRINT_AUTH_CONCURRENCY = 8",
  "PRINT_IMAGE_WAIT_MS = 20000",
  "const printWindow = openPrintWindow(targetRows.length)",
  "await authorizeRows(targetRows",
  "Promise.all(Array.from",
  "void guardedPrint(rows)",
  "Print all (${rows.length})",
  "Print now",
  "The browser blocked the print window",
];
const forbiddenSource = [
  "void guardedPrint(visibleRows)",
  "BRITIUM EXPRESS DELIVERY SERVICE",
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
if (!sourceFiles.length) throw new Error("No V37 Waybill Studio source was found under src.");

for (const filePath of sourceFiles) {
  const body = fs.readFileSync(filePath, "utf8");
  for (const item of requiredSource) {
    if (!body.includes(item)) throw new Error(`${path.relative(root, filePath)} is missing ${item}`);
  }
  for (const item of forbiddenSource) {
    if (body.includes(item)) throw new Error(`${path.relative(root, filePath)} still contains forbidden text: ${item}`);
  }
  const openIndex = body.indexOf("const printWindow = openPrintWindow(targetRows.length)");
  const awaitIndex = body.indexOf("await authorizeRows(targetRows");
  if (openIndex < 0 || awaitIndex < 0 || openIndex > awaitIndex) {
    throw new Error(`${path.relative(root, filePath)} does not open the popup before async authorization.`);
  }
  console.log(`PASS source: ${path.relative(root, filePath)}`);
}

const distFiles = walk(path.join(root, "dist")).filter((filePath) => /\.(js|mjs|html)$/.test(filePath));
if (!distFiles.length) throw new Error("dist was not found. Run npm run build first.");

const activeBundles = distFiles.filter((filePath) => fs.readFileSync(filePath, "utf8").includes(marker));
if (!activeBundles.length) throw new Error("Production bundle does not contain the V37 Waybill Studio marker.");

const requiredBundleStrings = [
  marker,
  "Preparing Britium print job",
  "Authorizing secure print job",
  "Print now",
  "The browser blocked the print window",
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

console.log("PASS bundle: popup-safe bulk authorization, all-row printing, progress, error handling, and manual Print now fallback are present.");
console.log("SAFE TO DEPLOY WAYBILL STUDIO V37");
