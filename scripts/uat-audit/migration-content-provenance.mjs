#!/usr/bin/env node
// Issue #308: offline, read-only migration-content provenance audit.
// Never connects to Supabase and never modifies a database.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const paths = [
  resolve(root, 'supabase/migrations'),
  resolve(root, 'britium-go-live/supabase/migrations')
];
const target = '20260721093501_remote_schema.sql';
let problems = 0;
const sha = value => createHash('sha256').update(value).digest('hex').slice(0, 16);

for (const folder of paths) {
  const files = readdirSync(folder).filter(f => /^\d{14}_.+\.sql$/.test(f));
  console.log('DIRECTORY', folder, 'migrations', files.length);
  const matching = files.filter(x => x.startsWith('20260721093501_'));
  if (matching.length !== 1) {
    console.error('ERROR historical migration version not unique:', matching);
    problems++;
    continue;
  }
  const content = readFileSync(resolve(folder, matching[0]), 'utf8');
  console.log('SNAPSHOT', matching[0], 'bytes', Buffer.byteLength(content), 'SHA256-prefix', sha(content));
  if (content.trim().length === 0) {
    console.error('BLOCKER: repository historical snapshot is empty; production migration ledger holds 26,003 SQL statements for this version. Filename-only validation is insufficient.');
    problems++;
  }
}
const a = readFileSync(resolve(paths[0], target));
const b = readFileSync(resolve(paths[1], target));
if (!a.equals(b)) { console.error('ERROR root and nested snapshot contents differ'); problems++; }
console.log('No remote databases, production ledgers, or UAT branches were changed.');
if (problems) {
  console.error('FAIL: block automatic migration replay and follow issue #308 recovery runbook.');
  process.exitCode = 1;
} else {
  console.log('Local file consistency checks passed; this does NOT prove that replay will succeed.');
}
