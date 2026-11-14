import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expected = readFileSync(resolve(root, 'supabase/migration_history_archive/production_versions_20261114.txt'), 'utf8').trim().split(/\r?\n/).sort();
const files = readdirSync(resolve(root, 'supabase/migrations')).filter(name => name.endsWith('.sql'));
const versions = files.map(name => {
  assert.match(name, /^\d{14}_[\w.-]+\.sql$/, `Invalid migration filename: ${name}`);
  return name.slice(0, 14);
}).sort();
assert.equal(new Set(versions).size, versions.length, 'Duplicate local migration version');
assert.deepEqual(versions, expected, 'Migration versions disagree with audited production ledger snapshot');
console.log(`PASS migration version alignment: ${versions.length} unique active versions, zero absent/extra. This test does not replay SQL or validate production deployment.`);
