-- BRITIUM_RIDER_DELIVERY_WORKFLOW_V1_20260826
-- Assignment-scoped delivery proof, signature and payment validation.

begin;

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
  v_role text := lower(v_identity->>'role');
  v_rows jsonb := '[]'::jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.wayplan_created_at desc, x.stop_sequence asc),'[]'::jsonb)
  into v_rows
  from (
    select j.*
    from public.be_v_rider_delivery_wayplan_jobs j
    where case v_role
      when 'driver' then upper(coalesce(j.driver_code,'')) = v_code
      when 'helper' then upper(coalesce(j.helper_code,'')) = v_code
      else upper(coalesce(j.rider_code,'')) = v_code
    end
    order by j.wayplan_created_at desc, j.stop_sequence asc
    limit least(greatest(coalesce(p_limit,100),1),500)
  ) x;

  return jsonb_build_object(
    'ok',true,
    'source','be_rider_delivery_wayplan_jobs_auth_v2_20260826',
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
  v_role text := lower(v_identity->>'role');
  v_wayplan text := nullif(btrim(p_payload->>'wayplan_id'),'');
  v_delivery text := nullif(btrim(p_payload->>'delivery_way_id'),'');
  v_action text := lower(btrim(coalesce(p_payload->>'action','')));
  v_allowed boolean := false;
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

  select exists(
    select 1 from public.be_wayplan_membership_v40 m
    where m.wayplan_id=v_wayplan and m.delivery_way_id=v_delivery
      and case v_role
        when 'driver' then upper(coalesce(m.driver_code,''))=v_code
        when 'helper' then upper(coalesce(m.helper_code,''))=v_code
        else upper(coalesce(m.rider_code,''))=v_code
      end
  ) into v_allowed;

  if not v_allowed then
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

  v_result := public.be_rider_wayplan_action_legacy_20260814(p_payload);
  if coalesce((v_result->>'ok')::boolean,false)=false then return v_result; end if;

  if v_action='deliver' then
    update public.be_wayplan_dispatch_stops
    set receiver_signature_url=v_signature,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'payment_method',v_payment_method,
          'transaction_reference',v_transaction_ref,
          'payment_confirmed_at',now(),
          'confirmed_by_auth_user_id',v_uid,
          'confirmed_by_workforce_code',v_code,
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
          'confirmed_by',v_code,'confirmed_at',now()
        ), delivered_at=now(), delivery_status='DELIVERED', updated_at=now()
    where delivery_way_id=v_delivery or tracking_no=v_delivery;
  end if;

  return v_result||jsonb_build_object('payment_method',v_payment_method,'transaction_reference',v_transaction_ref,'proof_saved',v_action='deliver');
end;
$$;

revoke all on function public.be_rider_wayplan_action(jsonb) from public, anon;
grant execute on function public.be_rider_wayplan_action(jsonb) to authenticated;

commit;
;
