#!/usr/bin/env node
// Issue #308: Local GitHub Actions ONLY. Rewrite historical files in disposable CI checkout.
// DO NOT run in a production checkout. Never touches any remote database.
import { readdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
const expectedBranch = 'refs/heads/fix/uat-migration-replay-audit-308';
if (process.env.UAT_308_DISPOSABLE_ONLY !== '1' ||
    process.env.GITHUB_REF !== expectedBranch ||
    process.env.CI !== 'true') {
  throw new Error('Refusing to operate outside designated disposable GitHub Actions runner');
}
const root = resolve('supabase/migrations');
const files = readdirSync(root).filter(f => /^\d{14}_.+\.sql$/.test(f));
if (files.length < 450) throw new Error('Unexpectedly short migration list: ' + files.length);
const snapshot = files.find(f => f.startsWith('20260721093501_'));
if (!snapshot) throw new Error('Historical snapshot missing');
let sql = readFileSync(resolve(root,snapshot),'utf8');
if (sql.length < 3000000 || !sql.includes('create type "public"."app_role"')) {
  throw new Error('Historical baseline content unexpected');
}
// pgtap creates _time_trial_type; historical schema-dump duplicates the extension-owned type.
const duplicatePgtapType = 'create type "public"."_time_trial_type" as ("a_time" numeric);';
if (sql.split(duplicatePgtapType).length !== 2) {
  throw new Error('Expected exactly one pgtap extension-owned _time_trial_type duplicate');
}
sql = sql.replace(duplicatePgtapType, '-- CI-only omission: pgtap extension already owns _time_trial_type');
writeFileSync(resolve(root,snapshot), sql);
let replaced=0;
for (const file of files) {
  if (file.slice(0,14) < '20260721093501') {
    // This runs ONLY in disposable CI workspace. Preserve migration versions;
    // start from full July schema snapshot, rather than duplicating objects.
    writeFileSync(resolve(root,file), '-- CI-only baseline test, original untouched in Git\nSELECT 1;\n');
    replaced++;
  }
}
if (replaced < 15 || replaced > 100) throw new Error('Unexpected historical migration count: '+replaced);
const financeFixture = resolve('scripts/uat-audit/fixtures/finance_v61_8_2_ci_bootstrap.sql');
const fixtureText = readFileSync(financeFixture,'utf8');
if (fixtureText.length < 11000 || !fixtureText.includes('be_calculate_parcel_financial_v2(')) {
  throw new Error('Missing or invalid CI-only finance historical fixture');
}
copyFileSync(financeFixture, resolve(root,'20260827070904_uat308_finance_legacy_reconstruction.sql'));
console.log('CI-only finance legacy bootstrap inserted before the August patch; committed migration history unchanged.');

console.log(JSON.stringify({mode:'disposable-snapshot-first',replacedHistoricalMigrations:replaced,snapshotSizeBytes:Buffer.byteLength(sql),remainingMigrations:files.length-replaced,productionWrites:false}));
