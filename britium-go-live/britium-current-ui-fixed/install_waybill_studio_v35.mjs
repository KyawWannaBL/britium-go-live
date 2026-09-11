import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const marker = "WAYBILL_STUDIO_V35_BRAND_OVERLAP_FIX_2026-07-30";
const sourceCandidates = [
  path.join(root, "WaybillStudioPage.V35.tsx"),
  path.join(root, "WaybillStudioPage.tsx"),
];
const sourcePath = sourceCandidates.find((candidate) => fs.existsSync(candidate));
if (!sourcePath) throw new Error("WaybillStudioPage.V35.tsx was not found beside package.json.");

const source = fs.readFileSync(sourcePath, "utf8");
for (const required of [marker, 'from("be_data_entry_parcel_details")', "BRITIUM EXPRESS"]) {
  if (!source.includes(required)) throw new Error(`The V35 source is missing ${required}`);
}
if (source.includes("BRITIUM EXPRESS DELIVERY SERVICE")) {
  throw new Error("The V35 source still contains the overlapping DELIVERY wording.");
}

const srcRoot = path.join(root, "src");
if (!fs.existsSync(srcRoot)) throw new Error("src directory was not found. Run this script from the repository root.");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return [fullPath];
  });
}

const candidates = walk(srcRoot).filter((filePath) => {
  if (!filePath.endsWith(".tsx") || filePath.includes(".pre-v35.")) return false;
  const body = fs.readFileSync(filePath, "utf8");
  return path.basename(filePath) === "WaybillStudioPage.tsx" ||
    (body.includes("Exact multi-size Waybill printing") && body.includes("Waybill Print Studio"));
});

if (!candidates.length) throw new Error("No active Waybill Print Studio component was found under src.");

for (const target of candidates) {
  const backup = `${target}.pre-v35.bak`;
  if (!fs.existsSync(backup)) fs.copyFileSync(target, backup);
  fs.writeFileSync(target, source, "utf8");
  console.log(`Installed V35 into ${path.relative(root, target)}`);
}

console.log(`PASS: installed ${marker} into ${candidates.length} source file(s).`);
console.log("Next: remove dist and node_modules/.vite, build, then run verify_waybill_studio_v35.mjs.");
