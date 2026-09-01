create or replace function public.be_validate_rider_delivery_proof_v12_15(
  p_proof_url text,
  p_delivery_way_id text,
  p_parent_pickup_id text,
  p_worker_id uuid,
  p_delivery_started_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,storage,pg_temp
as $$
declare
  v_url text := btrim(coalesce(p_proof_url,''));
  v_name text;
  v_obj storage.objects%rowtype;
  v_bound boolean := false;
  v_used_elsewhere boolean := false;
begin
  if v_url='' then
    return jsonb_build_object('ok',false,'error','DELIVERY_PROOF_PHOTO_REQUIRED');
  end if;

  v_name := regexp_replace(
    v_url,
    '^.*?/rider-proofs/',
    ''
  );
  v_name := split_part(v_name,'?',1);
  v_name := replace(v_name,'%2F','/');
  v_name := replace(v_name,'%2f','/');

  select o.* into v_obj
  from storage.objects o
  where o.bucket_id='rider-proofs'
    and o.name=v_name
  limit 1;

  if not found then
    return jsonb_build_object('ok',false,'error','RIDER_DELIVERY_PROOF_NOT_FOUND','object_name',v_name);
  end if;

  if v_obj.owner is distinct from p_worker_id then
    return jsonb_build_object('ok',false,'error','RIDER_DELIVERY_PROOF_NOT_OWNED','object_name',v_name);
  end if;

  if lower(coalesce(v_obj.metadata->>'mimetype','')) not like 'image/%' then
    return jsonb_build_object('ok',false,'error','RIDER_DELIVERY_PROOF_MUST_BE_IMAGE','object_name',v_name);
  end if;

  if coalesce((v_obj.metadata->>'size')::bigint,0)<=0 then
    return jsonb_build_object('ok',false,'error','RIDER_DELIVERY_PROOF_EMPTY','object_name',v_name);
  end if;

  if p_delivery_started_at is not null
     and v_obj.created_at < p_delivery_started_at - interval '2 minutes' then
    return jsonb_build_object(
      'ok',false,
      'error','RIDER_DELIVERY_PROOF_PREDATES_DELIVERY',
      'object_name',v_name,
      'proof_created_at',v_obj.created_at,
      'delivery_started_at',p_delivery_started_at
    );
  end if;

  v_bound := position(upper(coalesce(p_delivery_way_id,'')) in upper(v_name))>0
             or (
               coalesce(p_parent_pickup_id,'')<>''
               and position(upper(p_parent_pickup_id) in upper(v_name))>0
             );

  if not v_bound then
    return jsonb_build_object(
      'ok',false,
      'error','RIDER_DELIVERY_PROOF_NOT_BOUND_TO_DELIVERY',
      'object_name',v_name,
      'delivery_way_id',p_delivery_way_id,
      'pickup_id',p_parent_pickup_id
    );
  end if;

  select exists(
    select 1
    from public.be_wayplan_dispatch_stops s
    where s.delivery_way_id<>p_delivery_way_id
      and (
        coalesce(s.rider_proof_url,'')=v_url
        or coalesce(s.proof_url,'')=v_url
        or split_part(regexp_replace(coalesce(s.rider_proof_url,s.proof_url,''),'^.*?/rider-proofs/',''), '?', 1)=v_name
      )
  ) into v_used_elsewhere;

  if v_used_elsewhere then
    return jsonb_build_object('ok',false,'error','RIDER_DELIVERY_PROOF_ALREADY_USED','object_name',v_name);
  end if;

  return jsonb_build_object(
    'ok',true,
    'build','RIDER_DELIVERY_PROOF_BINDING_V12_15_20260901',
    'object_name',v_name,
    'created_at',v_obj.created_at,
    'mimetype',v_obj.metadata->>'mimetype',
    'size',coalesce((v_obj.metadata->>'size')::bigint,0),
    'bound_to_delivery',true,
    'owner_verified',true,
    'fresh_after_start',true,
    'unique_use',true
  );
end;
$$;

grant execute on function public.be_validate_rider_delivery_proof_v12_15(text,text,text,uuid,timestamptz) to authenticated;

create or replace function public.be_field_team_delivery_action(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_identity jsonb := public.be_current_field_team_identity();
  v_uid uuid := auth.uid();
  v_code text := upper(coalesce(v_identity->>'worker_code',''));
  v_email text := lower(coalesce(v_identity->>'email',''));
  v_role text := lower(coalesce(v_identity->>'role',''));
  v_action text := lower(btrim(coalesce(p_payload->>'action',p_payload->>'source_action','')));
  v_delivery_way_id text := coalesce(
    nullif(upper(btrim(p_payload->>'delivery_way_id')),''),
    case when upper(coalesce(p_payload->>'pickup_id','')) ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]{3}$' then upper(btrim(p_payload->>'pickup_id')) end,
    case when upper(coalesce(p_payload->>'pickup_way_id','')) ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]{3}$' then upper(btrim(p_payload->>'pickup_way_id')) end
  );
  v_wayplan_id text;
  v_parent_pickup_id text;
  v_stop_status text;
  v_wayplan_status text;
  v_rider_code text;
  v_driver_code text;
  v_helper_code text;
  v_required_cod numeric := 0;
  v_collected_cod numeric := 0;
  v_has_scan boolean := false;
  v_delivery_started_at timestamptz;
  v_recipient_name text := nullif(btrim(coalesce(p_payload->>'recipient_name','')),'');
  v_recipient_phone text := nullif(btrim(coalesce(p_payload->>'recipient_phone','')),'');
  v_proof_url text := nullif(btrim(coalesce(p_payload->>'proof_url','')),'');
  v_reason text := nullif(btrim(coalesce(p_payload->>'reason',p_payload->>'exception_reason',p_payload->>'remark',p_payload->>'remarks','')),'');
  v_operation_id text := coalesce(nullif(btrim(p_payload->>'operation_id'),''),gen_random_uuid()::text);
  v_failure jsonb := '{}'::jsonb;
  v_failure_status text;
  v_proof_check jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','AUTHENTICATED_FIELD_SESSION_REQUIRED'); end if;
  if v_role not in ('rider','driver','helper') then return jsonb_build_object('ok',false,'error','FIELD_ROLE_NOT_RECOGNIZED'); end if;
  if v_delivery_way_id is null then raise exception 'DELIVERY_WAY_ID_REQUIRED: canonical D... DeliveryWayID required' using errcode='22023'; end if;

  select s.wayplan_id,
         coalesce(d.pickup_id,s.pickup_id,m.pickup_id,v_delivery_way_id),
         upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')),
         upper(coalesce(w.wayplan_status,'')),
         upper(coalesce(m.rider_code,w.rider_code,s.rider_code,'')),
         upper(coalesce(m.driver_code,w.driver_code,'')),
         upper(coalesce(m.helper_code,w.helper_code,'')),
         coalesce(d.actual_collect,d.cod_amount,s.cod_amount,0),
         exists(select 1 from public.be_dispatch_scans_v39 ds where ds.delivery_way_id=s.delivery_way_id and ds.scan_status='SCANNED'),
         case
           when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('OUT_FOR_DELIVERY','ARRIVED_AT_CUSTOMER')
             then s.updated_at
           else null
         end
    into v_wayplan_id,v_parent_pickup_id,v_stop_status,v_wayplan_status,v_rider_code,v_driver_code,v_helper_code,v_required_cod,v_has_scan,v_delivery_started_at
  from public.be_wayplan_dispatch_stops s
  join public.be_wayplan_dispatches w on w.wayplan_id=s.wayplan_id
  left join lateral (
    select mm.* from public.be_wayplan_membership_v40 mm
    where mm.wayplan_id=s.wayplan_id and mm.delivery_way_id=s.delivery_way_id
    order by mm.updated_at desc nulls last limit 1
  ) m on true
  join lateral (
    select dd.* from public.be_data_entry_parcel_details dd
    where dd.delivery_way_id=s.delivery_way_id
    order by dd.updated_at desc nulls last,dd.saved_at desc nulls last limit 1
  ) d on true
  where s.delivery_way_id=v_delivery_way_id
  order by s.updated_at desc nulls last
  limit 1
  for update of s;

  if not found then raise exception 'DELIVERY_NOT_FOUND_OR_NOT_REGISTERED: %',v_delivery_way_id using errcode='P0002'; end if;
  if not (case v_role when 'rider' then v_rider_code=v_code when 'driver' then v_driver_code=v_code when 'helper' then v_helper_code=v_code else false end) then
    raise exception 'DELIVERY_NOT_ASSIGNED_TO_SIGNED_IN_FIELD_WORKER: %',v_delivery_way_id using errcode='42501';
  end if;
  if v_wayplan_status in ('ON_HOLD','CANCELLED','DRAFT','REJECTED') then raise exception 'WAYPLAN_NOT_RELEASED_FOR_DELIVERY: % is %',v_wayplan_id,v_wayplan_status using errcode='22023'; end if;

  if v_action in ('start_delivery','out_for_delivery') then
    if v_role='helper' then return jsonb_build_object('ok',false,'error','PRIMARY_WORKER_REQUIRED','message','Only assigned rider or driver can start delivery.'); end if;
    if not v_has_scan then raise exception 'DISPATCH_SCAN_REQUIRED_BEFORE_DELIVERY: %',v_delivery_way_id using errcode='22023'; end if;
    if v_stop_status in ('DELIVERED','COMPLETED') then return jsonb_build_object('ok',true,'delivery_way_id',v_delivery_way_id,'action','start_delivery','mobile_status','DELIVERED','already_applied',true); end if;
    if v_stop_status in ('RTO','RETURN_TO_WAREHOUSE','CANCELLED') then raise exception 'DELIVERY_CANNOT_RESTART_FROM_STATUS: %',v_stop_status using errcode='22023'; end if;
    if v_stop_status='OUT_FOR_DELIVERY' then return jsonb_build_object('ok',true,'delivery_way_id',v_delivery_way_id,'action','start_delivery','mobile_status','OUT_FOR_DELIVERY','already_applied',true); end if;

    update public.be_wayplan_dispatch_stops
       set stop_status='OUT_FOR_DELIVERY',rider_status='OUT_FOR_DELIVERY',dispatch_status='OUT_FOR_DELIVERY',updated_at=now(),
           metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('rider_mobile_action','START_DELIVERY','worker_code',v_code,'worker_role',v_role,'delivery_started_at',now(),'action_at',now())
     where delivery_way_id=v_delivery_way_id and wayplan_id=v_wayplan_id;
    update public.be_data_entry_parcel_details set parcel_status='OUT_FOR_DELIVERY',updated_at=now() where delivery_way_id=v_delivery_way_id;
    update public.be_waybill_ledger
       set dispatch_status='OUT_FOR_DELIVERY',wayplan_status='OUT_FOR_DELIVERY',rider_status='OUT_FOR_DELIVERY',updated_at=now(),
           metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('rider_mobile_action','START_DELIVERY','worker_code',v_code,'delivery_started_at',now(),'action_at',now())
     where delivery_way_id=v_delivery_way_id or tracking_no=v_delivery_way_id;
    return jsonb_build_object('ok',true,'delivery_way_id',v_delivery_way_id,'pickup_id',v_parent_pickup_id,'wayplan_id',v_wayplan_id,'action','start_delivery','mobile_status','OUT_FOR_DELIVERY','required_cod',v_required_cod);
  end if;

  if v_action in ('deliver','delivered','verify_delivery','delivery_verified') then
    if v_role='helper' then return jsonb_build_object('ok',false,'error','PRIMARY_WORKER_REQUIRED','message','Only assigned rider or driver can finalize delivery.'); end if;
    if not v_has_scan then raise exception 'DISPATCH_SCAN_REQUIRED_BEFORE_DELIVERED: %',v_delivery_way_id using errcode='22023'; end if;
    if v_stop_status in ('DELIVERED','COMPLETED') then return jsonb_build_object('ok',true,'delivery_way_id',v_delivery_way_id,'action','deliver','mobile_status','DELIVERED','already_applied',true); end if;
    if v_stop_status not in ('OUT_FOR_DELIVERY','ARRIVED_AT_CUSTOMER') then raise exception 'START_DELIVERY_REQUIRED_BEFORE_DELIVERED: current status %',coalesce(v_stop_status,'NULL') using errcode='22023'; end if;
    if v_recipient_name is null then raise exception 'RECIPIENT_NAME_REQUIRED' using errcode='22023'; end if;
    if v_proof_url is null then raise exception 'DELIVERY_PROOF_PHOTO_REQUIRED' using errcode='22023'; end if;
    begin v_collected_cod:=coalesce(nullif(btrim(p_payload->>'cod_collected_amount'),'')::numeric,0); exception when others then raise exception 'INVALID_COD_COLLECTED_AMOUNT' using errcode='22023'; end;
    if coalesce(v_required_cod,0)>0 and v_collected_cod<v_required_cod then raise exception 'COD_COLLECTION_REQUIRED: required %, collected %',v_required_cod,v_collected_cod using errcode='22023'; end if;

    v_proof_check := public.be_validate_rider_delivery_proof_v12_15(v_proof_url,v_delivery_way_id,v_parent_pickup_id,v_uid,v_delivery_started_at);
    if not coalesce((v_proof_check->>'ok')::boolean,false) then
      raise exception '%',coalesce(v_proof_check->>'error','RIDER_DELIVERY_PROOF_INVALID') using errcode='42501';
    end if;

    update public.be_wayplan_dispatch_stops
       set stop_status='DELIVERED',rider_status='DELIVERED',dispatch_status='DELIVERED',delivered_at=coalesce(delivered_at,now()),
           cod_collected=v_collected_cod,rider_proof_url=v_proof_url,proof_url=v_proof_url,receiver_name=v_recipient_name,receiver_phone=v_recipient_phone,failed_reason=null,updated_at=now(),
           metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('rider_mobile_action','DELIVERED','worker_code',v_code,'worker_role',v_role,'required_cod',v_required_cod,'cod_collected',v_collected_cod,'proof_url',v_proof_url,'proof_validation',v_proof_check,'action_at',now())
     where delivery_way_id=v_delivery_way_id and wayplan_id=v_wayplan_id;
    update public.be_data_entry_parcel_details set parcel_status='DELIVERED',updated_at=now() where delivery_way_id=v_delivery_way_id;
    update public.be_waybill_ledger
       set dispatch_status='DELIVERED',wayplan_status='DELIVERED',rider_status='DELIVERED',delivered_at=coalesce(delivered_at,now()),cod_collected=v_collected_cod,rider_proof_url=v_proof_url,failed_reason=null,updated_at=now(),
           metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('rider_mobile_action','DELIVERED','worker_code',v_code,'required_cod',v_required_cod,'cod_collected',v_collected_cod,'proof_url',v_proof_url,'proof_validation',v_proof_check,'action_at',now())
     where delivery_way_id=v_delivery_way_id or tracking_no=v_delivery_way_id;
    update public.be_wayplan_membership_v40
       set membership_status='COMPLETED',updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('rider_mobile_result','DELIVERED','result_at',now(),'worker_code',v_code)
     where wayplan_id=v_wayplan_id and delivery_way_id=v_delivery_way_id;
    perform public.be_record_delivery_success_v39(v_delivery_way_id,coalesce(nullif(v_email,''),v_code),v_operation_id);
    return jsonb_build_object('ok',true,'delivery_way_id',v_delivery_way_id,'pickup_id',v_parent_pickup_id,'wayplan_id',v_wayplan_id,'action','deliver','mobile_status','DELIVERED','required_cod',v_required_cod,'cod_collected',v_collected_cod,'proof_url',v_proof_url,'proof_validation',v_proof_check);
  end if;

  if v_action='exception' or v_action like '%delivery_exception%' or v_action like '%delivery_failed%' then
    if v_reason is null then raise exception 'DELIVERY_EXCEPTION_REASON_REQUIRED' using errcode='22023'; end if;
    if v_stop_status in ('DELIVERED','COMPLETED') then raise exception 'DELIVERED_STOP_CANNOT_BE_FAILED' using errcode='22023'; end if;
    if v_proof_url is not null then
      v_proof_check := public.be_validate_rider_delivery_proof_v12_15(v_proof_url,v_delivery_way_id,v_parent_pickup_id,v_uid,v_delivery_started_at);
      if not coalesce((v_proof_check->>'ok')::boolean,false) then
        raise exception '%',coalesce(v_proof_check->>'error','RIDER_DELIVERY_PROOF_INVALID') using errcode='42501';
      end if;
    end if;
    select public.be_record_delivery_failure_v39(v_delivery_way_id,v_reason,coalesce(nullif(v_email,''),v_code),v_operation_id) into v_failure;
    v_failure_status:=upper(coalesce(v_failure->>'status','ATTEMPTED_FAILED'));
    update public.be_wayplan_dispatch_stops
       set stop_status=case when v_failure_status='RTO' then 'RETURN_TO_WAREHOUSE' else 'FAILED_DELIVERY' end,
           rider_status=case when v_failure_status='RTO' then 'RTO' else 'DELIVERY_FAILED' end,dispatch_status=v_failure_status,failed_reason=v_reason,
           rider_proof_url=coalesce(v_proof_url,rider_proof_url),proof_url=coalesce(v_proof_url,proof_url),updated_at=now(),
           metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('rider_mobile_action','DELIVERY_EXCEPTION','worker_code',v_code,'worker_role',v_role,'failure_status',v_failure_status,'reason',v_reason,'proof_url',v_proof_url,'proof_validation',v_proof_check,'action_at',now())
     where delivery_way_id=v_delivery_way_id and wayplan_id=v_wayplan_id;
    update public.be_data_entry_parcel_details set parcel_status=v_failure_status,updated_at=now() where delivery_way_id=v_delivery_way_id;
    update public.be_waybill_ledger
       set dispatch_status=v_failure_status,rider_status=v_failure_status,failed_reason=v_reason,rider_proof_url=coalesce(v_proof_url,rider_proof_url),updated_at=now(),
           metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('rider_mobile_action','DELIVERY_EXCEPTION','worker_code',v_code,'failure_status',v_failure_status,'reason',v_reason,'proof_url',v_proof_url,'proof_validation',v_proof_check,'action_at',now())
     where delivery_way_id=v_delivery_way_id or tracking_no=v_delivery_way_id;
    if v_failure_status='RTO' then
      update public.be_wayplan_membership_v40 set membership_status='RTO',updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('rider_mobile_result','RTO','result_at',now(),'worker_code',v_code,'reason',v_reason) where wayplan_id=v_wayplan_id and delivery_way_id=v_delivery_way_id;
    end if;
    return v_failure||jsonb_build_object('ok',true,'delivery_way_id',v_delivery_way_id,'pickup_id',v_parent_pickup_id,'wayplan_id',v_wayplan_id,'action','exception','mobile_status',case when v_failure_status='RTO' then 'RTO' else 'DELIVERY_FAILED' end,'proof_url',v_proof_url,'proof_validation',v_proof_check);
  end if;

  raise exception 'UNSUPPORTED_DELIVERY_ACTION: %',coalesce(nullif(v_action,''),'EMPTY') using errcode='22023';
end;
$$;

revoke all on function public.be_validate_rider_delivery_proof_v12_15(text,text,text,uuid,timestamptz) from public;
grant execute on function public.be_validate_rider_delivery_proof_v12_15(text,text,text,uuid,timestamptz) to authenticated;
revoke all on function public.be_field_team_delivery_action(jsonb) from public;
revoke all on function public.be_field_team_delivery_action(jsonb) from anon;
grant execute on function public.be_field_team_delivery_action(jsonb) to authenticated;;
