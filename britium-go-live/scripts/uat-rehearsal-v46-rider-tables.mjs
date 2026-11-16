/** CI ONLY: original V46 route tables from archived execution module,
 * not an operational migration or a live database modification.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const src=fileURLToPath(new URL('../britium-current-ui-fixed/rider_delivery_execution_v46.sql',import.meta.url));
const dst=fileURLToPath(new URL('../supabase/migrations/20260917000000_CI_ONLY_V46_rider_route_tables.sql',import.meta.url));
if(fs.existsSync(dst))throw Error('Refusing to overwrite existing migration');
const s=fs.readFileSync(src,'utf8');
const names=['be_rider_route_settings_v46','be_rider_route_runs_v46','be_rider_route_stop_state_v46','be_rider_route_events_v46'];
const ddl=names.map(name=>{
 const start='create table if not exists public.'+name+' (';
 const i=s.indexOf(start);if(i<0||s.indexOf(start,i+1)>=0)throw Error('Missing/ambiguous V46 table '+name);
 const j=s.indexOf('\n);',i);
 if(j<0||j-i>9000)throw Error('DDL boundary not found '+name);
 return s.slice(i,j+3);
});
fs.writeFileSync(dst,'-- LOCAL REPLAY ONLY: source-derived V46 tables, no hosted writes.\n'+ddl.join('\n\n')+'\n'+names.map(n=>'ALTER TABLE public.'+n+' ENABLE ROW LEVEL SECURITY;').join('\n')+'\n'+names.map(n=>'REVOKE ALL ON public.'+n+' FROM PUBLIC, anon, authenticated;').join('\n')+'\n');
console.log('CI-only: restored '+names.length+' V46 rider route tables, fail-closed.');
