/** Disposable CI only: fail-closed inventory of historical branch-warehouse RPC prerequisites.
 * Never invent functions or bypass ACL/RLS checks.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
assert.equal(process.env.DO_NOT_CONNECT_REMOTE,'1','Remote database guard required');
assert.equal(process.env.GITHUB_ACTIONS,'true','Disposable CI only');
const file=path.resolve('supabase/migrations/20261029213548_branch_warehouse_scoped_reports.sql');
const original=fs.readFileSync(file,'utf8');
assert.ok(original.includes('BRANCH_WAREHOUSE_ROWS_V1')&&original.includes('BRANCH_WAREHOUSE_ACK_V1'),'Original warehouse guards missing');
assert.ok(!original.includes('CI_ONLY_WAREHOUSE_RPC_INVENTORY'),'Already instrumented');
const ddl=`-- CI_ONLY_WAREHOUSE_RPC_INVENTORY: read-only prerequisite check, original migration retained.
do $uat_rpc_inventory$
declare required text[]:=array[
  'public.be_warehouse_scan_lifecycle_snapshot()',
  'public.be_warehouse_wayplan_handoff_archive_v150()',
  'public.be_warehouse_ack_wayplan_handoff_v150(jsonb)',
  'public.be_dispatch_command_snapshot_v63()',
  'public.be_warehouse_wayplan_view_v199(integer)',
  'public.be_warehouse_rto_report_v199(date,date,text,integer)',
  'public.be_unified_ops_workflow_snapshot()'
];
missing text[];
begin
 select coalesce(array_agg(t.sig order by t.sig),array[]::text[]) into missing
 from unnest(required) as t(sig)
 where to_regprocedure(t.sig) is null;
 if cardinality(missing)>0 then
   raise exception 'CI_UAT_MISSING_WAREHOUSE_RPC_COUNT=%, SIGNATURES=%',cardinality(missing),array_to_string(missing,', ') using errcode='P0001';
 end if;
end $uat_rpc_inventory$;
`;
assert.equal((ddl.match(/public\.be_/g)||[]).length,7,'Must inventory seven exact original signatures');
fs.writeFileSync(file,ddl+'\n'+original);
assert.ok(fs.readFileSync(file,'utf8').endsWith(original),'Original role guards and SQL preserved');
console.log('CI only: seven branch warehouse RPC signatures checked, with fail-closed results.');
