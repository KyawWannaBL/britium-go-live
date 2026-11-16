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
const bridge=fs.readFileSync(new URL('../britium-current-ui-fixed/parcel_financial_v2_2_ui_finance_bridge.sql',import.meta.url),'utf8');
if(!bridge.startsWith('-- PARCEL_FINANCIAL_V2_2_UI_FINANCE_BRIDGE_2026-07-31'))throw Error('Historical finance bridge mismatch');
const blocks=[...bridge.matchAll(/alter table public\.be_data_entry_parcel_details\s+[\s\S]*?;/gi)];
if(blocks.length!==1)throw Error('Missing/ambiguous original finance bridge column definition');
const details=blocks[0][0];
const runtime=fs.readFileSync(new URL('../sql/candidates/uat_financial_runtime_v58_rehearsal_only.sql',import.meta.url),'utf8');
const field=fs.readFileSync(new URL('../sql/candidates/uat_field_finance_foundation_rehearsal_only.sql',import.meta.url),'utf8');
const pickup=fs.readFileSync(new URL('../sql/candidates/uat_pickup_declared_value_rehearsal_only.sql',import.meta.url),'utf8');
const commission=fs.readFileSync(new URL('../sql/candidates/uat_commission_event_lineage_rehearsal_only.sql',import.meta.url),'utf8');
for(const marker of ['ALTER TABLE public.be_commission_events','ADD COLUMN IF NOT EXISTS source_key text','ADD COLUMN IF NOT EXISTS merchant_id text','ADD COLUMN IF NOT EXISTS merchant_name text','ADD COLUMN IF NOT EXISTS referral_assignment_id uuid;'])
 if(!commission.includes(marker))throw Error('Commission lineage fixture incomplete: '+marker);
const manifest=JSON.parse(fs.readFileSync(new URL('./uat-finance-prerequisite-sources.json',import.meta.url),'utf8'));
if(Object.keys(manifest).length!==12)throw Error('Unexpected archived prerequisite manifest');
const archived=['-- CI ONLY: archived missing table prerequisites.'];
const indexes=new Set();
for(const [name,relative] of Object.entries(manifest)){
 const original=fs.readFileSync(new URL('../'+relative,import.meta.url),'utf8');
 const needle='create table if not exists public.'+name+' (';
 const begin=original.indexOf(needle),end=original.indexOf('\n);',begin);
 if(begin<0||end<begin||end-begin>10000||original.indexOf(needle,begin+1)!==-1)throw Error('Missing/ambiguous original table '+name);
 archived.push(original.slice(begin,end+3));
 archived.push('ALTER TABLE public.'+name+' ENABLE ROW LEVEL SECURITY;');
 archived.push('REVOKE ALL ON public.'+name+' FROM PUBLIC,anon,authenticated;');
 for(const match of original.matchAll(/create\s+(?:unique\s+)?index\s+[\s\S]*?;/gi))
  if(new RegExp('\\bon\\s+public\\.'+name+'\\s*\\(','i').test(match[0]))indexes.add(match[0]);
}
archived.push(...indexes);
for(const marker of ['ADD COLUMN IF NOT EXISTS declared_item_value numeric NOT NULL DEFAULT 0,',"ADD COLUMN IF NOT EXISTS cod_policy_status text NOT NULL DEFAULT 'NOT_EVALUATED'",'ADD COLUMN IF NOT EXISTS cod_service_fee_rate numeric NOT NULL DEFAULT 0','ADD COLUMN IF NOT EXISTS cod_service_fee_amount numeric NOT NULL DEFAULT 0',"ADD COLUMN IF NOT EXISTS finance_pre_dispatch_status text NOT NULL DEFAULT 'NOT_REQUIRED'"])
 if(!pickup.includes(marker))throw Error('Pickup finance fixture incomplete: '+marker);
for(const marker of ['CREATE TABLE public.be_field_finance_settlements_v1','UNIQUE (work_date, wayplan_id)','ENABLE ROW LEVEL SECURITY','FROM PUBLIC,anon,authenticated'])
 if(!field.includes(marker))throw Error('Field finance foundation incomplete: '+marker);
for(const marker of ['CREATE TABLE public.be_data_entry_financial_v2_runtime_v58','CHECK (singleton)',"CHECK (mutation_mode IN ('MUTATION_SHADOW','ACTIVE'))",'ENABLE ROW LEVEL SECURITY','FROM PUBLIC,anon,authenticated'])
 if(!runtime.includes(marker))throw Error('Financial runtime fixture incomplete: '+marker);
for(const marker of ['amount_entry_type text','financial_validation_status text',"financial_quote jsonb not null default '{}'::jsonb"])
 if(!details.includes(marker))throw Error('Incomplete original finance bridge: '+marker);
if(!content.includes('-- PARCEL_FINANCIAL_V2_BACKEND_2026-07-31') ||
   !content.includes('create table if not exists public.be_parcel_tariffs_v2') ||
   !content.includes('create or replace function public.be_calculate_parcel_financial_v2(')) throw Error('Historical foundation mismatch');
for(const p of [finance,compat]) if(fs.existsSync(p)) throw Error('Refusing overwrite of existing migration');
const ddl=[
 '-- CI ONLY: verified existing Production parcel column types, never execute on hosted DB.',
 'ALTER TABLE public.parcels',
 ' ADD COLUMN IF NOT EXISTS item_price numeric DEFAULT 0,',
 ' ADD COLUMN IF NOT EXISTS delivery_charges numeric DEFAULT 0,',
 ' ADD COLUMN IF NOT EXISTS cod_amount integer DEFAULT 0,',
 ' ADD COLUMN IF NOT EXISTS way_id text,',
 ' ADD COLUMN IF NOT EXISTS merchant_id text,',
 ' ADD COLUMN IF NOT EXISTS customer_tier text,',
 ' ADD COLUMN IF NOT EXISTS amount_entry_type text,',
 ' ADD COLUMN IF NOT EXISTS merchant_stated_total_amount bigint,',
 ' ADD COLUMN IF NOT EXISTS additional_customer_charge bigint NOT NULL DEFAULT 0,',
 ' ADD COLUMN IF NOT EXISTS cbm_surcharge bigint NOT NULL DEFAULT 0,',
 ' ADD COLUMN IF NOT EXISTS other_surcharge bigint NOT NULL DEFAULT 0,',
 ' ADD COLUMN IF NOT EXISTS merchant_payable_charges bigint NOT NULL DEFAULT 0,',
 ' ADD COLUMN IF NOT EXISTS other_merchant_credits bigint NOT NULL DEFAULT 0,',
 ' ADD COLUMN IF NOT EXISTS monthly_ways integer,',
 ' ADD COLUMN IF NOT EXISTS township text,',
 ' ADD COLUMN IF NOT EXISTS weight_kg numeric DEFAULT 0,',
 ' ADD COLUMN IF NOT EXISTS collect_amount numeric NOT NULL DEFAULT 0,',
 ' ADD COLUMN IF NOT EXISTS base_tariff bigint,',
 ' ADD COLUMN IF NOT EXISTS weight_surcharge bigint,',
 ' ADD COLUMN IF NOT EXISTS gross_system_delivery_charge bigint,',
 ' ADD COLUMN IF NOT EXISTS commitment_refund bigint,',
 ' ADD COLUMN IF NOT EXISTS net_system_delivery_charge bigint,',
 ' ADD COLUMN IF NOT EXISTS delivery_difference bigint,',
 ' ADD COLUMN IF NOT EXISTS merchant_settlement_adjustment bigint,',
 ' ADD COLUMN IF NOT EXISTS merchant_final_settlement_amount bigint,',
 ' ADD COLUMN IF NOT EXISTS settlement_direction text,',
 ' ADD COLUMN IF NOT EXISTS validation_status text,',
 ' ADD COLUMN IF NOT EXISTS validation_message text,',
 " ADD COLUMN IF NOT EXISTS calculation_version text NOT NULL DEFAULT 'PARCEL_FINANCIAL_V2',",
 ' ADD COLUMN IF NOT EXISTS calculated_at timestamptz,',
 ' ADD COLUMN IF NOT EXISTS financial_locked_at timestamptz,',
 ' ADD COLUMN IF NOT EXISTS financial_settled_at timestamptz,',
 ' ADD COLUMN IF NOT EXISTS financial_settlement_batch_id uuid;',
 ''
].join('\n');
if(ddl.split('\n').length<6 || !ddl.includes('\nALTER TABLE public.parcels\n')) throw Error('Invalid diagnostic prelude line breaks');
fs.writeFileSync(compat,ddl+'\n'+pickup+'\n'+commission+'\n');
fs.writeFileSync(finance,content+'\n-- Original V2.2 Data Entry finance bridge columns, CI ONLY.\n'+details+'\n'+runtime+'\n'+field+'\n'+archived.join('\n')+'\n');
console.log('CI ONLY: staged verified parcel columns and original 20260731 finance foundation.');
