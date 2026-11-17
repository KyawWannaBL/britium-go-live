/** Historical V36 prerequisite diagnostic; disposable CI checkout only.
 * Restores original V36 receipt tables and receipt view, never hosted UAT.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const dir=new URL('../supabase/migrations/',import.meta.url);
const canonical=fileURLToPath(new URL('20260830050000_original_v36_warehouse_receipt_foundation.sql',dir));
if(fs.existsSync(canonical)) {
 const ddl=fs.readFileSync(canonical,'utf8');
 if(!ddl.includes('be_warehouse_receipts_v36')||!ddl.includes('security_invoker = true')) throw Error('V36 canonical security source missing');
 console.log('Original V36 warehouse foundation versioned; CI overlay skipped.');
 process.exit(0);
}
const dst=fileURLToPath(new URL('20260830050000_CI_ONLY_V36_receipt_foundation.sql',dir));
const src=fileURLToPath(new URL('../britium-current-ui-fixed/warehouse_receipt_reconciliation_v36.sql',import.meta.url));
if(fs.existsSync(dst)) throw Error('Existing migration; refusing overwrite');
const original=fs.readFileSync(src,'utf8');
function extract(first){
 const i=original.indexOf(first);
 if(i<0||original.indexOf(first,i+first.length)!==-1) throw Error('Missing/ambiguous '+first);
 const j=original.indexOf(';\n',i);
 if(j<0||j-i>14000) throw Error('Invalid DDL boundary');
 return original.slice(i,j+1);
}
const objects=[
 'create table if not exists public.be_warehouse_exception_codes_v36 (',
 'create table if not exists public.be_warehouse_receipts_v36 (',
 'create table if not exists public.be_warehouse_receipt_events_v36 ('
];
const sql=objects.map(extract).join('\n\n')+'\n'+objects.map(x=>'ALTER TABLE public.'+x.match(/public\.([a-z0-9_]+)/)[1]+' ENABLE ROW LEVEL SECURITY;').join('\n')+'\n\n'+extract('create or replace view public.be_v_warehouse_receipt_v36 as')+'\n';
fs.writeFileSync(dst,'-- Historical V36 source extraction, CI ONLY, no grants / seeded records.\n'+sql);
console.log('CI-only original V36 receipt tables and view staged');
