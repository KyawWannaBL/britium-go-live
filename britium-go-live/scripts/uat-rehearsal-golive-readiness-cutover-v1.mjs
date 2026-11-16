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
create table if not exists private.be_golive_readiness_scope_v1 (
  cutover_id uuid not null references private.be_golive_readiness_cutovers_v1(cutover_id),
  table_schema text not null default 'public',
  table_name text not null,
  category text not null,
  row_count bigint not null default 0,
  primary key (cutover_id, table_schema, table_name)
);
revoke all on table private.be_golive_readiness_cutovers_v1 from public, anon, authenticated;
revoke all on table private.be_golive_readiness_scope_v1 from public, anon, authenticated;
-- Exact archived report formula; no historical rows are seeded.
create or replace function public.be_go_live_readiness_isolation_report_v1()
returns jsonb language sql stable security definer set search_path = '' as $
  select jsonb_build_object(
    'ok',true,'mode','READINESS_ONLY','cutover_code',c.cutover_code,
    'cutoff_at',c.cutoff_at,'target_tables',c.target_table_count,
    'existing_tables',c.existing_table_count,'nonempty_tables',c.nonempty_table_count,
    'isolated_rows',c.isolated_row_count,'isolated_keys',c.isolated_key_count,
    'rows_updated',0,'rows_deleted',0,'statuses_changed',0,
    'master_data_untouched',true,
    'by_category',coalesce((select jsonb_object_agg(category,total order by category)
      from (select category,sum(row_count) total
            from private.be_golive_readiness_scope_v1 s
            where s.cutover_id=c.cutover_id group by category) x),'{}'::jsonb)
  )
  from private.be_golive_readiness_cutovers_v1 c
  where c.cutover_code='PRE_GOLIVE_UAT_20260901';
$;
revoke all on function public.be_go_live_readiness_isolation_report_v1() from public,anon,authenticated;
-- No direct application-role or anonymous access.
`;
fs.writeFileSync(migration,original.replace(anchor,predecessor+'\n'+anchor));
assert.ok(fs.readFileSync(migration,'utf8').includes(predecessor));
console.log('CI-only empty private go-live cutover predecessor inserted before October reader; no rows seeded.');
