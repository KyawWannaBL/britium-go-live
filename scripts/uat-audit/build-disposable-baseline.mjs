#!/usr/bin/env node
/**
 * Issue #308 — build a disposable snapshot-first replay tree.
 * NEVER writes a remote database, never modifies original migrations,
 * never runs Supabase commands. Requires an operator-exported schema-only
 * historical snapshot file from the applied migration ledger.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const flag = name => args[args.indexOf(name) + 1];
if (!args.includes('--snapshot') || !args.includes('--output')) {
  console.error('Usage: node scripts/uat-audit/build-disposable-baseline.mjs --snapshot /path/to/20260721093501_remote_schema.sql --output /tmp/uat-308-baseline');
  process.exit(2);
}
const source = resolve(flag('--snapshot'));
const output = resolve(flag('--output'));
const original = join(repoRoot, 'supabase/migrations');
if (!existsSync(source)) throw new Error('Snapshot file does not exist');
if (existsSync(output)) throw new Error('Refusing to overwrite output directory: ' + output);
if (output === repoRoot || output.startsWith(repoRoot + '/')) throw new Error('Output must be outside the Git checkout');
const sql = readFileSync(source, 'utf8');
const matches = (sql.match(/create\s+type\s+["']?public["']?\.["']?app_role["']?\s+as\s+enum/i) || []).length;
if (Buffer.byteLength(sql) < 100000 || !matches || !/create\s+table\s+["']?public["']?\./i.test(sql)) {
  throw new Error('Snapshot does not resemble the required historical baseline; refuse to generate replay files');
}
const target = '20260721093501_remote_schema.sql';
const postFiles = readdirSync(original)
  .filter(f => /^\d{14}_.+\.sql$/.test(f) && f.slice(0,14) > '20260721093501')
  .sort();
mkdirSync(join(output,'supabase/migrations'),{recursive:true});
writeFileSync(join(output,'supabase/migrations',target),sql);
for (const file of postFiles) {
  copyFileSync(join(original,file),join(output,'supabase/migrations',file));
}
writeFileSync(join(output,'supabase/config.toml'), 'project_id = "uat_308_disposable"\n[db]\nmajor_version = 17\n');
writeFileSync(join(output,'README.md'),
  '# Disposable UAT baseline replay\n\n' +
  'This directory is an experimental LOCAL-ONLY test tree. DO NOT link it to production, do not use remote db push.\n' +
  'Run `supabase start` then `supabase db reset` locally after installing Docker and the current Supabase CLI.\n' +
  'The output intentionally omits prior migration versions; this is a replay **experiment**, not a validated replacement or production migration history.\n' +
  'Do not deploy until all migration errors, schema comparisons, RLS checks and branch permissions pass.\n');
console.log(JSON.stringify({output, snapshotBytes:Buffer.byteLength(sql), laterMigrationFiles:postFiles.length, totalReplayFiles:postFiles.length+1, localOnly:true},null,2));
