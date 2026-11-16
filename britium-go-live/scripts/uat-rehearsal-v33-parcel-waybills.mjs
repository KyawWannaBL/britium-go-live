/** CI ONLY: restore original Data Entry V33 waybill table before V36 receipt view.
 * No grants, no seeds, no remote calls. Not a canonical migration.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const src=fileURLToPath(new URL('../britium-current-ui-fixed/src/pages/data_entry_excel_register_backend.sql',import.meta.url));
const out=fileURLToPath(new URL('../supabase/migrations/20260830040000_CI_ONLY_V33_parcel_waybills.sql',import.meta.url));
if(fs.existsSync(out)) throw Error('Existing migration; not overwriting');
const sql=fs.readFileSync(src,'utf8');
const marker='create table if not exists public.be_parcel_waybills (';
const i=sql.indexOf(marker);
if(i<0||sql.indexOf(marker,i+marker.length)!==-1)throw Error('Missing or ambiguous V33 source');
const j=sql.indexOf(';\n',i);
if(j<0||j-i>7000)throw Error('DDL boundary invalid');
const ddl=sql.slice(i,j+1);
fs.writeFileSync(out,'-- CI-only historic V33 source, no backend records copied.\n'+ddl+'\nALTER TABLE public.be_parcel_waybills ENABLE ROW LEVEL SECURITY;\n');
console.log('CI-only: staged original V33 parcel waybill schema.');
