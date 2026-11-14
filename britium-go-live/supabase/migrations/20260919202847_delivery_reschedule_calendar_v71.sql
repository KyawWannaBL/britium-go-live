-- V71: dated delivery reschedule + standardized delivery failure/return reasons.
-- A CUSTOMER_REQUESTED_RESCHEDULE parcel is withheld from automatic Wayplan queues
-- until its requested delivery date in Asia/Yangon.

create table if not exists public.be_delivery_reschedules_v71 (
  delivery_way_id text primary key,
  original_way_id text,
  requested_delivery_date date not null,
  reason_code text not null default 'CUSTOMER_REQUESTED_RESCHEDULE',
  reason_name_en text,
  reason_name_mm text,
  note text,
  status text not null default 'ACTIVE',
  requested_by text,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint be_delivery_reschedules_v71_status_chk check (status in ('ACTIVE','COMPLETED','CANCELLED'))
);

create index if not exists be_delivery_reschedules_v71_date_idx
  on public.be_delivery_reschedules_v71(status,requested_delivery_date);

alter table public.be_delivery_reschedules_v71 enable row level security;

drop policy if exists be_delivery_reschedules_v71_internal_read on public.be_delivery_reschedules_v71;
create policy be_delivery_reschedules_v71_internal_read
on public.be_delivery_reschedules_v71
for select to authenticated
using (true);

-- Keep the existing reason catalogue, add the requested specific reasons.
insert into public.be_exception_rules(
  exception_code,process_type,exception_name_en,exception_name_mm,
  mapped_status,severity,require_photo,require_remark,next_action,
  customer_message_en,customer_message_mm,raw_rule,active,created_at,updated_at
)
values
('PHONE_OFF','DELIVERY','Phone switched off','ဖုန်းစက်ပိတ်ထားသည်။',
 'DELIVERY_ATTEMPTED','MEDIUM','NO','YES','RETRY_OR_CS_FOLLOWUP',
 'We could not reach your phone.','ဖုန်းဆက်သွယ်၍ မရရှိပါ။',
 '{"category":"PHONE","v71":true}'::jsonb,true,now(),now()),
('PHONE_OUT_OF_COVERAGE','DELIVERY','Phone is outside coverage area','ဖုန်းဆက်သွယ်မှုဧရိယာပြင်ပသို့ရောက်ရှိနေသည်။',
 'DELIVERY_ATTEMPTED','MEDIUM','NO','YES','RETRY_OR_CS_FOLLOWUP',
 'Your phone was outside the coverage area.','ဖုန်းဆက်သွယ်မှုဧရိယာပြင်ပတွင် ရှိနေပါသည်။',
 '{"category":"PHONE","v71":true}'::jsonb,true,now(),now()),
('NO_ANSWER','DELIVERY','Customer did not answer phone','ဖုန်းမကိုင်ပါ။',
 'DELIVERY_ATTEMPTED','MEDIUM','NO','YES','RETRY_OR_CS_FOLLOWUP',
 'We could not reach you by phone.','ဖုန်းဆက်သွယ်၍ မရရှိပါ။',
 '{"category":"PHONE","v71":true}'::jsonb,true,now(),now()),
('CUSTOMER_REQUESTED_RESCHEDULE','DELIVERY','Delivery date postponed / changed by customer','ပို့ဆောင်ရက်အား Customer မှ သတ်မှတ်ရက်သို့ ရွှေ့ဆိုင်း/ပြောင်းလဲထားသည်။',
 'DELIVERY_RESCHEDULED','LOW','NO','YES','SET_NEXT_ATTEMPT_DATE',
 'Your delivery has been rescheduled to the requested date.','Customer သတ်မှတ်ထားသော ရက်သို့ ပို့ဆောင်ရက် ပြောင်းလဲထားပါသည်။',
 '{"category":"RESCHEDULE","requires_delivery_date":true,"v71":true}'::jsonb,true,now(),now())
on conflict(process_type,exception_code) do update set
  exception_name_en=excluded.exception_name_en,
  exception_name_mm=excluded.exception_name_mm,
  mapped_status=excluded.mapped_status,
  severity=excluded.severity,
  require_photo=excluded.require_photo,
  require_remark=excluded.require_remark,
  next_action=excluded.next_action,
  customer_message_en=excluded.customer_message_en,
  customer_message_mm=excluded.customer_message_mm,
  raw_rule=coalesce(public.be_exception_rules.raw_rule,'{}'::jsonb)||excluded.raw_rule,
  active=true,
  updated_at=now();

insert into public.be_delivery_failure_reasons(
  reason_code,reason_mm,reason_en,requires_reschedule,requires_other_text,
  status,sort_order,updated_at,requires_note,active
)
values
('CUSTOMER_REQUESTED_RESCHEDULE','ပို့ဆောင်ရက်အား Customer မှ သတ်မှတ်ရက်သို့ ရွှေ့ဆိုင်း/ပြောင်းလဲထားသည်။','Delivery date postponed / changed by customer',true,false,'active',10,now(),true,true),
('PHONE_OFF','ဖုန်းစက်ပိတ်ထားသည်။','Phone switched off',false,false,'active',20,now(),false,true),
('PHONE_OUT_OF_COVERAGE','ဖုန်းဆက်သွယ်မှုဧရိယာပြင်ပသို့ရောက်ရှိနေသည်။','Phone is outside coverage area',false,false,'active',30,now(),false,true),
('NO_ANSWER','ဖုန်းမကိုင်ပါ။','Customer did not answer phone',false,false,'active',40,now(),false,true)
on conflict(reason_code) do update set
  reason_mm=excluded.reason_mm,
  reason_en=excluded.reason_en,
  requires_reschedule=excluded.requires_reschedule,
  requires_other_text=excluded.requires_other_text,
  status='active',
  sort_order=excluded.sort_order,
  requires_note=excluded.requires_note,
  active=true,
  updated_at=now();

create or replace function public.be_set_delivery_reschedule_v71(
  p_way_id text,
  p_delivery_date date,
  p_reason_code text default 'CUSTOMER_REQUESTED_RESCHEDULE',
  p_actor_email text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_input text:=nullif(upper(btrim(coalesce(p_way_id,''))),'');
  v_internal text;
  v_original text;
  v_actor text:=coalesce(nullif(lower(btrim(coalesce(p_actor_email,''))),''),
                         lower(auth.jwt()->>'email'),'authenticated-user');
  v_today date:=(now() at time zone 'Asia/Yangon')::date;
  v_reason text:=upper(coalesce(nullif(btrim(p_reason_code),''),'CUSTOMER_REQUESTED_RESCHEDULE'));
  v_name_en text;
  v_name_mm text;
  v_pickup text;
begin
  if auth.uid() is null and session_user<>'postgres' then
    raise exception 'Authentication required';
  end if;
  if v_input is null then raise exception 'Way ID is required'; end if;
  if p_delivery_date is null then raise exception 'Dedicated delivery date is required'; end if;
  if p_delivery_date<v_today then
    raise exception 'Dedicated delivery date cannot be earlier than %',v_today;
  end if;

  v_internal:=public.be_resolve_internal_way_id_v70(v_input,null);
  if v_internal is null then raise exception 'Way ID % was not found',v_input; end if;
  v_original:=public.be_operational_way_id_v70(v_internal);

  select r.exception_name_en,r.exception_name_mm
    into v_name_en,v_name_mm
  from public.be_exception_rules r
  where r.process_type='DELIVERY' and r.exception_code=v_reason and coalesce(r.active,true)
  limit 1;
  if v_name_en is null then raise exception 'Unknown or inactive delivery reason: %',v_reason; end if;

  select d.pickup_id into v_pickup
  from public.be_data_entry_parcel_details d
  where d.delivery_way_id=v_internal
  limit 1;

  insert into public.be_delivery_reschedules_v71(
    delivery_way_id,original_way_id,requested_delivery_date,reason_code,
    reason_name_en,reason_name_mm,note,status,requested_by,requested_at,updated_at,metadata
  ) values (
    v_internal,v_original,p_delivery_date,v_reason,
    v_name_en,v_name_mm,nullif(btrim(coalesce(p_note,'')),''),
    'ACTIVE',v_actor,now(),now(),
    jsonb_build_object('pickup_id',v_pickup,'source','V71_DEDICATED_DELIVERY_DATE')
  )
  on conflict(delivery_way_id) do update set
    original_way_id=excluded.original_way_id,
    requested_delivery_date=excluded.requested_delivery_date,
    reason_code=excluded.reason_code,
    reason_name_en=excluded.reason_name_en,
    reason_name_mm=excluded.reason_name_mm,
    note=excluded.note,
    status='ACTIVE',
    requested_by=excluded.requested_by,
    requested_at=now(),
    updated_at=now(),
    metadata=coalesce(public.be_delivery_reschedules_v71.metadata,'{}'::jsonb)||excluded.metadata;

  -- Release the failed parcel from its previous active route membership, while
  -- retaining that Wayplan as historical evidence.
  update public.be_wayplan_membership_v40
  set membership_status='ON_HOLD',
      updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'rescheduled_delivery_date',p_delivery_date,
        'reschedule_reason_code',v_reason,
        'reschedule_actor',v_actor,
        'reschedule_set_at',now()
      )
  where delivery_way_id=v_internal
    and membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED');

  update public.be_wayplan_dispatch_stops
  set stop_status=case
        when upper(coalesce(stop_status,'')) in ('DELIVERED','COMPLETED','RTO') then stop_status
        else 'RETURN_TO_WAREHOUSE'
      end,
      rider_status=case
        when upper(coalesce(rider_status,'')) in ('DELIVERED','RTO') then rider_status
        else 'DELIVERY_RESCHEDULED'
      end,
      dispatch_status=case
        when upper(coalesce(dispatch_status,'')) in ('DELIVERED','RTO') then dispatch_status
        else 'DELIVERY_RESCHEDULED'
      end,
      updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'rescheduled_delivery_date',p_delivery_date,
        'reschedule_reason_code',v_reason,
        'reschedule_actor',v_actor
      )
  where delivery_way_id=v_internal;

  update public.be_waybill_ledger
  set dispatch_status='READY_FOR_DISPATCH',
      rider_status='DELIVERY_RESCHEDULED',
      wayplan_status='READY_FOR_WAYPLAN',
      updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'rescheduled_delivery_date',p_delivery_date,
        'reschedule_reason_code',v_reason,
        'reschedule_actor',v_actor
      )
  where delivery_way_id=v_internal
     or upper(coalesce(waybill_no,''))=upper(v_original)
     or upper(coalesce(tracking_no,''))=upper(v_original);

  return jsonb_build_object(
    'ok',true,
    'delivery_way_id',v_internal,
    'operational_way_id',v_original,
    'pickup_id',v_pickup,
    'requested_delivery_date',p_delivery_date,
    'reason_code',v_reason,
    'reason_name_en',v_name_en,
    'reason_name_mm',v_name_mm,
    'eligible_from_date',p_delivery_date,
    'yangon_today',v_today,
    'build','DELIVERY_RESCHEDULE_CALENDAR_V71'
  );
end;
$function$;

grant execute on function public.be_set_delivery_reschedule_v71(text,date,text,text,text) to authenticated;

create or replace function public.be_delivery_schedule_allows_wayplan_v71(p_delivery_way_id text)
returns boolean
language sql
stable security definer
set search_path to 'public','pg_temp'
as $function$
  select not exists(
    select 1
    from public.be_delivery_reschedules_v71 r
    where r.delivery_way_id=p_delivery_way_id
      and r.status='ACTIVE'
      and r.requested_delivery_date>(now() at time zone 'Asia/Yangon')::date
  );
$function$;

grant execute on function public.be_delivery_schedule_allows_wayplan_v71(text) to authenticated;

-- Safe wrapper over the existing canonical V67 queue. It removes only parcels
-- whose customer-dedicated delivery date is still in the future.
create or replace function public.be_dispatch_ready_queue_v71(
  p_limit integer default 200,
  p_region_code text default 'YANGON'
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_base jsonb;
  v_rows jsonb;
begin
  v_base:=public.be_dispatch_ready_queue_v19(10000,p_region_code);

  select coalesce(jsonb_agg(
    e || case when r.delivery_way_id is not null then
      jsonb_build_object(
        'rescheduled_delivery_date',r.requested_delivery_date,
        'reschedule_reason_code',r.reason_code,
        'dedicated_delivery_date_due',true
      )
    else '{}'::jsonb end
    order by coalesce((e->>'created_at')::timestamptz,now()) desc
  ),'[]'::jsonb)
  into v_rows
  from (
    select e
    from jsonb_array_elements(coalesce(v_base->'queue','[]'::jsonb)) e
    where public.be_delivery_schedule_allows_wayplan_v71(e->>'delivery_way_id')
    limit greatest(coalesce(p_limit,200),1)
  ) q
  left join public.be_delivery_reschedules_v71 r
    on r.delivery_way_id=q.e->>'delivery_way_id'
   and r.status='ACTIVE'
   and r.requested_delivery_date<=(now() at time zone 'Asia/Yangon')::date;

  return (v_base-'queue'-'count'-'build')||jsonb_build_object(
    'queue',v_rows,
    'count',jsonb_array_length(v_rows),
    'build','WAYPLAN_REGION_QUEUE_V71_RESCHEDULE_DATE',
    'schedule_date_timezone','Asia/Yangon'
  );
end;
$function$;

grant execute on function public.be_dispatch_ready_queue_v71(integer,text) to authenticated;

create or replace function public.be_multi_van_queue(p_region text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_queue jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  v_queue:=public.be_dispatch_ready_queue_v71(10000,p_region);
  return v_queue||jsonb_build_object('build','MULTI_VAN_QUEUE_V71_RESCHEDULE_DATE');
end;
$function$;

grant execute on function public.be_multi_van_queue(text) to authenticated;

create or replace function public.be_wayplan_eligible_rows_v69(p_region text)
returns table(
  delivery_way_id text,
  waybill_no text,
  pickup_id text,
  pickup_way_id text,
  merchant_name text,
  merchant_code text,
  recipient_name text,
  recipient_phone text,
  township text,
  address text,
  cod_amount numeric,
  delivery_fee numeric,
  parcel_weight_kg numeric,
  dispatch_status text,
  warehouse_status text,
  wayplan_status text,
  created_at timestamptz,
  updated_at timestamptz,
  delivery_region text,
  delivery_route_mode text,
  location_required boolean,
  service_provider_code text,
  latitude numeric,
  longitude numeric,
  metadata jsonb
)
language sql
stable security definer
set search_path to 'public','auth','pg_temp'
as $function$
  select
    x.delivery_way_id,x.waybill_no,x.pickup_id,x.pickup_way_id,
    x.merchant_name,x.merchant_code,x.recipient_name,x.recipient_phone,
    x.township,x.address,x.cod_amount,x.delivery_fee,x.parcel_weight_kg,
    x.dispatch_status,x.warehouse_status,x.wayplan_status,x.created_at,x.updated_at,
    x.delivery_region,x.delivery_route_mode,x.location_required,x.service_provider_code,
    x.latitude,x.longitude,x.metadata
  from jsonb_to_recordset(
    coalesce(public.be_dispatch_ready_queue_v71(10000,p_region)->'queue','[]'::jsonb)
  ) as x(
    delivery_way_id text,
    waybill_no text,
    pickup_id text,
    pickup_way_id text,
    merchant_name text,
    merchant_code text,
    recipient_name text,
    recipient_phone text,
    township text,
    address text,
    cod_amount numeric,
    delivery_fee numeric,
    parcel_weight_kg numeric,
    dispatch_status text,
    warehouse_status text,
    wayplan_status text,
    created_at timestamptz,
    updated_at timestamptz,
    delivery_region text,
    delivery_route_mode text,
    location_required boolean,
    service_provider_code text,
    latitude numeric,
    longitude numeric,
    metadata jsonb
  );
$function$;

grant execute on function public.be_wayplan_eligible_rows_v69(text) to authenticated;

create or replace function public.be_warehouse_return_scan_v71(
  p_tracking_no text,
  p_reason_code text,
  p_delivery_date date default null,
  p_actor_email text default null,
  p_remark text default null,
  p_warehouse_code text default 'YGN-MAIN'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_input text:=nullif(upper(btrim(coalesce(p_tracking_no,''))),'');
  v_internal text;
  v_reason text:=upper(nullif(btrim(coalesce(p_reason_code,'')),''));
  v_result jsonb;
  v_schedule jsonb:='{}'::jsonb;
begin
  if v_input is null then raise exception 'Delivery Way ID is required'; end if;
  v_internal:=public.be_resolve_internal_way_id_v70(v_input,null);
  if v_internal is null then raise exception 'Way ID % was not found',v_input; end if;

  if v_reason='CUSTOMER_REQUESTED_RESCHEDULE' and p_delivery_date is null then
    raise exception 'Dedicated delivery date is required for customer reschedule';
  end if;

  v_result:=public.be_warehouse_return_scan(
    v_internal,v_reason,p_actor_email,p_remark,p_warehouse_code
  );

  if v_reason='CUSTOMER_REQUESTED_RESCHEDULE' then
    v_schedule:=public.be_set_delivery_reschedule_v71(
      v_internal,p_delivery_date,v_reason,p_actor_email,p_remark
    );
  end if;

  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'input_way_id',v_input,
    'operational_way_id',public.be_operational_way_id_v70(v_internal),
    'internal_delivery_way_id',v_internal,
    'reschedule',v_schedule,
    'build','WAREHOUSE_RETURN_RESCHEDULE_V71'
  );
end;
$function$;

grant execute on function public.be_warehouse_return_scan_v71(text,text,date,text,text,text) to authenticated;


-- Rider/Driver delivery exception wrapper. The existing field action still owns
-- attempt counting and proof/status rules; V71 only adds dated reschedule state.
create or replace function public.be_field_team_delivery_action_v71(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_result jsonb;
  v_action text:=lower(btrim(coalesce(p_payload->>'action',p_payload->>'source_action','')));
  v_reason text:=upper(btrim(coalesce(p_payload->>'exception_code',p_payload->>'exception_reason','')));
  v_input_way text:=coalesce(
    nullif(upper(btrim(p_payload->>'delivery_way_id')),''),
    nullif(upper(btrim(p_payload->>'tracking_no')),''),
    case when upper(coalesce(p_payload->>'pickup_id','')) ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]{3}$'
         then upper(btrim(p_payload->>'pickup_id')) end
  );
  v_date date;
  v_actor text:=coalesce(lower(auth.jwt()->>'email'),nullif(lower(btrim(p_payload->>'actor_email')),''));
  v_schedule jsonb:='{}'::jsonb;
begin
  v_result:=public.be_field_team_delivery_action(p_payload);

  if (v_action='exception' or v_action like '%delivery_exception%' or v_action like '%delivery_failed%')
     and v_reason='CUSTOMER_REQUESTED_RESCHEDULE' then
    begin
      v_date:=nullif(btrim(coalesce(
        p_payload->>'requested_delivery_date',
        p_payload->>'reschedule_date',
        p_payload->>'next_attempt_date'
      )), '')::date;
    exception when others then
      raise exception 'A valid dedicated delivery date is required for customer reschedule';
    end;

    if v_date is null then
      raise exception 'Dedicated delivery date is required for customer reschedule';
    end if;
    if v_input_way is null then
      raise exception 'Delivery Way ID is required for customer reschedule';
    end if;

    v_schedule:=public.be_set_delivery_reschedule_v71(
      v_input_way,
      v_date,
      v_reason,
      v_actor,
      coalesce(nullif(btrim(p_payload->>'remark'),''),nullif(btrim(p_payload->>'remarks'),''))
    );
  end if;

  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'reschedule',v_schedule,
    'build','FIELD_DELIVERY_ACTION_V71_RESCHEDULE'
  );
end;
$function$;

grant execute on function public.be_field_team_delivery_action_v71(jsonb) to authenticated;

create or replace function public.be_rider_pickup_action(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_identity jsonb:=private.be_field_primary_context_v101();
  v_role text:=lower(v_identity->>'role');
  v_action text:=lower(btrim(coalesce(p_payload->>'action',p_payload->>'source_action','')));
  v_id text:=upper(btrim(coalesce(
    p_payload->>'delivery_way_id',
    p_payload->>'tracking_no',
    p_payload->>'pickup_id',
    p_payload->>'pickup_way_id',''
  )));
  v_process text:=lower(btrim(coalesce(p_payload->>'process_type',p_payload->>'workflow_area','')));
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTHENTICATED_FIELD_SESSION_REQUIRED'); end if;
  if v_role not in ('rider','driver','helper') then return jsonb_build_object('ok',false,'error','FIELD_ROLE_NOT_RECOGNIZED'); end if;

  if v_id ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]{3}$'
     or v_action in ('start_delivery','out_for_delivery','deliver','delivered','verify_delivery','delivery_verified')
     or (v_action='exception' and v_process='delivery')
     or v_action like '%delivery_exception%'
     or v_action like '%delivery_failed%' then
    return public.be_field_team_delivery_action_v71(p_payload);
  end if;

  if v_role='helper' and v_action in (
    'verify_pickup','pickup_verify','pickup_verified','verify',
    'collect','pickup_collected','collected','delivered_to_warehouse'
  ) then
    return jsonb_build_object(
      'ok',false,'error','PRIMARY_WORKER_REQUIRED',
      'message','Only assigned rider or driver can finalize pickup or delivery. Helper may upload evidence and report exceptions.'
    );
  end if;

  return public.be_rider_pickup_action_primary_guard_legacy_v101(
    p_payload||jsonb_build_object(
      'authenticated_worker_code',v_identity->>'worker_code',
      'authenticated_worker_role',v_role
    )
  );
end;
$function$;

grant execute on function public.be_rider_pickup_action(jsonb) to authenticated;
