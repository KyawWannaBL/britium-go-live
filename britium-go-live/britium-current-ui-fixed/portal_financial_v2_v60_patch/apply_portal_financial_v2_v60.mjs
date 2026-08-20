import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILD = 'PORTAL_FINANCIAL_V2_V60_INSTALL_2026_08_02';
const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const patchRoot = path.join(packageRoot, 'patch');
const root = path.resolve(process.argv[2] || '.');
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'patch_manifest.json'), 'utf8'));
const patchHashes = manifest.patch_hashes;
const originalHashes = manifest.original_hashes;
const retiredPaths = manifest.retired_paths;

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
function fail(message, detail = {}) {
  console.error(JSON.stringify({ ok: false, build: BUILD, root, message, ...detail, deploy_performed: false }, null, 2));
  process.exit(1);
}

try {
  if (!fs.existsSync(path.join(root, 'package.json')) || !fs.existsSync(path.join(root, 'src', 'App.tsx'))) {
    fail('Run this installer from the main portal repository root.');
  }

  for (const [rel, expected] of Object.entries(patchHashes)) {
    const source = path.join(patchRoot, rel);
    if (!fs.existsSync(source)) fail('Patch package is incomplete.', { missing_patch_file: rel });
    const actual = sha256(source);
    if (actual !== expected) fail('Patch package hash mismatch.', { file: rel, expected, actual });
  }

  const mismatches = [];
  for (const [rel, original] of Object.entries(originalHashes)) {
    const target = path.join(root, rel);
    if (!fs.existsSync(target)) {
      mismatches.push({ file: rel, reason: 'missing' });
      continue;
    }
    const actual = sha256(target);
    const patched = patchHashes[rel];
    if (actual !== original && actual !== patched) mismatches.push({ file: rel, reason: 'unexpected_sha256', actual, expected_original: original, expected_patched: patched });
  }
  for (const rel of ['src/lib/dataEntryFinancialV2Api.ts', 'src/pages/DataEntryFinancialV2Page.tsx']) {
    const target = path.join(root, rel);
    if (fs.existsSync(target) && sha256(target) !== patchHashes[rel]) mismatches.push({ file: rel, reason: 'unexpected_existing_file', actual: sha256(target) });
  }
  if (mismatches.length) fail('Source changed after the reviewed collector snapshot. Installation stopped before writing.', { mismatches });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = path.join(root, 'production_backups', `portal_financial_v2_v60_${stamp}`);
  fs.mkdirSync(backupRoot, { recursive: true });
  const backedUp = [];

  for (const rel of new Set([...Object.keys(patchHashes), ...retiredPaths])) {
    const target = path.join(root, rel);
    if (!fs.existsSync(target)) continue;
    copyFile(target, path.join(backupRoot, rel));
    backedUp.push(rel);
  }

  for (const rel of Object.keys(patchHashes)) copyFile(path.join(patchRoot, rel), path.join(root, rel));
  for (const rel of retiredPaths) fs.rmSync(path.join(root, rel), { force: true });

  const installed = [];
  for (const [rel, expected] of Object.entries(patchHashes)) {
    const actual = sha256(path.join(root, rel));
    if (actual !== expected) fail('Post-copy verification failed.', { file: rel, expected, actual, backup_root: backupRoot });
    installed.push(rel);
  }

  fs.writeFileSync(path.join(backupRoot, 'install_manifest.json'), JSON.stringify({
    build: BUILD,
    source_snapshot_sha256: manifest.source_snapshot_sha256,
    installed_at: new Date().toISOString(),
    root,
    backed_up: backedUp,
    installed,
    retired: retiredPaths,
    financial_writes_enabled_by_patch: false,
  }, null, 2));

  console.log(JSON.stringify({
    ok: true,
    build: BUILD,
    root,
    backup_root: backupRoot,
    files_installed: installed.length,
    retired_public_uat_assets: retiredPaths.length,
    financial_writes_enabled_by_patch: false,
    build_performed: false,
    deploy_performed: false,
    next: 'Run the source verifier, npm run build, then the dist verifier.',
  }, null, 2));
} catch (error) {
  fail(error?.message || String(error));
}
