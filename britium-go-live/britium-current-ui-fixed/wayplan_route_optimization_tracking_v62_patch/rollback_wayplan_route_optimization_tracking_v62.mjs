import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(process.argv[2] || ".");
const backupRoot = process.argv[3] ? path.resolve(process.argv[3]) : "";
if (!backupRoot || !fs.existsSync(path.join(backupRoot, "INSTALL_METADATA.json"))) {
  throw new Error("Usage: node rollback_wayplan_route_optimization_tracking_v62.mjs <portal-root> <exact-backup-root>");
}
const metadata = JSON.parse(fs.readFileSync(path.join(backupRoot, "INSTALL_METADATA.json"), "utf8"));
const restored = [];
for (const relative of metadata.backed_up || []) {
  const source = path.join(backupRoot, relative);
  const target = path.join(root, relative);
  if (!fs.existsSync(source)) throw new Error(`Backup file missing: ${relative}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  restored.push(relative);
}
for (const relative of metadata.files || []) {
  if (!(metadata.backed_up || []).includes(relative)) {
    const target = path.join(root, relative);
    if (fs.existsSync(target)) fs.rmSync(target);
  }
}
console.log(JSON.stringify({ ok: true, build: "WAYPLAN_ROUTE_OPTIMIZATION_TRACKING_V62_ROLLBACK", root, backup_root: backupRoot, files_restored: restored, build_performed: false, deploy_performed: false }, null, 2));
