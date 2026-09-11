import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const BUILD = 'PORTAL_DATA_ENTRY_MERCHANT_DELIVERY_CREDIT_V61_2_1_INSTALL_2026_08_02';
const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || '.');
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'patch_manifest.json'), 'utf8'));
const patchRoot = path.join(packageRoot, 'patch');
function sha256Buffer(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function sha256File(file) { return sha256Buffer(fs.readFileSync(file)); }
function canonicalTextHash(file) { const canonical = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'); return sha256Buffer(Buffer.from(canonical, 'utf8')); }
function fail(message, detail = {}) { console.error(JSON.stringify({ ok: false, build: BUILD, root, message, ...detail, financial_writes_enabled_by_patch: false, build_performed: false, deploy_performed: false }, null, 2)); process.exit(1); }
function copy(source, target) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target); }
try {
  for (const required of ['package.json','src/App.tsx','src/lib/dataEntryFinancialV2Api.ts','src/pages/DataEntryFinancialV2Page.tsx','src/data/townshipTariffDirectory.ts']) if (!fs.existsSync(path.join(root, required))) fail('Run this installer from the reviewed Britium portal repository root.', { missing: required });
  for (const [rel, expected] of Object.entries(manifest.patch_hashes)) { const file=path.join(patchRoot,rel); if(!fs.existsSync(file)) fail('Patch package is incomplete.',{missing:rel}); const actual=sha256File(file); if(actual!==expected) fail('Patch package hash mismatch.',{file:rel,expected,actual}); }
  for (const [rel, accepted] of Object.entries(manifest.accepted_current_canonical_hashes)) { const target=path.join(root,rel); const actual=canonicalTextHash(target); if(!accepted.includes(actual)) fail('Current source is not a reviewed V61.1, V61.1.1, or V61.2 file. Installation stopped before writing.',{file:rel,actual_canonical_hash:actual,accepted_canonical_hashes:accepted}); }
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const backupRoot=path.join(root,'production_backups',`data_entry_merchant_delivery_credit_v61_2_1_${stamp}`);
  fs.mkdirSync(backupRoot,{recursive:true});
  for(const rel of Object.keys(manifest.patch_hashes)) copy(path.join(root,rel),path.join(backupRoot,rel));
  for(const rel of Object.keys(manifest.patch_hashes)) copy(path.join(patchRoot,rel),path.join(root,rel));
  for(const [rel,expected] of Object.entries(manifest.patch_hashes)){const actual=sha256File(path.join(root,rel));if(actual!==expected) fail('Post-copy verification failed.',{file:rel,expected,actual,backup_root:backupRoot});}
  fs.writeFileSync(path.join(backupRoot,'install_manifest.json'),JSON.stringify({build:BUILD,installed_at:new Date().toISOString(),installed:Object.keys(manifest.patch_hashes),confirmed_business_rule:manifest.confirmed_business_rule,financial_writes_enabled_by_patch:false,build_performed:false,deploy_performed:false},null,2));
  console.log(JSON.stringify({ok:true,build:BUILD,root,backup_root:backupRoot,files_installed:Object.keys(manifest.patch_hashes),township_record_count:manifest.township_record_count,positive_delivery_difference_credited_to_merchant:true,example_delivery_difference:1000,example_merchant_final_settlement_amount:51000,additional_customer_charge_receives_delivery_difference:false,other_merchant_credits_receives_delivery_difference:false,financial_writes_enabled_by_patch:false,build_performed:false,deploy_performed:false,next:'Run the V61.2.1 source verifier, npm run build, then the V61.2.1 dist verifier.'},null,2));
} catch(error){fail(error?.message||String(error));}
