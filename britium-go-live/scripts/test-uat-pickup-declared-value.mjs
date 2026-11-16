import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try{
 await db.exec(`create table be_portal_pickup_requests(payment_type text,payment_method text,payment_terms text,total_cod numeric,cod_amount numeric,parcel_count integer,expected_parcels integer,pickup_township text,township text,pickup_date date,created_at timestamptz,updated_at timestamptz,metadata jsonb,cod_policy_status text,cod_service_fee_rate numeric,cod_service_fee_amount numeric,finance_pre_dispatch_status text);
 create table be_data_entry_parcel_details(actual_collect numeric,cod_amount numeric,updated_at timestamptz);
 create table be_system_config(config_key text primary key,config_value jsonb,description text,updated_at timestamptz);`);
 const fixture=new URL('../sql/candidates/uat_pickup_declared_value_rehearsal_only.sql',import.meta.url);
 if(fs.existsSync(fixture))await db.exec(fs.readFileSync(fixture,'utf8'));
 const sql=fs.readFileSync(new URL('../supabase/migrations/20260930051110_cod_pickup_service_policy_20260930_v1.sql',import.meta.url),'utf8');
 await db.exec(sql);
 await db.exec(`insert into be_portal_pickup_requests(payment_type,declared_item_value,parcel_count) values('COD',400000,1)`);
 let row=(await db.query('select * from be_portal_pickup_requests')).rows[0];
 // This migration defines the existing COD sync function; its trigger was
 // installed earlier in the full history, so exercise it here explicitly.
 await db.exec(`create trigger ci_cod_sync before update on be_portal_pickup_requests for each row execute function be_pickup_cod_policy_sync_v1();update be_portal_pickup_requests set declared_item_value=400000`);
 row=(await db.query('select * from be_portal_pickup_requests')).rows[0];
 assert.equal(Number(row.cod_service_fee_amount),800);
 await db.exec(`insert into be_portal_pickup_requests(payment_type,parcel_count) values('COD',1)`);
 assert.equal(Number((await db.query('select declared_item_value from be_portal_pickup_requests order by declared_item_value limit 1')).rows[0].declared_item_value),0);
 console.log('PASS: original September COD/pickup migration compiles; declared value has zero default and feeds original COD fee policy.');
}finally{await db.close();}
