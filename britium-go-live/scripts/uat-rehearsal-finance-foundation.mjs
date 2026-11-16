/** CI ONLY: Stage historical July 31 Financial V2 SQL in disposable CI DB.
 * No production or hosted UAT interaction. Source may seed TEST tariffs locally.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('../britium-current-ui-fixed/parcel_financial_v2_backend.sql',import.meta.url));
const migrations=new URL('../supabase/migrations/',import.meta.url);
const finance=fileURLToPath(new URL('20260731000000_CI_ONLY_original_financial_foundation.sql',migrations));
const compat=fileURLToPath(new URL('20260730000000_CI_ONLY_missing_parcel_columns.sql',migrations));
const content=fs.readFileSync(source,'utf8');
if(!content.includes('-- PARCEL_FINANCIAL_V2_BACKEND_2026-07-31') ||
   !content.includes('create table if not exists public.be_parcel_tariffs_v2') ||
   !content.includes('create or replace function public.be_calculate_parcel_financial_v2(')) throw Error('Historical foundation mismatch');
for(const p of [finance,compat]) if(fs.existsSync(p)) throw Error('Refusing overwrite of existing migration');
const ddl=[
 '-- CI ONLY: verified existing Production parcel column types, never execute on hosted DB.',
 'ALTER TABLE public.parcels',
 ' ADD COLUMN IF NOT EXISTS item_price numeric DEFAULT 0,',
 ' ADD COLUMN IF NOT EXISTS delivery_charges numeric DEFAULT 0,',
 ' ADD COLUMN IF NOT EXISTS cod_amount integer DEFAULT 0;',
 ''
].join('\n');
if(ddl.split('\n').length<6 || !ddl.includes('\nALTER TABLE public.parcels\n')) throw Error('Invalid diagnostic prelude line breaks');
fs.writeFileSync(compat,ddl);
fs.writeFileSync(finance,content);
console.log('CI ONLY: staged verified parcel columns and original 20260731 finance foundation.');
