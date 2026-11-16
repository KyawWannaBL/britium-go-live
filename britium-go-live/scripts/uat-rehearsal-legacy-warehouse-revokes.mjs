/** CI only: retain all Sept 25 legacy RPC privilege revocations while
 * permitting a clean schema in which those deprecated RPCs were never created.
 * Every extant RPC is still REVOKED from PUBLIC, anon, authenticated.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const target=fileURLToPath(new URL('../supabase/migrations/20260925194041_warehouse_return_history_and_canonical_snapshot.sql',import.meta.url));
let source=fs.readFileSync(target,'utf8');
const revoked=[
 'be_warehouse_receive_scan_v39_legacy_20260823(text,text,text,text,text,text,numeric,text,text,text)',
 'be_warehouse_return_scan_v39_legacy_20260823(text,text,text,text)',
 'be_dispatch_scan_parcel_v39_legacy_20260823(text,text,text)'
];
for(const sig of revoked){
 const before='revoke all on function public.'+sig+'\n  from public,anon,authenticated;';
 if(source.split(before).length!==2)throw Error('Missing/non-unique legacy REVOKE '+sig);
 const safe="DO $revoke$ BEGIN IF to_regprocedure('public."+sig+"') IS NOT NULL THEN EXECUTE 'REVOKE ALL ON FUNCTION public."+sig+" FROM PUBLIC,anon,authenticated'; END IF; END $revoke$;";
 source=source.replace(before,safe);
}
fs.writeFileSync(target,source);
console.log('CI only: 3 legacy warehouse/dispatch RPC REVOKEs remain effective when functions exist.');
