import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
try {
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select '{"email":"finance@example.test"}'::jsonb$$;
 create function be_current_role() returns text language sql as $$select current_setting('test.role',true)$$;
 create table be_wayplan_cod_settlements(id uuid primary key,wayplan_id text,delivery_way_id text,cod_expected numeric,cod_collected numeric,settlement_status text,settlement_reference text,settled_at timestamptz,metadata jsonb,updated_at timestamptz);
 create table be_finance_cod_settlements_v48(wayplan_id text,delivery_way_id text,settlement_status text,expected_cod numeric,reported_collected numeric,rider_remittance numeric,settled_amount numeric,settlement_reference text,settled_by text,settled_at timestamptz,metadata jsonb,updated_at timestamptz);
 create table audit_logs(id serial primary key,action text,table_name text,actor_uid uuid,actor_email text,actor_role text,entity_type text,entity_id text,before_data jsonb,after_data jsonb,metadata jsonb);
 create table be_wayplan_dispatches(wayplan_id text,driver_code text,driver_name text,helper_code text,helper_name text);
 insert into be_wayplan_cod_settlements values('00000000-0000-0000-0000-000000000010','WP','WAY',100,null,'PENDING_SETTLEMENT',null,null,'{"driver_name":"Driver A","helper_name":"Helper A"}',now());
 insert into be_finance_cod_settlements_v48(wayplan_id,delivery_way_id,settlement_status,metadata) values('WP','WAY','PENDING','{}');
 alter table be_wayplan_cod_settlements add column delivered_at timestamptz,add column created_at timestamptz default now();
 insert into be_wayplan_dispatches values('WP','DRV001','Current driver','HLP001','Current helper');`);
 const file=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_finance_cod_review_actions_v213.sql'));
 if(file)await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 else await db.exec(`create function be_finance_cod_review_action_v213(jsonb) returns jsonb language sql as $$select '{"ok":false,"error":"NOT_IMPLEMENTED"}'::jsonb$$;`);
 const types=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_finance_named_payment_types_v214.sql'));
 if(types)await db.exec(fs.readFileSync('supabase/migrations/'+types,'utf8'));
 let n=0;async function row(){return(await db.query('select * from be_wayplan_cod_settlements')).rows[0];}
 async function payload(action,extra={}){return{action,row_id:(await row()).id,expected_updated_at:(await row()).updated_at.toISOString(),operation_id:`00000000-0000-0000-0000-${String(++n).padStart(12,'0')}`,...extra};}
 async function call(p){return(await db.query('select be_finance_cod_review_action_v213($1::jsonb) data',[JSON.stringify(p)])).rows[0].data;}
 assert.equal((await call(await payload('REJECT',{reason:'x'}))).error,'AUTH_REQUIRED');
 await db.exec(`set test.uid='00000000-0000-0000-0000-000000000001';set test.role='rider'`);
 assert.equal((await call(await payload('REJECT',{reason:'x'}))).error,'FINANCE_REQUIRED');
 await db.exec(`set test.role='finance'`);
 for(const action of ['REJECT','ADJUST'])assert.equal((await call(await payload(action,{adjustment_mmk:-10}))).error,'REASON_REQUIRED');
 assert.equal((await call(await payload('CONFIRM',{reference:'R',payment_method:'CASH'}))).error,'COLLECTION_REQUIRED');
 assert.equal((await call(await payload('ADJUST',{adjustment_mmk:'NaN',reason:'bad'}))).error,'INVALID_AMOUNT');
 assert.equal((await call(await payload('ADJUST',{adjustment_mmk:-101,reason:'bad'}))).error,'NEGATIVE_EXPECTED_AMOUNT');
 assert.equal((await call(await payload('CONFIRM',{actual_collected:90,reference:'R',payment_method:'CASH'}))).error,'AMOUNT_MISMATCH');
 const stale=await payload('REJECT',{reason:'old screen'});
 assert.equal((await call(await payload('ADJUST',{adjustment_mmk:-10,reason:'Agreed correction'}))).ok,true);
 assert.equal(Number((await row()).cod_expected),90);assert.equal(Number((await row()).metadata.original_expected_collection),100);
 assert.equal((await call(stale)).error,'STALE_REVIEW');
 assert.equal((await call(await payload('REJECT',{reason:'Receipt needs correction'}))).ok,true);
 assert.equal((await row()).settlement_status,'REJECTED');
 assert.equal((await db.query(`select be_finance_settle_wayplan_cod('{"delivery_way_id":"WAY"}') data`)).rows[0].data.error,'REVIEW_REJECTED','legacy settlement cannot bypass rejection');
 assert.equal((await call(await payload('CONFIRM',{actual_collected:90,reference:'R',payment_method:'CASH'}))).error,'REVIEW_REJECTED');
 assert.equal((await call(await payload('ADJUST',{adjustment_mmk:10,reason:'Corrected supporting record'}))).ok,true);
 assert.equal((await row()).settlement_status,'PENDING_SETTLEMENT');
 await db.exec(`update be_finance_cod_settlements_v48 set settlement_status='HOLD_EXCEPTION'`);
 assert.equal((await call(await payload('CONFIRM',{actual_collected:100,reference:'R',payment_method:'CASH'}))).error,'FIELD_EXCEPTION_HOLD');
 await db.exec(`update be_finance_cod_settlements_v48 set settlement_status='PENDING'`);
 assert.equal((await call(await payload('CONFIRM',{actual_collected:100,reference:'R',payment_method:'UNSUPPORTED'}))).error,'PAYMENT_METHOD_REQUIRED');
 for(const method of ['KBZ_PAY','WAVE_PAY','AYA_PAY','CB_PAY']){
  const p=await payload('CONFIRM',{actual_collected:100,reference:'TYPE-CHECK',payment_method:method});
  await db.exec('begin');assert.equal((await call(p)).ok,true,method+' must persist through Finance confirmation');
  assert.equal((await row()).metadata.payment_method,method);await db.exec('rollback');
 }
 const confirm=await payload('CONFIRM',{actual_collected:100,reference:'RCPT-100',payment_method:'CASH',actor:'spoofed'});
 assert.equal((await call(confirm)).ok,true);assert.equal((await row()).settlement_status,'SETTLED');
 assert.equal((await call(confirm)).idempotent,true);
 assert.equal((await call({...confirm,actual_collected:101})).error,'OPERATION_REUSED');
 assert.equal((await call(await payload('ADJUST',{adjustment_mmk:1,reason:'late'}))).error,'SETTLEMENT_LOCKED');
 assert.equal((await db.query('select count(*) n from audit_logs')).rows[0].n,4);
 assert.equal((await row()).metadata.settled_by,'finance@example.test');
 const downstream=(await db.query('select * from be_finance_cod_settlements_v48')).rows[0];
 assert.equal(Number(downstream.settled_amount),100);assert.equal(downstream.settlement_status,'SETTLED');
 assert.equal((await row()).metadata.driver_name,'Driver A');
 const crew=(await db.query('select be_finance_wayplan_cod_center(200) data')).rows[0].data.rows[0];
 assert.equal(crew.driver_name,'Driver A','historical crew snapshot wins over later header edit');
 assert.equal(crew.driver_code,'DRV001','missing crew code falls back to the matching wayplan');
 assert.equal(crew.helper_name,'Helper A');
 await db.exec('set role authenticated');
 await assert.rejects(db.exec("update be_wayplan_cod_settlements set cod_expected=1"),/permission denied/,'direct writes cannot bypass review');
 await db.exec('reset role');
 console.log('PASS COD review actions: roles, reasons, amounts, adjustment history, rejection/reopen, stale edits, holds, confirmation, replay safety, audit and locked settlements');
}finally{await db.close();}
