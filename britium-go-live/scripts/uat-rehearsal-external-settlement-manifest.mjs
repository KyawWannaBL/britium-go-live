/** CI-only original private settlement manifest shape; zero historic evidence rows. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
assert.equal(process.env.DO_NOT_CONNECT_REMOTE,'1','Remote guard required');
assert.equal(process.env.GITHUB_ACTIONS,'true','Disposable GitHub Actions only');
const file=path.resolve('supabase/migrations/20261024092930_oct2026_populate_owner_hybrid_attestation_v1.sql');
const original=fs.readFileSync(file,'utf8');
assert.ok(original.includes('private.be_oct2026_external_settlement_manifest'),'Expected attestation source missing');
assert.ok(!original.includes('CI_ONLY_EMPTY_EXTERNAL_SETTLEMENT_MANIFEST'),'Already patched');
const schema=`-- CI_ONLY_EMPTY_EXTERNAL_SETTLEMENT_MANIFEST: production catalog verified schema, zero evidence rows.
create table private.be_oct2026_external_settlement_manifest (
  source_sha256 text not null,
  delivery_way_id text not null,
  sheet_date date not null,
  source_row integer not null,
  final_cod_mmk numeric,
  cash_mmk numeric,
  kpay_mmk numeric,
  imported_at timestamptz not null default now(),
  source_sheet text,
  source_check text,
  import_note text,
  constraint ci_oct2026_external_manifest_pk primary key(source_sha256,delivery_way_id),
  constraint ci_oct2026_external_manifest_nonnegative check (
    coalesce(final_cod_mmk,0::numeric)>=0::numeric and
    coalesce(cash_mmk,0::numeric)>=0::numeric and
    coalesce(kpay_mmk,0::numeric)>=0::numeric
  )
);
revoke all on table private.be_oct2026_external_settlement_manifest from public, anon, authenticated;
`;
assert.ok(!/\binsert\s+into\b/i.test(schema),'No historic settlement evidence may be imported');
fs.writeFileSync(file,schema+'\n'+original);
assert.ok(fs.readFileSync(file,'utf8').endsWith(original),'Original historical attestation retained');
console.log('CI ONLY: empty verified private external settlement manifest staged.');
