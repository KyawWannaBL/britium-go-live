import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
// Exercise the real revision function. Context, generation and route-history adapters
// are reduced disposable fixtures, not substitutes for the production end-to-end gate.
const db=new PGlite();
const actor='00000000-0000-4000-8000-000000000001';
const request='00000000-0000-4000-8000-000000000002';
const context={vehicles:[{id:'VAN1',name:'Van',operation_type:'DELIVERY',branch_code:'YGN',capacity_kg:100}],drivers:[{id:'D1',branch_code:'YGN'}],riders:[{id:'R1',branch_code:'YGN'}],helpers:[{id:'H1',branch_code:'YGN'}],busy:[],route_origins:{YANGON:{latitude:16.84,longitude:96.17}}};
const payload=()=>({source_wayplan_id:'SOURCE',request_id:request,region_code:'YANGON',approve_below_minimum:true,below_minimum_reason:'Approved low volume',plan:{vehicle_code:'VAN1',driver_code:'D1',helper_code:'H1',delivery_way_ids:['TEST-2','TEST-1'],route:{source:'MAPBOX_FALLBACK',estimated:false}}});
try{
await db.exec(`CREATE SCHEMA auth; CREATE ROLE authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '${actor}'::uuid$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT '{"email":"operator@test.invalid"}'::jsonb$$;
CREATE FUNCTION public.be_current_user_role() RETURNS text LANGUAGE sql AS $$SELECT 'dispatch'::text$$;
CREATE TABLE public.be_wayplan_dispatches(wayplan_id text PRIMARY KEY,wayplan_status text,dispatched_at timestamptz,loaded_to_vehicle_at timestamptz,handed_over_to_rider_at timestamptz,branch_code text,vehicle_code text,vehicle_name text,driver_code text,driver_name text,rider_code text,rider_name text,helper_code text,helper_name text,metadata jsonb,updated_at timestamptz);
CREATE TABLE public.be_audit_events(actor_id uuid,actor_email text,actor_role text,action text,resource_type text,resource_id text,details jsonb);
CREATE TABLE public.be_wayplan_membership_v40(wayplan_id text,delivery_way_id text,membership_status text,vehicle_code text,vehicle_name text,driver_code text,driver_name text,rider_code text,rider_name text,helper_code text,helper_name text,updated_at timestamptz,metadata jsonb);
CREATE TABLE public.be_waybill_ledger(delivery_way_id text PRIMARY KEY,wayplan_id text,wayplan_status text,dispatch_status text,metadata jsonb,updated_at timestamptz);
CREATE TABLE public.be_wayplan_dispatch_stops(wayplan_id text,delivery_way_id text,stop_sequence int,optimized_sequence int,delivery_sequence int,rider_code text,rider_name text,waybill_no text,recipient_name text,recipient_phone text,address text,township text,stop_status text,dispatch_status text,metadata jsonb,updated_at timestamptz,UNIQUE(wayplan_id,stop_sequence));
CREATE TABLE public.be_data_entry_parcel_details(delivery_way_id text,delivery_region text,delivery_route_mode text,weight_kg numeric);
CREATE TABLE public.be_delivery_location_registry(delivery_way_id text,latitude numeric,longitude numeric);
CREATE VIEW public.be_v_dispatch_ready_queue AS SELECT delivery_way_id FROM public.be_waybill_ledger WHERE wayplan_id IS NULL;
CREATE TABLE fixture_context(value jsonb);
CREATE FUNCTION public.be_multi_van_context() RETURNS jsonb LANGUAGE sql AS $$SELECT value FROM fixture_context$$;
CREATE TABLE fixture_route_history(wayplan_id text,kind text,payload jsonb);
CREATE FUNCTION public.be_save_operational_route_version_v1(text,text,jsonb,text) RETURNS jsonb LANGUAGE plpgsql AS $$BEGIN INSERT INTO fixture_route_history VALUES($1,$2,$3);RETURN jsonb_build_object('route_version',(SELECT count(*) FROM fixture_route_history WHERE wayplan_id=$1));END$$;
CREATE FUNCTION public.be_generate_wayplan(jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$DECLARE stop_id text;seq int:=0;BEGIN
 IF current_setting('test.generation_failure',true)='true' THEN RETURN '{"ok":false,"error":"fixture generation rejected"}'::jsonb;END IF;
 INSERT INTO public.be_wayplan_dispatches(wayplan_id,wayplan_status,branch_code) VALUES($1->>'wayplan_id','CREATED',$1->>'branch_code');
 FOR stop_id IN SELECT jsonb_array_elements_text($1->'delivery_way_ids') LOOP
 seq:=seq+1;INSERT INTO public.be_wayplan_dispatch_stops(wayplan_id,delivery_way_id,stop_sequence,stop_status) VALUES($1->>'wayplan_id',stop_id,seq,'PENDING');
 INSERT INTO public.be_wayplan_membership_v40(wayplan_id,delivery_way_id,membership_status) VALUES($1->>'wayplan_id',stop_id,'PLANNED');
 UPDATE public.be_waybill_ledger SET wayplan_id=$1->>'wayplan_id' WHERE delivery_way_id=stop_id;
 END LOOP;RETURN '{"ok":true}'::jsonb;END$$;`);
await db.exec(fs.readFileSync('../supabase/migrations/20261012144059_wayplan_revision_policy_v201.sql','utf8'));
async function seed(ctx=context){
 await db.exec(`TRUNCATE be_audit_events,be_wayplan_dispatches,be_wayplan_dispatch_stops,be_wayplan_membership_v40,be_waybill_ledger,be_data_entry_parcel_details,be_delivery_location_registry,fixture_context,fixture_route_history;
 SELECT set_config('test.generation_failure','false',false);
 INSERT INTO be_wayplan_dispatches(wayplan_id,wayplan_status,branch_code) VALUES('SOURCE','CREATED','YGN');
 INSERT INTO be_wayplan_dispatch_stops(wayplan_id,delivery_way_id,stop_sequence,stop_status) VALUES('SOURCE','TEST-1',1,'PENDING'),('SOURCE','TEST-2',2,'PENDING');
 INSERT INTO be_wayplan_membership_v40(wayplan_id,delivery_way_id,membership_status) VALUES('SOURCE','TEST-1','PLANNED'),('SOURCE','TEST-2','PLANNED');
 INSERT INTO be_waybill_ledger(delivery_way_id,wayplan_id,dispatch_status) VALUES('TEST-1','SOURCE','CREATED'),('TEST-2','SOURCE','CREATED');
 INSERT INTO be_data_entry_parcel_details VALUES('TEST-1','YANGON','DOORSTEP_MAP',1),('TEST-2','YANGON','DOORSTEP_MAP',1);
 INSERT INTO be_delivery_location_registry VALUES('TEST-1',16.85,96.19),('TEST-2',16.86,96.20);`);
 await db.query('INSERT INTO fixture_context VALUES($1::jsonb)',[ctx]);
 await db.exec("INSERT INTO fixture_route_history VALUES('SOURCE','GENERATED','{\"original\":true}'::jsonb)");
}
async function call(p=payload()){return(await db.query('SELECT public.be_replace_created_wayplan_v46($1::jsonb) result',[p])).rows[0].result;}
async function snapshot(){return(await db.query(`SELECT jsonb_build_object('dispatches',(SELECT jsonb_agg(to_jsonb(x) ORDER BY wayplan_id) FROM be_wayplan_dispatches x),'ledger',(SELECT jsonb_agg(to_jsonb(x) ORDER BY delivery_way_id) FROM be_waybill_ledger x),'stops',(SELECT jsonb_agg(to_jsonb(x) ORDER BY wayplan_id,stop_sequence) FROM be_wayplan_dispatch_stops x),'audit',(SELECT count(*) FROM be_audit_events),'membership',(SELECT jsonb_agg(to_jsonb(x) ORDER BY wayplan_id,delivery_way_id) FROM be_wayplan_membership_v40 x),'history',(SELECT count(*) FROM fixture_route_history)) state`)).rows[0].state;}
for(const [label,change,expected] of [
 ['cross-branch vehicle',c=>c.vehicles[0].branch_code='MDY',/vehicle.*branch/i],
 ['cross-branch driver',c=>c.drivers[0].branch_code='MDY',/crew.*branch/i],
 ['inactive helper',c=>c.helpers=[],/active Helper/i],
 ['busy driver',c=>c.busy=[{wayplan_id:'OTHER',driver_code:'D1'}],/active.*another/i],
 ['driver busy as helper',c=>c.busy=[{wayplan_id:'OTHER',helper_code:'D1'}],/active.*another/i],
 ['busy fleet',c=>c.busy=[{wayplan_id:'OTHER',vehicle_code:'VAN1'}],/active.*another/i],
]){
 const ctx=structuredClone(context);change(ctx);await seed(ctx);const before=await snapshot();await assert.rejects(call(),expected,label);assert.deepEqual(await snapshot(),before,label+' must roll back source release');
}
await seed({...context,busy:[{wayplan_id:'SOURCE',vehicle_code:'VAN1',driver_code:'D1',helper_code:'H1'}]});
const p=payload(),result=await call(p);assert.equal(result.ok,true);assert.equal(result.new_stop_count,2);
const after=await snapshot();assert.equal(after.dispatches.find(x=>x.wayplan_id==='SOURCE').wayplan_status,'CANCELLED');assert.equal(after.dispatches.find(x=>x.wayplan_id===result.replacement_wayplan_id).wayplan_status,'CREATED');
assert.deepEqual(after.stops.filter(x=>x.wayplan_id===result.replacement_wayplan_id).map(x=>x.delivery_way_id),['TEST-2','TEST-1']);assert.equal(after.history,3);
assert.deepEqual((await db.query("SELECT payload FROM fixture_route_history WHERE wayplan_id='SOURCE'")).rows,[{payload:{original:true}}]);assert.equal(after.audit,1);
assert.deepEqual(await call(p),result);assert.deepEqual(await snapshot(),after,'Retry must not add history, routes or assignments');
p.plan.delivery_way_ids.reverse();await assert.rejects(call(p),/another operation/);assert.deepEqual(await snapshot(),after);
await seed();const before=await snapshot();await db.exec("SELECT set_config('test.generation_failure','true',false)");await assert.rejects(call(),/fixture generation rejected/);assert.deepEqual(await snapshot(),before,'Failure after releasing original memberships must restore all original rows');
console.log('PASS: real revision transaction rejects wrong-branch/inactive/busy crew and fleet, permits compatible source crew, preserves reviewed order/history, replays once and rolls back failure (fixture adapters)');
}finally{await db.close();}
