import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Execute the real migrations against PostgreSQL, without network or production data.
const db=new PGlite();
try {
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select '{"email":"finance@example.test"}'::jsonb$$;
 create function be_current_role() returns text language sql as $$select current_setting('test.role',true)$$;
 create table be_wayplan_cod_settlements(id uuid primary key default gen_random_uuid(),wayplan_id text,delivery_way_id text,cod_expected numeric,cod_collected numeric,settlement_status text,settlement_reference text,settled_at timestamptz,metadata jsonb,updated_at timestamptz);
 create table be_finance_cod_settlements_v48(wayplan_id text,delivery_way_id text,settlement_status text,expected_cod numeric,reported_collected numeric,rider_remittance numeric,settled_amount numeric,settlement_reference text,settled_by text,settled_at timestamptz,metadata jsonb,updated_at timestamptz);
 create table audit_logs(id serial primary key,action text,table_name text,actor_uid uuid,actor_email text,actor_role text,entity_type text,entity_id text,before_data jsonb,after_data jsonb,metadata jsonb);
 create table be_wayplan_dispatches(wayplan_id text,driver_code text,driver_name text,helper_code text,helper_name text);
 alter table be_wayplan_cod_settlements add column delivered_at timestamptz,add column created_at timestamptz default now(),
 add column waybill_no text,add column pickup_id text,add column rider_code text,add column rider_name text,
 add column recipient_name text,add column recipient_phone text,add column delivery_fee numeric,
 add constraint be_cod_unique_delivery unique(wayplan_id,delivery_way_id);
 alter table be_wayplan_dispatches add column rider_code text,add column rider_name text,add column vehicle_code text,add column vehicle_name text,add column service_date date;
 alter table be_finance_cod_settlements_v48 add column settlement_receiver text,add column settlement_note text,add column hold_code text,add column hold_note text,add column held_by text,add column held_at timestamptz;
 insert into be_wayplan_dispatches values('WP','DRV001','Driver A','HLP001','Helper A','RDR001','Rider A','VAN01','Van One','2026-10-20');
 insert into be_wayplan_cod_settlements(id,wayplan_id,delivery_way_id,cod_expected,cod_collected,settlement_status,metadata,updated_at,delivered_at,rider_code,rider_name)
 values('00000000-0000-0000-0000-000000000010','WP','WAY',100,100,'PENDING_SETTLEMENT',
 '{"source_business_date":"2026-10-20","reported_collected_by_code":"RDR001","reported_collected_by_name":"Rider A","reported_payment_allocations":[{"method":"CASH","amount":100}]}',clock_timestamp(),'2026-10-20 12:00:00+00','RDR001','Rider A');
 insert into be_finance_cod_settlements_v48(wayplan_id,delivery_way_id,settlement_status,metadata) values('WP','WAY','PENDING','{}');`);
 for(const suffix of ['_finance_cod_review_actions_v213.sql','_finance_named_payment_types_v214.sql']) {
  const file=fs.readdirSync('supabase/migrations').find(f=>f.endsWith(suffix));
  assert.ok(file,`missing prerequisite ${suffix}`);
  await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 }
 const file=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_split_collection_payments_v215.sql'));
 if(file)await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 else await db.exec(`create function be_validate_collection_allocations_v215(jsonb,numeric) returns jsonb language sql as $$select '{"error":"NOT_IMPLEMENTED"}'::jsonb$$;`);
 const split=[{method:'CASH',amount:30},{method:'KBZ_PAY',amount:70,reference:'KBZ-70'}];
 async function validate(lines,total){return(await db.query('select be_validate_collection_allocations_v215($1::jsonb,$2::numeric) data',[lines===null?null:JSON.stringify(lines),total])).rows[0].data;}
 assert.equal(await validate(null,100),null,'SQL NULL preserves legacy scalar collection');
 let normalized=await validate(split,100);
 assert.ok(Array.isArray(normalized),'split allocation helper is implemented');
 assert.deepEqual(normalized.map(x=>[x.method,Number(x.amount)]),[['CASH',30],['KBZ_PAY',70]]);
 assert.equal(normalized[1].reference,'KBZ-70');
 assert.deepEqual(await validate([],0),[],'zero collection has no positive allocation lines');
 normalized=await validate([{method:'cash',amount:'0.10'},{method:'KBZPAY',amount:'0.20',reference:' R '}],'.30');
 assert.deepEqual(normalized.map(x=>x.method),['CASH','KBZ_PAY']);
 assert.equal(normalized[1].reference,'R');
 assert.equal((await validate([{method:'WAVEPAY',amount:1,reference:'W'}],1))[0].method,'WAVE_PAY');
 for(const method of ['AYA_PAY','CB_PAY','BANK_TRANSFER','MOBILE_WALLET','QR']) {
  assert.equal((await validate([{method,amount:1,reference:'X'}],1))[0].method,method);
 }
 for(const [lines,total] of [
  [split,99],[[{method:'CASH',amount:-1}],-1],[[{method:'CASH',amount:0}],0],
  [[{method:'UNKNOWN',amount:1}],1],[[{method:'KBZ_PAY',amount:1}],1],
  [[{method:'CASH',amount:'1.001'}],1.001],[[{method:'CASH',amount:'NaN'}],1],
  [{method:'CASH',amount:1},1],['not an array',1],[[],1],
  [Array.from({length:21},()=>({method:'CASH',amount:1})),21],
 ])await assert.rejects(validate(lines,total),undefined,`reject invalid allocation ${JSON.stringify(lines)}`);
 console.log('PASS split allocation validation: methods, aliases, exact cents, limits and invalid inputs');

 let n=100;
 async function row(){return(await db.query(`select * from be_wayplan_cod_settlements where delivery_way_id='WAY'`)).rows[0];}
 async function payload(extra={}){return{action:'CONFIRM',row_id:(await row()).id,expected_updated_at:(await row()).updated_at.toISOString(),operation_id:`00000000-0000-0000-0000-${String(++n).padStart(12,'0')}`,actual_collected:100,payment_method:'MIXED',reference:'RECEIPT-100',payment_allocations:split,...extra};}
 async function call(p){return(await db.query('select be_finance_cod_review_action_v213($1::jsonb) data',[JSON.stringify(p)])).rows[0].data;}
 async function totals(group='PERSON',from='2026-10-20',to='2026-10-20'){return(await db.query('select be_finance_collection_totals_v215($1::date,$2::date,$3::text) data',[from,to,group])).rows[0].data;}
 assert.equal((await call(await payload())).error,'AUTH_REQUIRED');
 await db.exec(`set test.uid='00000000-0000-0000-0000-000000000001';set test.role='rider'`);
 assert.equal((await call(await payload())).error,'FINANCE_REQUIRED');
 assert.equal((await totals()).error,'FINANCE_REQUIRED');
 await db.exec(`set test.role='finance'`);
 // Rejected allocations must not partially settle or create audit records.
 for(const bad of [[{method:'CASH',amount:99}],[{method:'CASH',amount:-1}],[{method:'KBZ_PAY',amount:100}]]) {
  try {
   assert.equal((await call(await payload({payment_allocations:bad}))).ok,false);
  } catch(error) {
   assert.equal(error.code,'22023','invalid allocation raises a PostgreSQL validation error');
  }
  assert.equal((await row()).settlement_status,'PENDING_SETTLEMENT');
 }
 assert.equal(Number((await db.query('select count(*) n from audit_logs')).rows[0].n),0);
 await db.exec(`update be_finance_cod_settlements_v48 set settlement_status='HOLD_EXCEPTION'`);
 assert.equal((await call(await payload())).error,'FIELD_EXCEPTION_HOLD');
 await db.exec(`update be_finance_cod_settlements_v48 set settlement_status='PENDING'`);
 const stale=await payload();
 await db.exec(`update be_wayplan_cod_settlements set updated_at=updated_at+interval '1 second' where delivery_way_id='WAY'`);
 assert.equal((await call(stale)).error,'STALE_REVIEW');
 // Decimal and zero collection confirmations use the same real Finance path.
 for(const [amount,allocations] of [[0.30,[{method:'CASH',amount:0.10},{method:'KBZ_PAY',amount:0.20,reference:'CENT-20'}]],[0,[]]]) {
  await db.exec('begin');
  await db.query(`update be_wayplan_cod_settlements set cod_expected=$1 where delivery_way_id='WAY'`,[amount]);
  const result=await call(await payload({actual_collected:amount,payment_allocations:allocations}));
  assert.equal(result.ok,true,`Finance accepts exact decimal total ${amount}`);
  assert.equal(Number((await row()).cod_collected),amount);
  await db.exec('rollback');
 }
 const confirm=await payload();
 assert.equal((await call(confirm)).ok,true);
 assert.equal((await call(confirm)).idempotent,true,'double click replays without mutation');
 assert.equal((await call({...confirm,payment_allocations:[{method:'CASH',amount:100}]})).error,'OPERATION_REUSED');
 const settled=await row();
 assert.equal(settled.settlement_status,'SETTLED');
 assert.equal(Number(settled.cod_collected),100);
 assert.deepEqual(settled.metadata.reported_payment_allocations,[{method:'CASH',amount:100}],'reported evidence remains distinct from Finance confirmation');
 assert.deepEqual(settled.metadata.payment_allocations.map(x=>[x.method,Number(x.amount)]),[['CASH',30],['KBZ_PAY',70]]);
 assert.equal(settled.metadata.settled_by,'finance@example.test');
 const audit=(await db.query('select * from audit_logs')).rows;
 assert.equal(audit.length,1,'one audit for duplicate confirm');
 assert.deepEqual(audit[0].metadata.request_payload.payment_allocations,split);
 assert.deepEqual(audit[0].before_data.metadata.reported_payment_allocations,[{method:'CASH',amount:100}]);
 assert.deepEqual(audit[0].after_data.metadata.payment_allocations,settled.metadata.payment_allocations);
 const downstream=(await db.query('select * from be_finance_cod_settlements_v48')).rows[0];
 assert.equal(Number(downstream.settled_amount),100);
 assert.deepEqual(downstream.metadata.payment_allocations,settled.metadata.payment_allocations);
 assert.equal((await call(await payload({action:'ADJUST',adjustment_mmk:1,reason:'late'}))).error,'SETTLEMENT_LOCKED');
 console.log('PASS split Finance confirmation: authorization, holds, stale edits, atomic validation, audit and replay safety');

 // Two people collect for one van; each parcel contributes once to either grouping.
 await db.exec(`insert into be_wayplan_cod_settlements(wayplan_id,delivery_way_id,cod_expected,cod_collected,settlement_status,metadata,updated_at,delivered_at,rider_code,rider_name) values
 ('WP','WAY-HELPER',50,50,'PENDING_SETTLEMENT','{"source_business_date":"2026-10-20","reported_collected_by_code":"HLP001","reported_collected_by_name":"Helper A","reported_payment_allocations":[{"method":"CASH","amount":20},{"method":"WAVE_PAY","amount":30,"reference":"W30"}]}',now(),'2026-10-20 13:00+00','RDR001','Rider A'),
 ('WP','WAY-LEGACY',10,10,'PENDING_SETTLEMENT','{"source_business_date":"2026-10-20","payment_method":"CASH"}',now(),'2026-10-20 14:00+00','RDR001','Rider A'),
 ('WP','WAY-UNKNOWN',5,5,'PENDING_SETTLEMENT','{"source_business_date":"2026-10-20"}',now(),'2026-10-20 15:00+00','RDR001','Rider A'),
 ('WP','WAY-OTHER-DATE',7,7,'PENDING_SETTLEMENT','{"source_business_date":"2026-10-21","payment_method":"CASH"}',now(),'2026-10-21 12:00+00','RDR001','Rider A');`);
 const person=await totals();assert.equal(person.ok,true);
 assert.equal(person.rows.length,2);
 const rider=person.rows.find(x=>x.collector_code==='RDR001');
 const helper=person.rows.find(x=>x.collector_code==='HLP001');
 assert.ok(rider);assert.ok(helper);
 assert.equal(Number(rider.waybill_count),3);
 assert.equal(Number(rider.total_collected),115);
 assert.equal(Number(rider.cash_collected),40,'confirmed allocations take precedence over reported cash100');
 assert.equal(Number(rider.digital_collected),70);
 assert.equal(Number(rider.unclassified_collected),5,'unknown historical method remains visible');
 assert.equal(Number(rider.confirmed_total),100);assert.equal(Number(rider.pending_total),15);
 assert.equal(Number(rider.by_method.KBZ_PAY),70);
 assert.equal(Number(helper.total_collected),50);assert.equal(Number(helper.cash_collected),20);assert.equal(Number(helper.digital_collected),30);
 const van=await totals('VAN');assert.equal(van.ok,true);assert.equal(van.rows.length,1);
 const v=van.rows[0];assert.equal(v.vehicle_code,'VAN01');assert.equal(Number(v.waybill_count),4);
 assert.equal(Number(v.total_collected),165,'shared van is counted once per parcel, not once per crew member');
 assert.equal(Number(v.cash_collected),60);assert.equal(Number(v.digital_collected),100);assert.equal(Number(v.unclassified_collected),5);
 assert.equal(Number(v.confirmed_total),100);assert.equal(Number(v.pending_total),65);
 assert.equal(Number(v.by_method.CASH),60);assert.equal(Number(v.by_method.KBZ_PAY),70);assert.equal(Number(v.by_method.WAVE_PAY),30);
 assert.deepEqual((await totals('PERSON','2026-10-19','2026-10-19')).rows,[]);
 const next=(await totals('PERSON','2026-10-21','2026-10-21')).rows;assert.equal(next.length,1);assert.equal(Number(next[0].total_collected),7);
 assert.equal((await totals('PERSON',null,null)).rows.reduce((sum,x)=>sum+Number(x.total_collected),0),172);
 assert.equal(Number((await db.query('select count(*) n from audit_logs')).rows[0].n),1,'totals are read-only');
 console.log('PASS collection totals: confirmed precedence, historical fallback, per-person and shared-van grouping, dates and no double counting');
 // A later operational sync must preserve confirmed allocations and the original collector.
 await db.exec(`create table be_wayplan_dispatch_stops(
  wayplan_id text,delivery_way_id text,waybill_no text,pickup_id text,receiver_name text,recipient_name text,
  receiver_phone text,recipient_phone text,cod_amount numeric,cod_collected numeric,delivery_fee numeric,
  stop_status text,delivered_at timestamptz,rider_status text,rider_proof_url text,metadata jsonb);
  create trigger sync_cod after insert or update on be_wayplan_dispatch_stops
  for each row execute function be_sync_wayplan_cod_settlement();
  insert into be_wayplan_dispatch_stops(wayplan_id,delivery_way_id,cod_amount,cod_collected,delivery_fee,stop_status,delivered_at,rider_status,rider_proof_url,metadata)
  values('WP','WAY',999,999,10,'DELIVERED','2026-10-22 12:00+00','DELIVERED','new-proof',
  '{"reported_collected_by_code":"DIFFERENT","reported_collected_by_name":"Different Worker","reported_payment_allocations":[{"method":"CASH","amount":999}]}');`);
 const afterSync=await row();
 assert.equal(Number(afterSync.cod_expected),100);assert.equal(Number(afterSync.cod_collected),100);
 assert.equal(afterSync.settlement_status,'SETTLED');
 assert.equal(afterSync.delivered_at.toISOString(),settled.delivered_at.toISOString(),'reviewed service date cannot move when operational delivery timestamp changes');
 assert.deepEqual(afterSync.metadata.payment_allocations,settled.metadata.payment_allocations);
 assert.equal(afterSync.metadata.reported_collected_by_code,'RDR001');
 assert.equal(afterSync.metadata.reported_collected_by_name,'Rider A');
 assert.deepEqual(afterSync.metadata.reported_payment_allocations,settled.metadata.reported_payment_allocations);
 await db.exec(`update be_wayplan_dispatch_stops set metadata='{}' where delivery_way_id='WAY'`);
 assert.equal((await row()).metadata.reported_collected_by_code,'RDR001','missing source attribution cannot clear historical collector');
 assert.equal((await row()).metadata.reported_collected_by_name,'Rider A');
 const personAfterSync=(await totals()).rows.find(x=>x.collector_code==='RDR001');
 assert.equal(Number(personAfterSync.total_collected),115);
 assert.equal((await totals()).rows.some(x=>x.collector_code==='DIFFERENT'),false);
 assert.equal(Number((await totals('VAN')).rows[0].total_collected),165);
 console.log('PASS operational sync preserves confirmed split amounts and collector attribution');
}finally{await db.close();}
