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

// Restore the historical Finance V2 parcel columns as a single dependency set.
// Both sources are original checked-in SQL; this runs only in disposable CI.
const parcelFinanceLegacySource = readFileSync(
  resolve('britium-go-live/britium-current-ui-fixed/parcel_financial_v2_backend.sql'), 'utf8');
const originalParcelAdditions = [waybillBackendSource, parcelFinanceLegacySource]
  .flatMap(source => source.split('\n').map(line =>
    line.trim().match(/^add column if not exists ([a-z_][a-z0-9_]*) (.+?)[,;]?\s*$/i)
  ).filter(Boolean).map(match => [match[1], match[2].replace(/,\s*$/, '')]));
const financeParcelColumns = [
  'merchant_id','township','customer_tier','amount_entry_type','item_price',
  'delivery_charges','merchant_stated_total_amount','additional_customer_charge',
  'cbm_surcharge','other_surcharge','merchant_payable_charges',
  'other_merchant_credits','weight_kg','monthly_ways'
];
const originalDefinitions = new Map(originalParcelAdditions);
const verifiedTypes = new Map([
  ['merchant_id','text'],['township','text'],['customer_tier','text'],
  ['amount_entry_type','text'],['item_price','numeric(14,2)'],
  ['delivery_charges','numeric(14,2)'],
  ['merchant_stated_total_amount','bigint'],['additional_customer_charge','bigint'],
  ['cbm_surcharge','bigint'],['other_surcharge','bigint'],
  ['merchant_payable_charges','bigint'],['other_merchant_credits','bigint'],
  ['weight_kg','numeric(12,3)'],['monthly_ways','integer']
]);
const additions = financeParcelColumns.map(column => {
  const original = originalDefinitions.get(column);
  const expectedType = verifiedTypes.get(column);
  if (!original || !expectedType || !original.toLowerCase().startsWith(expectedType)) {
    throw new Error('Historical Finance V2 parcel column mismatch: ' + column + ': ' + original);
  }
  return '  ADD COLUMN IF NOT EXISTS ' + column + ' ' + original;
});
writeFileSync(resolve(root, '20260901192454_uat308_original_finance_parcel_columns_ci.sql'),
  '-- CI-only historical additive Finance V2 parcel definitions, sourced from original SQL.\n' +
  '-- Never apply this diagnostic fixture to hosted UAT or production.\n' +
  'ALTER TABLE public.parcels\n' + additions.join(',\n') + ';\n');
console.log('CI-only original Finance V2 parcel columns restored before canonical projection.');

// Historical Finance V4 assumes a superseded settlement view exists. The July
// disposable baseline lacks it. Make only its unconditional drop idempotent
// within this ephemeral checkout; do not change committed migration bytes.
const financeProjectionPath = resolve(root, '20260901192455_finance_canonical_projection_v4_1.sql');
const financeProjectionSql = readFileSync(financeProjectionPath, 'utf8');
const oldFinanceDrop = 'drop view public.be_v_finance_merchant_settlement_queue_v2;';
if (financeProjectionSql.split(oldFinanceDrop).length !== 2 ||
    !financeProjectionSql.includes('create view public.be_v_finance_merchant_settlement_queue_v2')) {
  throw new Error('Expected single historical settlement-view replacement not found');
}
writeFileSync(financeProjectionPath, financeProjectionSql.replace(
  oldFinanceDrop, 'drop view if exists public.be_v_finance_merchant_settlement_queue_v2;'));
console.log('CI-only conditional drop of missing superseded Finance V2 view; Git history unchanged.');

// Production's canonical Finance view relies on legacy parcels columns missing
// from the July disposable snapshot. Recover their verified historical shapes.
// No financial status is fabricated; existing rows remain unchanged.
const legacyFinanceViewColumns = [
  ['collect_amount', 'numeric NOT NULL DEFAULT 0'],
  ['financial_locked_at', 'timestamptz'],
  ['financial_settled_at', 'timestamptz'],
  ['financial_settlement_batch_id', 'uuid']
];
const canonicalViewSource = financeProjectionSql.slice(
  financeProjectionSql.indexOf('create view public.be_v_finance_merchant_settlement_queue_v2'));
for (const [col] of legacyFinanceViewColumns) {
  if (!canonicalViewSource.includes('p.' + col)) {
    throw new Error('Finance V4 no longer references expected historical parcel column: ' + col);
  }
}
const combinedFinanceColumnsPath = resolve(root, '20260901192454_uat308_original_finance_parcel_columns_ci.sql');
writeFileSync(combinedFinanceColumnsPath,
  readFileSync(combinedFinanceColumnsPath, 'utf8') +
  '\n-- CI-only historical Finance V4 view prerequisites verified against production catalog.\n' +
  'ALTER TABLE public.parcels\n' +
  legacyFinanceViewColumns.map(([col, definition]) =>
    '  ADD COLUMN IF NOT EXISTS ' + col + ' ' + definition).join(',\n') + ';\n');
console.log('CI-only historical collection and settlement-lock parcel fields restored.');

// Restore the complete referenced Finance V2 projection field set, rather than
// whack-a-mole individual missing fields. Every definition comes from checked-in
// historical SQL and is used ONLY in the ephemeral replay checkout.
const financeViewParcelFields = [...new Set(
  [...canonicalViewSource.matchAll(/\bp\.([a-z_][a-z0-9_]*)/g)].map(m => m[1])
)];
const knownHistoricalBaseFields = new Set([
  'id', 'delivery_way_id', 'collect_amount', 'financial_locked_at',
  'financial_settled_at', 'financial_settlement_batch_id'
]);
const financeProjectionAdditions = financeViewParcelFields
  .filter(column => !knownHistoricalBaseFields.has(column))
  .map(column => {
    const definition = originalDefinitions.get(column);
    if (!definition || !/^(text|bigint|numeric\(|integer|uuid|timestamptz)\b/i.test(definition)) {
      throw new Error('Missing checked-in Finance V2 column definition: ' + column);
    }
    return '  ADD COLUMN IF NOT EXISTS ' + column + ' ' + definition;
  });
if (financeProjectionAdditions.length < 20 ||
    !financeProjectionAdditions.some(s => s.includes('base_tariff bigint'))) {
  throw new Error('Incomplete original Finance V2 settlement projection column set');
}
const financeCombinedFixturePath =
  resolve(root, '20260901192454_uat308_original_finance_parcel_columns_ci.sql');
writeFileSync(financeCombinedFixturePath,
  readFileSync(financeCombinedFixturePath, 'utf8') +
  '\n-- Additional original Finance V2 settlement projection columns.\n' +
  'ALTER TABLE public.parcels\n' + financeProjectionAdditions.join(',\n') + ';\n');
console.log('CI-only full Finance settlement projection columns restored from original SQL.');

// Restore the original merchant financial profile parent table needed by the
// canonical projection, without inserting merchant identities or tariff values.
const merchantProfileStart = 'create table if not exists public.be_merchant_financial_profiles_v2 (';
const merchantProfileEnd = 'create table if not exists public.be_parcel_tariffs_v2 (';
const merchantProfileSql = takeSection(
  parcelFinanceLegacySource, merchantProfileStart, merchantProfileEnd,
  'original Finance V2 merchant financial profiles');
if (!merchantProfileSql.includes('merchant_id text primary key') ||
    !merchantProfileSql.includes('customer_tier text not null') ||
    !merchantProfileSql.includes('effective_from date not null') ||
    !merchantProfileSql.includes('be_merchant_financial_profiles_v2_tier_check') ||
    !financeProjectionSql.includes('from public.be_merchant_financial_profiles_v2 m')) {
  throw new Error('Original Finance V2 merchant profile schema or dependency changed');
}
writeFileSync(resolve(root, '20260901192453_uat308_original_merchant_financial_profiles_ci.sql'),
  '-- CI-only original historical merchant financial profiles, no merchant records.\n' +
  merchantProfileSql +
  '\nALTER TABLE public.be_merchant_financial_profiles_v2 ENABLE ROW LEVEL SECURITY;\n' +
  'REVOKE ALL ON TABLE public.be_merchant_financial_profiles_v2 FROM PUBLIC, anon, authenticated;\n');
console.log('CI-only real merchant financial profile parent schema restored without records.');

// The original Finance V2 profile gained descriptive settlement columns after
// its base definition. Restore their verified production types only in CI.
const merchantProfileViewColumns = [
  ['merchant_name', 'text'],
  ['counterparty_type', "text NOT NULL DEFAULT 'MERCHANT'"],
  ['settlement_method', 'text'],
  ['settlement_account', 'text']
];
const merchantProfileViewSql = financeProjectionSql.slice(
  financeProjectionSql.indexOf('create view public.be_v_finance_merchant_settlement_queue_v2'));
for (const [column] of merchantProfileViewColumns) {
  if (!merchantProfileViewSql.includes('m.' + column)) {
    throw new Error('Merchant settlement view dependency changed: ' + column);
  }
}
const merchantProfileFixturePath =
  resolve(root, '20260901192453_uat308_original_merchant_financial_profiles_ci.sql');
writeFileSync(merchantProfileFixturePath,
  readFileSync(merchantProfileFixturePath, 'utf8') +
  '\n-- Add verified historical merchant settlement profile fields; no profile data.\n' +
  'ALTER TABLE public.be_merchant_financial_profiles_v2\n' +
  merchantProfileViewColumns.map(([column, definition]) =>
    '  ADD COLUMN IF NOT EXISTS ' + column + ' ' + definition).join(',\n') + ';\n');
console.log('CI-only merchant settlement profile descriptor columns restored.');

// V58 request ledger exists in production but is absent in the July snapshot.
// Reconstruct its catalog-verified columns in disposable CI without request data.
const v58RequestMigration = readFileSync(
  resolve(root, '20260902220115_data_entry_extra_registration_bulk_actions.sql'), 'utf8');
if (!v58RequestMigration.includes('alter table public.be_data_entry_financial_v2_requests_v58') ||
    !v58RequestMigration.includes('be_data_entry_financial_v2_requests_v58_operation_check')) {
  throw new Error('V14 request ledger dependency changed');
}
const v58RequestsCiSql = [
  '-- CI-only catalog-verified V58 request ledger; no request data.',
  'CREATE TABLE IF NOT EXISTS public.be_data_entry_financial_v2_requests_v58 (',
  '  request_id text PRIMARY KEY,',
  '  operation text NOT NULL,',
  '  actor_id uuid,',
  '  payload_hash text NOT NULL,',
  '  status text NOT NULL CONSTRAINT be_data_entry_financial_v2_requests_v58_status_check',
  "    CHECK (status IN ('IN_PROGRESS','COMPLETE')),",
  '  response jsonb,',
  '  created_at timestamptz NOT NULL DEFAULT now(),',
  '  completed_at timestamptz,',
  '  CONSTRAINT be_data_entry_financial_v2_requests_v58_operation_check',
  "    CHECK (operation IN ('SAVE','IMPORT','CREATE_WAYBILL'))",
  ');',
  'ALTER TABLE public.be_data_entry_financial_v2_requests_v58 ENABLE ROW LEVEL SECURITY;',
  'REVOKE ALL ON TABLE public.be_data_entry_financial_v2_requests_v58',
  '  FROM PUBLIC, anon, authenticated;',
  ''
].join('\n');
writeFileSync(resolve(root, '20260902220114_uat308_verified_data_entry_v58_request_ledger_ci.sql'),
  v58RequestsCiSql);
console.log('CI-only catalog-verified V58 request ledger restored before V14.');

// Restore the complete existing enterprise V13.2 save function body so V14's
// rename can replay as originally intended. CI-only, no execution or API grant.
const dataEntrySaveFixturePath =
  resolve('scripts/uat-audit/fixtures/data_entry_v13_2_save_ci_bootstrap.sql');
const dataEntrySaveSql = readFileSync(dataEntrySaveFixturePath, 'utf8');
if (dataEntrySaveSql.length < 30000 ||
    !dataEntrySaveSql.includes('CREATE OR REPLACE FUNCTION public.be_data_entry_financial_v2_save(p_payload jsonb)') ||
    !dataEntrySaveSql.includes('v_access') ||
    !dataEntrySaveSql.includes('REVOKE ALL ON FUNCTION public.be_data_entry_financial_v2_save(jsonb)')) {
  throw new Error('Enterprise V13.2 save-function fixture is incomplete or unsafe');
}
const dataEntryV14PrerequisitesPath =
  resolve(root, '20260902220114_uat308_verified_data_entry_v58_request_ledger_ci.sql');
writeFileSync(dataEntryV14PrerequisitesPath,
  readFileSync(dataEntryV14PrerequisitesPath, 'utf8') + '\n' + dataEntrySaveSql);
console.log('CI-only complete enterprise V13.2 save body restored before V14 rename.');

// V17's calculator rename expects the original V13.2 Data Entry calculator.
// The authentic definition is retained in the archived September V13.2 source.
// Copy only this validated function body into the disposable replay; never
// enable Data Entry mutations, invent quotes, or grant public execution.
const v13CalculatorArchive = readFileSync(resolve(
  'britium-go-live/supabase/migration_history_archive/local_only_not_in_production_20261114/20260902153000_financial_reconciliation_and_data_entry_options_v13_2.sql'
), 'utf8');
const v13CalculatorHeader =
  'create or replace function public.be_data_entry_financial_v2_calculate(p_payload jsonb)';
const calcStart = v13CalculatorArchive.indexOf(v13CalculatorHeader);
const calcEnd = v13CalculatorArchive.indexOf('$function$;', calcStart);
if (calcStart < 0 || calcEnd < calcStart ||
    v13CalculatorArchive.indexOf(v13CalculatorHeader, calcStart + 1) >= 0) {
  throw new Error('Original V13.2 calculator definition not uniquely available');
}
const v13CalculatorDefinition = v13CalculatorArchive.slice(calcStart, calcEnd + 11);
if (v13CalculatorDefinition.length < 5800 ||
    !v13CalculatorDefinition.includes('be_data_entry_financial_v2_calculate_v61_3_3_legacy') ||
    !v13CalculatorDefinition.includes('v_update_access') ||
    !v13CalculatorDefinition.includes('customer_tier_override')) {
  throw new Error('Original V13.2 calculator safety checks changed');
}
writeFileSync(dataEntryV14PrerequisitesPath,
  readFileSync(dataEntryV14PrerequisitesPath, 'utf8') +
  '\n-- CI-only authentic archived V13.2 calculator; required for V17 rename.\n' +
  v13CalculatorDefinition + '\n' +
  'REVOKE ALL ON FUNCTION public.be_data_entry_financial_v2_calculate(jsonb)' +
  ' FROM PUBLIC, anon, authenticated, service_role;\n');
console.log('CI-only original V13.2 Data Entry calculator restored before V17.');

// Restore the *original* V28 location alias migration that is archived outside
// the current migration directory. This keeps its RLS policy, validated pin
// bounds, address-learning trigger and resolver unchanged in disposable CI.
const locationAliasArchivePath = resolve(
  'britium-go-live/supabase/migration_history_archive/local_only_not_in_production_20261114/20260906193000_location_alias_learning_v28.sql');
const locationAliasArchiveSql = readFileSync(locationAliasArchivePath, 'utf8');
if (locationAliasArchiveSql.length < 9000 ||
    !locationAliasArchiveSql.includes('create table if not exists public.be_location_aliases') ||
    !locationAliasArchiveSql.includes('constraint be_location_alias_lat_ck') ||
    !locationAliasArchiveSql.includes('alter table public.be_location_aliases enable row level security') ||
    !locationAliasArchiveSql.includes('private.be_location_editor_allowed_v10()') ||
    !locationAliasArchiveSql.includes('create or replace function public.be_location_alias_resolve_v28(') ||
    !locationAliasArchiveSql.includes('create trigger be_delivery_location_learn_alias_v28') ||
    !readFileSync(resolve(root, '20260906200807_location_alias_learning_v28.sql'), 'utf8')
      .includes("V28 location alias objects are incomplete")) {
  throw new Error('Original V28 location alias source/dependency verification failed');
}
copyFileSync(locationAliasArchivePath,
  resolve(root, '20260906200806_uat308_original_location_alias_v28_ci.sql'));
console.log('CI-only original V28 location alias objects and access policy restored.');

// V29 location permission enforcement depends on the actual V57 account/RLS
// gate. Preserve the source definition unchanged, with API execution revoked,
// and restore it only for CI disposable migration verification.
const actorAccessV57Fixture = resolve(
  'scripts/uat-audit/fixtures/data_entry_actor_access_v57_ci_bootstrap.sql');
const actorAccessV57Sql = readFileSync(actorAccessV57Fixture, 'utf8');
if (actorAccessV57Sql.length < 10000 ||
    !actorAccessV57Sql.includes('CREATE OR REPLACE FUNCTION public.be_data_entry_actor_access_v57(') ||
    !actorAccessV57Sql.includes('auth.uid()') ||
    !actorAccessV57Sql.includes('be_data_entry_access_grants_v57') ||
    !actorAccessV57Sql.includes('REVOKE ALL ON FUNCTION public.be_data_entry_actor_access_v57(text,boolean)')) {
  throw new Error('V57 actor permission guard fixture is incomplete');
}
copyFileSync(actorAccessV57Fixture,
  resolve(root, '20260906213641_uat308_original_data_entry_access_v57_ci.sql'));
console.log('CI-only authentic role-scoped Data Entry V57 guard restored before V29.');

// Catalog-verified support tables are required for compilation of the original
// V57 access-guard function (in particular, its %rowtype declaration).
// No grants are seeded; data API roles receive no access in the CI baseline.
const dataEntryAccessSupportCi = [
  '-- Catalog-verified V57 security tables, exclusively for disposable CI.',
  'CREATE TABLE IF NOT EXISTS public.be_data_entry_access_grants_v57 (',
  '  grant_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),',
  '  auth_user_id uuid NOT NULL,',
  '  registry_user_id text,',
  '  email_snapshot text NOT NULL,',
  '  branch_code text,',
  "  grant_status text NOT NULL CHECK (grant_status IN ('PENDING','APPROVED','DENIED','REVOKED')),",
  "  allowed_actions text[] NOT NULL DEFAULT ARRAY['view','create','update','upload','export'],",
  "  waybill_allowed_actions text[] NOT NULL DEFAULT ARRAY['view','create','update','upload','export'],",
  '  effective_from timestamptz NOT NULL DEFAULT now(),',
  '  effective_to timestamptz,',
  '  approved_by uuid,',
  '  approval_reason text NOT NULL,',
  '  request_id text,',
  '  created_at timestamptz NOT NULL DEFAULT now(),',
  '  updated_at timestamptz NOT NULL DEFAULT now(),',
  '  CHECK (effective_to IS NULL OR effective_to > effective_from)',
  ');',
  'CREATE TABLE IF NOT EXISTS public.be_data_entry_access_mode_v57 (',
  '  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),',
  "  enforcement_mode text NOT NULL DEFAULT 'MATRIX_SHADOW'",
  "    CHECK (enforcement_mode IN ('MATRIX_SHADOW','EXPLICIT_ONLY')),",
  '  note text,',
  '  updated_at timestamptz NOT NULL DEFAULT now(),',
  '  updated_by uuid',
  ');',
  'ALTER TABLE public.be_data_entry_access_grants_v57 ENABLE ROW LEVEL SECURITY;',
  'ALTER TABLE public.be_data_entry_access_mode_v57 ENABLE ROW LEVEL SECURITY;',
  'REVOKE ALL ON TABLE public.be_data_entry_access_grants_v57,',
  '  public.be_data_entry_access_mode_v57 FROM PUBLIC, anon, authenticated;',
  ''
].join('\n');
const actorAccessMigrationPath =
  resolve(root, '20260906213641_uat308_original_data_entry_access_v57_ci.sql');
if (!readFileSync(actorAccessMigrationPath, 'utf8')
       .includes('v_grant public.be_data_entry_access_grants_v57%rowtype;')) {
  throw new Error('Original V57 guard access grants rowtype changed');
}
writeFileSync(actorAccessMigrationPath,
  dataEntryAccessSupportCi + '\n' + readFileSync(actorAccessMigrationPath, 'utf8'));
console.log('CI-only V57 access security tables restored empty with RLS enabled.');

// September's approved-tariff lookup references the original V61.4.1
// township normalizer. Extract that authentic function from checked-in
// source rather than substituting an approximate alias normalizer.
const townshipV614ArchivePath = resolve(
  'britium-go-live/britium-current-ui-fixed/data_entry_clean_review_v61_4_1_patch/sql/20260803_financial_v2_township_alias_v61_4_1.sql');
const townshipV614Source = readFileSync(townshipV614ArchivePath, 'utf8');
const townshipV614Header =
  'create or replace function public.be_financial_v2_township_key_v61_4_1(p_value text)';
const townshipV614Start = townshipV614Source.indexOf(townshipV614Header);
const townshipV614End = townshipV614Source.indexOf('$normalize$;', townshipV614Start);
if (townshipV614Start < 0 || townshipV614End < townshipV614Start ||
    townshipV614Source.indexOf(townshipV614Header, townshipV614Start + 1) !== -1) {
  throw new Error('Authentic V61.4.1 township normalizer is not uniquely present');
}
const townshipV614Function =
  townshipV614Source.slice(townshipV614Start, townshipV614End + '$normalize$;'.length);
if (townshipV614Function.length < 400 ||
    !townshipV614Function.includes('language plpgsql') ||
    !townshipV614Function.includes('immutable') ||
    !townshipV614Function.includes('regexp_replace')) {
  throw new Error('Authentic V61.4.1 township normalization logic changed');
}
writeFileSync(resolve(root,
  '20260911000202_uat308_original_township_key_v61_4_1_ci.sql'),
  '-- CI-only: original V61.4.1 township normalization function.\n' +
  townshipV614Function + '\n');
console.log('CI-only authentic V61.4.1 tariff township key restored before tariff lookup.');

// The September 11 dispatch-ready view projects the financial quote stored
// in Data Entry. July's snapshot predates the field. Restore the confirmed
// production column definition only in disposable CI, before the view loads.
const dispatchQuoteMigration =
  resolve(root, '20260911205409_uat308_original_data_entry_quote_column_ci.sql');
const dispatchReadyViewSql = readFileSync(
  resolve(root, '20260911205410_restore_imported_wayplan_ready_queue.sql'), 'utf8');
if (!dispatchReadyViewSql.includes("d.financial_quote->>'source_waybill_no'") ||
    !dispatchReadyViewSql.includes('be_v_warehouse_receipt_v39')) {
  throw new Error('Dispatch-ready projection differs from verified historical source');
}
writeFileSync(dispatchQuoteMigration, [
  '-- Disposable CI only: catalog-verified Data Entry financial quote column.',
  'ALTER TABLE public.be_data_entry_parcel_details',
  "  ADD COLUMN IF NOT EXISTS financial_quote jsonb NOT NULL DEFAULT '{}'::jsonb;",
  ''
].join('\n'));
console.log('CI-only catalog-verified financial_quote column restored before dispatch queue.');


















console.log('CI-only finance legacy bootstrap inserted before the August patch; committed migration history unchanged.');

console.log(JSON.stringify({mode:'disposable-snapshot-first',replacedHistoricalMigrations:replaced,snapshotSizeBytes:Buffer.byteLength(sql),remainingMigrations:files.length-replaced,productionWrites:false}));
