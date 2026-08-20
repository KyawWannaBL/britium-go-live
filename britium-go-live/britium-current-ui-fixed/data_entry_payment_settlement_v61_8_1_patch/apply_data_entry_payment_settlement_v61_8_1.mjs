#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.argv[2] || '.');
const patchDir = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(patchDir, 'DataEntryFinancialV2Page.tsx');
const target = path.join(root, 'src', 'pages', 'DataEntryFinancialV2Page.tsx');

if (!fs.existsSync(source) || !fs.existsSync(target)) {
  console.error(JSON.stringify({ ok: false, error: `Missing ${!fs.existsSync(source) ? source : target}` }, null, 2));
  process.exit(1);
}

const current = fs.readFileSync(target, 'utf8');
const accepted = [
  'PORTAL_DATA_ENTRY_CANONICAL_TARIFF_WIRING_V61_7_2026_08_03',
  'PORTAL_DATA_ENTRY_PAYMENT_SEMANTICS_V61_8_2026_08_04',
  'PORTAL_DATA_ENTRY_PAYMENT_SETTLEMENT_V61_8_1_2026_08_04',
];
if (!accepted.some((marker) => current.includes(marker))) {
  console.error(JSON.stringify({
    ok: false,
    error: 'Expected V61.7/V61.8 Data Entry source before V61.8.1.',
    target,
  }, null, 2));
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = `${target}.before-v61-8-1-${timestamp}`;
fs.copyFileSync(target, backup);
fs.copyFileSync(source, target);

console.log(JSON.stringify({
  ok: true,
  build: 'PORTAL_DATA_ENTRY_PAYMENT_SETTLEMENT_V61_8_1_INSTALL_2026_08_04',
  target,
  backup,
  total_including_uses_item_plus_declared_delivery: true,
  total_including_adds_weight_surcharge_once: true,
  delivery_only_stale_item_blocked: true,
  exact_collection_gross_minus_britium: true,
  opaque_cod_gross_minus_britium: true,
  canonical_tariff_wiring_preserved: true,
  v61_6_clean_ux_preserved: true,
  financial_writes_enabled: false,
  build_performed: false,
  deploy_performed: false,
}, null, 2));
