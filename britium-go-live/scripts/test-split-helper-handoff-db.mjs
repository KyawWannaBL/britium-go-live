import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Real v176 Helper preparation + Driver confirmation, v215 patch, delivery core and queue trigger. Only the
// external proof-storage validator and success-event sink are controlled stubs;
// the v77 wrapper captures its input and delegates to the real delivery core.
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
 await db.exec(`create table be_rider_route_stop_state_v46(wayplan_id text,delivery_way_id text,stop_status text,geo_verified boolean);
 create table be_rider_geofence_overrides_v50(wayplan_id text,delivery_way_id text,used_at timestamptz);
 create table be_delivery_team_confirmations_v176(wayplan_id text,delivery_way_id text,status text,
 prepared_by_user uuid,prepared_by_code text,prepared_by_role text,prepared_at timestamptz,
 recipient_name text,recipient_phone text,proof_url text,signature_url text,cod_collected_amount numeric,
 payment_method text,transaction_reference text,latitude numeric,longitude numeric,metadata jsonb,updated_at timestamptz,
 confirmed_by_user uuid,confirmed_by_driver_code text,confirmed_at timestamptz,unique(wayplan_id,delivery_way_id));
 create table forwarded_payloads(payload jsonb);
 create function be_field_team_delivery_action_v77(jsonb) returns jsonb language plpgsql as $$begin
 insert into forwarded_payloads values($1);return public.be_field_team_delivery_action($1);end$$;`);
 // Exact prior deployed v176 definitions, installed before v215 to exercise its
 // pg_get_functiondef patch rather than an already modified fixture function.
 await db.exec(String.raw`CREATE OR REPLACE FUNCTION public.be_field_team_prepare_delivery_v176(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_role text:=lower(coalesce(v_identity->>'role',''));
  v_code text:=upper(coalesce(v_identity->>'worker_code',''));
  v_way text:=upper(btrim(coalesce(p_payload->>'delivery_way_id','')));
  v_wayplan text:=btrim(coalesce(p_payload->>'wayplan_id',''));
  v_recipient text:=nullif(btrim(coalesce(p_payload->>'recipient_name','')),'');
  v_phone text:=nullif(btrim(coalesce(p_payload->>'recipient_phone','')),'');
  v_proof text:=nullif(btrim(coalesce(p_payload->>'proof_url','')),'');
  v_signature text:=nullif(btrim(coalesce(p_payload->>'signature_url','')),'');
  v_payment text:=upper(coalesce(nullif(btrim(p_payload->>'payment_method'),''),'UNKNOWN'));
  v_reference text:=nullif(btrim(coalesce(p_payload->>'transaction_reference','')),'');
  v_cod numeric:=0;
  v_required numeric:=0;
  v_started timestamptz;
  v_lat numeric;
  v_lng numeric;
  v_proof_check jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTHENTICATED_FIELD_SESSION_REQUIRED'); end if;
  if v_role<>'helper' then return jsonb_build_object('ok',false,'error','ASSIGNED_HELPER_REQUIRED'); end if;
  if v_way='' or v_wayplan='' then return jsonb_build_object('ok',false,'error','WAYPLAN_AND_DELIVERY_WAY_REQUIRED'); end if;

  if not exists(
    select 1 from public.be_wayplan_dispatches w
    join public.be_wayplan_dispatch_stops s on s.wayplan_id=w.wayplan_id
    where w.wayplan_id=v_wayplan and upper(s.delivery_way_id)=v_way
      and upper(coalesce(w.helper_code,''))=v_code
  ) then
    return jsonb_build_object('ok',false,'error','DELIVERY_NOT_ASSIGNED_TO_SIGNED_IN_HELPER');
  end if;

  if not exists(
    select 1 from public.be_rider_route_stop_state_v46 rs
    where rs.wayplan_id=v_wayplan and upper(rs.delivery_way_id)=v_way
      and rs.stop_status='ARRIVED'
      and (coalesce(rs.geo_verified,false) or exists(
        select 1 from public.be_rider_geofence_overrides_v50 o
        where o.wayplan_id=v_wayplan and upper(o.delivery_way_id)=v_way and o.used_at is not null
      ))
  ) then
    return jsonb_build_object('ok',false,'error','ARRIVAL_GEOFENCE_REQUIRED_BEFORE_DELIVERY_PREPARATION');
  end if;

  if v_recipient is null then raise exception 'RECIPIENT_NAME_REQUIRED' using errcode='22023'; end if;
  if v_proof is null then raise exception 'DELIVERY_PROOF_PHOTO_REQUIRED' using errcode='22023'; end if;
  if v_signature is null then raise exception 'RECIPIENT_SIGNATURE_REQUIRED' using errcode='22023'; end if;

  begin v_cod:=coalesce(nullif(btrim(p_payload->>'cod_collected_amount'),'')::numeric,0);
  exception when others then raise exception 'INVALID_COD_COLLECTED_AMOUNT' using errcode='22023'; end;

  select coalesce(d.actual_collect,d.cod_amount,s.cod_amount,0),
         nullif(s.metadata->>'delivery_started_at','')::timestamptz
    into v_required,v_started
  from public.be_wayplan_dispatch_stops s
  left join lateral(
    select dd.* from public.be_data_entry_parcel_details dd
    where upper(dd.delivery_way_id)=v_way
    order by dd.updated_at desc nulls last,dd.saved_at desc nulls last limit 1
  ) d on true
  where s.wayplan_id=v_wayplan and upper(s.delivery_way_id)=v_way
  limit 1;

  if coalesce(v_required,0)>0 and v_cod<v_required then
    raise exception 'COD_COLLECTION_REQUIRED: required %, collected %',v_required,v_cod using errcode='22023';
  end if;

  v_proof_check:=public.be_validate_rider_delivery_proof_v12_15(v_proof,v_way,null,auth.uid(),v_started);
  if not coalesce((v_proof_check->>'ok')::boolean,false) then
    raise exception '%',coalesce(v_proof_check->>'error','DELIVERY_PROOF_INVALID') using errcode='42501';
  end if;

  begin
    v_lat:=nullif(btrim(coalesce(p_payload->>'latitude',p_payload->>'gps_lat','')),'')::numeric;
    v_lng:=nullif(btrim(coalesce(p_payload->>'longitude',p_payload->>'gps_lng','')),'')::numeric;
  exception when others then v_lat:=null; v_lng:=null; end;

  insert into public.be_delivery_team_confirmations_v176(
    wayplan_id,delivery_way_id,status,prepared_by_user,prepared_by_code,prepared_by_role,
    prepared_at,recipient_name,recipient_phone,proof_url,signature_url,cod_collected_amount,
    payment_method,transaction_reference,latitude,longitude,metadata,updated_at
  ) values(
    v_wayplan,v_way,'PREPARED',auth.uid(),v_code,v_role,now(),v_recipient,v_phone,v_proof,
    v_signature,v_cod,v_payment,v_reference,v_lat,v_lng,
    jsonb_build_object('proof_validation',v_proof_check,'build','TEAM_DELIVERY_V176'),now()
  )
  on conflict(wayplan_id,delivery_way_id) do update set
    status='PREPARED',prepared_by_user=excluded.prepared_by_user,prepared_by_code=excluded.prepared_by_code,
    prepared_by_role=excluded.prepared_by_role,prepared_at=now(),recipient_name=excluded.recipient_name,
    recipient_phone=excluded.recipient_phone,proof_url=excluded.proof_url,signature_url=excluded.signature_url,
    cod_collected_amount=excluded.cod_collected_amount,payment_method=excluded.payment_method,
    transaction_reference=excluded.transaction_reference,latitude=excluded.latitude,longitude=excluded.longitude,
    confirmed_by_user=null,confirmed_by_driver_code=null,confirmed_at=null,metadata=excluded.metadata,updated_at=now();

  update public.be_wayplan_dispatch_stops
  set stop_status='ARRIVED_AT_CUSTOMER',
      rider_status='HELPER_COMPLETED_PENDING_DRIVER',
      receiver_name=v_recipient,receiver_phone=v_phone,
      rider_proof_url=v_proof,proof_url=v_proof,receiver_signature_url=v_signature,
      cod_collected=v_cod,updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'team_delivery_status','HELPER_COMPLETED_PENDING_DRIVER',
        'helper_prepared_by',v_code,'helper_prepared_at',now(),
        'helper_proof_url',v_proof,'helper_signature_url',v_signature,'build','TEAM_DELIVERY_V176'
      )
  where wayplan_id=v_wayplan and upper(delivery_way_id)=v_way;

  return jsonb_build_object(
    'ok',true,'wayplan_id',v_wayplan,'delivery_way_id',v_way,
    'mobile_status','PENDING_DRIVER_CONFIRMATION',
    'team_delivery_status','HELPER_COMPLETED_PENDING_DRIVER',
    'prepared_by',v_code,'driver_confirmation_required',true,
    'build','TEAM_DELIVERY_PREPARE_V176'
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.be_driver_confirm_team_delivery_v176(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_role text:=lower(coalesce(v_identity->>'role',''));
  v_code text:=upper(coalesce(v_identity->>'worker_code',''));
  v_way text:=upper(btrim(coalesce(p_payload->>'delivery_way_id','')));
  v_wayplan text:=btrim(coalesce(p_payload->>'wayplan_id',''));
  v_prepared public.be_delivery_team_confirmations_v176%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTHENTICATED_FIELD_SESSION_REQUIRED'); end if;
  if v_role<>'driver' then return jsonb_build_object('ok',false,'error','ASSIGNED_DRIVER_CONFIRMATION_REQUIRED'); end if;

  if not exists(
    select 1 from public.be_wayplan_dispatches w
    join public.be_wayplan_dispatch_stops s on s.wayplan_id=w.wayplan_id
    where w.wayplan_id=v_wayplan and upper(s.delivery_way_id)=v_way
      and upper(coalesce(w.driver_code,''))=v_code
  ) then
    return jsonb_build_object('ok',false,'error','DELIVERY_NOT_ASSIGNED_TO_SIGNED_IN_DRIVER');
  end if;

  select * into v_prepared
  from public.be_delivery_team_confirmations_v176
  where wayplan_id=v_wayplan and delivery_way_id=v_way and status='PREPARED'
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','HELPER_PREPARATION_NOT_FOUND','message','No completed Helper delivery package is waiting for Driver confirmation.');
  end if;

  v_result:=public.be_field_team_delivery_action_v77(jsonb_build_object(
    'action','deliver',
    'wayplan_id',v_wayplan,
    'delivery_way_id',v_way,
    'recipient_name',v_prepared.recipient_name,
    'recipient_phone',v_prepared.recipient_phone,
    'proof_url',v_prepared.proof_url,
    'signature_url',v_prepared.signature_url,
    'cod_collected_amount',v_prepared.cod_collected_amount,
    'payment_method',v_prepared.payment_method,
    'transaction_reference',v_prepared.transaction_reference,
    'latitude',v_prepared.latitude,
    'longitude',v_prepared.longitude,
    'operation_id','TEAM-V176-'||gen_random_uuid()::text
  ));

  if coalesce((v_result->>'ok')::boolean,false)=false then return v_result; end if;

  update public.be_delivery_team_confirmations_v176
  set status='CONFIRMED',confirmed_by_user=auth.uid(),confirmed_by_driver_code=v_code,
      confirmed_at=now(),updated_at=now()
  where wayplan_id=v_wayplan and delivery_way_id=v_way;

  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'ok',true,'mobile_status','DELIVERED','team_delivery_status','DRIVER_CONFIRMED',
    'driver_confirmed_by',v_code,'helper_prepared_by',v_prepared.prepared_by_code,
    'build','TEAM_DELIVERY_CONFIRM_V176'
  );
end;
$function$;`);
 // Minimal pre-v215 assigned-job projection. The production migration must
 // rewrite its metadata expression, retaining only the collection keys it adds.
 await db.exec(`create view be_v_rider_delivery_wayplan_jobs as select
 s.delivery_way_id as id,s.wayplan_id,s.pickup_id,s.pickup_id as pickup_way_id,s.delivery_way_id,s.waybill_no,
 s.receiver_name as recipient_name,s.receiver_phone as recipient_phone,''::text as township,''::text as address,
 s.cod_amount,s.cod_amount as calculated_cod_amount,s.cod_collected,s.delivery_fee,
 s.cod_amount as data_entry_item_price,s.delivery_fee as data_entry_delivery_fee,'COD'::text as data_entry_amount_entry_type,
 s.stop_status,s.rider_status,s.delivered_at,w.vehicle_code,w.vehicle_name,w.driver_code,w.driver_name,
 w.rider_code,w.rider_name,w.helper_code,w.helper_name,
 jsonb_build_object('source','fixture') as metadata
 from be_wayplan_dispatch_stops s join be_wayplan_dispatches w using(wayplan_id);`);
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
 await seed('D1026-TEST-001');await seed('D1026-TEST-002');
 const target={wayplan_id:'WP',delivery_way_id:'D1026-TEST-001'};
 const preparedPayload={...payload(target.delivery_way_id),wayplan_id:'WP',latitude:16.8,longitude:96.1};
 async function prepare(p){return(await db.query('select be_field_team_prepare_delivery_v176($1::jsonb) data',[JSON.stringify(p)])).rows[0].data;}
 async function confirm(p=target){return(await db.query('select be_driver_confirm_team_delivery_v176($1::jsonb) data',[JSON.stringify(p)])).rows[0].data;}
 async function prepared(){return(await db.query('select * from be_delivery_team_confirmations_v176 where delivery_way_id=$1',[target.delivery_way_id])).rows[0];}
 assert.equal((await prepare(preparedPayload)).error,'AUTHENTICATED_FIELD_SESSION_REQUIRED');
 await db.exec(`set test.uid='00000000-0000-0000-0000-000000000001'`);
 await identity('driver','DRV001','Driver One');
 assert.equal((await prepare(preparedPayload)).error,'ASSIGNED_HELPER_REQUIRED');
 await identity('helper','WRONG','Wrong Helper');
 assert.equal((await prepare(preparedPayload)).error,'DELIVERY_NOT_ASSIGNED_TO_SIGNED_IN_HELPER');
 await identity('helper','HLP001','Helper One');
 assert.equal((await prepare(preparedPayload)).error,'ARRIVAL_GEOFENCE_REQUIRED_BEFORE_DELIVERY_PREPARATION');
 await db.query(`insert into be_rider_route_stop_state_v46 values('WP',$1,'ARRIVED',true)`,[target.delivery_way_id]);
 for(const allocations of [[{method:'CASH',amount:99}],[{method:'CASH',amount:-1},{method:'CASH',amount:101}],[{method:'KBZ_PAY',amount:100}]]) {
  await assert.rejects(prepare({...preparedPayload,payment_allocations:allocations}),error=>error.code==='22023');
  assert.equal(await count('be_delivery_team_confirmations_v176'),0);
  assert.equal((await stop(target.delivery_way_id)).stop_status,'OUT_FOR_DELIVERY');
  assert.equal(await count('be_wayplan_cod_settlements'),0);
 }
 const p=await prepare(preparedPayload);
 assert.equal(p.ok,true);assert.equal(p.driver_confirmation_required,true);
 assert.equal((await prepared()).status,'PREPARED');
 const reloaded=(await db.query('select metadata from be_v_rider_delivery_wayplan_jobs where delivery_way_id=$1',[target.delivery_way_id])).rows[0].metadata;
 assert.deepEqual(reloaded.payment_allocations,(await prepared()).metadata.payment_allocations,'assigned-job reload preserves Helper-prepared split');
 assert.equal(reloaded.source,'fixture');
 assert.equal(reloaded.helper_proof_url,undefined,'view does not expose unrelated stop metadata');
 assert.deepEqual((await prepared()).metadata.payment_allocations.map(x=>[x.method,Number(x.amount)]),[['CASH',30],['KBZ_PAY',70]],'patched helper persists allocation package');
 assert.equal((await stop(target.delivery_way_id)).rider_status,'HELPER_COMPLETED_PENDING_DRIVER');
 assert.equal(await count('be_wayplan_cod_settlements'),0,'helper preparation cannot enter Finance before Driver confirmation');
 assert.equal((await confirm()).error,'ASSIGNED_DRIVER_CONFIRMATION_REQUIRED');
 await identity('driver','WRONG','Wrong Driver');
 assert.equal((await confirm()).error,'DELIVERY_NOT_ASSIGNED_TO_SIGNED_IN_DRIVER');
 assert.equal(await count('forwarded_payloads'),0);
 await identity('driver','DRV001','Driver One');
 assert.equal((await confirm({wayplan_id:'WP',delivery_way_id:'D1026-TEST-002'})).error,'HELPER_PREPARATION_NOT_FOUND');
 const result=await confirm();
 assert.equal(result.ok,true);assert.equal(result.team_delivery_status,'DRIVER_CONFIRMED');
 assert.equal(result.helper_prepared_by,'HLP001');assert.equal(result.driver_confirmed_by,'DRV001');
 const forwarded=(await db.query('select payload from forwarded_payloads')).rows[0].payload;
 assert.deepEqual(forwarded.payment_allocations,(await prepared()).metadata.payment_allocations,'patched Driver confirmation forwards Helper split package through v77');
 assert.equal(forwarded.latitude,16.8);assert.equal(forwarded.longitude,96.1);
 const delivered=await stop(target.delivery_way_id);
 assert.equal(delivered.stop_status,'DELIVERED');assert.equal(Number(delivered.cod_collected),100);
 assert.deepEqual(delivered.metadata.payment_allocations,forwarded.payment_allocations);
 assert.equal((await prepared()).status,'CONFIRMED');assert.equal((await prepared()).confirmed_by_driver_code,'DRV001');
 const queue=(await db.query('select * from be_wayplan_cod_settlements')).rows[0];
 assert.equal(queue.settlement_status,'PENDING_SETTLEMENT');assert.equal(queue.settled_at,null);
 assert.deepEqual(queue.metadata.reported_payment_allocations,forwarded.payment_allocations);
 assert.equal(queue.metadata.reported_collected_by_code,'DRV001','finalizing signed Driver owns collection attribution');
 const handover=(await db.query('select be_field_team_cod_handover_queue_v1(200) data')).rows[0].data;
 assert.equal(handover.ok,true);assert.equal(handover.count,1);assert.equal(handover.pending_count,1);
 assert.deepEqual(handover.jobs[0].payment_allocations,forwarded.payment_allocations,'COD handover reader exposes exact receipt allocation lines');
 assert.equal(handover.jobs[0].payment_mode,'MIXED');assert.equal(Number(handover.jobs[0].authoritative_cod_collected),100);
 assert.deepEqual(handover.jobs[0].payment_allocations.map(x=>[x.method,Number(x.amount)]),[['CASH',30],['KBZ_PAY',70]]);
 await identity('driver','WRONG','Wrong Driver');
 assert.equal((await db.query('select be_field_team_cod_handover_queue_v1(200) data')).rows[0].data.count,0);
 await identity('driver','DRV001','Driver One');
 assert.equal((await confirm()).error,'HELPER_PREPARATION_NOT_FOUND','already confirmed package cannot be applied again');
 assert.equal(await count('forwarded_payloads'),1);assert.equal(await count('success_events'),1);assert.equal(await count('audit_logs'),1);assert.equal(await count('be_wayplan_cod_settlements'),1);
 // Historical delivered jobs with no receipt remain unknown in the reader.
 await db.exec('begin');
 await db.exec(`update be_wayplan_dispatch_stops set stop_status='DELIVERED',rider_status='DELIVERED',cod_collected=null,metadata='{}' where delivery_way_id='D1026-TEST-002'`);
 const unknown=(await db.query('select be_field_team_cod_handover_queue_v1(200) data')).rows[0].data.jobs.find(x=>x.delivery_way_id==='D1026-TEST-002');
 assert.ok(unknown);assert.equal(unknown.payment_mode,'UNKNOWN');assert.equal(unknown.authoritative_cod_collected,null);
 assert.equal(unknown.eligible_to_handover,false);
 await db.exec('rollback');
 await identity('helper','HLP001','Helper One');
 assert.equal((await prepare({...preparedPayload,cod_collected_amount:999,payment_allocations:[{method:'CASH',amount:999}]})).already_applied,true,'stale Helper submission cannot reopen a Driver-confirmed delivery');
 assert.equal((await stop(target.delivery_way_id)).stop_status,'DELIVERED');
 assert.equal((await prepared()).status,'CONFIRMED');
 assert.equal(Number((await stop(target.delivery_way_id)).cod_collected),100);
 assert.equal(await count('audit_logs'),1);
 await identity('finance','FIN001','Finance');
 const totals=(await db.query(`select be_finance_collection_totals_v215(null,null,'VAN') data`)).rows[0].data;
 assert.equal(Number(totals.rows[0].total_collected),100);assert.equal(Number(totals.rows[0].cash_collected),30);assert.equal(Number(totals.rows[0].digital_collected),70);
 console.log('PASS real Helper→Driver handoff: v215 patches deployed v176 functions, validates/stores/forwards split allocations, checks assignments/geofence, delivers once through real core+sync');
} finally {await db.close();}
