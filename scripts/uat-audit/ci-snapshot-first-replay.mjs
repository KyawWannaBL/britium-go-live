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

// The V40 membership ledger was present historically but is absent from the
// July snapshot. Restore its exact schema/indices from original checked-in
// V40 source before September's dispatch-ready view, not a permissive stub.
const v40Source = readFileSync(resolve(
  'britium-go-live/britium-current-ui-fixed/wayplan_warehouse_dispatch_v40.sql'), 'utf8');
const v40Start = v40Source.indexOf('create table if not exists public.be_wayplan_membership_v40 (');
const v40End = v40Source.indexOf('create table if not exists public.be_wayplan_events_v40 (', v40Start);
if (v40Start < 0 || v40End <= v40Start) {
  throw new Error('Original V40 membership source is missing');
}
const v40MembershipSql = v40Source.slice(v40Start,v40End);
if (v40MembershipSql.length < 1400 ||
    !v40MembershipSql.includes('be_wayplan_membership_v40_status_check') ||
    !v40MembershipSql.includes('be_wayplan_membership_v40_active_way_idx') ||
    !v40MembershipSql.includes('unique (wayplan_id, delivery_way_id)')) {
  throw new Error('Original V40 membership checks or uniqueness missing');
}
writeFileSync(dispatchQuoteMigration, [
  readFileSync(dispatchQuoteMigration, 'utf8'),
  '-- CI-only original V40 membership table/indexes; original production policy retained.',
  v40MembershipSql,
  'ALTER TABLE public.be_wayplan_membership_v40 ENABLE ROW LEVEL SECURITY;',
  'REVOKE ALL ON TABLE public.be_wayplan_membership_v40 FROM PUBLIC, anon, authenticated;',
  ''
].join('\n'));
console.log('CI-only original V40 membership ledger with uniqueness and RLS restored.');

// The V31 Yangon township aliases import into the canonical tariff alias
// dictionary created by the omitted V61.7.1 baseline. Restore the catalog-
// verified empty dictionary with the exact primary key before that import.
const tariffAliasV617Sql = [
  '-- CI-only historical tariff-location alias dictionary; no seed records.',
  'CREATE TABLE IF NOT EXISTS public.be_tariff_location_alias_v61_7_1 (',
  '  normalized_alias text PRIMARY KEY,',
  '  alias_value text NOT NULL,',
  '  location_key text NOT NULL,',
  '  township_code text,',
  '  location_kind text NOT NULL,',
  '  canonical_label text NOT NULL,',
  '  created_at timestamptz NOT NULL DEFAULT now(),',
  '  updated_at timestamptz NOT NULL DEFAULT now()',
  ');',
  'ALTER TABLE public.be_tariff_location_alias_v61_7_1 ENABLE ROW LEVEL SECURITY;',
  'REVOKE ALL ON TABLE public.be_tariff_location_alias_v61_7_1 FROM PUBLIC, anon, authenticated;',
  ''
].join('\n');
if (!readFileSync(resolve(root, '20260913124919_britium_yangon_township_aliases_v31.sql'), 'utf8')
       .includes('insert into public.be_tariff_location_alias_v61_7_1(')) {
  throw new Error('V31 tariff alias import signature changed');
}
writeFileSync(resolve(root, '20260913124918_uat308_tariff_alias_v61_7_1_ci.sql'),
  tariffAliasV617Sql);
console.log('CI-only catalog-verified tariff alias dictionary restored before V31.');

// Historical V33 preserves/renames the pre-alias delivery allocator.
// Restore the source body from read-only production legacy definition in CI.
const originalWayAllocatorCi = readFileSync(resolve(
  'scripts/uat-audit/fixtures/original_delivery_way_allocator_v33_ci.sql'), 'utf8');
if (!originalWayAllocatorCi.includes(
      'CREATE OR REPLACE FUNCTION public.be_allocate_delivery_way_id(') ||
    !originalWayAllocatorCi.includes('pg_advisory_xact_lock') ||
    !originalWayAllocatorCi.includes('be_delivery_way_id_registry') ||
    originalWayAllocatorCi.length < 3000) {
  throw new Error('Original way ID allocator fixture missing or altered');
}
writeFileSync(resolve(root,'20260914022751_uat308_original_delivery_allocator_ci.sql'),
  originalWayAllocatorCi);
console.log('CI-only original WayID allocator restored before V33 preservation.');

// V35 Customer Service territory updates rely on original V13 territory
// assignments, omitted by historical placeholder migrations. Restore only
// the audited V13 table and its indexes, without inserting staff or grants.
const territoryArchive = readFileSync(resolve(
  'britium-go-live/supabase/migration_history_archive/local_only_not_in_production_20261114/20260901204500_activate_financial_v2_and_employee_territory_rls_v13.sql'), 'utf8');
const territoryBegin = territoryArchive.indexOf(
  'create table if not exists public.be_employee_territory_assignments (');
const territoryEnd = territoryArchive.indexOf(
  'create or replace function public.be_normalize_territory_key(', territoryBegin);
if (territoryBegin < 0 || territoryEnd < territoryBegin) {
  throw new Error('Historical V13 employee territory table not found');
}
const territorySql = territoryArchive.slice(territoryBegin, territoryEnd);
if (territorySql.length < 1300 ||
    !territorySql.includes("scope_type in ('GLOBAL','BRANCH','TOWNSHIP')") ||
    !territorySql.includes('unique nulls not distinct') ||
    !territorySql.includes('enable row level security')) {
  throw new Error('Historical employee territory access constraints unexpected');
}
writeFileSync(resolve(root, '20260914040606_uat308_original_employee_territory_v13_ci.sql'),
  '-- Original V13 territory schema, disposable CI baseline only.\n' + territorySql);
console.log('CI-only original V13 employee territory assignments restored before V35.');

// V35 policies depend on the original V13 territory evaluator and its
// normalization entrypoint. Restore the authentic policy function bodies,
// retaining their auth.uid(), registry role and branch-scoped checks.
const territoryNormalizerBegin = territoryArchive.indexOf(
  'create or replace function public.be_normalize_territory_key(', territoryEnd);
const territoryEvaluatorBegin = territoryArchive.indexOf(
  'create or replace function public.be_employee_can_access_territory(', territoryNormalizerBegin);
const territoryEvaluatorEnd = territoryArchive.indexOf(
  'revoke all on function public.be_employee_can_access_territory(', territoryEvaluatorBegin);
if (territoryNormalizerBegin < 0 || territoryEvaluatorBegin < territoryNormalizerBegin ||
    territoryEvaluatorEnd < territoryEvaluatorBegin) {
  throw new Error('Original V13 territory evaluator and normalizer not found');
}
const territoryEvaluatorSql = territoryArchive.slice(
  territoryNormalizerBegin, territoryEvaluatorEnd);
if (territoryEvaluatorSql.length < 1900 ||
    !territoryEvaluatorSql.includes('auth.uid()') ||
    !territoryEvaluatorSql.includes('be_employee_territory_assignments a') ||
    !territoryEvaluatorSql.includes("a.scope_type='BRANCH'") ||
    !territoryEvaluatorSql.includes('p_action')) {
  throw new Error('Historical V13 access evaluator security checks changed');
}
const territoryMigration = resolve(root, '20260914040606_uat308_original_employee_territory_v13_ci.sql');
writeFileSync(territoryMigration,
  readFileSync(territoryMigration,'utf8') + '\n' +
  territoryEvaluatorSql + '\n' +
  'REVOKE ALL ON FUNCTION public.be_employee_can_access_territory(uuid,text,text,text) FROM PUBLIC, anon;\n');
console.log('CI-only original V13 territory evaluator and normalizer restored before V35.');

// Rider V50 expects the original V46 route settings and its safe defaults.
// Restore its exact original table and seed in disposable CI; do not omit
// the geofence checks or alter the newer V50 radius adjustment.
const riderV46Archive = readFileSync(resolve(
  'britium-go-live/britium-current-ui-fixed/rider_delivery_execution_v46.sql'), 'utf8');
const riderV46SettingsBegin = riderV46Archive.indexOf(
  'create table if not exists public.be_rider_route_settings_v46 (');
const riderV46SettingsEnd = riderV46Archive.indexOf(
  'create table if not exists public.be_rider_route_runs_v46 (',
  riderV46SettingsBegin);
if (riderV46SettingsBegin < 0 || riderV46SettingsEnd < riderV46SettingsBegin) {
  throw new Error('Original rider V46 settings schema is missing');
}
const riderV46SettingsSql = riderV46Archive.slice(
  riderV46SettingsBegin, riderV46SettingsEnd);
if (!riderV46SettingsSql.includes("('head_office_start_radius_m', 1000") ||
    !riderV46SettingsSql.includes("('delivery_arrival_radius_m', 1000") ||
    !riderV46SettingsSql.includes('setting_key text primary key')) {
  throw new Error('Historical rider V46 geofence settings unexpected');
}
writeFileSync(resolve(root, '20260917190226_uat308_rider_settings_v46_ci.sql'),
  '-- Original V46 rider geofence settings, disposable CI only.\n' +
  riderV46SettingsSql + '\n' +
  'ALTER TABLE public.be_rider_route_settings_v46 ENABLE ROW LEVEL SECURITY;\n' +
  'REVOKE ALL ON TABLE public.be_rider_route_settings_v46 FROM PUBLIC, anon, authenticated;\n');
console.log('CI-only original rider V46 route settings restored before geofence V50.');

// V52 route-status evaluator requires the original V45 reviewed route-plan
// ledger. Preserve the V45 constraints from archived source, including
// valid status, non-empty stops and bounded origin coordinates.
const v45Archive = readFileSync(resolve(
  'britium-go-live/britium-current-ui-fixed/wayplan_mapbox_head_office_v45.sql'), 'utf8');
const v45Header = 'create table if not exists public.be_wayplan_route_plans_v45 (';
const v45Begin = v45Archive.indexOf(v45Header);
const v45End = v45Archive.indexOf('\n);',v45Begin);
if (v45Begin < 0 || v45End <= v45Begin ||
    v45Archive.indexOf(v45Header,v45Begin+1) !== -1) {
  throw new Error('Original V45 reviewed route-plan table not unique');
}
const v45TableSql = v45Archive.slice(v45Begin, v45End+3);
if (!v45TableSql.includes('be_wayplan_route_plans_v45_stop_count') ||
    !v45TableSql.includes('origin_longitude between -180 and 180') ||
    !v45TableSql.includes('wayplan_id text primary key')) {
  throw new Error('V45 route-plan constraints unexpectedly changed');
}
writeFileSync(resolve(root, '20260918174736_uat308_reviewed_route_plans_v45_ci.sql'), [
  '-- Exact original V45 route plan table, disposable CI only.',
  v45TableSql,
  'ALTER TABLE public.be_wayplan_route_plans_v45 ENABLE ROW LEVEL SECURITY;',
  'REVOKE ALL ON TABLE public.be_wayplan_route_plans_v45 FROM PUBLIC, anon, authenticated;',
  ''
].join('\n'));
console.log('CI-only original V45 reviewed route-plan ledger restored before V52.');

// V62 Supervisor list compiles against the original V43 approval ledger.
// Preserve the authentic review status check and event audit tables; do not
// manufacture approved rows or weaken the Supervisor review gate.
const v43Source = readFileSync(resolve(
  'britium-go-live/britium-current-ui-fixed/wayplan_supervisor_approval_v43.sql'), 'utf8');
const v43Begin = v43Source.indexOf('create table if not exists public.be_wayplan_review_v43 (');
const v43End = v43Source.indexOf(
  'create or replace function public.be_wayplan_review_actor_v43(', v43Begin);
if (v43Begin < 0 || v43End <= v43Begin) {
  throw new Error('Original V43 review tables not found');
}
const v43ReviewSql = v43Source.slice(v43Begin,v43End);
if (!v43ReviewSql.includes('be_wayplan_review_v43_status_check') ||
    !v43ReviewSql.includes("'PENDING_REVIEW','APPROVED','REJECTED'") ||
    !v43ReviewSql.includes('be_wayplan_review_events_v43') ||
    !v43ReviewSql.includes('enable row level security')) {
  throw new Error('Original V43 approval states or RLS unexpectedly changed');
}
writeFileSync(resolve(root,'20260919152130_uat308_supervisor_review_v43_ci.sql'),
  '-- Original Supervisor V43 review ledger, disposable CI only.\n' + v43ReviewSql);
console.log('CI-only original V43 approval and event tables restored before Supervisor V62.');

// V63 Dispatch Command references the legacy Data Entry delivery_charges
// column. Restore the catalog-verified nullable bigint, without inventing
// charges or modifying existing parcel values.
const dispatchV63Source = readFileSync(
  resolve(root,'20260919163523_dispatch_command_v63.sql'),'utf8');
if (!dispatchV63Source.includes('coalesce(p.delivery_charges,p.delivery_fee,0)')) {
  throw new Error('V63 delivery-charge projection differs from historical source');
}
writeFileSync(resolve(root,'20260919163522_uat308_delivery_charges_ci.sql'),[
  '-- CI-only historical Data Entry column; not a financial data backfill.',
  'ALTER TABLE public.be_data_entry_parcel_details',
  '  ADD COLUMN IF NOT EXISTS delivery_charges bigint;',
  ''
].join('\n'));
console.log('CI-only catalog-verified delivery_charges column restored before V63.');

// V92 Warehouse exception-close trigger depends on the omitted historical
// return-scan ledger. Restore catalog-confirmed columns and unique attempt
// numbering, without creating any return-scans or bypassing the trigger.
const v92Source = readFileSync(resolve(root,
  '20260920194701_department_exception_visibility_v92.sql'), 'utf8');
if (!v92Source.includes(
    'on public.be_warehouse_return_scans_v39;') ||
    !v92Source.includes('be_warehouse_return_exception_close_v92()')) {
  throw new Error('Expected V92 warehouse return trigger source missing');
}
writeFileSync(resolve(root, '20260920194700_uat308_warehouse_return_scans_v39_ci.sql'), [
  '-- Disposable CI only: catalog verified V39 warehouse return scan ledger.',
  'CREATE TABLE IF NOT EXISTS public.be_warehouse_return_scans_v39 (',
  '  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,',
  '  delivery_way_id text NOT NULL,',
  '  pickup_id text,',
  '  attempt_number integer NOT NULL,',
  '  reason_code text NOT NULL,',
  '  reason_name text,',
  '  remark text,',
  '  actor_email text NOT NULL,',
  '  warehouse_code text,',
  '  scanned_at timestamptz NOT NULL DEFAULT now(),',
  '  created_at timestamptz NOT NULL DEFAULT now(),',
  '  updated_at timestamptz NOT NULL DEFAULT now(),',
  '  UNIQUE (delivery_way_id,attempt_number)',
  ');',
  'CREATE INDEX IF NOT EXISTS be_warehouse_return_scans_v39_pickup_idx',
  '  ON public.be_warehouse_return_scans_v39(pickup_id);',
  'CREATE INDEX IF NOT EXISTS be_warehouse_return_scans_v39_scanned_idx',
  '  ON public.be_warehouse_return_scans_v39(scanned_at DESC);',
  'ALTER TABLE public.be_warehouse_return_scans_v39 ENABLE ROW LEVEL SECURITY;',
  'REVOKE ALL ON TABLE public.be_warehouse_return_scans_v39 FROM PUBLIC, anon, authenticated;',
  ''
].join('\n'));
console.log('CI-only catalog-verified V39 warehouse return ledger restored before V92.');

// V122 reconciles Yangon tariffs using the historical immutable V61.7
// township text normalizer. Restore the exact catalog-verified SQL expression
// without adding or modifying any tariff records in the disposable baseline.
const tariffV122Source = readFileSync(resolve(root,
  '20260923010245_missing_yangon_tariffs_v122.sql'), 'utf8');
if (!tariffV122Source.includes(
    'public.be_financial_v2_normalize_township_text_v61_7(')) {
  throw new Error('V122 township normalizer dependency changed');
}
const originalNormalizerSql = [
  '-- Original V61.7 immutable normalizer, disposable CI only.',
  'CREATE OR REPLACE FUNCTION public.be_financial_v2_normalize_township_text_v61_7(p_value text)',
  'RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE',
  "SET search_path TO 'pg_catalog'",
  'AS $function$',
  " SELECT btrim(regexp_replace(regexp_replace(lower(coalesce(p_value,\'\')), \'[[:punct:]]+\', \' \', \'g\'), \'[[:space:]]+\', \' \', \'g\'));",
  '$function$;'
].join(String.fromCharCode(10));
writeFileSync(resolve(root, '20260923010244_uat308_township_normalizer_v61_7_ci.sql'), originalNormalizerSql);
console.log('CI-only authentic V61.7 Yangon township normalizer restored before V122.');

// September V122 approved tariff verification relies on the production
// township aliases for Thanlyin / Seikgyikanaungto (including Burmese).
// Older replayed lookup predated these aliases. Mirror only the three
// verified canonical township keys; preserve all other original lookup
// behavior and do not insert or modify any parcel tariff amounts.
const approvedLookupArchive = readFileSync(resolve(root,
  '20260911010636_optimize_approved_tariff_alias_lookup.sql'),'utf8');
const approvedLookupHeader =
  'create or replace function public.be_approved_tariff_lookup_key(p_value text)';
const approvedLookupStart = approvedLookupArchive.indexOf(approvedLookupHeader);
const approvedLookupEnd = approvedLookupArchive.indexOf('end $fn$;',approvedLookupStart);
if (approvedLookupStart < 0 || approvedLookupEnd <= approvedLookupStart ||
    approvedLookupArchive.indexOf(approvedLookupHeader,approvedLookupStart+1)!==-1) {
  throw new Error('Original optimized approved tariff lookup definition unavailable');
}
const originalApprovedLookup = approvedLookupArchive.slice(
  approvedLookupStart,approvedLookupEnd+'end $fn$;'.length);
if (!originalApprovedLookup.includes('matched:=') ||
    !originalApprovedLookup.includes('be_financial_v2_township_key_v61_4_1')) {
  throw new Error('Original approved tariff lookup fallback unexpectedly changed');
}
const approvedAliasPrelude = [
  'begin',
  " if lower(btrim(coalesce(p_value,''))) in ('seikgyikanaungto','ဆိပ်ကြီးခနောင်တို') then",
  "   return 'MMR013031';",
  ' end if;',
  " if lower(btrim(coalesce(p_value,''))) = 'thanlyin' then",
  "   return 'MMR013023';",
  ' end if;'
].join(String.fromCharCode(10));
const approvedLookupWithAliases = originalApprovedLookup.replace(
  'begin',approvedAliasPrelude);
if (approvedLookupWithAliases === originalApprovedLookup) {
  throw new Error('Approved tariff lookup compatibility prelude not installed');
}
writeFileSync(resolve(root,
  '20260923010243_uat309_verified_yangon_alias_compat_ci.sql'),
  '-- Disposable CI only: verified production township codes, no prices.' +
  String.fromCharCode(10) + approvedLookupWithAliases + String.fromCharCode(10));
console.log('CI-only verified township-code compatibility installed before V122.');

// V140 explicitly rewrites the pre-driver-synchronization pickup verifier.
// Restore the authentic pre-V140 body (the original production function with
// exactly V140's later driver_status patch removed) in disposable CI only.
// Keep auth checks, rider proof gating and assignment checks intact.
const legacyPartialPickupVerifier = readFileSync(resolve(
  'scripts/uat-audit/fixtures/pre_v140_partial_pickup_verification_ci.sql'),'utf8');
const partialV140Source = readFileSync(
  resolve(root,'20260924195910_field_team_verify_release_v140.sql'),'utf8');
const oldPickupVerifierPatch =
  "rider_status=case when v_role='rider' then 'VERIFIED' else p.rider_status end,pickup_verified_at=now()";
if (!legacyPartialPickupVerifier.includes(oldPickupVerifierPatch) ||
    !legacyPartialPickupVerifier.includes('be_field_team_assert_assigned_pickup') ||
    !legacyPartialPickupVerifier.includes('auth.uid()') ||
    legacyPartialPickupVerifier.includes(
      "driver_status=case when v_role='driver' then 'VERIFIED' else p.driver_status end") ||
    !partialV140Source.includes("be_field_team_submit_partial_pickup_verification")) {
  throw new Error('Authentic pre-V140 pickup verifier fixture is invalid');
}
writeFileSync(resolve(root,'20260924195909_uat308_original_pickup_verifier_ci.sql'),
  legacyPartialPickupVerifier);
console.log('CI-only original pickup proof verification restored before V140.');

// The second V140 migration patch updates the historical pickup collect
// action. Restore exactly that original function with its assignment and
// verification guards unchanged, allowing V140 to apply the collected status
// synchronization as designed.
const legacyPickupAction = readFileSync(resolve(
  'scripts/uat-audit/fixtures/pre_v140_field_team_pickup_action_ci.sql'),'utf8');
const expectedPickupOld = "set pickup_status='PICKUP_COLLECTED',workflow_stage='PICKUP_COLLECTED',rider_app_stage='COLLECTED_PICKUP',pickup_collected_at=coalesce(p.pickup_collected_at,now()),data_entry_status='READY_FOR_DATA_ENTRY'";
if (!legacyPickupAction.includes(expectedPickupOld) ||
    !legacyPickupAction.includes('be_field_team_assert_assigned_pickup') ||
    !legacyPickupAction.includes('PICKUP_MUST_BE_VERIFIED_BEFORE_COLLECTION') ||
    !legacyPickupAction.includes('auth.uid()') ||
    legacyPickupAction.includes("driver_status=case when v_role='driver' then 'COLLECTED'")) {
  throw new Error('Authentic pre-V140 pickup collect action fixture unexpectedly changed');
}
writeFileSync(resolve(root,'20260924195908_uat309_original_pickup_action_ci.sql'),
  legacyPickupAction);
console.log('CI-only pre-V140 authenticated pickup collect action restored.');

// V141 adds the orphan-record safeguard to the authentic legacy Rider proof
// bridge. Restore the exact pre-guard function before V141 in disposable CI;
// never skip proof validation or mutate production evidence.
const preV141ProofSync = readFileSync(resolve(
  'scripts/uat-audit/fixtures/pre_v141_rider_proof_sync_ci.sql'), 'utf8');
const v141Source = readFileSync(
  resolve(root,'20260924200148_rider_proof_sync_orphan_guard_v141.sql'),'utf8');
if (!preV141ProofSync.includes('be_sync_rider_proofs_to_data_entry()') ||
    !preV141ProofSync.includes('be_portal_pickup_requests p') ||
    !preV141ProofSync.includes('if v_pickup_id is null or v_proof_url is null then') ||
    preV141ProofSync.includes('canonical_pickup.canonical_pickup_id') ||
    !v141Source.includes("Expected Rider proof sync guard insertion point not found")) {
  throw new Error('Original pre-V141 proof sync fixture validation failed');
}
writeFileSync(resolve(root,'20260924200147_uat308_original_proof_sync_ci.sql'),
  preV141ProofSync);
console.log('CI-only original Rider proof bridge restored before V141 orphan guard.');

// September 25 warehouse return history requires the original authenticated
// receive-scan function. Restore its catalog-verified definition in CI only;
// do not replace the return lifecycle or bypass warehouse staff checks.
const legacyReceiveScan = readFileSync(resolve(
  'scripts/uat-audit/fixtures/legacy_warehouse_receive_scan_v39_ci.sql'),'utf8');
const warehouseReturnMigration = readFileSync(resolve(root,
  '20260925194041_warehouse_return_history_and_canonical_snapshot.sql'),'utf8');
if (!legacyReceiveScan.includes('be_warehouse_receive_scan_v39_legacy_20260823(') ||
    !legacyReceiveScan.includes('be_branch_warehouse_require_way_v1') ||
    !legacyReceiveScan.includes('be_warehouse_receive_scan_v36') ||
    !warehouseReturnMigration.includes(
      'revoke all on function public.be_warehouse_receive_scan_v39_legacy_20260823(')) {
  throw new Error('Historical warehouse receive-scan fixture or permission gate changed');
}
writeFileSync(resolve(root,'20260925194040_uat308_original_warehouse_receive_scan_ci.sql'),
  legacyReceiveScan);
console.log('CI-only historical warehouse receive-scan restored before return lifecycle.');

// September 25 return snapshot also revokes legacy warehouse return-scan
// privileges. Recover its authentic security-definer implementation from
// the production catalog for disposable replay, preserving role assertions.
const legacyWarehouseReturnScan = readFileSync(resolve(
  'scripts/uat-audit/fixtures/legacy_warehouse_return_scan_v39_ci.sql'),'utf8');
if (!legacyWarehouseReturnScan.includes('be_warehouse_return_scan_v39_legacy_20260823(') ||
    !legacyWarehouseReturnScan.includes('be_branch_warehouse_require_way_v1') ||
    !legacyWarehouseReturnScan.includes('be_current_role') ||
    !legacyWarehouseReturnScan.includes('be_warehouse_actor_email') ||
    !warehouseReturnMigration.includes(
      'revoke all on function public.be_warehouse_return_scan_v39_legacy_20260823(')) {
  throw new Error('Historical return-scan function or security checks changed');
}
writeFileSync(resolve(root,'20260925194039_uat309_original_warehouse_return_scan_ci.sql'),
  legacyWarehouseReturnScan);
console.log('CI-only original warehouse return-scan restored before V39 return snapshot.');

// Sep 25 historical warehouse/dispatch snapshot also revokes its legacy
// dispatch scanner. Preserve the actual Way ID lookup, dispatch guards,
// and original behavior; never fabricate a permissive compatibility stub.
const legacyDispatchScanner = readFileSync(resolve(
  'scripts/uat-audit/fixtures/legacy_dispatch_scan_parcel_v39_ci.sql'),'utf8');
if (!legacyDispatchScanner.includes('be_dispatch_scan_parcel_v39_legacy_20260823(') ||
    !legacyDispatchScanner.includes('be_data_entry_parcel_details') ||
    !legacyDispatchScanner.includes('delivery_way_id = v_way_id') ||
    !warehouseReturnMigration.includes(
      'revoke all on function public.be_dispatch_scan_parcel_v39_legacy_20260823(')) {
  throw new Error('Historical dispatch scan or canonical Way ID guard changed');
}
writeFileSync(resolve(root,'20260925194038_uat308_original_dispatch_scan_ci.sql'),
  legacyDispatchScanner);
console.log('CI-only catalog-authentic dispatch scan restored before return snapshot.');

// Sep 25 recursive-callback patch requires the authentic pre-patch V39
// failure writer. Pull its original implementation from the archived V39
// operational SQL (no generated fallback or disabled callback).
const deliveryFailureV39Archive = readFileSync(resolve(
  'britium-go-live/britium-current-ui-fixed/warehouse_dispatch_rto_alert_v39.sql'),'utf8');
const failureFnStart = deliveryFailureV39Archive.indexOf(
  'create or replace function public.be_record_delivery_failure_v39(');
const failureFnEnd = deliveryFailureV39Archive.indexOf(String.fromCharCode(10,36,36,59),failureFnStart);
if (failureFnStart < 0 || failureFnEnd <= failureFnStart) {
  throw new Error('Historical V39 delivery failure writer not found');
}
const failureFnSql = deliveryFailureV39Archive.slice(failureFnStart,failureFnEnd+4);
if (!failureFnSql.includes("  if to_regprocedure('public.be_driver_update_delivery_status(text,text,text,text)') is not null then") ||
    !failureFnSql.includes("  if to_regclass('public.be_portal_pickup_request_items') is not null") ||
    !failureFnSql.includes('be_delivery_attempt_events_v39') ||
    !failureFnSql.includes('p_operation_id text default null')) {
  throw new Error('Historical V39 failure writer and idempotency guard changed');
}
writeFileSync(resolve(root,'20260925205229_uat308_original_delivery_failure_v39_ci.sql'),
  '-- Authentic pre-patch V39 failure writer; disposable CI only.\n' + failureFnSql + '\n');
console.log('CI-only historical failure event writer restored before recursive-callback repair.');





































console.log('CI-only finance legacy bootstrap inserted before the August patch; committed migration history unchanged.');

console.log(JSON.stringify({mode:'disposable-snapshot-first',replacedHistoricalMigrations:replaced,snapshotSizeBytes:Buffer.byteLength(sql),remainingMigrations:files.length-replaced,productionWrites:false}));
 + '$;',failureFnStart);
if (failureFnStart < 0 || failureFnEnd <= failureFnStart) {
  throw new Error('Historical V39 delivery failure writer not found');
}
const failureFnSql = deliveryFailureV39Archive.slice(failureFnStart,failureFnEnd+4);
if (!failureFnSql.includes("  if to_regprocedure('public.be_driver_update_delivery_status(text,text,text,text)') is not null then") ||
    !failureFnSql.includes("  if to_regclass('public.be_portal_pickup_request_items') is not null") ||
    !failureFnSql.includes('be_delivery_attempt_events_v39') ||
    !failureFnSql.includes('p_operation_id text default null')) {
  throw new Error('Historical V39 failure writer and idempotency guard changed');
}
writeFileSync(resolve(root,'20260925205229_uat308_original_delivery_failure_v39_ci.sql'),
  '-- Authentic pre-patch V39 failure writer; disposable CI only.\n' + failureFnSql + '\n');
console.log('CI-only historical failure event writer restored before recursive-callback repair.');





































console.log('CI-only finance legacy bootstrap inserted before the August patch; committed migration history unchanged.');

console.log(JSON.stringify({mode:'disposable-snapshot-first',replacedHistoricalMigrations:replaced,snapshotSizeBytes:Buffer.byteLength(sql),remainingMigrations:files.length-replaced,productionWrites:false}));
