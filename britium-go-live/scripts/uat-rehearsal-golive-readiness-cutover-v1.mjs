/** Disposable CI-only predecessor of the archived September readiness cutover.
 * Reproduces the original table shape, not its historical records or cutover activation.
 * Does not edit the committed historical migration.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
assert.equal(process.env.DO_NOT_CONNECT_REMOTE,'1','remote access must be disabled');
assert.equal(process.env.GITHUB_ACTIONS,'true','only disposable GitHub Actions rehearsal allowed');
const migration=path.resolve('supabase/migrations/20261019171658_october_isolation_rehearsal_and_status.sql');
const original=fs.readFileSync(migration,'utf8');
const anchor="create or replace function public.be_golive_live_cutoff_v1()";
assert.equal(original.split(anchor).length,2,'unexpected October migration shape');
assert.ok(!original.includes('-- CI_ONLY_EMPTY_GOLIVE_CUTOVER_V1'),'refusing repeated overlay');
const predecessor=`-- CI_ONLY_EMPTY_GOLIVE_CUTOVER_V1
-- The original private table was created by an archived September migration.
-- No historical cutover row is seeded into disposable schema-only rehearsal.
create table if not exists private.be_golive_readiness_cutovers_v1 (
  cutover_id uuid primary key default gen_random_uuid(),
  cutover_code text not null unique,
  cutoff_at timestamptz not null default clock_timestamp(),
  reason text not null,
  target_table_count integer not null default 0,
  existing_table_count integer not null default 0,
  nonempty_table_count integer not null default 0,
  isolated_row_count bigint not null default 0,
  isolated_key_count bigint not null default 0,
  created_by text not null default current_user,
  metadata jsonb not null default '{}'::jsonb
);
revoke all on table private.be_golive_readiness_cutovers_v1 from public, anon, authenticated;
-- No direct application-role or anonymous access.
`;
fs.writeFileSync(migration,original.replace(anchor,predecessor+'\n'+anchor));
assert.ok(fs.readFileSync(migration,'utf8').includes(predecessor));
console.log('CI-only empty private go-live cutover predecessor inserted before October reader; no rows seeded.');
