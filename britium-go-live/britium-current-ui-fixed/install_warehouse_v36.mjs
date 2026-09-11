import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.join(root, 'src', 'pages');
const active = path.join(pagesDir, 'WarehousePage.tsx');
const versioned = path.join(pagesDir, 'WarehousePage.V36.tsx');
const source = path.join(sourceDir, 'WarehousePage.V36.tsx');
const sqlSource = path.join(sourceDir, 'warehouse_receipt_reconciliation_v36.sql');
const sqlTarget = path.join(root, 'warehouse_receipt_reconciliation_v36.sql');

if (!fs.existsSync(pagesDir)) throw new Error('Run this installer from the repository root containing src/pages.');
if (!fs.existsSync(source)) throw new Error('WarehousePage.V36.tsx is missing beside the installer.');
if (!fs.existsSync(sqlSource)) throw new Error('warehouse_receipt_reconciliation_v36.sql is missing beside the installer.');

if (fs.existsSync(active)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(active, `${active}.before-v36-${stamp}`);
}

fs.copyFileSync(source, active);
fs.copyFileSync(source, versioned);
fs.copyFileSync(sqlSource, sqlTarget);

const body = fs.readFileSync(active);
const sha = crypto.createHash('sha256').update(body).digest('hex');
if (!body.toString('utf8').includes('WAREHOUSE_V36_RECEIPT_RECONCILIATION_2026-07-30')) {
  throw new Error('Installed source does not contain the V36 build marker.');
}

console.log(`PASS: installed WAREHOUSE_V36_RECEIPT_RECONCILIATION_2026-07-30`);
console.log(`Active: ${path.relative(root, active)} | ${body.length} bytes | ${sha}`);
console.log(`Versioned: ${path.relative(root, versioned)}`);
console.log(`SQL: ${path.relative(root, sqlTarget)}`);
console.log('Next: run the V36 SQL in Supabase, remove dist/node_modules/.vite, build, then run verify_warehouse_v36.mjs.');
