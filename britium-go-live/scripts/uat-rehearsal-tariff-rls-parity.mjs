/** Disposable-CI-only RLS parity with the production tariff table.
 * Production catalog: RLS enabled, no end-user policies. Do not bypass gate.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
assert.equal(process.env.DO_NOT_CONNECT_REMOTE,'1','Never modify a remote database');
assert.equal(process.env.GITHUB_ACTIONS,'true','Only a disposable Actions database');
const name='20261117000000_CI_ONLY_parcel_tariff_rls_parity.sql';
const file=path.resolve('supabase/migrations',name);
assert.ok(!fs.existsSync(file),'No duplicate CI migration');
const sql=`-- CI_ONLY source-parity: production catalog has RLS ON, no authenticated row policies.
-- Preserve all historical tariff migration SQL and business rules.
DO $check$
BEGIN
 IF to_regclass('public.be_parcel_tariffs_v2') IS NULL
 THEN RAISE EXCEPTION 'CI_TARIFF_TABLE_MISSING'; END IF;
END $check$;
ALTER TABLE public.be_parcel_tariffs_v2 ENABLE ROW LEVEL SECURITY;
DO $check$
BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.be_parcel_tariffs_v2'::regclass)
 THEN RAISE EXCEPTION 'CI_TARIFF_RLS_NOT_ENABLED'; END IF;
END $check$;
`;
assert.ok(sql.includes('ENABLE ROW LEVEL SECURITY'),'Must enable RLS');
assert.ok(!/DISABLE ROW LEVEL SECURITY|CREATE POLICY|GRANT .* TO anon|GRANT .* TO authenticated/i.test(sql),'No access widening');
fs.writeFileSync(file,sql);
console.log('Disposable-only RLS parity for public.be_parcel_tariffs_v2 staged.');
