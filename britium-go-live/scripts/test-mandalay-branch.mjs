import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
try {
await db.exec(`create schema auth; create role anon; create role authenticated;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email','actor@example.test')$$;
create function be_current_role() returns text language sql stable as $$select current_setting('test.role',true)$$;
create table be_user_account_registry(auth_user_id uuid,branch_code text,status text,active boolean,is_active boolean);
create table be_employee_territory_assignments(user_id uuid,branch_code text,scope_type text,active boolean,can_read boolean,can_create boolean,can_update boolean);
create table be_wayplan_dispatches(wayplan_id text,branch_code text);
create table be_branch_offices(branch_code text primary key,branch_name text);
create table be_portal_pickup_requests(pickup_id text,branch_code text);
create table be_data_entry_parcel_details(delivery_way_id text primary key,delivery_region text,parcel_status text,actual_collect numeric,cod_amount numeric,pickup_id text);
create table be_audit_events(actor_id uuid,actor_email text,actor_role text,action text,resource_type text,resource_id text,details jsonb);
insert into be_branch_offices values('MDY','Mandalay'),('YGN','Yangon');
insert into be_wayplan_dispatches values('MDY-PLAN','MDY'),('YGN-PLAN','YGN');
insert into be_portal_pickup_requests values('P-MDY','MDY'),('P-YGN','YGN');
insert into be_data_entry_parcel_details values('TO-YGN','YANGON','WAREHOUSE_READY',1000,1000,'P-MDY'),('TO-MDY','MANDALAY','WAREHOUSE_READY',2000,2000,'P-YGN'),('TO-YGN-2','YANGON','WAREHOUSE_READY',500,500,'P-MDY');
insert into be_user_account_registry values('11111111-1111-4111-8111-111111111111','MDY','active',true,true),('22222222-2222-4222-8222-222222222222','YGN','active',true,true);
insert into be_employee_territory_assignments values('11111111-1111-4111-8111-111111111111','MDY','BRANCH',true,true,true,true),('22222222-2222-4222-8222-222222222222','YGN','BRANCH',true,true,true,true);
set test.uid='11111111-1111-4111-8111-111111111111'; set test.role='branch_manager';`);
// Compile the complete live-RPC migration against table shapes from production.
const columns=JSON.parse(fs.readFileSync(new URL('./fixtures/mandalay-table-columns.json',import.meta.url),'utf8'));
for(const table of new Set(columns.map(x=>x.table_name))){
 await db.exec(`create table if not exists public.${table}(_fixture boolean)`);
 for(const c of columns.filter(x=>x.table_name===table)){
  const type=c.data_type==='ARRAY'?c.udt_name.slice(1)+'[]':c.data_type==='USER-DEFINED'?'text':c.data_type;
  await db.exec(`alter table public.${table} add column if not exists "${c.column_name}" ${type}`);
 }
}
await db.exec(`create function be_current_user_role() returns text language sql stable as $$select current_setting('test.role',true)$$;
create function be_wayplan_review_actor_v43(text default null) returns text language sql stable as $$select 'actor@example.test'::text$$;
create function be_golive_live_cutoff_v1() returns timestamptz language sql stable as $$select '2020-01-01'::timestamptz$$;
create function be_is_pre_golive_uat_key_v1(text) returns boolean language sql immutable as $$select false$$;
create view be_v_wayplan_command_center as select * from be_wayplan_dispatches;
update be_wayplan_dispatches set created_at=now(),updated_at=now(),wayplan_status='CREATED',metadata='{}';
insert into be_wayplan_membership_v40(wayplan_id,delivery_way_id,membership_status) values('MDY-PLAN','TO-MDY','PLANNED'),('YGN-PLAN','TO-YGN','PLANNED');`);
const dir=new URL('../supabase/migrations/',import.meta.url);
const migration=fs.readdirSync(dir).find(x=>x.endsWith('_mandalay_branch_controls.sql'));
await db.exec(migration?fs.readFileSync(new URL(migration,dir),'utf8'):fs.readFileSync(new URL('./mandalay-controls-core.sql',import.meta.url),'utf8'));
assert.equal((await db.query("select be_branch_scope_v1(null) b")).rows[0].b,'MDY');
assert.deepEqual((await db.query('select be_wayplan_supervisor_list_v62() r')).rows[0].r.wayplans.map(x=>x.wayplan_id),['MDY-PLAN']);
assert.equal((await db.query("select be_wayplan_supervisor_detail_v62('YGN-PLAN') r")).rows[0].r.wayplan.parcel_count,0);
assert.deepEqual((await db.query('select be_wayplan_command_center(100) r')).rows[0].r.wayplans.map(x=>x.wayplan_id),['MDY-PLAN']);
for(const name of ['be_generate_wayplan_v18_legacy','be_generate_wayplan_emergency_crew_v1']){
 await assert.rejects(db.query(`select ${name}($1::jsonb)`,[JSON.stringify({region_code:'MANDALAY',branch_code:'MDY',wayplan_id:'YGN-PLAN',delivery_way_ids:[]})]),/WAYPLAN_BRANCH_DENIED/);
}
await assert.rejects(db.query("select be_wayplan_supervisor_assign_crew_v68('YGN-PLAN','DRIVER',null,null)"),/WAYPLAN_BRANCH_DENIED/);
await assert.rejects(db.query("select be_wayplan_visible_queue_v124('YANGON',100)"),/BRANCH_SCOPE_DENIED/);

await assert.rejects(db.query("select be_branch_scope_v1('YGN')"),/BRANCH_SCOPE_DENIED/);
assert.equal((await db.query("select be_branch_wayplan_allowed_v1('MDY-PLAN') ok")).rows[0].ok,true);
assert.equal((await db.query("select be_branch_wayplan_allowed_v1('YGN-PLAN') ok")).rows[0].ok,false);
await db.exec("set test.uid=''");await assert.rejects(db.query("select be_branch_scope_v1('MDY')"),/AUTH_REQUIRED/);
await db.exec("set test.uid='11111111-1111-4111-8111-111111111111';update be_user_account_registry set active=false where branch_code='MDY'");
await assert.rejects(db.query("select be_branch_scope_v1('MDY')"),/ACCOUNT_INACTIVE/);
await db.exec("update be_user_account_registry set active=true;set test.role='superadmin'");
assert.equal((await db.query("select be_branch_scope_v1('YGN') b")).rows[0].b,'YGN');
assert.equal((await db.query("select be_branch_wayplan_allowed_v1('YGN-PLAN') ok")).rows[0].ok,true);
await db.exec("set test.role='branch_manager'");
const call=async p=>(await db.query('select be_branch_control_action_v1($1::jsonb) r',[JSON.stringify(p)])).rows[0].r;
let transfer=await call({action:'CREATE_TRANSFER',from_branch:'MDY',to_branch:'YGN',way_ids:['TO-YGN','TO-YGN-2'],carrier:'Britium linehaul',reference:'SEAL-1',reason:'Transfer to Yangon'});
assert.equal(transfer.status,'DISPATCHED');
await assert.rejects(call({action:'CREATE_TRANSFER',from_branch:'MDY',to_branch:'YGN',way_ids:['TO-YGN'],carrier:'DK',reference:'DUP',reason:'Duplicate'}),/PARCEL_ALREADY_IN_TRANSFER/);
await assert.rejects(call({action:'RECEIVE_TRANSFER',id:transfer.id,received_way_ids:['TO-YGN']}),/DESTINATION_BRANCH_REQUIRED/);
await db.exec("set test.uid='22222222-2222-4222-8222-222222222222';set test.role='branch_manager'");
let received=await call({action:'RECEIVE_TRANSFER',id:transfer.id,received_way_ids:['TO-YGN'],reason:'Partial receipt, one parcel missing'});assert.equal(received.status,'PARTIALLY_RECEIVED');
assert.equal((await call({action:'RECEIVE_TRANSFER',id:transfer.id,received_way_ids:['TO-YGN-2'],reason:'Missing parcel arrived'})).status,'RECEIVED');
assert.equal((await db.query("select count(*)::int n from be_data_entry_parcel_details")).rows[0].n,3,'transfer never duplicates parcel or settlement source');
await db.exec("set test.uid='11111111-1111-4111-8111-111111111111';set test.role='branch_manager'");
let doc=await call({action:'SUBMIT_RECORD',branch:'MDY',kind:'EXPENSE',title:'Office setup',amount:1000,reference:'INV-1',evidence:'Receipt INV-1',notes:'Desk purchase'});
await assert.rejects(call({action:'REVIEW_RECORD',id:doc.id,decision:'APPROVED',reason:'Approve'}),/HQ_REVIEW_REQUIRED/);
await db.exec("set test.role='superadmin'");await assert.rejects(call({action:'REVIEW_RECORD',id:doc.id,decision:'APPROVED',reason:'Approve'}),/SELF_APPROVAL_DENIED/);
await db.exec("set test.uid='22222222-2222-4222-8222-222222222222'");assert.equal((await call({action:'REVIEW_RECORD',id:doc.id,decision:'APPROVED',reason:'Receipt checked'})).status,'APPROVED');
assert.equal((await db.query("select amount from be_branch_control_records_v1 where id=$1",[doc.id])).rows[0].amount,'1000.00');
assert.ok((await db.query('select count(*)::int n from be_audit_events')).rows[0].n>=5);
console.log('PASS: full migration compiled; scoped operational RPCs, generator collision denial, destination manager receipt; Mandalay scope, Superadmin intervention, inactive denial, transfer custody, duplicates, partial receipts and separate financial review');
} finally { await db.close(); }
