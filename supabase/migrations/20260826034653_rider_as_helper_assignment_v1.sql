
create or replace view public.be_v_active_helper_candidates
with (security_invoker = true)
as
select h.code, h.name, h.phone, h.zone, h.branch_code, h.status,
       'HELPER'::text as master_role,
       false as acting_as_helper,
       h.name::text as display_name
from public.be_v_active_helpers h
union all
select r.code, r.name, r.phone, r.zone, r.branch_code, r.status,
       'RIDER'::text as master_role,
       true as acting_as_helper,
       (r.name || ' (Rider acting as Helper)')::text as display_name
from public.be_v_active_riders r
where not exists (
  select 1 from public.be_v_active_helpers h
  where upper(h.code)=upper(r.code)
);

revoke all on public.be_v_active_helper_candidates from anon;
grant select on public.be_v_active_helper_candidates to authenticated;

create or replace function public.be_wayplan_distinct_rider_helper_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if nullif(btrim(coalesce(new.rider_code,'')),'') is not null
     and upper(btrim(new.rider_code))=upper(btrim(coalesce(new.helper_code,''))) then
    raise exception using
      errcode='23514',
      message='The same workforce member cannot be assigned as both Rider and Helper on one wayplan.';
  end if;
  return new;
end;
$$;

drop trigger if exists be_wayplan_distinct_rider_helper_guard on public.be_wayplan_dispatches;
create trigger be_wayplan_distinct_rider_helper_guard
before insert or update of rider_code, helper_code
on public.be_wayplan_dispatches
for each row execute function public.be_wayplan_distinct_rider_helper_guard();

create or replace function public.be_rider_delivery_wayplan_jobs(
  p_rider_code text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_identity jsonb := public.be_current_field_team_identity();
  v_code text := upper(v_identity->>'worker_code');
  v_rows jsonb := '[]'::jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.wayplan_created_at desc, x.stop_sequence asc),'[]'::jsonb)
  into v_rows
  from (
    select j.*,
      case
        when upper(coalesce(j.helper_code,''))=v_code then 'HELPER'
        when upper(coalesce(j.rider_code,''))=v_code then 'RIDER'
        when upper(coalesce(j.driver_code,''))=v_code then 'DRIVER'
      end as assignment_role
    from public.be_v_rider_delivery_wayplan_jobs j
    where upper(coalesce(j.helper_code,''))=v_code
       or upper(coalesce(j.rider_code,''))=v_code
       or upper(coalesce(j.driver_code,''))=v_code
    order by j.wayplan_created_at desc, j.stop_sequence asc
    limit least(greatest(coalesce(p_limit,100),1),500)
  ) x;

  return jsonb_build_object(
    'ok',true,
    'source','be_rider_delivery_wayplan_jobs_dual_role_v3_20260826',
    'identity',v_identity,
    'count',jsonb_array_length(v_rows),
    'jobs',v_rows
  );
end;
$$;

revoke all on function public.be_rider_delivery_wayplan_jobs(text,integer) from public, anon;
grant execute on function public.be_rider_delivery_wayplan_jobs(text,integer) to authenticated;

create or replace function public.be_rider_wayplan_action(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_identity jsonb := public.be_current_field_team_identity();
  v_uid uuid := (v_identity->>'auth_user_id')::uuid;
  v_code text := upper(v_identity->>'worker_code');
  v_wayplan text := nullif(btrim(p_payload->>'wayplan_id'),'');
  v_delivery text := nullif(btrim(p_payload->>'delivery_way_id'),'');
  v_action text := lower(btrim(coalesce(p_payload->>'action','')));
  v_allowed boolean := false;
  v_assignment_role text;
  v_stop public.be_wayplan_dispatch_stops%rowtype;
  v_receiver text := nullif(btrim(p_payload->>'receiver_name'),'');
  v_phone text := nullif(btrim(p_payload->>'receiver_phone'),'');
  v_photo text := nullif(btrim(p_payload->>'proof_url'),'');
  v_signature text := nullif(btrim(coalesce(p_payload->>'signature_path',p_payload->>'signature_url')),'');
  v_signature_payload jsonb := coalesce(p_payload->'signature_payload','{}'::jsonb);
  v_payment_method text := upper(nullif(btrim(p_payload->>'payment_method'),''));
  v_transaction_ref text := nullif(btrim(p_payload->>'transaction_reference'),'');
  v_cod numeric := coalesce(nullif(p_payload->>'cod_collected','')::numeric,0);
  v_result jsonb;
begin
  if v_wayplan is null or v_delivery is null then
    return jsonb_build_object('ok',false,'error','wayplan_id and delivery_way_id are required');
  end if;

  select true,
    case
      when upper(coalesce(m.helper_code,''))=v_code then 'HELPER'
      when upper(coalesce(m.rider_code,''))=v_code then 'RIDER'
      when upper(coalesce(m.driver_code,''))=v_code then 'DRIVER'
    end
  into v_allowed, v_assignment_role
  from public.be_wayplan_membership_v40 m
  where m.wayplan_id=v_wayplan and m.delivery_way_id=v_delivery
    and (
      upper(coalesce(m.helper_code,''))=v_code
      or upper(coalesce(m.rider_code,''))=v_code
      or upper(coalesce(m.driver_code,''))=v_code
    )
  limit 1;

  if not coalesce(v_allowed,false) then
    return jsonb_build_object('ok',false,'error','WAYPLAN_NOT_ASSIGNED_TO_SIGNED_IN_WORKER');
  end if;

  select * into v_stop from public.be_wayplan_dispatch_stops
  where wayplan_id=v_wayplan and delivery_way_id=v_delivery for update;
  if not found then return jsonb_build_object('ok',false,'error','Wayplan stop not found'); end if;

  if v_action='deliver' then
    if upper(coalesce(v_stop.stop_status,v_stop.rider_status,'')) <> 'ARRIVED_AT_CUSTOMER' then
      return jsonb_build_object('ok',false,'error','Record Arrived at Customer before confirming delivery');
    end if;
    if v_receiver is null then return jsonb_build_object('ok',false,'error','Receiver name is required'); end if;
    if v_photo is null then return jsonb_build_object('ok',false,'error','Delivery proof photo is required'); end if;
    if v_signature is null and v_signature_payload='{}'::jsonb then
      return jsonb_build_object('ok',false,'error','Customer electronic signature is required');
    end if;
    if v_payment_method is null or v_payment_method not in ('CASH','PREPAID','QR','BANK_TRANSFER','MOBILE_WALLET') then
      return jsonb_build_object('ok',false,'error','Valid payment method is required');
    end if;
    if coalesce(v_stop.cod_amount,0)>0 and v_cod<>coalesce(v_stop.cod_amount,0) then
      return jsonb_build_object('ok',false,'error','COD collected must equal required COD','required_cod',v_stop.cod_amount);
    end if;
    if v_payment_method in ('QR','BANK_TRANSFER','MOBILE_WALLET') and v_transaction_ref is null then
      return jsonb_build_object('ok',false,'error','Transaction reference is required for electronic payment');
    end if;
  end if;

  v_result := public.be_rider_wayplan_action_legacy_20260814(
    p_payload || jsonb_build_object('assignment_role',v_assignment_role)
  );
  if coalesce((v_result->>'ok')::boolean,false)=false then return v_result; end if;

  update public.be_wayplan_dispatch_stops
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'last_assignment_role',v_assignment_role,
        'last_action_workforce_code',v_code,
        'last_action_auth_user_id',v_uid,
        'last_action_at',now()
      ),
      updated_at=now()
  where wayplan_id=v_wayplan and delivery_way_id=v_delivery;

  if v_action='deliver' then
    update public.be_wayplan_dispatch_stops
    set receiver_signature_url=v_signature,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'payment_method',v_payment_method,
          'transaction_reference',v_transaction_ref,
          'payment_confirmed_at',now(),
          'confirmed_by_auth_user_id',v_uid,
          'confirmed_by_workforce_code',v_code,
          'assignment_role',v_assignment_role,
          'signature_path',v_signature
        ), updated_at=now()
    where wayplan_id=v_wayplan and delivery_way_id=v_delivery;

    insert into public.shipment_delivery_proofs(
      delivery_way_id,waybill_id,proof_type,receiver_name,receiver_phone,
      signature_url,signature_payload,photo_url,gps_lat,gps_lng,remarks,captured_at
    ) values (
      v_delivery,v_stop.waybill_no,'DELIVERY',v_receiver,v_phone,
      v_signature,v_signature_payload,v_photo,
      nullif(p_payload->>'gps_lat','')::numeric,nullif(p_payload->>'gps_lng','')::numeric,
      nullif(p_payload->>'remark',''),now()
    );

    update public.be_wayplan_items
    set receiver_name=v_receiver, receiver_phone=v_phone,
        delivery_proof_photo_url=v_photo, delivery_signature_data_url=v_signature,
        delivery_gps_lat=nullif(p_payload->>'gps_lat','')::numeric,
        delivery_gps_lng=nullif(p_payload->>'gps_lng','')::numeric,
        delivery_proof_metadata=coalesce(delivery_proof_metadata,'{}'::jsonb)||jsonb_build_object(
          'payment_method',v_payment_method,'transaction_reference',v_transaction_ref,
          'confirmed_by',v_code,'assignment_role',v_assignment_role,'confirmed_at',now()
        ), delivered_at=now(), delivery_status='DELIVERED', updated_at=now()
    where delivery_way_id=v_delivery or tracking_no=v_delivery;
  end if;

  return v_result||jsonb_build_object(
    'payment_method',v_payment_method,
    'transaction_reference',v_transaction_ref,
    'proof_saved',v_action='deliver',
    'assignment_role',v_assignment_role
  );
end;
$$;

revoke all on function public.be_rider_wayplan_action(jsonb) from public, anon;
grant execute on function public.be_rider_wayplan_action(jsonb) to authenticated;
;
