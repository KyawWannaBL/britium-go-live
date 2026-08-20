import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILD = 'PORTAL_DATA_ENTRY_WEIGHT_SURCHARGE_PASS_THROUGH_V61_3_INSTALL_2026_08_02';
const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || '.');
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'patch_manifest.json'), 'utf8'));
const patchRoot = path.join(packageRoot, 'patch');

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
function sha256File(file) {
  return sha256Buffer(fs.readFileSync(file));
}
function canonicalTextHash(file) {
  const canonical = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  return sha256Buffer(Buffer.from(canonical, 'utf8'));
}
function fail(message, detail = {}) {
  console.error(JSON.stringify({
    ok: false,
    build: BUILD,
    root,
    message,
    ...detail,
    backend_sql_performed: false,
    financial_writes_enabled_by_patch: false,
    build_performed: false,
    deploy_performed: false,
  }, null, 2));
  process.exit(1);
}
function copy(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

try {
  for (const required of manifest.required_existing_files) {
    if (!fs.existsSync(path.join(root, required))) {
      fail('Run this installer from the reviewed Britium portal repository root.', { missing: required });
    }
  }

  for (const [rel, expected] of Object.entries(manifest.patch_hashes)) {
    const file = path.join(patchRoot, rel);
    if (!fs.existsSync(file)) fail('Patch package is incomplete.', { missing: rel });
    const actual = sha256File(file);
    if (actual !== expected) fail('Patch package hash mismatch.', { file: rel, expected, actual });
  }

  for (const [rel, accepted] of Object.entries(manifest.accepted_current_canonical_hashes)) {
    const target = path.join(root, rel);
    if (!fs.existsSync(target)) fail('Current source file is missing.', { file: rel });
    const actual = canonicalTextHash(target);
    if (!accepted.includes(actual)) {
      fail('Current source is not the reviewed deployed V61.2.1 file. Installation stopped before writing.', {
        file: rel,
        actual_canonical_hash: actual,
        accepted_canonical_hashes: accepted,
      });
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = path.join(root, 'production_backups', `data_entry_weight_surcharge_pass_through_v61_3_${stamp}`);
  fs.mkdirSync(backupRoot, { recursive: true });

  for (const rel of Object.keys(manifest.patch_hashes)) {
    copy(path.join(root, rel), path.join(backupRoot, rel));
  }
  for (const rel of Object.keys(manifest.patch_hashes)) {
    copy(path.join(patchRoot, rel), path.join(root, rel));
  }
  for (const [rel, expected] of Object.entries(manifest.patch_hashes)) {
    const actual = sha256File(path.join(root, rel));
    if (actual !== expected) {
      fail('Post-copy verification failed.', { file: rel, expected, actual, backup_root: backupRoot });
    }
  }

  fs.writeFileSync(path.join(backupRoot, 'install_manifest.json'), JSON.stringify({
    build: BUILD,
    installed_at: new Date().toISOString(),
    installed: Object.keys(manifest.patch_hashes),
    confirmed_business_rule: manifest.confirmed_business_rule,
    backend_sql_performed: false,
    financial_writes_enabled_by_patch: false,
    build_performed: false,
    deploy_performed: false,
  }, null, 2));

  console.log(JSON.stringify({
    ok: true,
    build: BUILD,
    root,
    backup_root: backupRoot,
    files_installed: Object.keys(manifest.patch_hashes),
    confirmed_example: manifest.confirmed_business_rule.example,
    township_record_count: manifest.township_record_count,
    backend_sql_required: true,
    backend_sql_performed: false,
    weight_surcharge_added_to_receiver_cod: true,
    weight_surcharge_retained_by_britium: true,
    merchant_double_charge_prevented: true,
    financial_writes_enabled_by_patch: false,
    build_performed: false,
    deploy_performed: false,
    next: 'Run the V61.3 source verifier, deploy the V61.3 SQL migration in Supabase, run its SQL verifier, then build and dist-verify the portal.',
  }, null, 2));
} catch (error) {
  fail(error?.message || String(error));
}
