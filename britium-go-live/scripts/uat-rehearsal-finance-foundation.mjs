/** CI ONLY: stage original 2026-07-31 Financial V2 foundation for diagnosis.
 * Source lives in the repository; migration file exists only in disposable
 * GitHub Actions checkout. May seed historical test tariffs only in local DB.
 * NEVER run this script against a hosted DB or commit its generated migration.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('../britium-current-ui-fixed/parcel_financial_v2_backend.sql',import.meta.url));
const out=fileURLToPath(new URL('../supabase/migrations/20260731000000_CI_ONLY_original_financial_foundation.sql',import.meta.url));
const s=fs.readFileSync(source,'utf8');
if(!s.includes('-- PARCEL_FINANCIAL_V2_BACKEND_2026-07-31') ||
   !s.includes('create table if not exists public.be_parcel_tariffs_v2') ||
   !s.includes('create or replace function public.be_calculate_parcel_financial_v2(')) {
 throw Error('Historical foundation source mismatched: no temporary migration produced.');
}
if(fs.existsSync(out)) throw Error('Refusing to overwrite existing migration.');
fs.writeFileSync(out,s);
console.log('CI ONLY: staged original July 31 Financial V2 foundation into disposable migration checkout.');
