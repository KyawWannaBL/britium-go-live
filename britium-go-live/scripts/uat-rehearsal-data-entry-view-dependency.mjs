/** Diagnostic-only replay: restore absent Data Entry validation field.
 * Source type checked against Production information_schema on 2026-11-16.
 * This is a local migration overlay, not a hosted UAT/production change.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const target=fileURLToPath(new URL('../supabase/migrations/20260901145928_dispatch_queue_auth_and_helper_optional_v12_11.sql',import.meta.url));
const original=fs.readFileSync(target,'utf8');
if(!original.startsWith('create or replace view public.be_v_dispatch_ready_queue as') ||
   !original.includes('d.financial_validation_status')) throw Error('Unexpected view migration, refusing patch');
const ddl=[
 '-- CI-only local schema dependency restored before September 1 dispatch ready view.',
 'ALTER TABLE public.be_data_entry_parcel_details',
 ' ADD COLUMN IF NOT EXISTS financial_validation_status text,',
 " ADD COLUMN IF NOT EXISTS financial_quote jsonb NOT NULL DEFAULT '{}'::jsonb;",
 ''
].join('\n');
fs.writeFileSync(target,ddl+original);
console.log('Local CI: restored production-typed Data Entry financial validation field.');
