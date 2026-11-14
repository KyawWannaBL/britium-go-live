import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Audit the repository-root directory actually used by Supabase GitHub Preview.
// Do not connect to, reset, repair or change any remote migration ledger.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const snapshot = resolve(repoRoot, 'britium-go-live/supabase/migration_history_archive/production_versions_20261114.txt');
const expected = readFileSync(snapshot, 'utf8').trim().split(/\r?\n/).sort();
const rootFiles = readdirSync(resolve(repoRoot, 'supabase/migrations'))
  .filter(name => name.endsWith('.sql'));
const actual = rootFiles.map(name => {
  assert.match(name, /^\d{14}_[\w.-]+\.sql$/, 'Malformed root migration filename: ' + name);
  return name.slice(0, 14);
}).sort();
assert.equal(new Set(actual).size, actual.length, 'Duplicate root migration version');
assert.deepEqual(actual, expected, 'Repository-root migration versions diverge from audited production ledger');
const nested = readdirSync(resolve(repoRoot, 'britium-go-live/supabase/migrations'))
  .filter(name => name.endsWith('.sql')).map(name => name.slice(0, 14)).sort();
assert.deepEqual(actual, nested, 'Root and nested migrations disagree by version');
console.log('PASS root Supabase migration history: ' + actual.length + ' versions match production snapshot and nested app; no remote writes.');
