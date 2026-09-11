import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILD = 'PORTAL_DATA_ENTRY_BILINGUAL_TOWNSHIP_V61_1_INSTALL_2026_08_02';
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
  const canonical = fs.readFileSync(file, 'utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');
  return sha256Buffer(Buffer.from(canonical, 'utf8'));
}
function fail(message, detail = {}) {
  console.error(JSON.stringify({
    ok: false,
    build: BUILD,
    root,
    message,
    ...detail,
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
  for (const required of [
    'package.json',
    'src/App.tsx',
    'src/lib/dataEntryFinancialV2Api.ts',
    'src/pages/DataEntryFinancialV2Page.tsx',
  ]) {
    if (!fs.existsSync(path.join(root, required))) {
      fail('Run this installer from the V60-or-newer main Britium portal repository root.', { missing: required });
    }
  }

  for (const [rel, expected] of Object.entries(manifest.patch_hashes)) {
    const file = path.join(patchRoot, rel);
    if (!fs.existsSync(file)) fail('Patch package is incomplete.', { missing: rel });
    const actual = sha256File(file);
    if (actual !== expected) fail('Patch package hash mismatch.', { file: rel, expected, actual });
  }

  const pageRel = 'src/pages/DataEntryFinancialV2Page.tsx';
  const dataRel = 'src/data/townshipTariffDirectory.ts';
  const pageTarget = path.join(root, pageRel);
  const dataTarget = path.join(root, dataRel);

  const currentPageCanonicalHash = canonicalTextHash(pageTarget);
  const acceptedPageHashes = manifest.accepted_current_canonical_hashes[pageRel] || [];
  if (!acceptedPageHashes.includes(currentPageCanonicalHash)) {
    fail('Current Data Entry page is not a reviewed V60, V61, approved-translation revision, or this V61.1 source. Installation stopped before writing.', {
      file: pageRel,
      actual_canonical_hash: currentPageCanonicalHash,
      accepted_canonical_hashes: acceptedPageHashes,
    });
  }

  if (fs.existsSync(dataTarget)) {
    const currentDataCanonicalHash = canonicalTextHash(dataTarget);
    const acceptedDataHashes = manifest.accepted_current_canonical_hashes[dataRel] || [];
    if (!acceptedDataHashes.includes(currentDataCanonicalHash)) {
      fail('An unreviewed township directory already exists. Installation stopped before writing.', {
        file: dataRel,
        actual_canonical_hash: currentDataCanonicalHash,
        accepted_canonical_hashes: acceptedDataHashes,
      });
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = path.join(root, 'production_backups', `data_entry_bilingual_township_v61_1_${stamp}`);
  fs.mkdirSync(backupRoot, { recursive: true });
  copy(pageTarget, path.join(backupRoot, pageRel));
  if (fs.existsSync(dataTarget)) copy(dataTarget, path.join(backupRoot, dataRel));

  copy(path.join(patchRoot, pageRel), pageTarget);
  copy(path.join(patchRoot, dataRel), dataTarget);

  for (const [rel, expected] of Object.entries(manifest.patch_hashes)) {
    const target = path.join(root, rel);
    const actual = sha256File(target);
    if (actual !== expected) {
      fail('Post-copy verification failed.', { file: rel, expected, actual, backup_root: backupRoot });
    }
  }

  fs.writeFileSync(path.join(backupRoot, 'install_manifest.json'), JSON.stringify({
    build: BUILD,
    installed_at: new Date().toISOString(),
    root,
    previous_page_canonical_hash: currentPageCanonicalHash,
    installed: Object.keys(manifest.patch_hashes),
    township_record_count: manifest.township_record_count,
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
    township_record_count: manifest.township_record_count,
    default_language: 'my',
    duplicate_township_names_disambiguated_by_code_and_region: true,
    inactive_township_selection_blocked: true,
    stale_calculation_output_cleared_on_input_change: true,
    financial_writes_enabled_by_patch: false,
    build_performed: false,
    deploy_performed: false,
    next: 'Run the V61.1 source verifier, npm run build, then the V61.1 dist verifier.',
  }, null, 2));
} catch (error) {
  fail(error?.message || String(error));
}
