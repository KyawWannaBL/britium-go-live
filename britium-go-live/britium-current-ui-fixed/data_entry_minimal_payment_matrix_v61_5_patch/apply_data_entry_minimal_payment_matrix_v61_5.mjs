#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const patchDir = path.dirname(new URL(import.meta.url).pathname);
const source = path.join(patchDir, 'DataEntryFinancialV2Page.tsx');
const target = path.join(root, 'src', 'pages', 'DataEntryFinancialV2Page.tsx');

if (!fs.existsSync(source)) {
  console.error(`ERROR: patch source missing: ${source}`);
  process.exit(1);
}
if (!fs.existsSync(target)) {
  console.error(`ERROR: target page missing: ${target}`);
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = `${target}.before-v61-5-${timestamp}`;
fs.copyFileSync(target, backup);
fs.copyFileSync(source, target);

console.log(JSON.stringify({
  ok: true,
  build: 'PORTAL_DATA_ENTRY_MINIMAL_PAYMENT_MATRIX_V61_5_INSTALL_2026_08_03',
  target,
  backup,
  backend_sql_required: true,
  build_performed: false,
  deploy_performed: false,
  financial_writes_enabled: false,
}, null, 2));
