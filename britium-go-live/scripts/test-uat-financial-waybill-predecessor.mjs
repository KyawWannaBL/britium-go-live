import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Execute the real Financial V2 wrapper and the unchanged historical patch.
// Only its external access service is isolated; unauthorised calls must stop
// before touching pickup or finance data.
const db=new PGlite();
try {
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table be_data_entry_financial_v2_requests_v58(request_id text,operation text,actor_id uuid,payload_hash text,status text,response jsonb,completed_at timestamptz);
 create table be_portal_pickup_requests(pickup_id text,pickup_verified_at timestamptz,pickup_collected_at timestamptz,pickup_status text,workflow_stage text,rider_app_stage text,assigned_rider_id uuid);
 create function be_data_entry_require_access_v57(text,boolean) returns jsonb language plpgsql as $$begin
 if coalesce(current_setting('test.authorized',true),'')<>'yes' then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 return '{"actor_user_id":"00000000-0000-4000-8000-000000000001","actor_email":"staff@example.test"}'::jsonb;end$$;
 create function be_data_entry_create_waybill_from_rows(text,jsonb,text) returns jsonb language plpgsql as $$declare v_pickup record;begin
 -- Canonical legacy gate was installed by V136, immediately before V136.1.
 -- v_pickup.pickup_status v_pickup.workflow_stage COLLECTED_PICKUP
 return '{}'::jsonb;end$$;`);
 const runtime=new URL('../sql/candidates/uat_financial_runtime_v58_rehearsal_only.sql',import.meta.url);
 if(fs.existsSync(runtime)){
  await db.exec(fs.readFileSync(runtime,'utf8'));
  await db.exec(`insert into be_data_entry_financial_v2_runtime_v58(singleton,mutation_mode,build,change_reason) values(true,'MUTATION_SHADOW','CI_TEST','Disposable regression')`);
 }
 const path=new URL('../sql/candidates/uat_financial_waybill_v136_1_predecessor_rehearsal_only.sql',import.meta.url);
 const fixture=fs.existsSync(path)?fs.readFileSync(path,'utf8'):'';
 if(fixture)await db.exec(fixture);
 const patch=fs.readFileSync(new URL('../supabase/migrations/20260925210905_field_team_waybill_gate_financial_v2_v136_1.sql',import.meta.url),'utf8');
 await db.exec(patch);
 const call=async(payload)=>(await db.query('select be_data_entry_financial_v2_create_waybill($1::jsonb) as result',[JSON.stringify(payload)])).rows[0].result;
 await assert.rejects(call({dry_run:true}),{code:'42501'});
 await db.exec(`set test.authorized='yes'`);
 assert.equal((await call({})).errors[0].code,'MUTATION_NOT_ACTIVE');
 assert.equal((await call({dry_run:true})).errors[0].code,'REQUEST_AND_PICKUP_REQUIRED');
 const payload={dry_run:true,request_id:'ci-request',pickup_id:'CI-PICKUP'};
 assert.equal((await call(payload)).errors[0].code,'PICKUP_NOT_FOUND');
 await db.exec(`insert into be_portal_pickup_requests(pickup_id,pickup_verified_at,pickup_collected_at,pickup_status) values('CI-PICKUP',now(),null,'PICKUP_COLLECTED')`);
 assert.equal((await call(payload)).errors[0].code,'FIELD_TEAM_COLLECTION_NOT_VERIFIED');
 await db.exec(`update be_portal_pickup_requests set pickup_collected_at=now(),pickup_status='PENDING'`);
 assert.equal((await call(payload)).errors[0].code,'FIELD_TEAM_COLLECTION_NOT_VERIFIED');
 await db.exec(`update be_portal_pickup_requests set assigned_rider_id='00000000-0000-4000-8000-000000000001'`);
 assert.equal((await call(payload)).errors[0].code,'SEGREGATION_OF_DUTIES');
 const privileges=(await db.query(`select has_function_privilege('anon','be_data_entry_financial_v2_create_waybill(jsonb)','EXECUTE') as anon,has_function_privilege('authenticated','be_data_entry_financial_v2_create_waybill(jsonb)','EXECUTE') as authenticated`)).rows[0];
 assert.deepEqual(privileges,{anon:false,authenticated:false});
 console.log('PASS: V136.1 applies; access, shadow mode, pickup, proof-state and duty checks remain enforced; client execute denied.');
} finally {await db.close();}
