import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const target = path.join(root, "src/pages/FinanceMerchantSettlementPage.tsx");
const source = path.join(here, "payload/FinanceMerchantSettlementPage.tsx");
const sqlSource = path.join(here, "sql/20260731_financial_settlement_v3.sql");
const verifySource = path.join(here, "sql/verify_financial_settlement_v3.sql");
const sqlDir = path.join(root, "src/sql/SQL 0708");

if (!fs.existsSync(path.join(root, "package.json"))) {
  throw new Error(`Run this installer from the portal repository root. Current directory: ${root}`);
}
if (!fs.existsSync(target)) throw new Error(`Missing target: ${target}`);
if (!fs.existsSync(source)) throw new Error(`Missing package payload: ${source}`);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = `${target}.before-financial-settlement-v3-${stamp}`;
fs.copyFileSync(target, backup);
fs.copyFileSync(source, target);

fs.mkdirSync(sqlDir, { recursive: true });
const sqlTarget = path.join(sqlDir, "20260731_financial_settlement_v3.sql");
const verifyTarget = path.join(sqlDir, "verify_financial_settlement_v3.sql");
fs.copyFileSync(sqlSource, sqlTarget);
fs.copyFileSync(verifySource, verifyTarget);

console.log("Financial Settlement V3 frontend installed.");
console.log(`Page: ${target}`);
console.log(`Backup: ${backup}`);
console.log(`Migration: ${sqlTarget}`);
console.log(`Verifier: ${verifyTarget}`);
console.log("Next: execute the migration in Supabase SQL Editor, then run npm run build.");
