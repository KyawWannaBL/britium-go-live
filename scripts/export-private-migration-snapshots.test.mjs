import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, chmodSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const exporter = path.join(here, 'export-private-migration-snapshots.sh');

function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'britium-recovery-test-'));
  const bin = path.join(root, 'bin');
  const target = path.join(root, 'private');
  mkdirSync(bin, { mode: 0o700 });
  mkdirSync(target, { mode: 0o700 });
  writeFileSync(path.join(bin, 'psql'), `#!/usr/bin/env bash
set -euo pipefail
# Test double: do not connect to any database.
[[ "${PGOPTIONS:-}" == *"default_transaction_read_only=on"* ]] || exit 93
[[ "${PGDATABASE:-}" == "postgresql://fake-local-test-only/" ]] || exit 94
if [[ "${MOCK_PSQL_MODE:-}" == fail ]]; then exit 23; fi
printf '%s\\n' '["FAKE SQL TEST FIXTURE \\"sensitive-looking\\\" \\\\n"]'
`);
  chmodSync(path.join(bin, 'psql'), 0o700);
  return { root, bin, target, dispose: () => rmSync(root, { recursive: true, force: true }) };
}
function run(ctx, envOverrides = {}, directory = ctx.target) {
  return spawnSync('bash', [exporter, directory], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${ctx.bin}:${process.env.PATH}`,
      SUPABASE_DB_URL: 'postgresql://fake-local-test-only/', ...envOverrides }
  });
}

test('missing credential fails before export', () => {
  const c = setup();
  try {
    const result = run(c, { SUPABASE_DB_URL: '' });
    assert.equal(result.status, 2);
    assert.deepEqual(readdirSync(c.target), []);
  } finally { c.dispose(); }
});

test('refuses group/other-readable export directory', () => {
  const c = setup();
  try {
    chmodSync(c.target, 0o755);
    const result = run(c);
    assert.equal(result.status, 2);
    assert.deepEqual(readdirSync(c.target), []);
  } finally { c.dispose(); }
});

test('refuses symlink export directory and existing output file', () => {
  const c = setup();
  try {
    const alias = path.join(c.root, 'directory-link');
    symlinkSync(c.target, alias);
    assert.equal(run(c, {}, alias).status, 2);
    writeFileSync(path.join(c.target, '20260412000000-statements.json'), 'original');
    const result = run(c);
    assert.equal(result.status, 1);
    assert.deepEqual(readdirSync(c.target), ['20260412000000-statements.json']);
  } finally { c.dispose(); }
});

test('database command failure cleans private temporary files', () => {
  const c = setup();
  try {
    const result = run(c, { MOCK_PSQL_MODE: 'fail' });
    assert.equal(result.status, 1);
    assert.deepEqual(readdirSync(c.target), []);
  } finally { c.dispose(); }
});

test('incorrect historical fingerprint fails closed without publishing either file', () => {
  const c = setup();
  try {
    const result = run(c);
    assert.equal(result.status, 1);
    assert.deepEqual(readdirSync(c.target), []);
    assert.doesNotMatch(result.stdout + result.stderr, /FAKE SQL TEST FIXTURE/);
    assert.match(result.stderr, /Fingerprint mismatch/);
  } finally { c.dispose(); }
});
