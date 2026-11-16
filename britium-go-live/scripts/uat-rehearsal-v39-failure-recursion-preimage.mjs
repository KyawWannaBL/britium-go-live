/** CI only: authentic V39 failed-delivery function from the original warehouse
 * operations source, before Sep25 recursion removal. This is NOT a stub.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('../britium-current-ui-fixed/warehouse_dispatch_rto_alert_v39.sql',import.meta.url));
const target=fileURLToPath(new URL('../supabase/migrations/20260925205230_remove_recursive_legacy_delivery_failure_callback.sql',import.meta.url));
const text=fs.readFileSync(source,'utf8');
const marker='create or replace function public.be_record_delivery_failure_v39(';
const i=text.indexOf(marker),j=text.indexOf('\n$$;',i);
if(i<0||j<i||text.indexOf(marker,i+marker.length)>=0)throw Error('V39 historical source not unique');
const ddl=text.slice(i,j+4);
for(const expected of [
 "if to_regprocedure('public.be_driver_update_delivery_status(text,text,text,text)') is not null then",
 "if to_regclass('public.be_portal_pickup_request_items') is not null",
 'security definer'
])if(!ddl.includes(expected))throw Error('Required V39 recursion patch boundary absent');
const migration=fs.readFileSync(target,'utf8');
if(!migration.includes('be_record_delivery_failure_v39 signature not found'))throw Error('Unexpected Sept25 patch');
const revoke="REVOKE ALL ON FUNCTION public.be_record_delivery_failure_v39(text,text,text,text) FROM PUBLIC,anon;\n";
fs.writeFileSync(target,ddl+'\n'+revoke+migration);
console.log('CI-only: original V39 failure writer installed before its recursion-removal patch.');
