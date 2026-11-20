// Disposable CI only. Extract exactly two missing production-catalog RPC bodies.
// The original full eight-RPC restoration intentionally refuses to overwrite a
// pre-existing Dashboard implementation. This script never rewrites that RPC.
import { readFileSync, writeFileSync } from 'node:fs';
const source=readFileSync('scripts/uat-audit/uat_restore_authentic_8_rpcs_after_schema.sql','utf8');
const names=[
 ['be_branch_intake_snapshot_v1','text'],
 ['be_data_entry_financial_v2_schema','']
];
let output=[
 '-- Disposable CI: restore only two absent application RPCs from verified catalog exports.',
 'BEGIN;'
];
for (const [name,arg] of names) {
 const header='CREATE OR REPLACE FUNCTION public.'+name+'(';
 const start=source.indexOf(header);
 const grant='GRANT EXECUTE ON FUNCTION public.'+name+'('+arg+')';
 const grantStart=source.indexOf(grant,start);
 const end=source.indexOf(';',grantStart)+1;
 if (start<0 || grantStart<start || end<=grantStart ||
     source.indexOf(header,start+header.length)>=0) {
   throw Error('Missing/ambiguous authentic RPC source: '+name);
 }
 const slice=source.slice(start,end);
 if ((slice.match(/CREATE OR REPLACE FUNCTION/g)||[]).length!==1 ||
     !slice.includes('$function$;') ||
     !slice.includes('REVOKE ALL ON FUNCTION public.'+name) ||
     !slice.includes(grant) ||
     !slice.includes('SECURITY DEFINER')) {
   throw Error('Unexpected SQL permissions or definition: '+name);
 }
 output.push("DO $safety$ BEGIN IF to_regprocedure('public."+name+"("+arg+")') IS NOT NULL THEN RAISE EXCEPTION 'Refusing to overwrite pre-existing "+name+"'; END IF; END $safety$;");
 output.push(slice);
}
output.push('COMMIT;');
writeFileSync('/tmp/uat308_missing_two_rpcs.sql',output.join('\n')+'\n');
console.log('Prepared exactly two missing authentic RPCs; all existing implementations remain untouched.');
