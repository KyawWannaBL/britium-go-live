import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Real delivery RPC, real allocation validation and real queue trigger. Only the
// external proof-storage validator and success-event sink are controlled stubs;
// this does not exercise GPS/photo-storage policy inside the v77 proof system.
const db=new PGlite();
try {
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('email','worker@example.test')$$;
 create function be_current_role() returns text language sql as $$select current_setting('test.role',true)$$;
 create function be_current_field_team_identity() returns jsonb language sql as $$select jsonb_build_object(
 'worker_code',current_setting('test.worker',true),'display_name',current_setting('test.name',true),
 'role',current_setting('test.role',true),'email','worker@example.test')$$;
 create table proof_checks(delivery_way_id text);
 create function be_validate_rider_delivery_proof_v12_15(text,text,text,uuid,timestamptz) returns jsonb language plpgsql as $$begin
 insert into proof_checks values($2);return jsonb_build_object('ok',true,'fixture',true);end$$;
 create table success_events(delivery_way_id text,actor text,operation_id text);
 create function be_record_delivery_success_v39(text,text,text) returns jsonb language plpgsql as $$begin
 insert into success_events values($1,$2,$3);return '{"ok":true}'::jsonb;end$$;
 create table audit_logs(id serial primary key,action text,table_name text,actor_uid uuid,actor_email text,actor_role text,entity_type text,entity_id text,before_data jsonb,after_data jsonb,metadata jsonb);
 create table be_wayplan_dispatches(wayplan_id text primary key,wayplan_status text,rider_code text,rider_name text,driver_code text,driver_name text,helper_code text,helper_name text,vehicle_code text,vehicle_name text);
 create table be_wayplan_dispatch_stops(wayplan_id text,delivery_way_id text,waybill_no text,pickup_id text,
 rider_code text,stop_status text,rider_status text,dispatch_status text,cod_amount numeric,cod_collected numeric,delivery_fee numeric,
 delivered_at timestamptz,updated_at timestamptz,metadata jsonb,receiver_name text,recipient_name text,receiver_phone text,recipient_phone text,
 rider_proof_url text,proof_url text,receiver_signature_url text,failed_reason text,unique(wayplan_id,delivery_way_id));
 create table be_wayplan_membership_v40(wayplan_id text,delivery_way_id text,pickup_id text,rider_code text,driver_code text,helper_code text,updated_at timestamptz,membership_status text,metadata jsonb);
 create table be_data_entry_parcel_details(delivery_way_id text,pickup_id text,actual_collect numeric,cod_amount numeric,updated_at timestamptz,saved_at timestamptz,parcel_status text);
 create table be_dispatch_scans_v39(delivery_way_id text,scan_status text);
 create table be_waybill_ledger(delivery_way_id text,tracking_no text,dispatch_status text,wayplan_status text,rider_status text,updated_at timestamptz,metadata jsonb,delivered_at timestamptz,cod_collected numeric,rider_proof_url text,failed_reason text);
 create table be_wayplan_cod_settlements(id uuid primary key default gen_random_uuid(),wayplan_id text,delivery_way_id text,waybill_no text,pickup_id text,
 rider_code text,rider_name text,recipient_name text,recipient_phone text,cod_expected numeric,cod_collected numeric,delivery_fee numeric,
 settlement_status text,settlement_reference text,settled_at timestamptz,delivered_at timestamptz,metadata jsonb,created_at timestamptz,updated_at timestamptz,unique(wayplan_id,delivery_way_id));
 create table be_finance_cod_settlements_v48(wayplan_id text,delivery_way_id text,settlement_status text,expected_cod numeric,reported_collected numeric,rider_remittance numeric,settled_amount numeric,settlement_reference text,settled_by text,settled_at timestamptz,metadata jsonb,updated_at timestamptz);
 insert into be_wayplan_dispatches values('WP','RELEASED','RDR001','Rider One','DRV001','Driver One','HLP001','Helper One','VAN01','Van One');`);
 const file=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_split_collection_payments_v215.sql'));
 assert.ok(file,'real split collection migration required');
 await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 await db.exec(`create trigger sync_cod after insert or update on be_wayplan_dispatch_stops for each row execute function be_sync_wayplan_cod_settlement();`);
 async function seed(id){
  await db.query(`insert into be_wayplan_dispatch_stops(wayplan_id,delivery_way_id,pickup_id,stop_status,rider_status,dispatch_status,cod_amount,delivery_fee,updated_at,metadata)
   values('WP',$1,'PARENT','OUT_FOR_DELIVERY','OUT_FOR_DELIVERY','OUT_FOR_DELIVERY',100,0,now(),jsonb_build_object('delivery_started_at',now()))`,[id]);
  await db.query(`insert into be_wayplan_membership_v40 values('WP',$1,'PARENT','RDR001','DRV001','HLP001',now(),'ACTIVE','{}')`,[id]);
  await db.query(`insert into be_data_entry_parcel_details values($1,'PARENT',100,100,now(),now(),'OUT_FOR_DELIVERY')`,[id]);
  await db.query(`insert into be_dispatch_scans_v39 values($1,'SCANNED')`,[id]);
  await db.query(`insert into be_waybill_ledger(delivery_way_id,tracking_no,metadata) values($1,$1,'{}')`,[id]);
 }
 const split=[{method:'CASH',amount:30},{method:'KBZ_PAY',amount:70,reference:'KBZ-70'}];
 let n=0;
 function payload(id,extra={}){return{action:'deliver',delivery_way_id:id,recipient_name:'Recipient',recipient_phone:'099999999',proof_url:'https://proof.invalid/photo.jpg',signature_url:'https://proof.invalid/signature.png',cod_collected_amount:100,payment_method:'MIXED',payment_allocations:split,operation_id:`delivery-${++n}`,reported_collected_by_code:'SPOOFED',...extra};}
 async function call(p){return(await db.query('select be_field_team_delivery_action($1::jsonb) data',[JSON.stringify(p)])).rows[0].data;}
 async function stop(id){return(await db.query('select * from be_wayplan_dispatch_stops where delivery_way_id=$1',[id])).rows[0];}
 async function count(table){return Number((await db.query(`select count(*) n from ${table}`)).rows[0].n);}
 async function identity(role,worker,name){await db.query(`select set_config('test.role',$1,false),set_config('test.worker',$2,false),set_config('test.name',$3,false)`,[role,worker,name]);}
 await seed('D1026-TEST-001');await seed('D1026-TEST-002');await seed('D1026-TEST-003');
 assert.equal((await call(payload('D1026-TEST-001'))).error,'AUTHENTICATED_FIELD_SESSION_REQUIRED');
 await db.exec(`set test.uid='00000000-0000-0000-0000-000000000001'`);
 await identity('driver','WRONG','Wrong Driver');
 await assert.rejects(call(payload('D1026-TEST-001')),error=>error.code==='42501'&&/NOT_ASSIGNED/.test(error.message));
 await identity('helper','HLP001','Helper One');
 assert.equal((await call(payload('D1026-TEST-001'))).error,'PRIMARY_WORKER_REQUIRED');
 assert.equal(await count('be_wayplan_cod_settlements'),0);
 assert.equal(await count('success_events'),0);

 await identity('driver','DRV001','Driver One');
 for(const allocations of [[{method:'CASH',amount:99}],[{method:'CASH',amount:-1},{method:'CASH',amount:101}],[{method:'KBZ_PAY',amount:100}]]) {
  await assert.rejects(call(payload('D1026-TEST-003',{payment_allocations:allocations})),error=>error.code==='22023');
  assert.equal((await stop('D1026-TEST-003')).stop_status,'OUT_FOR_DELIVERY','invalid split rolls back delivery state');
  assert.equal(await count('be_wayplan_cod_settlements'),0,'invalid split cannot create Finance queue evidence');
  assert.equal(await count('success_events'),0);
  assert.equal(await count('audit_logs'),0);
 }
 const driverRequest=payload('D1026-TEST-001');
 assert.equal((await call(driverRequest)).ok,true);
 let delivered=await stop('D1026-TEST-001');
 assert.equal(delivered.stop_status,'DELIVERED');assert.equal(Number(delivered.cod_collected),100);
 assert.deepEqual(delivered.metadata.payment_allocations.map(x=>[x.method,Number(x.amount)]),[['CASH',30],['KBZ_PAY',70]]);
 assert.equal(delivered.metadata.reported_collected_by_code,'DRV001','collector comes from signed-in identity');
 const queue=(await db.query(`select * from be_wayplan_cod_settlements where delivery_way_id='D1026-TEST-001'`)).rows[0];
 assert.equal(queue.settlement_status,'PENDING_SETTLEMENT','field evidence does not confirm Finance settlement');
 assert.equal(queue.settled_at,null);assert.equal(Number(queue.cod_collected),100);
 assert.equal(queue.metadata.reported_collected_by_code,'DRV001');
 assert.equal(queue.metadata.reported_collected_by_name,'Driver One');
 assert.deepEqual(queue.metadata.reported_payment_allocations,delivered.metadata.payment_allocations);
 assert.equal(queue.metadata.payment_allocations,undefined,'reported evidence remains separate from Finance confirmation');
 assert.equal((await call(driverRequest)).already_applied,true);
 assert.equal((await call(payload('D1026-TEST-001',{payment_allocations:[{method:'CASH',amount:100}]}))).already_applied,true);
 assert.equal(await count('be_wayplan_cod_settlements'),1);assert.equal(await count('success_events'),1);assert.equal(await count('audit_logs'),1);
 assert.deepEqual((await stop('D1026-TEST-001')).metadata.payment_allocations,delivered.metadata.payment_allocations,'retry cannot replace the original receipt');
 assert.equal(await count('proof_checks'),1,'already delivered retries do not repeat external proof validation');

 await identity('rider','RDR001','Rider One');
 assert.equal((await call(payload('D1026-TEST-002'))).ok,true);
 assert.equal((await stop('D1026-TEST-002')).metadata.reported_collected_by_code,'RDR001');
 assert.equal(await count('be_wayplan_cod_settlements'),2);assert.equal(await count('success_events'),2);assert.equal(await count('audit_logs'),2);
 await identity('finance','FIN001','Finance');
 const totals=(await db.query(`select be_finance_collection_totals_v215(null,null,'VAN') data`)).rows[0].data;
 assert.equal(totals.ok,true);assert.equal(totals.rows.length,1);
 assert.equal(Number(totals.rows[0].total_collected),200);assert.equal(Number(totals.rows[0].cash_collected),60);assert.equal(Number(totals.rows[0].digital_collected),140);
 assert.equal(Number(totals.rows[0].pending_total),200);assert.equal(Number(totals.rows[0].confirmed_total),0);assert.equal(Number(totals.rows[0].waybill_count),2);
 console.log('PASS real delivery+sync: assigned driver/rider split receipts, signed collector, pending Finance queue, invalid rollback, role denial, retries and van totals');
} finally {await db.close();}
