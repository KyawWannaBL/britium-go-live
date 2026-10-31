import fs from 'node:fs';import assert from 'node:assert/strict';import{createRequire}from'node:module';
const require=createRequire(new URL('../britium-go-live/package.json',import.meta.url));const{PGlite}=require('@electric-sql/pglite');
const db=new PGlite();try{
await db.exec(`create schema private;create schema auth;create role anon;create role authenticated;create role service_role;
create table private.be_oct2026_scope(table_name text primary key);
create table private.be_oct2026_epoch(singleton bool primary key,epoch text,cutoff_at timestamptz,is_active bool,activated_at timestamptz,report jsonb);
insert into private.be_oct2026_epoch values(true,'2026-11-01',now()+interval '1 hour',true,now()-interval '10 minutes','{}');
create table private.be_cutover_scope_v3(table_name text primary key);insert into private.be_cutover_scope_v3 values('be_data_entry_financial_v2_runtime_v58');
create table private.be_cutover_batches_v3(id uuid,status text,evidence jsonb,manifest jsonb,created_at timestamptz,expires_at timestamptz);
create table private.be_cutover_rows_v3(batch_id uuid,table_name text,payload jsonb);
create table private.be_golive_readiness_cutovers_v1(cutover_code text,cutoff_at timestamptz);
create table public.be_data_entry_financial_v2_runtime_v58(singleton bool primary key,mutation_mode text,updated_at timestamptz);
create function private.be_oct2026_write_guard()returns trigger language plpgsql as $$begin raise exception 'Original runtime guard must be removed before exact configuration restore';end$$;
create trigger aaa_oct2026_guard before insert or update or delete on public.be_data_entry_financial_v2_runtime_v58 for each row execute function private.be_oct2026_write_guard();
create table public.be_user_account_registry(auth_user_id uuid,role text,active bool,is_active bool);
create function auth.uid()returns uuid language sql as $$select null::uuid$$;
create function private.be_cutover_finance_v3()returns jsonb language sql as $$select '{}'::jsonb$$;
create function private.be_cutover_finance_archive_v3(uuid)returns jsonb language sql as $$select '{}'::jsonb$$;
create table private.be_oct2026_retired_keys(source_table text,key_field text,key_value text,key_family text);
create table private.be_oct2026_identity_links(parent_table text,parent_column text,identity_table text,parent_type text);
create function private.be_oct2026_key_family(text,text)returns text language sql as $$select case when $1='id'then 'row:'||$2 else 'delivery'end$$;
create table public.be_data_entry_parcel_details(id uuid primary key,delivery_way_id text,status text,created_at timestamptz default now(),cod_collected numeric default 0);
create table public.be_wayplan_dispatches(wayplan_id text primary key,wayplan_status text,created_at timestamptz default now(),dispatched_at timestamptz,total_cod_collected numeric default 0);
create table public.be_party_wallet_accounts(id int primary key,britium_owes numeric);insert into be_party_wallet_accounts values(1,0);
insert into private.be_cutover_batches_v3 values('10000000-0000-4000-8000-000000000001','ACTIVE','{}','{}',now(),now()+interval '1 hour');
insert into private.be_cutover_rows_v3 values('10000000-0000-4000-8000-000000000001','be_data_entry_financial_v2_runtime_v58','{"singleton":true,"mutation_mode":"ACTIVE","updated_at":"2026-10-20T00:00:00+00:00"}');
update private.be_oct2026_epoch set report='{"archive_batch_id":"10000000-0000-4000-8000-000000000001","rows_removed":11}';`);
const sql=fs.readFileSync(new URL('../supabase/migrations/20261031090106_october_preparation_window.sql',import.meta.url),'utf8');assert.ok(sql.includes('be_preparation_row_allowed_v1'),'preparation migration must define policy');await db.exec(sql);
for(const t of['be_data_entry_parcel_details','be_wayplan_dispatches','be_party_wallet_accounts'])await db.exec(`create trigger aaa_prep before insert or update or delete on ${t} for each row execute function private.be_oct2026_write_guard()`);
assert.equal((await db.query('select mutation_mode from be_data_entry_financial_v2_runtime_v58')).rows[0].mutation_mode,'ACTIVE');
assert.equal((await db.query("select count(*)::int n from private.be_cutover_scope_v3 where table_name='be_data_entry_financial_v2_runtime_v58'")).rows[0].n,0);
await db.exec("insert into be_data_entry_parcel_details(id,delivery_way_id,status)values('20000000-0000-4000-8000-000000000001','NEW-WAY','REGISTERED');insert into be_wayplan_dispatches(wayplan_id,wayplan_status)values('NEW-PLAN','CREATED')");
await db.exec('create role authenticator;grant usage on schema public to authenticator;grant select,update on public.be_data_entry_parcel_details to authenticator;set session authorization authenticator');
await db.exec(`select set_config('request.headers','{"x-britium-data-epoch":"2026-10-20"}',false)`);
await assert.rejects(db.exec("update be_data_entry_parcel_details set status='REGISTERED'"),/OBSOLETE_CLIENT_EPOCH/);
await db.exec(`select set_config('request.headers','{"x-britium-data-epoch":"2026-11-01"}',false)`);await db.exec("update be_data_entry_parcel_details set status='REGISTERED'");await db.exec('set session authorization postgres;reset role');
await assert.rejects(db.exec("update be_wayplan_dispatches set wayplan_status='DISPATCHED',dispatched_at=now()"),/GO_LIVE_NOT_OPEN/);
await assert.rejects(db.exec("update be_data_entry_parcel_details set status='DELIVERED'"),/GO_LIVE_NOT_OPEN/);
await assert.rejects(db.exec("update be_data_entry_parcel_details set cod_collected=100"),/GO_LIVE_NOT_OPEN/);
await assert.rejects(db.exec("update be_party_wallet_accounts set britium_owes=100"),/GO_LIVE_NOT_OPEN/);
await assert.rejects(db.exec("insert into be_data_entry_parcel_details(id,delivery_way_id,status,created_at)values('20000000-0000-4000-8000-000000000002','OLD-TIME','REGISTERED',now()-interval '1 day')"),/PRE_CUTOFF_TRANSACTION_REJECTED/);
await db.exec("insert into private.be_oct2026_retired_keys values('be_data_entry_parcel_details','delivery_way_id','retired-way','delivery')");
await assert.rejects(db.exec("insert into be_data_entry_parcel_details(id,delivery_way_id,status)values('20000000-0000-4000-8000-000000000003','RETIRED-WAY','REGISTERED')"),/RETIRED_TRANSACTION_REJECTED/);
for(const [table,row,allowed]of[
['be_finance_predispatch_reviews_v1',{finance_status:'APPROVED',cod_service_fee_amount:200},true],
['be_data_entry_financial_v2_requests_v58',{status:'COMPLETED'},true],
['be_portal_pickup_requests',{pickup_status:'PICKUP_COLLECTED',rider_status:'COMPLETED',pickup_collected_at:new Date().toISOString()},true],
['be_document_print_approval_requests',{status:'PENDING_APPROVAL'},true],
['be_commission_events',{operation_type:'PICKUP',event_status:'READY'},true],
['be_commission_events',{operation_type:'PICKUP',event_status:'PAID'},false],
['be_commission_events',{operation_type:'DELIVERY',event_status:'READY'},false],
['be_wayplan_dispatches',{wayplan_status:'CANCELLED'},true],
['be_data_entry_parcel_details',{parcel_status:'DELIVERED'},false],
['be_wayplan_items',{item_status:'DISPATCHED'},false],
['be_portal_pickup_requests',{workflow_stage:'DELIVERY_COMPLETED'},false],
['be_portal_pickup_requests',{rider_status:'OUT_FOR_DELIVERY'},false],
['be_portal_pickup_requests',{status:'DELIVERED',cod_settled_amount:100},false],
['be_portal_pickup_requests',{pickup_status:'PICKUP_COLLECTED',cod_settled_amount:100},false],
['be_cod_ledger',{cod_status:'HANDED_OVER',handover_amount:100,cod_handed_over:100,collected_at:'2026-10-31T09:00Z',handed_over_at:'2026-10-31T09:00Z'},false],
['be_financial_settlements',{settlement_status:'CLOSED',handover_amount:100,finance_cod:100,closed_at:'2026-10-31T09:00Z'},false],
['be_financial_settlements',{settlement_status:'FINANCE_SETTLED'},false],
['be_wayplan_cod_settlements',{settlement_status:'PENDING'},false]]){
const r=(await db.query('select private.be_preparation_row_allowed_v1($1,$2::jsonb) allowed',[table,JSON.stringify(row)])).rows[0];assert.equal(r.allowed,allowed,`${table} ${JSON.stringify(row)}`);}
await db.exec("update private.be_oct2026_epoch set cutoff_at=now()-interval '1 second';update be_data_entry_parcel_details set status='DELIVERED',cod_collected=100;update be_party_wallet_accounts set britium_owes=100");
const visible=(await db.query('select count(*)::int n from be_data_entry_parcel_details where created_at>=public.be_golive_live_cutoff_v1()')).rows[0].n;assert.equal(visible,1,'preparation row stays visible and editable after opening');
console.log('PASS preparation: exact runtime restore, provenance floor, created planning, no early dispatch/COD/payout, genuine pickup accrued commission only, historical replay denial, post-opening continuity');
}catch(e){console.error(JSON.stringify({message:e.message,position:e.position,internalPosition:e.internalPosition,internalQuery:e.internalQuery,where:e.where}));process.exitCode=1}finally{await db.close()}
