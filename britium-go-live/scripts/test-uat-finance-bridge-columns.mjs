import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {PGlite} from '@electric-sql/pglite';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'uat-finance-bridge-'));
const db=new PGlite();
try {
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'scripts/uat-finance-prerequisite-sources.json'),'utf8'));
 for(const rel of ['scripts/uat-rehearsal-finance-foundation.mjs','scripts/uat-finance-prerequisite-sources.json',...new Set(Object.values(manifest)),'britium-current-ui-fixed/parcel_financial_v2_backend.sql','britium-current-ui-fixed/parcel_financial_v2_2_ui_finance_bridge.sql','sql/candidates/uat_financial_runtime_v58_rehearsal_only.sql','sql/candidates/uat_field_finance_foundation_rehearsal_only.sql','sql/candidates/uat_pickup_declared_value_rehearsal_only.sql']){
  fs.mkdirSync(path.dirname(path.join(tmp,rel)),{recursive:true});fs.copyFileSync(path.join(root,rel),path.join(tmp,rel));
 }
 fs.mkdirSync(path.join(tmp,'supabase/migrations'),{recursive:true});
 execFileSync(process.execPath,[path.join(tmp,'scripts/uat-rehearsal-finance-foundation.mjs')],{env:{...process.env,DO_NOT_CONNECT_REMOTE:'1'}});
 const staged=fs.readFileSync(path.join(tmp,'supabase/migrations/20260731000000_CI_ONLY_original_financial_foundation.sql'),'utf8');
 const ddl=staged.match(/alter table public\.be_data_entry_parcel_details\s+[\s\S]*?;/i)?.[0];
 assert.ok(ddl,'Replay foundation must restore the original complete financial bridge columns');
 for(const name of ['be_finance_cod_settlements_v48','be_finance_cod_events_v48','be_waybill_print_audit_v38','be_merchant_accounts','be_finance_settlement_access_v3','be_finance_settlement_batches_v3','be_finance_settlement_batch_items_v3','be_finance_settlement_payments_v3','be_finance_settlement_parcel_control_v3','be_finance_settlement_disputes_v3','be_finance_settlement_adjustments_v3','be_finance_settlement_audit_v3'])
  assert.ok(staged.includes('create table if not exists public.'+name+' ('),'Referenced historical table omitted: '+name);
 await db.exec('create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;');
 await db.exec(staged.slice(staged.indexOf('-- CI ONLY: archived missing table prerequisites.')));
 for(const name of Object.keys(manifest)){
  assert.equal((await db.query('select count(*) n from public.'+name)).rows[0].n,0,'No archived business/account data');
  assert.deepEqual((await db.query(`select relrowsecurity as rls,has_table_privilege('anon',$1,'SELECT') as anon,has_table_privilege('authenticated',$1,'SELECT') as authenticated from pg_class where oid=$1::regclass`,['public.'+name])).rows[0],{rls:true,anon:false,authenticated:false});
 }
 await db.exec(`create table be_data_entry_parcel_details(delivery_way_id text,cod_amount numeric,item_price numeric,delivery_fee numeric,updated_at timestamptz);`);
 await db.exec(ddl);await db.exec(ddl);
 await db.exec(`insert into be_data_entry_parcel_details(delivery_way_id,cod_amount,amount_entry_type) values('D-CI',0,'DELIVERY_CHARGE_ONLY')`);
 assert.equal((await db.query(`select amount_entry_type,additional_customer_charge,financial_quote from be_data_entry_parcel_details`)).rows[0].amount_entry_type,'DELIVERY_CHARGE_ONLY');
 const cols=(await db.query(`select column_name from information_schema.columns where table_name='be_data_entry_parcel_details'`)).rows.map(r=>r.column_name);
 for(const c of ['amount_entry_type','merchant_stated_total_amount','financial_validation_status','financial_calculated_at','financial_quote','effective_declared_delivery_charge'])assert.ok(cols.includes(c),c);
 const migration=fs.readFileSync(path.join(root,'supabase/migrations/20260927213538_rider_cod_from_data_entry_v165a.sql'),'utf8');
 const lateral=migration.match(/left join lateral \(([\s\S]*?)\) de on true/i)[1];
 const result=await db.query(`select de.* from (values('D-CI')) s(delivery_way_id) left join lateral (${lateral}) de on true`);
 assert.equal(Number(result.rows[0].cod_amount),0,'Real Rider COD projection preserves genuine zero');
 assert.equal(result.rows[0].amount_entry_type,'DELIVERY_CHARGE_ONLY');
 console.log('PASS: original finance bridge columns replay twice; actual Rider COD projection retains amount type and genuine zero.');
}finally{await db.close();fs.rmSync(tmp,{recursive:true,force:true});}
