#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.argv[2] || '.');
const patchDir = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(patchDir, 'DataEntryFinancialV2Page.tsx');
const target = path.join(root, 'src', 'pages', 'DataEntryFinancialV2Page.tsx');

for (const file of [source, target]) {
  if (!fs.existsSync(file)) {
    console.error(JSON.stringify({ ok: false, error: `Missing required file: ${file}` }, null, 2));
    process.exit(1);
  }
}

const current = fs.readFileSync(target, 'utf8');
const next = fs.readFileSync(source, 'utf8');
if (!next.includes('PORTAL_DATA_ENTRY_MINIMAL_CLEAN_UX_V61_6_2026_08_03')) {
  console.error(JSON.stringify({ ok: false, error: 'V61.6 build marker missing from patch source.' }, null, 2));
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = `${target}.before-v61-6-${timestamp}`;
fs.copyFileSync(target, backup);
fs.writeFileSync(target, next);

console.log(JSON.stringify({
  ok: true,
  build: 'PORTAL_DATA_ENTRY_MINIMAL_CLEAN_UX_V61_6_INSTALL_2026_08_03',
  target,
  backup,
  previous_build_detected: current.match(/PORTAL_DATA_ENTRY_[A-Z0-9_]+/)?.[0] || null,
  single_parcel_focus: true,
  backend_fields_hidden: true,
  three_summary_cards_only: true,
  full_review_sheet_preserved: true,
  backend_sql_required: false,
  financial_writes_enabled: false,
  build_performed: false,
  deploy_performed: false
}, null, 2));
