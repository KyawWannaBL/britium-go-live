import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const marker = "FINANCE_COD_V48_RECONCILIATION_2026-07-30";

function requireFile(path, label) {
  if (!existsSync(path)) throw new Error(`${label} is missing: ${path}`);
  return readFileSync(path, "utf8");
}
function requireText(content, items, label) {
  for (const item of items) {
    if (!content.includes(item)) throw new Error(`${label} is missing ${item}`);
    console.log(`PASS ${label}: ${item}`);
  }
}
function files(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path));
    else out.push(path);
  }
  return out;
}

const active = requireFile(join(root, "src", "pages", "CODSettlementPage.tsx"), "Active COD Settlement source");
requireText(active, [
  marker,
  "be_finance_cod_snapshot_v48",
  "be_finance_cod_record_remittance_v48",
  "be_finance_cod_hold_v48",
  "be_finance_cod_settle_v48",
  "be_finance_cod_settle_batch_v48",
  "V48 FINANCE COD RECONCILIATION ACTIVE",
], "source");

const app = requireFile(join(root, "src", "App.tsx"), "App route file");
requireText(app, ['path="/cod-settlement"', "CODSettlementPage"], "route");

const sqlCandidates = [
  join(root, "finance_cod_settlement_v48.sql"),
  join(root, "sql", "finance_cod_settlement_v48.sql"),
  join(root, "supabase", "migrations", "finance_cod_settlement_v48.sql"),
].filter(existsSync);
if (!sqlCandidates.length) throw new Error("finance_cod_settlement_v48.sql was not found in the repository root, sql, or supabase/migrations.");
const sql = readFileSync(sqlCandidates[0], "utf8");
requireText(sql, [
  "be_finance_cod_settlements_v48",
  "be_finance_cod_sync_v48",
  "be_finance_cod_snapshot_v48",
  "be_finance_cod_record_remittance_v48",
  "be_finance_cod_hold_v48",
  "be_finance_cod_settle_v48",
  "be_finance_cod_settle_batch_v48",
], "SQL");

const distFiles = files(join(root, "dist", "assets")).filter((path) => /\.(js|mjs)$/i.test(path));
if (!distFiles.length) throw new Error("Production bundle was not found. Run npm run build first.");
const merged = distFiles.map((path) => readFileSync(path, "utf8")).join("\n");
requireText(merged, [marker, "be_finance_cod_snapshot_v48", "be_finance_cod_settle_v48"], "production bundle");

console.log("SAFE TO DEPLOY FINANCE COD SETTLEMENT V48");
