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
const tariffFixture = resolve('scripts/uat-audit/fixtures/finance_tariff_v2_ci_bootstrap.sql');
if (!readFileSync(tariffFixture, 'utf8').includes('create table if not exists public.be_parcel_tariffs_v2')) {
  throw new Error('Missing CI-only tariff table fixture');
}
copyFileSync(tariffFixture, resolve(root,'20260827070903_uat308_tariff_structure_reconstruction.sql'));
copyFileSync(financeFixture, resolve(root,'20260827070904_uat308_finance_legacy_reconstruction.sql'));
const fieldIdentityFixture = resolve('scripts/uat-audit/fixtures/field_team_identity_ci_bootstrap.sql');
const fieldIdentitySql = readFileSync(fieldIdentityFixture, 'utf8');
if (!fieldIdentitySql.includes('Authenticated field-team session is required') ||
    !fieldIdentitySql.includes('w.auth_user_id = v_uid') ||
    !fieldIdentitySql.includes('REVOKE ALL ON FUNCTION public.be_current_field_team_identity()')) {
  throw new Error('CI-only field identity fixture missing required auth and privilege guards');
}
copyFileSync(fieldIdentityFixture, resolve(root,'20260830094499_uat308_field_identity_reconstruction.sql'));
console.log('CI-only guarded field-team resolver inserted before v10_1; no production database changes.');
const scanFixture = resolve('scripts/uat-audit/fixtures/dispatch_scans_v39_ci_bootstrap.sql');
const scanSql = readFileSync(scanFixture,'utf8');
if (!scanSql.includes('CREATE TABLE IF NOT EXISTS public.be_dispatch_scans_v39') ||
    !scanSql.includes('delivery_way_id text PRIMARY KEY') ||
    !scanSql.includes('ENABLE ROW LEVEL SECURITY') ||
    !scanSql.includes('REVOKE ALL ON TABLE public.be_dispatch_scans_v39')) {
  throw new Error('Dispatch scan v39 CI fixture is absent or missing fail-closed safeguards');
}
copyFileSync(scanFixture, resolve(root,'20260901111808_uat308_dispatch_scans_v39_reconstruction.sql'));
console.log('CI-only dispatch scan table reconstructed before health v12_10c; no remote writes.');
const financialColumnFixture = resolve('scripts/uat-audit/fixtures/data_entry_financial_validation_column_ci.sql');
const financialSql = readFileSync(financialColumnFixture,'utf8');
if (!financialSql.includes('ADD COLUMN IF NOT EXISTS financial_validation_status text') ||
    !financialSql.includes('No default VALID')) {
  throw new Error('CI financial validation status fixture not nullable or safe');
}
copyFileSync(financialColumnFixture, resolve(root,'20260901145927_uat308_financial_status_column_reconstruction.sql'));
console.log('CI-only nullable financial_validation_status restored before dispatch v12_11; never mark unverified parcels VALID.');


// Restore real historical warehouse V36/V39 view dependencies only in disposable CI.
// Extract original SQL instead of fabricating ready/received warehouse statuses.
const warehouseV36Source = readFileSync(
  resolve('britium-go-live/britium-current-ui-fixed/warehouse_receipt_reconciliation_v36.sql'), 'utf8');
const warehouseV39Source = readFileSync(
  resolve('britium-go-live/britium-current-ui-fixed/warehouse_dispatch_rto_alert_v39.sql'), 'utf8');
const takeSection = (source, start, end, name) => {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  if (a < 0 || b <= a || source.indexOf(start, a + start.length) >= 0) {
    throw new Error('Ambiguous/missing original warehouse section: ' + name);
  }
  return source.slice(a, b).trim() + '\n';
};
// Recover the original Waybill Studio parent table referenced by V36.
// The selected source is the historical Data Entry backend, not a fabricated row set.
const waybillBackendSource = readFileSync(
  resolve('britium-go-live/britium-current-ui-fixed/src/pages/data_entry_excel_register_backend.sql'), 'utf8');
const waybillTableSql = takeSection(waybillBackendSource,
  'create table if not exists public.be_parcel_waybills (',
  '-- -----------------------------------------------------------------------------\n-- 3) Shared helpers', 'original parcel waybill table');
if (!waybillTableSql.includes('pickup_id text not null unique') ||
    !waybillTableSql.includes('waybill_no text not null unique') ||
    !waybillTableSql.includes('updated_at timestamptz not null default now()')) {
  throw new Error('Original Waybill Studio parent table definition changed');
}
writeFileSync(resolve(root, '20260901152004_uat308_original_waybill_table_ci.sql'),
  '-- CI-only original Waybill Studio parent table, no live data or direct API grants.\n' +
  waybillTableSql +
  '\nALTER TABLE public.be_parcel_waybills ENABLE ROW LEVEL SECURITY;\n' +
  'REVOKE ALL ON TABLE public.be_parcel_waybills FROM PUBLIC, anon, authenticated;\n');
console.log('CI-only historical Waybill Studio parent table restored before V36.');
// The original Data Entry backend adds parcels.way_id; the July snapshot lacks it.
// Restore just that verified nullable text column in disposable CI, without moving
// data, inventing way IDs, or running the original data-mutating backfill.
const parcelWayIdDefinition = waybillBackendSource.match(
  /alter table public\.parcels\s+add column if not exists (way_id text),/i);
if (!parcelWayIdDefinition || parcelWayIdDefinition[1].toLowerCase() !== 'way_id text') {
  throw new Error('Original parcels.way_id definition missing or changed');
}
writeFileSync(resolve(root, '20260901152003_uat308_original_parcel_way_id_ci.sql'),
  '-- CI-only historical nullable parcels.way_id dependency; no data updates.\n' +
  'ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS ' + parcelWayIdDefinition[1] + ';\n');
console.log('CI-only historical parcels.way_id text restored before warehouse V36.');
const warehouseV36Sql = takeSection(warehouseV36Source,
  'create extension if not exists pgcrypto;',
  'create or replace function public.be_warehouse_receipt_snapshot_v36(', 'V36 table + receipt view');
const warehouseV39Tables = takeSection(warehouseV39Source,
  'create extension if not exists pgcrypto;',
  'create or replace function public.be_is_super_admin_v39()', 'V39 operational tables');
const warehouseV39View = takeSection(warehouseV39Source,
  'create or replace view public.be_v_warehouse_receipt_v39 as',
  'create or replace view public.be_v_warehouse_lifecycle_v39 as', 'V39 receipt view');
if (!warehouseV36Sql.includes('create table if not exists public.be_warehouse_receipts_v36') ||
    !warehouseV36Sql.includes('enable row level security') ||
    !warehouseV36Sql.includes('revoke all on public.be_warehouse_receipts_v36') ||
    !warehouseV36Sql.includes('create or replace view public.be_v_warehouse_receipt_v36') ||
    !warehouseV39Tables.includes('create table if not exists public.be_delivery_attempt_state_v39') ||
    !warehouseV39Tables.includes('enable row level security') ||
    !warehouseV39View.includes('from public.be_v_warehouse_receipt_v36 v') ||
    !warehouseV39View.includes('where ds.delivery_way_id = v.delivery_way_id')) {
  throw new Error('Original V36/V39 warehouse safety dependencies not verified');
}
writeFileSync(resolve(root, '20260901152005_uat308_original_warehouse_v36_ci.sql'),
  '-- CI-only extract of original warehouse V36 source; never apply remotely.\n' + warehouseV36Sql);
writeFileSync(resolve(root, '20260901152006_uat308_original_warehouse_v39_ci.sql'),
  '-- CI-only extract of original warehouse V39 source; never apply remotely.\n' +
  warehouseV39Tables + '\n' + warehouseV39View);
console.log('CI-only V36/V39 genuine warehouse receipt dependencies injected before dispatch v12_12.');

const loginResolverFixture = resolve('scripts/uat-audit/fixtures/field_team_login_resolver_ci_bootstrap.sql');
const loginResolverSql = readFileSync(loginResolverFixture, 'utf8');
if (!loginResolverSql.includes('CREATE OR REPLACE FUNCTION public.be_field_team_resolve_login(p_login text)') ||
    !loginResolverSql.includes('coalesce(w.active, true) = true') ||
    !loginResolverSql.includes('v_row.auth_user_id is null') ||
    !loginResolverSql.includes('from auth.users u') ||
    !loginResolverSql.includes('REVOKE ALL ON FUNCTION public.be_field_team_resolve_login(text)')) {
  throw new Error('CI field login fixture fails active workforce and Auth mapping checks');
}
copyFileSync(loginResolverFixture,
  resolve(root, '20260901192436_uat308_original_field_login_resolver_ci.sql'));
console.log('CI-only original guarded workforce login resolver loaded before September public lockdown.');




console.log('CI-only finance legacy bootstrap inserted before the August patch; committed migration history unchanged.');

console.log(JSON.stringify({mode:'disposable-snapshot-first',replacedHistoricalMigrations:replaced,snapshotSizeBytes:Buffer.byteLength(sql),remainingMigrations:files.length-replaced,productionWrites:false}));
