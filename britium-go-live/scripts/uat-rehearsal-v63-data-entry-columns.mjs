/** CI-only Data Entry columns required by September 19 dispatch snapshot.
 * Column types checked from Production information_schema 2026-11-16.
 * Does not mutate real UAT / Production.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const file=fileURLToPath(new URL('../supabase/migrations/20260919163523_dispatch_command_v63.sql',import.meta.url));
const s=fs.readFileSync(file,'utf8');
if(!s.includes('create or replace function public.be_dispatch_command_snapshot_v63()')||
 !s.includes('left join public.be_data_entry_parcel_details p'))throw Error('Target migration changed; stop');
const statement=[
 '-- CI ONLY: production-typed Data Entry dispatch columns, no row changes.',
 'ALTER TABLE public.be_data_entry_parcel_details',
 ' ADD COLUMN IF NOT EXISTS delivery_charges bigint,',
 ' ADD COLUMN IF NOT EXISTS cod_amount numeric DEFAULT 0,',
 ' ADD COLUMN IF NOT EXISTS merchant_id text,',
 ' ADD COLUMN IF NOT EXISTS contact_no_2 text,',
 " ADD COLUMN IF NOT EXISTS warehouse_status text DEFAULT 'PENDING_PRINT';",
 ''
].join('\n');
fs.writeFileSync(file,statement+s);
console.log('CI only: restored required Data Entry dispatch column types.');
