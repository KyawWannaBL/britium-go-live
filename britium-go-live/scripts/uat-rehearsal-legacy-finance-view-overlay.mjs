/** CI-only: make one legacy pre-replacement DROP VIEW conditional.
 * No remote database changes. Keep replacement view SQL untouched.
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const file=fileURLToPath(new URL('../supabase/migrations/20260901192455_finance_canonical_projection_v4_1.sql',import.meta.url));
const source=fs.readFileSync(file,'utf8');
const exact='drop view public.be_v_finance_merchant_settlement_queue_v2;';
const safe='drop view if exists public.be_v_finance_merchant_settlement_queue_v2;';
const needsPatch=source.split(exact).length===2;
if(!needsPatch && source.split(safe).length!==2)throw Error('Reviewed finance view DROP guard missing');
if(!source.includes('create view public.be_v_finance_merchant_settlement_queue_v2\nwith (security_invoker = true)'))throw Error('RLS-safe replacement view absent');
const foundation=[
 '-- CI-only source-verified business date helper (Production uses Asia/Yangon).',
 "CREATE OR REPLACE FUNCTION public.be_business_date() RETURNS date LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $function$ SELECT (statement_timestamp() AT TIME ZONE 'Asia/Yangon')::date $function$;",
 '-- CI-only historically missing merchant financial profile projection fields.',
 'ALTER TABLE public.be_merchant_financial_profiles_v2',
 ' ADD COLUMN IF NOT EXISTS merchant_name text,',
 " ADD COLUMN IF NOT EXISTS counterparty_type text NOT NULL DEFAULT 'MERCHANT',",
 ' ADD COLUMN IF NOT EXISTS settlement_method text,',
 ' ADD COLUMN IF NOT EXISTS settlement_account text,',
 ' ADD COLUMN IF NOT EXISTS settlement_notes text;',
 ''
].join('\n');
fs.writeFileSync(file,foundation+(needsPatch?source.replace(exact,safe):source));
console.log('CI only: conditional drop of absent legacy finance settlement queue before existing security-invoker CREATE VIEW.');
