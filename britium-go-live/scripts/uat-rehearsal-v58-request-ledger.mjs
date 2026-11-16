/** CI only: restore historic V58 request idempotency ledger before V14 ALTER.
 * Schema verified against Production pg_catalog (2026-11-16).
 * No data copy, no anonymous grants; fail-closed RLS.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const path=fileURLToPath(new URL('../supabase/migrations/20260902220115_data_entry_extra_registration_bulk_actions.sql',import.meta.url));
const sql=fs.readFileSync(path,'utf8');
if(!sql.includes('alter table public.be_data_entry_financial_v2_requests_v58')||
   !sql.includes('alter function public.be_data_entry_financial_v2_save(jsonb)'))throw Error('Wrong target migration');
const foundation=[
 '-- LOCAL CI ONLY: V58 request ledger, historical prerequisite.',
 'CREATE TABLE IF NOT EXISTS public.be_data_entry_financial_v2_requests_v58 (',
 ' request_id text PRIMARY KEY,',
 ' operation text NOT NULL,',
 ' actor_id uuid,',
 ' payload_hash text NOT NULL,',
 ' status text NOT NULL CHECK (status IN (\'IN_PROGRESS\',\'COMPLETE\')),',
 ' response jsonb,',
 ' created_at timestamptz NOT NULL DEFAULT now(),',
 ' completed_at timestamptz,',
 ' CONSTRAINT be_data_entry_financial_v2_requests_v58_operation_check CHECK (operation IN (\'SAVE\',\'IMPORT\',\'CREATE_WAYBILL\'))',
 ');',
 'ALTER TABLE public.be_data_entry_financial_v2_requests_v58 ENABLE ROW LEVEL SECURITY;',
 ''
].join('\n');
const predecessor=fileURLToPath(new URL('../sql/candidates/uat_v13_2_unbounded_save_historical_rehearsal_only.sql',import.meta.url));
const historical=fs.readFileSync(predecessor,'utf8');
if(!historical.includes('CREATE OR REPLACE FUNCTION public.be_data_entry_financial_v2_save(p_payload jsonb)') ||
 !historical.includes('SECURITY DEFINER') ||
 !historical.includes('be_data_entry_financial_v2_requests_v58%rowtype'))
 throw Error('Historical V13.2 predecessor function validation failed');
fs.writeFileSync(path,foundation+'\n'+historical+'\n'+sql);
console.log('CI-only: original V58 ledger shape restored without permissions.');
