/** CI ONLY: exact historical V45 route schema (three tables), no
 * Mapbox credential, routes, hub seed data, or hosted migrations.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const src=fileURLToPath(new URL('../britium-current-ui-fixed/wayplan_mapbox_head_office_v45.sql',import.meta.url));
const out=fileURLToPath(new URL('../supabase/migrations/20260916000000_CI_ONLY_V45_wayplan_route_tables.sql',import.meta.url));
if(fs.existsSync(out))throw Error('Existing migration; refusing overwrite');
const original=fs.readFileSync(src,'utf8');
const names=['be_wayplan_route_hubs_v45','be_wayplan_route_plans_v45','be_wayplan_route_events_v45'];
const sql=names.map(name=>{
 const marker='create table if not exists public.'+name+' (';
 const i=original.indexOf(marker),j=original.indexOf('\n);',i);
 if(i<0||j<0||j-i>7500||original.indexOf(marker,i+1)!==-1)throw Error('Missing/ambiguous original DDL '+name);
 return original.slice(i,j+3);
}).join('\n\n');
fs.writeFileSync(out,'-- CI ONLY: original historical V45 DDL without map providers or data.\n'+sql+'\n'+names.map(name=>'ALTER TABLE public.'+name+' ENABLE ROW LEVEL SECURITY;').join('\n')+'\n'+names.map(name=>'REVOKE ALL ON public.'+name+' FROM PUBLIC, anon, authenticated;').join('\n')+'\n');
console.log('CI-only: staged three original V45 route plan/hub/event tables.');
