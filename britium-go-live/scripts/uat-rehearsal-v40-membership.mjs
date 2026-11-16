/** Local CI only: stage original V40 route membership and event table definitions.
 * RLS fail-closed, no data or client grants. Not for hosted deployment.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('../britium-current-ui-fixed/wayplan_warehouse_dispatch_v40.sql',import.meta.url));
const out=fileURLToPath(new URL('../supabase/migrations/20260911000000_CI_ONLY_V40_wayplan_membership.sql',import.meta.url));
if(fs.existsSync(out))throw Error('Refusing existing migration overwrite');
const s=fs.readFileSync(source,'utf8');
const names=['be_wayplan_membership_v40','be_wayplan_events_v40'];
const extracted=names.map(n=>{
 const mark='create table if not exists public.'+n+' (';
 const i=s.indexOf(mark),j=s.indexOf(';\n',i);
 if(i<0||j<0||s.indexOf(mark,i+mark.length)>=0||j-i>6500)throw Error('Cannot extract V40 '+n);
 return s.slice(i,j+1);
});
fs.writeFileSync(out,'-- LOCAL CI ONLY, original V40 tables; no grants.\n'+extracted.join('\n\n')+'\n'+names.map(n=>'ALTER TABLE public.'+n+' ENABLE ROW LEVEL SECURITY;').join('\n')+'\n');
console.log('CI only: staged V40 wayplan membership and event tables.');
