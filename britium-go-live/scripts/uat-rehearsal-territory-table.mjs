/** DIAGNOSTIC CI ONLY: reconstruct original territory-assignment table from
 * archived historical SQL. This does not resurrect the archived migration
 * or run its role-grant/data-backfill statements. RLS defaults to deny.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const src=fileURLToPath(new URL('../supabase/migration_history_archive/local_only_not_in_production_20261114/20260901204500_activate_financial_v2_and_employee_territory_rls_v13.sql',import.meta.url));
const dst=fileURLToPath(new URL('../supabase/migrations/20260914030000_CI_ONLY_territory_assignments.sql',import.meta.url));
if(fs.existsSync(dst))throw Error('Migration exists; refusing replacement');
const source=fs.readFileSync(src,'utf8');
const token='create table if not exists public.be_employee_territory_assignments (';
const i=source.indexOf(token),j=source.indexOf('\n);',i);
if(i<0||j<0||j-i>5000||source.indexOf(token,i+1)!==-1)throw Error('Original territory table source not unique');
const ddl=source.slice(i,j+3);
if(!ddl.includes('references auth.users(id)')||!ddl.includes('unique nulls not distinct'))throw Error('Territory definition drift');
fs.writeFileSync(dst,'-- CI DIAGNOSTIC ONLY; historical table, empty, RLS enabled, no public access.\n'+ddl+'\nALTER TABLE public.be_employee_territory_assignments ENABLE ROW LEVEL SECURITY;\nREVOKE ALL ON public.be_employee_territory_assignments FROM PUBLIC, anon, authenticated;\n');
console.log('CI ONLY: original employee territory assignment table installed empty and fail-closed.');
