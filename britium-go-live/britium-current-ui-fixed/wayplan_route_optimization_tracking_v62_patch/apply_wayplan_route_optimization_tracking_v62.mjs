import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const patchRoot = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || ".");
const manifest = JSON.parse(fs.readFileSync(path.join(patchRoot, "PATCH_MANIFEST.json"), "utf8"));
const packageJson = path.join(root, "package.json");
if (!fs.existsSync(packageJson)) throw new Error(`Portal root not found: ${root}`);
const packageData = JSON.parse(fs.readFileSync(packageJson, "utf8"));
if (!packageData?.scripts?.build) throw new Error("The selected folder is not the Britium Vite portal root.");
if (!packageData?.dependencies?.["mapbox-gl"]) throw new Error("mapbox-gl is not installed in this portal package.");

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(root, "production_backups", `wayplan_route_optimization_tracking_v62_${timestamp}`);
const installed = [];
const backedUp = [];

for (const relative of manifest.files) {
  const source = path.join(patchRoot, "files", relative);
  const target = path.join(root, relative);
  if (!fs.existsSync(source)) throw new Error(`Patch source missing: ${relative}`);
  if (fs.existsSync(target)) {
    const backup = path.join(backupRoot, relative);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(target, backup);
    backedUp.push(relative);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  installed.push(relative);
}
fs.writeFileSync(path.join(backupRoot, "INSTALL_METADATA.json"), JSON.stringify({ ...manifest, installed_at: new Date().toISOString(), root, backed_up: backedUp }, null, 2));
console.log(JSON.stringify({
  ok: true,
  build: "WAYPLAN_ROUTE_OPTIMIZATION_TRACKING_V62_INSTALL_2026_08_02",
  root,
  backup_root: backupRoot,
  files_installed: installed,
  files_backed_up: backedUp,
  route_optimization: true,
  per_stop_distance_eta: true,
  optimized_manifest_order: true,
  rider_tracking_map: true,
  secured_gps_rpc_only: true,
  backend_mutation_performed: false,
  build_performed: false,
  deploy_performed: false
}, null, 2));
