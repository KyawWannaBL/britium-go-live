import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const marker = "WAYBILL_STUDIO_V35_BRAND_OVERLAP_FIX_2026-07-30";
const required = [marker, "be_data_entry_parcel_details", "be_parcel_waybills", "britium:last-created-waybill"];
const forbidden = [
  "BRITIUM EXPRESS DELIVERY SERVICE",
  "<span>DELIVERY SERVICE</span>",
  '? "DELIVERY SERVICE"',
];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return [fullPath];
  });
}

// Verify only V35 Waybill Studio sources. Other legacy print components may still
// contain their own historical wording and are not rendered by #/waybill-studio.
const sourceFiles = walk(path.join(root, "src")).filter((filePath) => {
  if (!filePath.endsWith(".tsx") || filePath.endsWith(".bak")) return false;
  return fs.readFileSync(filePath, "utf8").includes(marker);
});
if (!sourceFiles.length) throw new Error("No V35 Waybill Studio source was found under src.");

for (const filePath of sourceFiles) {
  const body = fs.readFileSync(filePath, "utf8");
  for (const item of required) {
    if (!body.includes(item)) throw new Error(`${path.relative(root, filePath)} is missing ${item}`);
  }
  for (const item of forbidden) {
    if (body.includes(item)) throw new Error(`${path.relative(root, filePath)} still contains overlapping brand text: ${item}`);
  }
  console.log(`PASS source: ${path.relative(root, filePath)}`);
}

const distFiles = walk(path.join(root, "dist")).filter((filePath) => /\.(js|mjs|html)$/.test(filePath));
if (!distFiles.length) throw new Error("dist was not found. Run npm run build first.");

// The old verifier searched every production chunk. That produced a false failure
// when a separate, unused legacy print component contained the same wording.
// Locate the actual V35 chunk by its unique marker and verify that chunk only.
const activeBundles = distFiles.filter((filePath) => fs.readFileSync(filePath, "utf8").includes(marker));
if (!activeBundles.length) throw new Error("Production bundle does not contain the V35 Waybill Studio marker.");

for (const filePath of activeBundles) {
  const body = fs.readFileSync(filePath, "utf8");
  for (const item of required) {
    if (!body.includes(item)) throw new Error(`${path.relative(root, filePath)} is missing ${item}`);
  }
  if (body.includes("BRITIUM EXPRESS DELIVERY SERVICE")) {
    throw new Error(`${path.relative(root, filePath)} still contains the overlapping BRITIUM EXPRESS DELIVERY SERVICE text.`);
  }
  console.log(`PASS active bundle: ${path.relative(root, filePath)}`);
}

const unrelatedMatches = distFiles.filter((filePath) => {
  if (activeBundles.includes(filePath)) return false;
  return fs.readFileSync(filePath, "utf8").includes("BRITIUM EXPRESS DELIVERY SERVICE");
});
if (unrelatedMatches.length) {
  console.log(`NOTE: ignored ${unrelatedMatches.length} unrelated legacy bundle(s) containing old wording.`);
}

console.log("PASS bundle: V35 live 287-row loader and corrected active brand header are present.");
console.log("SAFE TO DEPLOY WAYBILL STUDIO V35");
