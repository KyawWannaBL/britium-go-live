import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILD = 'PORTAL_DATA_ENTRY_CLEAN_REVIEW_V61_4_INSTALL_2026_08_03';
const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || '.');
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'patch_manifest.json'), 'utf8'));
const patchRoot = path.join(packageRoot, 'patch');

const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const fileHash = (file) => sha(fs.readFileSync(file));
const canonical = (file) => sha(Buffer.from(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'), 'utf8'));

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

function copy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

try {
  for (const rel of manifest.required_existing_files) {
    if (!fs.existsSync(path.join(root, rel))) {
      fail('Run this installer from the reviewed Britium portal root.', { missing: rel });
    }
  }

  const directorySource = fs.readFileSync(path.join(root, 'src/data/townshipTariffDirectory.ts'), 'utf8');
  if (!directorySource.includes('TOWNSHIP_TARIFF_DIRECTORY') || !directorySource.includes('MMR013019')) {
    fail('The reviewed V61 township directory is required before V61.4.', {
      file: 'src/data/townshipTariffDirectory.ts',
    });
  }

  for (const [rel, expected] of Object.entries(manifest.patch_hashes)) {
    const file = path.join(patchRoot, rel);
    if (!fs.existsSync(file) || fileHash(file) !== expected) {
      fail('Patch package hash mismatch.', { file: rel });
    }
  }

  for (const [rel, accepted] of Object.entries(manifest.accepted_current_canonical_hashes)) {
    const currentFile = path.join(root, rel);
    const actual = canonical(currentFile);
    if (!accepted.includes(actual)) {
      fail('Current Data Entry page is not the reviewed V61.3.3 source.', {
        file: rel,
        actual_canonical_hash: actual,
        accepted,
      });
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = path.join(root, 'production_backups', `data_entry_clean_review_v61_4_${stamp}`);
  fs.mkdirSync(backupRoot, { recursive: true });

  for (const rel of Object.keys(manifest.patch_hashes)) {
    copy(path.join(root, rel), path.join(backupRoot, rel));
    copy(path.join(patchRoot, rel), path.join(root, rel));
  }

  console.log(JSON.stringify({
    ok: true,
    build: BUILD,
    root,
    backup_root: backupRoot,
    files_installed: Object.keys(manifest.patch_hashes),
    clean_registration_layout: true,
    weight_before_final_charges: true,
    review_sheet_editable: true,
    review_sheet_column_count: 50,
    north_dagon_alias_frontend: true,
    backend_sql_required: true,
    backend_sql_performed: false,
    financial_writes_enabled_by_patch: false,
    build_performed: false,
    deploy_performed: false,
  }, null, 2));
} catch (error) {
  fail(error?.message || String(error));
}
