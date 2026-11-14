import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261115043000_royal_reconciliation_readonly_preview.sql'),'utf8');
const db=new PGlite();
try {
 await db.exec(`
 CREATE SCHEMA auth; CREATE SCHEMA private;
 CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
   SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
 CREATE FUNCTION public.be_current_role() RETURNS text LANGUAGE sql AS $$
   SELECT coalesce(nullif(current_setting('test.role',true),''),'customer_service') $$;
 CREATE FUNCTION public.be_golive_live_cutoff_v1() RETURNS timestamptz LANGUAGE sql AS $$ SELECT '2026-10-01'::timestamptz $$;
 CREATE FUNCTION private.be_current_operational_way_v1(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
 CREATE TABLE private.be_thirdparty_schedule_way_rows_v1(delivery_way_id text,scheduled_on date);
 CREATE TABLE public.be_data_entry_parcel_details(
 delivery_way_id text primary key,township text,city text,region_state text,
 delivery_route_mode text,handoff_station_name text,handoff_station_code text,
 cod_amount numeric,delivery_charges bigint,saved_at timestamptz
 );
 CREATE TABLE public.be_warehouse_inventory_rows(way_id text,cod_amount numeric,township text);
 INSERT INTO public.be_data_entry_parcel_details(delivery_way_id,township,region_state,delivery_route_mode,cod_amount) VALUES
 ('D1104-BBW-0039','လယ်ဝေး','Naypyitaw','ROYAL_EXPRESS',51000),
 ('D1105-KSC-0047','တောင်ကြီး','Shan','ROYAL_EXPRESS',44000),
 ('D1104-RYP-0008','ရမည်းသင်း','Mandalay','ROYAL_EXPRESS',190000),
 ('D1104-RYP-0013','ရမည်းသင်း','Mandalay','ROYAL_EXPRESS',190000);
 INSERT INTO public.be_warehouse_inventory_rows(way_id,cod_amount,township) VALUES
 ('D1105-KSC-0047',40000,'တောင်ကြီး'),('D1105-KSC-0047',40000,'တောင်ကြီး'),
 ('D1104-RYP-0008',190000,'ရမည်းသင်း');
 SELECT set_config('test.actor','00000000-0000-4000-8000-000000000001',false),
 set_config('test.role','customer_service',false);
 `);
 await db.exec(sql);
 const result=await db.query(`SELECT public.be_cs_thirdparty_reconcile_preview_v1(ARRAY[
 'D1104-BBW-0039','D1105-KSC-0047','D1104-RYP-0008','D1104-RYP-0013']) as result`);
 const v=result.rows[0].result;
 assert.equal(v.ok,true); assert.equal(v.read_only,true);
 assert.equal(v.rows.length,4);
 const rows=Object.fromEntries(v.rows.map(r=>[r.delivery_way_id,r]));
 assert.equal(rows['D1104-BBW-0039'].route_review_required,true);
 assert.equal(rows['D1104-BBW-0039'].inventory_row_count,0);
 assert.equal(rows['D1105-KSC-0047'].inventory_amount_conflict,true);
 assert.equal(rows['D1105-KSC-0047'].duplicate_inventory_way,true);
 assert.equal(rows['D1104-RYP-0008'].inventory_amount_conflict,false);
 assert.equal(rows['D1104-RYP-0008'].inventory_row_count,1);
 const count=await db.query('select count(*)::int as n from public.be_data_entry_parcel_details');
 assert.equal(count.rows[0].n,4);
 await db.exec(`select set_config('test.role','rider',false)`);
 const denied=await db.query(`select public.be_cs_thirdparty_reconcile_preview_v1(ARRAY['D1104-RYP-0008']) as result`);
 assert.equal(denied.rows[0].result.error,'CS_OR_FINANCE_ROLE_REQUIRED');
 await db.exec(`select set_config('test.role','customer_service',false),set_config('test.actor','',false)`);
 const noAuth=await db.query(`select public.be_cs_thirdparty_reconcile_preview_v1(ARRAY['D1104-RYP-0008']) as result`);
 assert.equal(noAuth.rows[0].result.error,'AUTH_REQUIRED');
 console.log('PASS Royal read-only reconciliation SQL: COD, duplicates, routing, missing inventory, auth/role guards');
} finally { await db.close(); }
