import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const marker = "WAYBILL_STUDIO_V34_DATA_ENTRY_ROWS_2026-07-30";
const required = [marker, "be_data_entry_parcel_details", "be_parcel_waybills", "britium:last-created-waybill"];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return [fullPath];
  });
}

const sourceFiles = walk(path.join(root, "src")).filter((filePath) => filePath.endsWith(".tsx") && !filePath.endsWith(".bak"));
const studioFiles = sourceFiles.filter((filePath) => fs.readFileSync(filePath, "utf8").includes("Exact multi-size Waybill printing"));
if (!studioFiles.length) throw new Error("No Waybill Print Studio source was found under src.");

for (const filePath of studioFiles) {
  const body = fs.readFileSync(filePath, "utf8");
  for (const item of required) {
    if (!body.includes(item)) throw new Error(`${path.relative(root, filePath)} is missing ${item}`);
  }
  if (body.includes('waybill_no: "D0627-BBG-015"')) {
    throw new Error(`${path.relative(root, filePath)} still contains the obsolete mock fallback row.`);
  }
  console.log(`PASS source: ${path.relative(root, filePath)}`);
}

const distFiles = walk(path.join(root, "dist")).filter((filePath) => /\.(js|mjs|html)$/.test(filePath));
if (!distFiles.length) throw new Error("dist was not found. Run npm run build first.");
const bundleText = distFiles.map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
for (const item of required) {
  if (!bundleText.includes(item)) throw new Error(`Production bundle is missing ${item}`);
}
if (bundleText.includes('waybill_no:"D0627-BBG-015"') || bundleText.includes('waybill_no: "D0627-BBG-015"')) {
  throw new Error("Production bundle still contains the obsolete mock Waybill row.");
}

console.log("PASS bundle: Data Entry parcel details loader and Waybill context are present.");
console.log("SAFE TO DEPLOY WAYBILL STUDIO V34");
