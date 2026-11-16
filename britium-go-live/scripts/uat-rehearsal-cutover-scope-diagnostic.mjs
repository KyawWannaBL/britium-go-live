/** CI-only inventory of missing October cutover tables.
 * Leaves original guard enforcement untouched, no tables or data created.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
assert.equal(process.env.DO_NOT_CONNECT_REMOTE, '1', 'Remote-work guard required');
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Disposable GitHub Actions only');
const p=path.resolve('supabase/migrations/20261019171843_october_isolation_guard_bindings.sql');
const original=fs.readFileSync(p,'utf8');
const anchor='do $$declare t record;begin';
assert.equal(original.split(anchor).length,2,'Expected original cutover guard must be present once');
assert.ok(original.includes("raise exception 'Cutover table missing: %'"),'Original fail-closed guard absent');
assert.ok(!original.includes('CI_ONLY_CUTOVER_SCOPE_DIAGNOSTIC'),'Repeated diagnostic staging refused');
const diagnostic=`-- CI_ONLY_CUTOVER_SCOPE_DIAGNOSTIC: read-only inventory before the original mandatory guard.
do $uat_cutover_inventory$
declare missing text[];
begin
  select coalesce(array_agg(s.table_name order by s.table_name),array[]::text[]) into missing
  from private.be_oct2026_scope s
  where to_regclass(format('public.%I',s.table_name)) is null;
  raise notice 'CI_UAT_MISSING_CUTOVER_TABLE_COUNT=%', cardinality(missing);
  raise notice 'CI_UAT_MISSING_CUTOVER_TABLE_NAMES=%', array_to_string(missing,',');
end
$uat_cutover_inventory$;
`;
fs.writeFileSync(p,diagnostic+original);
assert.ok(fs.readFileSync(p,'utf8').endsWith(original),'Original guard must remain unchanged');
console.log('CI-only read-only missing cutover table inventory staged; guard remains fail-closed.');
