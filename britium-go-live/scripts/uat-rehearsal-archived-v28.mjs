/** Diagnostic CI only: restore authentic archived V28 alias migration.
 * The source lives in migration_history_archive/local_only_not_in_production.
 * NEVER enable or copy it into hosted UAT/Production without canonical review.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('../supabase/migration_history_archive/local_only_not_in_production_20261114/20260906193000_location_alias_learning_v28.sql',import.meta.url));
const target=fileURLToPath(new URL('../supabase/migrations/20260906193000_CI_ONLY_V28_location_aliases.sql',import.meta.url));
if(fs.existsSync(target))throw Error('Refusing overwrite');
const sql=fs.readFileSync(source,'utf8');
for(const check of ['create table if not exists public.be_location_aliases','create or replace function public.be_location_alias_resolve_v28','alter table public.be_location_aliases enable row level security','create policy be_location_alias_read_v28']){
 if(!sql.includes(check))throw Error('Archived V28 source incomplete: '+check);
}
fs.writeFileSync(target,'-- DIAGNOSTIC CI ONLY: archived V28 source, not a hosted migration.\n'+sql);
console.log('CI only: archived canonical V28 alias source staged before V28 verification.');
