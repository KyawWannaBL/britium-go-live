import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const marker = "WAYBILL_STUDIO_V38_BATCH_AUTH_OS_TOWNSHIP_REMARKS_2026-07-30";
const sourceCandidates = [
  path.join(root, "WaybillStudioPage.V38.tsx"),
  path.join(root, "WaybillStudioPage.tsx"),
];
const sourcePath = sourceCandidates.find((candidate) => fs.existsSync(candidate));
if (!sourcePath) throw new Error("WaybillStudioPage.V38.tsx was not found beside package.json.");

const source = fs.readFileSync(sourcePath, "utf8");
const required = [
  marker,
  'rpc("be_waybill_print_rows_v38"',
  'rpc("be_waybill_authorize_batch_print_v38"',
  'from("be_data_entry_parcel_details")',
  'from("parcels")',
  'd.township || d.region || "Delivery"',
  '<b>Remarks:</b>',
  'void guardedPrint(rows)',
  'Print all (${rows.length})',
];
for (const item of required) {
  if (!source.includes(item)) throw new Error(`The V38 source is missing ${item}`);
}
const forbidden = [
  "await authorizeRows(targetRows",
  "BRITIUM EXPRESS DELIVERY SERVICE",
  '<aside class="w42-side">${esc(d.region || "Delivery")}</aside>',
];
for (const item of forbidden) {
  if (source.includes(item)) throw new Error(`The V38 source still contains forbidden text: ${item}`);
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
  if (!filePath.endsWith(".tsx")) return false;
  if (/\.pre-v38\.|\.bak(?:\.|$)/i.test(filePath)) return false;
  const body = fs.readFileSync(filePath, "utf8");
  return (
    path.basename(filePath) === "WaybillStudioPage.tsx" ||
    path.basename(filePath) === "WaybillStudioPage.V37.tsx" ||
    (body.includes("Exact multi-size Waybill printing") && body.includes("Waybill Print Studio"))
  );
});

if (!candidates.length) throw new Error("No active Waybill Print Studio component was found under src.");

for (const target of candidates) {
  const backup = `${target}.pre-v38.bak`;
  if (!fs.existsSync(backup)) fs.copyFileSync(target, backup);
  fs.writeFileSync(target, source, "utf8");
  console.log(`Installed V38 into ${path.relative(root, target)}`);
}

const versionedTarget = path.join(srcRoot, "pages", "WaybillStudioPage.V38.tsx");
fs.mkdirSync(path.dirname(versionedTarget), { recursive: true });
fs.writeFileSync(versionedTarget, source, "utf8");
console.log(`Installed V38 into ${path.relative(root, versionedTarget)}`);

console.log(`PASS: installed ${marker} into ${new Set([...candidates, versionedTarget]).size} source file(s).`);
console.log("Next: run the V38 SQL, remove dist/node_modules/.vite, build, then run verify_waybill_studio_v38.mjs.");
