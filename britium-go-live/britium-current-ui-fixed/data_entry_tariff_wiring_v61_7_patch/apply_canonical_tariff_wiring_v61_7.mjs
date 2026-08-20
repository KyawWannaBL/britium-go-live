#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(process.argv[2] || '.');
const patchDir = path.dirname(fileURLToPath(import.meta.url));
const files = [
  ['DataEntryFinancialV2Page.tsx', path.join(root,'src','pages','DataEntryFinancialV2Page.tsx')],
  ['TariffPage.tsx', path.join(root,'src','pages','TariffPage.tsx')]
];
for (const [srcName,target] of files) {
  const source=path.join(patchDir,srcName);
  if (!fs.existsSync(source) || !fs.existsSync(target)) { console.error(JSON.stringify({ok:false,error:`Missing ${!fs.existsSync(source)?source:target}`},null,2)); process.exit(1); }
}
const timestamp = new Date().toISOString().replace(/[:.]/g,'-');
const backups=[];
for (const [srcName,target] of files) {
  const backup=`${target}.before-v61-7-${timestamp}`;
  fs.copyFileSync(target,backup); backups.push(backup);
  fs.copyFileSync(path.join(patchDir,srcName),target);
}
console.log(JSON.stringify({ok:true,build:'PORTAL_CANONICAL_TARIFF_WIRING_V61_7_INSTALL_2026_08_03',targets:files.map(x=>x[1]),backups,canonical_tariff_source:'be_parcel_tariffs_v2',tariff_catalog_rpc:'be_tariff_catalog_v61_7',data_entry_and_tariff_screen_shared_source:true,financial_writes_enabled:false,build_performed:false,deploy_performed:false},null,2));
