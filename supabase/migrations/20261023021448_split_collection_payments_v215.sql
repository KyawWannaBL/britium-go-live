-- Split collections are reported by field workers; only Finance confirms settlement.
create or replace function public.be_validate_collection_allocations_v215(p_lines jsonb,p_total numeric)
returns jsonb language plpgsql immutable set search_path to public,pg_temp as $validator$
declare line jsonb; method text; amount numeric; reference text; total numeric:=0; result jsonb:='[]';
begin
 if p_total is null or p_total::text !~ '^[0-9]+([.][0-9]{1,2})?$' then raise exception 'INVALID_COLLECTION_TOTAL' using errcode='22023';end if;
 if p_lines is null or p_lines='null'::jsonb then return null;end if;
 if jsonb_typeof(p_lines)<>'array' then raise exception 'PAYMENT_LINES_REQUIRED' using errcode='22023';end if;
 if jsonb_array_length(p_lines)>20 then raise exception 'TOO_MANY_PAYMENT_LINES' using errcode='22023';end if;
 for line in select value from jsonb_array_elements(p_lines) loop
  method:=upper(btrim(coalesce(line->>'method','')));
  method:=case method when 'KBZPAY' then 'KBZ_PAY' when 'WAVEPAY' then 'WAVE_PAY' else method end;
  if method not in('CASH','KBZ_PAY','WAVE_PAY','AYA_PAY','CB_PAY','BANK_TRANSFER','MOBILE_WALLET','QR') then raise exception 'INVALID_PAYMENT_METHOD' using errcode='22023';end if;
  if coalesce(line->>'amount','') !~ '^[0-9]+([.][0-9]{1,2})?$' then raise exception 'INVALID_PAYMENT_AMOUNT' using errcode='22023';end if;
  amount:=(line->>'amount')::numeric;
  if amount<=0 then raise exception 'POSITIVE_PAYMENT_AMOUNT_REQUIRED' using errcode='22023';end if;
  reference:=nullif(btrim(line->>'reference'),'');
  if method<>'CASH' and reference is null then raise exception 'DIGITAL_PAYMENT_REFERENCE_REQUIRED' using errcode='22023';end if;
  total:=total+amount;
  result:=result||jsonb_build_array(jsonb_build_object('method',method,'amount',amount,'reference',coalesce(reference,'')));
 end loop;
 if total<>p_total then raise exception 'PAYMENT_TOTAL_MISMATCH: expected %, lines %',p_total,total using errcode='22023';end if;
 return result;
end;
$validator$;

-- Pure classification helper. Unknown legacy methods remain unclassified.
create or replace function public.be_collection_payment_totals_v215(p_metadata jsonb,p_amount numeric)
returns jsonb language plpgsql immutable set search_path to public,pg_temp as $totals$
declare lines jsonb; line jsonb; method text; methods jsonb:='{}'; amount numeric; cash numeric:=0; digital numeric:=0; unknown numeric:=0;
begin
 if p_amount is null then return jsonb_build_object('cash_collected',0,'digital_collected',0,'unclassified_collected',0,'total_collected',0,'by_method','{}'::jsonb,'unknown_count',1);end if;
 lines:=coalesce(nullif(p_metadata->'payment_allocations','null'::jsonb),nullif(p_metadata->'reported_payment_allocations','null'::jsonb));
 if lines is null then
  method:=upper(coalesce(p_metadata->>'payment_method',p_metadata->>'payment_mode',''));
  method:=case method when 'KBZPAY' then 'KBZ_PAY' when 'WAVEPAY' then 'WAVE_PAY' else method end;
  if method in('CASH','KBZ_PAY','WAVE_PAY','AYA_PAY','CB_PAY','BANK_TRANSFER','MOBILE_WALLET','QR') and p_amount>0 then
   lines:=jsonb_build_array(jsonb_build_object('method',method,'amount',p_amount,'reference',coalesce(p_metadata->>'payment_reference',p_metadata->>'collection_reference','LEGACY_RECORDED')));
  elsif p_amount=0 then lines:='[]';end if;
 end if;
 begin lines:=public.be_validate_collection_allocations_v215(lines,p_amount);exception when others then lines:=null;end;
 if lines is null then unknown:=p_amount;else
  for line in select value from jsonb_array_elements(lines) loop
   method:=line->>'method';amount:=(line->>'amount')::numeric;
   methods:=methods||jsonb_build_object(method,coalesce((methods->>method)::numeric,0)+amount);
   if method='CASH' then cash:=cash+amount;else digital:=digital+amount;end if;
  end loop;
 end if;
 return jsonb_build_object('cash_collected',cash,'digital_collected',digital,'unclassified_collected',unknown,'total_collected',p_amount,'by_method',methods,'unknown_count',0);
end;
$totals$;

CREATE OR REPLACE FUNCTION public.be_field_team_delivery_action(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_signature_url text := nullif(btrim(coalesce(p_payload->>'signature_url',p_payload->>'receiver_signature_url','')),'' );
  v_reason text := nullif(btrim(coalesce(p_payload->>'reason',p_payload->>'exception_reason',p_payload->>'remark',p_payload->>'remarks','')),'');
  v_operation_id text := coalesce(nullif(btrim(p_payload->>'operation_id'),''),gen_random_uuid()::text);
  v_failure jsonb := '{}'::jsonb;
  v_failure_status text;
  v_proof_check jsonb;
  v_allocations jsonb;
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
         coalesce(
           nullif(s.metadata->>'delivery_started_at','')::timestamptz,
           case when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('OUT_FOR_DELIVERY','ARRIVED_AT_CUSTOMER') then s.updated_at end
         )
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
    -- V176: assigned Helper may start the van-delivery workflow. Final delivery still requires Driver confirmation.
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
    if v_signature_url is null then raise exception 'RECIPIENT_SIGNATURE_REQUIRED' using errcode='22023'; end if;
    begin v_collected_cod:=coalesce(nullif(btrim(p_payload->>'cod_collected_amount'),'')::numeric,0); exception when others then raise exception 'INVALID_COD_COLLECTED_AMOUNT' using errcode='22023'; end;
    if coalesce(v_required_cod,0)>0 and v_collected_cod<v_required_cod then raise exception 'COD_COLLECTION_REQUIRED: required %, collected %',v_required_cod,v_collected_cod using errcode='22023'; end if;

    v_allocations:=public.be_validate_collection_allocations_v215(p_payload->'payment_allocations',v_collected_cod);

    v_proof_check := public.be_validate_rider_delivery_proof_v12_15(v_proof_url,v_delivery_way_id,v_parent_pickup_id,v_uid,v_delivery_started_at);
    if not coalesce((v_proof_check->>'ok')::boolean,false) then raise exception '%',coalesce(v_proof_check->>'error','RIDER_DELIVERY_PROOF_INVALID') using errcode='42501'; end if;

    update public.be_wayplan_dispatch_stops
       set stop_status='DELIVERED',rider_status='DELIVERED',dispatch_status='DELIVERED',delivered_at=coalesce(delivered_at,now()),
           cod_collected=v_collected_cod,rider_proof_url=v_proof_url,proof_url=v_proof_url,receiver_name=v_recipient_name,receiver_phone=v_recipient_phone,receiver_signature_url=v_signature_url,failed_reason=null,updated_at=now(),
           metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('payment_allocations',v_allocations,'reported_collected_by_code',v_code,'reported_collected_by_name',v_identity->>'display_name','rider_mobile_action','DELIVERED','worker_code',v_code,'worker_role',v_role,'required_cod',v_required_cod,'cod_collected',v_collected_cod,'payment_mode',upper(coalesce(nullif(btrim(p_payload->>'payment_method'),''),nullif(btrim(p_payload->>'payment_mode'),''),'UNKNOWN')),'payment_reference',coalesce(nullif(btrim(p_payload->>'transaction_reference'),''),nullif(btrim(p_payload->>'payment_reference'),'')),'proof_url',v_proof_url,'signature_url',v_signature_url,'proof_validation',v_proof_check,'action_at',now())
     where delivery_way_id=v_delivery_way_id and wayplan_id=v_wayplan_id;
    update public.be_data_entry_parcel_details set parcel_status='DELIVERED',updated_at=now() where delivery_way_id=v_delivery_way_id;
    update public.be_waybill_ledger
       set dispatch_status='DELIVERED',wayplan_status='DELIVERED',rider_status='DELIVERED',delivered_at=coalesce(delivered_at,now()),cod_collected=v_collected_cod,rider_proof_url=v_proof_url,failed_reason=null,updated_at=now(),
           metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('rider_mobile_action','DELIVERED','worker_code',v_code,'required_cod',v_required_cod,'cod_collected',v_collected_cod,'proof_url',v_proof_url,'signature_url',v_signature_url,'proof_validation',v_proof_check,'action_at',now())
     where delivery_way_id=v_delivery_way_id or tracking_no=v_delivery_way_id;
    update public.be_wayplan_membership_v40
       set membership_status='COMPLETED',updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('rider_mobile_result','DELIVERED','result_at',now(),'worker_code',v_code)
     where wayplan_id=v_wayplan_id and delivery_way_id=v_delivery_way_id;
    perform public.be_record_delivery_success_v39(v_delivery_way_id,coalesce(nullif(v_email,''),v_code),v_operation_id);
    insert into public.audit_logs(action,table_name,actor_uid,actor_email,actor_role,entity_type,entity_id,after_data,metadata) values('FIELD_COLLECTION_REPORTED','be_wayplan_dispatch_stops',v_uid,v_email,v_role,'DELIVERY_COLLECTION',v_delivery_way_id,jsonb_build_object('payment_allocations',v_allocations,'collected',v_collected_cod),jsonb_build_object('wayplan_id',v_wayplan_id,'operation_id',v_operation_id));
    return jsonb_build_object('ok',true,'delivery_way_id',v_delivery_way_id,'pickup_id',v_parent_pickup_id,'wayplan_id',v_wayplan_id,'action','deliver','mobile_status','DELIVERED','required_cod',v_required_cod,'cod_collected',v_collected_cod,'proof_url',v_proof_url,'signature_url',v_signature_url,'proof_validation',v_proof_check);
  end if;

  if v_action='exception' or v_action like '%delivery_exception%' or v_action like '%delivery_failed%' then
    if v_reason is null then raise exception 'DELIVERY_EXCEPTION_REASON_REQUIRED' using errcode='22023'; end if;
    if v_stop_status in ('DELIVERED','COMPLETED') then raise exception 'DELIVERED_STOP_CANNOT_BE_FAILED' using errcode='22023'; end if;
    if v_proof_url is not null then
      v_proof_check := public.be_validate_rider_delivery_proof_v12_15(v_proof_url,v_delivery_way_id,v_parent_pickup_id,v_uid,v_delivery_started_at);
      if not coalesce((v_proof_check->>'ok')::boolean,false) then raise exception '%',coalesce(v_proof_check->>'error','RIDER_DELIVERY_PROOF_INVALID') using errcode='42501'; end if;
    end if;
    select public.be_record_delivery_failure_v39(v_delivery_way_id,v_reason,coalesce(nullif(v_email,''),v_code),v_operation_id) into v_failure;
    v_failure_status:=upper(coalesce(v_failure->>'status','ATTEMPTED_FAILED'));
    update public.be_wayplan_dispatch_stops
       set stop_status=case when v_failure_status='RTO' then 'RETURN_TO_WAREHOUSE' else 'FAILED_DELIVERY' end,
           rider_status=case when v_failure_status='RTO' then 'RTO' else 'DELIVERY_FAILED' end,dispatch_status=v_failure_status,failed_reason=v_reason,
           rider_proof_url=coalesce(v_proof_url,rider_proof_url),proof_url=coalesce(v_proof_url,proof_url),updated_at=now(),
           metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('rider_mobile_action','DELIVERY_EXCEPTION','worker_code',v_code,'worker_role',v_role,'failure_status',v_failure_status,'reason',v_reason,'proof_url',v_proof_url,'signature_url',v_signature_url,'proof_validation',v_proof_check,'action_at',now())
     where delivery_way_id=v_delivery_way_id and wayplan_id=v_wayplan_id;
    update public.be_data_entry_parcel_details set parcel_status=v_failure_status,updated_at=now() where delivery_way_id=v_delivery_way_id;
    update public.be_waybill_ledger
       set dispatch_status=v_failure_status,rider_status=v_failure_status,failed_reason=v_reason,rider_proof_url=coalesce(v_proof_url,rider_proof_url),updated_at=now(),
           metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('rider_mobile_action','DELIVERY_EXCEPTION','worker_code',v_code,'failure_status',v_failure_status,'reason',v_reason,'proof_url',v_proof_url,'signature_url',v_signature_url,'proof_validation',v_proof_check,'action_at',now())
     where delivery_way_id=v_delivery_way_id or tracking_no=v_delivery_way_id;
    if v_failure_status='RTO' then update public.be_wayplan_membership_v40 set membership_status='RTO',updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('rider_mobile_result','RTO','result_at',now(),'worker_code',v_code,'reason',v_reason) where wayplan_id=v_wayplan_id and delivery_way_id=v_delivery_way_id; end if;
    return v_failure||jsonb_build_object('ok',true,'delivery_way_id',v_delivery_way_id,'pickup_id',v_parent_pickup_id,'wayplan_id',v_wayplan_id,'action','exception','mobile_status',case when v_failure_status='RTO' then 'RTO' else 'DELIVERY_FAILED' end,'proof_url',v_proof_url,'signature_url',v_signature_url,'proof_validation',v_proof_check);
  end if;

  raise exception 'UNSUPPORTED_DELIVERY_ACTION: %',coalesce(nullif(v_action,''),'EMPTY') using errcode='22023';
end;
$function$
;

-- Finance users perform these actions explicitly; migration does not review rows.
create or replace function public.be_finance_cod_review_action_v213(p_payload jsonb)
returns jsonb language plpgsql security definer
set search_path to public,auth,pg_temp
as $function$
declare
 v_lines jsonb;
 v_role text:=public.be_current_role();
 v_actor text:=coalesce(nullif(lower(auth.jwt()->>'email'),''),auth.uid()::text);
 v_id uuid;v_operation uuid;v_action text:=upper(coalesce(p_payload->>'action',''));
 v_reason text:=nullif(btrim(p_payload->>'reason'),'');
 v_ref text:=nullif(btrim(p_payload->>'reference'),'');
 v_method text:=upper(coalesce(p_payload->>'payment_method',''));
 v_amount numeric;v_original numeric;v_adjustment numeric;v_version timestamptz;
 v_row public.be_wayplan_cod_settlements%rowtype;v_before jsonb;v_audit record;
begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTH_REQUIRED');end if;
 if coalesce(v_role,'') not in('finance','accountant','superadmin','super_admin') then return jsonb_build_object('ok',false,'error','FINANCE_REQUIRED');end if;
 if v_action not in('CONFIRM','REJECT','ADJUST') then return jsonb_build_object('ok',false,'error','INVALID_ACTION');end if;
 begin
  v_id:=(p_payload->>'row_id')::uuid;v_operation:=(p_payload->>'operation_id')::uuid;
  v_version:=(p_payload->>'expected_updated_at')::timestamptz;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  return jsonb_build_object('ok',false,'error','INVALID_REQUEST');
 end;
 if v_id is null or v_operation is null or v_version is null then return jsonb_build_object('ok',false,'error','INVALID_REQUEST');end if;
 select * into v_row from public.be_wayplan_cod_settlements where id=v_id for update;
 if not found then return jsonb_build_object('ok',false,'error','ROW_NOT_FOUND');end if;
 select metadata into v_audit from public.audit_logs
 where action='FINANCE_COD_REVIEW_'||v_action and entity_id=v_id::text
 and metadata->>'operation_id'=v_operation::text order by id desc limit 1;
 if found then
  if v_audit.metadata->'request_payload' is distinct from p_payload then return jsonb_build_object('ok',false,'error','OPERATION_REUSED');end if;
  return jsonb_build_object('ok',true,'idempotent',true,'row',to_jsonb(v_row));
 end if;
 if exists(select 1 from public.audit_logs where entity_id=v_id::text and action like 'FINANCE_COD_REVIEW_%' and metadata->>'operation_id'=v_operation::text) then return jsonb_build_object('ok',false,'error','OPERATION_REUSED');end if;
 if upper(coalesce(v_row.settlement_status,''))='SETTLED' or v_row.settled_at is not null then return jsonb_build_object('ok',false,'error','SETTLEMENT_LOCKED');end if;
 perform 1 from public.be_finance_cod_settlements_v48 where wayplan_id=v_row.wayplan_id and delivery_way_id=v_row.delivery_way_id for update;
 if exists(select 1 from public.be_finance_cod_settlements_v48 where wayplan_id=v_row.wayplan_id and delivery_way_id=v_row.delivery_way_id and settlement_status='SETTLED') then return jsonb_build_object('ok',false,'error','DOWNSTREAM_SETTLEMENT_LOCKED');end if;
 if v_row.updated_at is distinct from v_version then return jsonb_build_object('ok',false,'error','STALE_REVIEW','message','This row changed. Refresh and review its latest values.');end if;
 if v_action in('REJECT','ADJUST') and v_reason is null then return jsonb_build_object('ok',false,'error','REASON_REQUIRED');end if;
 v_before:=to_jsonb(v_row);
 if v_action='ADJUST' then
  if coalesce(p_payload->>'adjustment_mmk','') !~ '^-?[0-9]+([.][0-9]{1,2})?$' then return jsonb_build_object('ok',false,'error','INVALID_AMOUNT');end if;
  v_amount:=(p_payload->>'adjustment_mmk')::numeric;
  if v_amount=0 then return jsonb_build_object('ok',false,'error','ZERO_ADJUSTMENT');end if;
  if coalesce(v_row.cod_expected,0)+v_amount<0 then return jsonb_build_object('ok',false,'error','NEGATIVE_EXPECTED_AMOUNT');end if;
  v_original:=coalesce((v_row.metadata->>'original_expected_collection')::numeric,v_row.cod_expected,0);
  v_adjustment:=coalesce((v_row.metadata->>'collection_adjustment_mmk')::numeric,0)+v_amount;
  update public.be_wayplan_cod_settlements set cod_expected=coalesce(cod_expected,0)+v_amount,settlement_status='PENDING_SETTLEMENT',
   metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('finance_review_status','ADJUSTED','original_expected_collection',v_original,'collection_adjustment_mmk',v_adjustment,'adjustment_reason',v_reason,'adjusted_by',v_actor,'adjusted_at',clock_timestamp(),'review_reopened_after_correction',v_row.settlement_status='REJECTED'),updated_at=clock_timestamp()
  where id=v_id returning * into v_row;
 elsif v_action='REJECT' then
  update public.be_wayplan_cod_settlements set settlement_status='REJECTED',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('finance_review_status','REJECTED','rejection_reason',v_reason,'rejected_by',v_actor,'rejected_at',clock_timestamp()),updated_at=clock_timestamp() where id=v_id returning * into v_row;
 else
  if v_row.settlement_status='REJECTED' then return jsonb_build_object('ok',false,'error','REVIEW_REJECTED','message','Correct and adjust the rejected row before confirmation.');end if;
  if coalesce(p_payload->>'actual_collected','')='' then return jsonb_build_object('ok',false,'error','COLLECTION_REQUIRED');end if;
  if p_payload->>'actual_collected' !~ '^[0-9]+([.][0-9]{1,2})?$' then return jsonb_build_object('ok',false,'error','INVALID_AMOUNT');end if;
  v_amount:=(p_payload->>'actual_collected')::numeric;
  if v_ref is null then return jsonb_build_object('ok',false,'error','REFERENCE_REQUIRED');end if;
  if v_method not in('CASH','KBZ_PAY','WAVE_PAY','AYA_PAY','CB_PAY','BANK_TRANSFER','MOBILE_WALLET','QR','MIXED') then return jsonb_build_object('ok',false,'error','PAYMENT_METHOD_REQUIRED');end if;
  if v_amount is distinct from v_row.cod_expected then return jsonb_build_object('ok',false,'error','AMOUNT_MISMATCH','message','Received amount differs from expected collection. Record an explained adjustment before confirming.');end if;
  v_lines:=public.be_validate_collection_allocations_v215(coalesce(p_payload->'payment_allocations',case when v_amount=0 then '[]'::jsonb else jsonb_build_array(jsonb_build_object('method',v_method,'amount',v_amount,'reference',v_ref)) end),v_amount);
  if v_lines is null then return jsonb_build_object('ok',false,'error','PAYMENT_LINES_REQUIRED');end if;
  v_method:=case when jsonb_array_length(v_lines)>1 then 'MIXED' else coalesce(v_lines->0->>'method','CASH') end;
  if exists(select 1 from public.be_finance_cod_settlements_v48 where wayplan_id=v_row.wayplan_id and delivery_way_id=v_row.delivery_way_id and settlement_status='HOLD_EXCEPTION') then return jsonb_build_object('ok',false,'error','FIELD_EXCEPTION_HOLD');end if;
  if exists(select 1 from public.be_finance_cod_settlements_v48 where wayplan_id=v_row.wayplan_id and delivery_way_id=v_row.delivery_way_id and settlement_status='SETTLED') then return jsonb_build_object('ok',false,'error','DOWNSTREAM_SETTLEMENT_LOCKED');end if;
  update public.be_wayplan_cod_settlements set cod_collected=v_amount,settlement_status='SETTLED',settlement_reference=v_ref,settled_at=clock_timestamp(),
   metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('payment_allocations',v_lines,'finance_review_status','CONFIRMED','collection_evidence_status','FINANCE_RECORDED','payment_method',v_method,'payment_mode',v_method,'collection_reference',v_ref,'settled_by',v_actor,'finance_confirmed_by_uid',auth.uid(),'finance_confirmed_at',clock_timestamp()),updated_at=clock_timestamp()
  where id=v_id returning * into v_row;
  update public.be_finance_cod_settlements_v48 set expected_cod=v_row.cod_expected,reported_collected=v_amount,rider_remittance=v_amount,settled_amount=v_amount,settlement_status='SETTLED',settlement_reference=v_ref,settled_by=v_actor,settled_at=v_row.settled_at,
   metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('payment_allocations',v_lines,'finance_review_source','COD_REVIEW_V213','payment_method',v_method,'settled_by',v_actor,'adjustment_mmk',v_row.metadata->'collection_adjustment_mmk'),updated_at=clock_timestamp()
  where wayplan_id=v_row.wayplan_id and delivery_way_id=v_row.delivery_way_id;
 end if;
 insert into public.audit_logs(action,table_name,actor_uid,actor_email,actor_role,entity_type,entity_id,before_data,after_data,metadata)
 values('FINANCE_COD_REVIEW_'||v_action,'be_wayplan_cod_settlements',auth.uid(),v_actor,v_role,'COD_SETTLEMENT',v_id::text,v_before,to_jsonb(v_row),jsonb_build_object('operation_id',v_operation,'request_payload',p_payload,'reason',v_reason,'source_business_date',v_row.metadata->>'source_business_date'));
 return jsonb_build_object('ok',true,'action',v_action,'row',to_jsonb(v_row));
end;
$function$;
revoke all on function public.be_finance_cod_review_action_v213(jsonb) from public;
grant execute on function public.be_finance_cod_review_action_v213(jsonb) to authenticated;


create or replace function public.be_sync_wayplan_cod_settlement()
returns trigger language plpgsql security definer set search_path to public,pg_temp
as $sync$
declare v_rider_code text;v_rider_name text;v_plan jsonb;
begin
 if new.stop_status='DELIVERED' and coalesce(new.cod_collected,0)>=0 then
  select to_jsonb(w) into v_plan from public.be_wayplan_dispatches w where wayplan_id=new.wayplan_id limit 1;
  v_rider_code:=v_plan->>'rider_code';v_rider_name:=v_plan->>'rider_name';
  insert into public.be_wayplan_cod_settlements as existing
   (wayplan_id,delivery_way_id,waybill_no,pickup_id,rider_code,rider_name,recipient_name,recipient_phone,
    cod_expected,cod_collected,delivery_fee,settlement_status,delivered_at,metadata,created_at,updated_at)
  values(new.wayplan_id,new.delivery_way_id,new.waybill_no,new.pickup_id,v_rider_code,v_rider_name,
   coalesce(new.receiver_name,new.recipient_name),coalesce(new.receiver_phone,new.recipient_phone),
   coalesce(new.cod_amount,0),new.cod_collected,coalesce(new.delivery_fee,0),'PENDING_SETTLEMENT',new.delivered_at,
   jsonb_build_object('vehicle_code',v_plan->>'vehicle_code','vehicle_name',v_plan->>'vehicle_name','driver_code',v_plan->>'driver_code','driver_name',v_plan->>'driver_name','helper_code',v_plan->>'helper_code','helper_name',v_plan->>'helper_name','reported_payment_allocations',new.metadata->'payment_allocations','reported_collected_by_code',new.metadata->>'reported_collected_by_code','reported_collected_by_name',new.metadata->>'reported_collected_by_name','source','be_wayplan_dispatch_stops','stop_status',new.stop_status,
    'rider_status',new.rider_status,'rider_proof_url',new.rider_proof_url),now(),clock_timestamp())
  on conflict(wayplan_id,delivery_way_id) do update set
   rider_code=case when existing.settled_at is not null or upper(coalesce(existing.settlement_status,'')) in('SETTLED','REJECTED') or existing.metadata ?| array['finance_review_status','original_expected_collection','rejection_reason','finance_confirmed_at'] or existing.metadata->>'historical_source_review'='true' then existing.rider_code else excluded.rider_code end,rider_name=case when existing.settled_at is not null or upper(coalesce(existing.settlement_status,'')) in('SETTLED','REJECTED') or existing.metadata ?| array['finance_review_status','original_expected_collection','rejection_reason','finance_confirmed_at'] or existing.metadata->>'historical_source_review'='true' then existing.rider_name else excluded.rider_name end,
   recipient_name=excluded.recipient_name,recipient_phone=excluded.recipient_phone,
   cod_expected=case when existing.settled_at is not null or upper(coalesce(existing.settlement_status,'')) in('SETTLED','REJECTED')
    or existing.metadata ?| array['finance_review_status','original_expected_collection','rejection_reason','finance_confirmed_at']
    or existing.metadata->>'historical_source_review'='true' then existing.cod_expected else excluded.cod_expected end,
   cod_collected=case when existing.settled_at is not null or upper(coalesce(existing.settlement_status,'')) in('SETTLED','REJECTED')
    or existing.metadata ?| array['finance_review_status','original_expected_collection','rejection_reason','finance_confirmed_at']
    or existing.metadata->>'historical_source_review'='true' then existing.cod_collected else excluded.cod_collected end,
   delivery_fee=case when existing.settled_at is not null or upper(coalesce(existing.settlement_status,'')) in('SETTLED','REJECTED')
    or existing.metadata ?| array['finance_review_status','original_expected_collection','rejection_reason','finance_confirmed_at']
    or existing.metadata->>'historical_source_review'='true' then existing.delivery_fee else excluded.delivery_fee end,
   delivered_at=case when existing.settled_at is not null or upper(coalesce(existing.settlement_status,'')) in('SETTLED','REJECTED') or existing.metadata ?| array['finance_review_status','original_expected_collection','rejection_reason','finance_confirmed_at'] or existing.metadata->>'historical_source_review'='true' then existing.delivered_at else excluded.delivered_at end,
   metadata=coalesce(existing.metadata,'{}'::jsonb)||case when existing.settled_at is not null or upper(coalesce(existing.settlement_status,'')) in('SETTLED','REJECTED') or existing.metadata ?| array['finance_review_status','original_expected_collection','rejection_reason','finance_confirmed_at'] or existing.metadata->>'historical_source_review'='true' then excluded.metadata - array['reported_payment_allocations','reported_collected_by_code','reported_collected_by_name','vehicle_code','vehicle_name','driver_code','driver_name','helper_code','helper_name'] else excluded.metadata end,updated_at=clock_timestamp();
 end if;
 return new;
end;
$sync$;



create or replace function public.be_finance_collection_totals_v215(p_from date default null,p_to date default null,p_group text default 'PERSON')
returns jsonb language plpgsql security definer set search_path to public,auth,pg_temp as $rollup$
declare result jsonb;
begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'error','AUTH_REQUIRED');end if;
 if coalesce(public.be_current_role(),'') not in('finance','accountant','superadmin','super_admin') then return jsonb_build_object('ok',false,'error','FINANCE_REQUIRED');end if;
 if coalesce(p_group,'') not in('PERSON','VAN') then return jsonb_build_object('ok',false,'error','INVALID_GROUP');end if;
 if p_from>p_to then return jsonb_build_object('ok',false,'error','INVALID_DATE_RANGE');end if;
 with source as(
  select q.id,q.cod_collected,q.settlement_status,
   case when q.metadata->>'source_business_date' ~ '^\d{4}-\d{2}-\d{2}$' then (q.metadata->>'source_business_date')::date else (q.delivered_at at time zone 'Asia/Yangon')::date end service_date,
   coalesce(nullif(q.metadata->>'reported_collected_by_code',''),nullif(q.rider_code,''),nullif(w.rider_code,''),nullif(q.metadata->>'driver_code',''),nullif(w.driver_code,''),'UNASSIGNED') collector_code,
   coalesce(nullif(q.metadata->>'reported_collected_by_name',''),nullif(q.rider_name,''),nullif(w.rider_name,''),nullif(q.metadata->>'driver_name',''),nullif(w.driver_name,''),'Unassigned') collector_name,
   coalesce(nullif(q.metadata->>'vehicle_code',''),nullif(w.vehicle_code,''),'UNASSIGNED') vehicle_code,
   coalesce(nullif(q.metadata->>'vehicle_name',''),nullif(w.vehicle_name,''),'Unassigned') vehicle_name,
   public.be_collection_payment_totals_v215(q.metadata,q.cod_collected) totals
  from public.be_wayplan_cod_settlements q left join public.be_wayplan_dispatches w using(wayplan_id)
 ), scoped as(
  select *,case when p_group='VAN' then vehicle_code else collector_code end group_code,
   case when p_group='VAN' then vehicle_name else collector_name end group_name
  from source where (p_from is null or service_date>=p_from) and (p_to is null or service_date<=p_to)
 ), amounts as(
  select service_date,group_code,max(group_name) group_name,count(*) waybill_count,
   sum((totals->>'total_collected')::numeric) total_collected,
   sum((totals->>'cash_collected')::numeric) cash_collected,
   sum((totals->>'digital_collected')::numeric) digital_collected,
   sum((totals->>'unclassified_collected')::numeric) unclassified_collected,
   sum((totals->>'unknown_count')::int) unknown_count,
   coalesce(sum(cod_collected)filter(where settlement_status='SETTLED'),0) confirmed_total,
   coalesce(sum(cod_collected)filter(where settlement_status<>'SETTLED'),0) pending_total
  from scoped group by service_date,group_code
 ), methods as(
  select service_date,group_code,jsonb_object_agg(method,value) by_method from(
   select service_date,group_code,m.key method,sum(m.value::numeric) value
   from scoped cross join lateral jsonb_each_text(totals->'by_method')m group by service_date,group_code,m.key
  ) x group by service_date,group_code
 )
 select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object(
  'collector_code',case when p_group='PERSON' then a.group_code else null end,
  'collector_name',case when p_group='PERSON' then a.group_name else null end,
  'vehicle_code',case when p_group='VAN' then a.group_code else null end,
  'vehicle_name',case when p_group='VAN' then a.group_name else null end,
  'by_method',coalesce(m.by_method,'{}'::jsonb))order by a.service_date,a.group_code),'[]'::jsonb)
 into result from amounts a left join methods m on m.service_date is not distinct from a.service_date and m.group_code=a.group_code;
 return jsonb_build_object('ok',true,'rows',result,'group',p_group,'build','SPLIT_COLLECTION_V215');
end;
$rollup$;
revoke all on function public.be_finance_collection_totals_v215(date,date,text) from public;
grant execute on function public.be_finance_collection_totals_v215(date,date,text) to authenticated;

-- Preserve helper-prepared allocations when the assigned driver confirms them.
do $team$
declare definition text;
begin
 if to_regprocedure('public.be_field_team_prepare_delivery_v176(jsonb)') is not null then
  definition:=pg_get_functiondef('public.be_field_team_prepare_delivery_v176(jsonb)'::regprocedure);
  definition:=replace(definition,'  if v_recipient is null',
   '  perform 1 from public.be_wayplan_dispatch_stops where wayplan_id=v_wayplan and upper(delivery_way_id)=v_way for update;'||chr(10)||
   '  if exists(select 1 from public.be_wayplan_dispatch_stops where wayplan_id=v_wayplan and upper(delivery_way_id)=v_way and upper(coalesce(stop_status,rider_status,dispatch_status,'''')) in(''DELIVERED'',''COMPLETED'')) then return jsonb_build_object(''ok'',true,''already_applied'',true,''mobile_status'',''DELIVERED'');end if;'||chr(10)||
   '  if v_recipient is null');
  definition:=replace(definition,'  v_proof_check jsonb;','  v_proof_check jsonb;'||chr(10)||'  v_allocations jsonb;');
  definition:=replace(definition,'  v_proof_check:=public.be_validate_rider_delivery_proof_v12_15',
   '  v_allocations:=public.be_validate_collection_allocations_v215(p_payload->''payment_allocations'',v_cod);'||chr(10)||'  v_proof_check:=public.be_validate_rider_delivery_proof_v12_15');
  definition:=replace(definition,'''proof_validation'',v_proof_check,''build'',''TEAM_DELIVERY_V176''','''payment_allocations'',v_allocations,''proof_validation'',v_proof_check,''build'',''TEAM_DELIVERY_V176''');
  if position('v_allocations:=public.be_validate_collection_allocations_v215' in definition)=0 or position('''payment_allocations'',v_allocations,''proof_validation''' in definition)=0 then raise exception 'Helper split payment patch did not match';end if;
  definition:=replace(definition,'''team_delivery_status'',''HELPER_COMPLETED_PENDING_DRIVER'',','''payment_allocations'',v_allocations,''payment_mode'',case when jsonb_array_length(v_allocations)>1 then ''MIXED'' else coalesce(v_allocations->0->>''method'',v_payment) end,''payment_reference'',v_reference,''team_delivery_status'',''HELPER_COMPLETED_PENDING_DRIVER'',');
  execute definition;
 end if;
 if to_regprocedure('public.be_driver_confirm_team_delivery_v176(jsonb)') is not null then
  definition:=pg_get_functiondef('public.be_driver_confirm_team_delivery_v176(jsonb)'::regprocedure);
  definition:=replace(definition,'  select * into v_prepared',
   '  perform 1 from public.be_wayplan_dispatch_stops where wayplan_id=v_wayplan and upper(delivery_way_id)=v_way for update;'||chr(10)||'  select * into v_prepared');
  definition:=replace(definition,'''payment_method'',v_prepared.payment_method,','''payment_allocations'',v_prepared.metadata->''payment_allocations'','||chr(10)||'    ''payment_method'',v_prepared.payment_method,');
  if position('''payment_allocations'',v_prepared.metadata->''payment_allocations''' in definition)=0 then raise exception 'Driver split payment patch did not match';end if;
  execute definition;
 end if;
end;
$team$;

CREATE OR REPLACE FUNCTION public.be_field_team_cod_handover_queue_v1(p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_identity jsonb := public.be_current_field_team_identity();
  v_code text := upper(coalesce(v_identity->>'worker_code',''));
  v_role text := lower(coalesce(v_identity->>'role','rider'));
  v_rows jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATED_FIELD_SESSION_REQUIRED' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.delivered_at desc nulls last, x.delivery_way_id),'[]'::jsonb)
  into v_rows
  from (
    select
      j.id,j.wayplan_id,j.pickup_id,j.pickup_way_id,j.delivery_way_id,j.waybill_no,
      j.recipient_name,j.recipient_phone,j.township,j.address,
      j.cod_amount,j.calculated_cod_amount,j.cod_collected,j.delivery_fee,
      j.data_entry_item_price,j.data_entry_delivery_fee,j.data_entry_amount_entry_type,
      j.stop_status,j.rider_status,j.delivered_at,j.vehicle_code,j.vehicle_name,
      j.driver_code,j.driver_name,j.rider_code,j.rider_name,j.helper_code,j.helper_name,
      coalesce(nullif(s.metadata->>'payment_method',''),nullif(j.metadata->>'payment_mode',''),'UNKNOWN') as payment_mode,
      coalesce(nullif(s.metadata->'payment_allocations','null'::jsonb),nullif(s.metadata->'reported_payment_allocations','null'::jsonb),nullif(j.metadata->'payment_allocations','null'::jsonb)) as payment_allocations,
      coalesce(s.settlement_status,'PENDING_HANDOVER') as cod_settlement_status,
      s.settlement_reference,
      s.settled_at,
      coalesce(s.cod_expected,j.calculated_cod_amount,j.cod_amount,0) as authoritative_cod_expected,
      coalesce(s.cod_collected,j.cod_collected) as authoritative_cod_collected,
      coalesce(s.metadata->>'proof_photo_name','') as proof_photo_name,
      (coalesce(s.cod_collected,j.cod_collected,0) > 0) as eligible_to_handover
    from public.be_v_rider_delivery_wayplan_jobs j
    left join public.be_wayplan_cod_settlements s
      on s.wayplan_id=j.wayplan_id and s.delivery_way_id=j.delivery_way_id
    where upper(coalesce(j.stop_status,j.rider_status,'')) in ('DELIVERED','COMPLETED')
      and case v_role
        when 'driver' then upper(coalesce(j.driver_code,''))=v_code
        when 'helper' then upper(coalesce(j.helper_code,''))=v_code
        else upper(coalesce(j.rider_code,''))=v_code
      end
    order by j.delivered_at desc nulls last
    limit least(greatest(coalesce(p_limit,200),1),500)
  ) x;

  return jsonb_build_object(
    'ok',true,'source','FIELD_TEAM_COD_HANDOVER_V1','identity',v_identity,
    'count',jsonb_array_length(v_rows),
    'pending_count',(
      select count(*) from jsonb_array_elements(v_rows) e
      where coalesce((e->>'eligible_to_handover')::boolean,false)
        and upper(coalesce(e->>'cod_settlement_status','PENDING_HANDOVER')) not in ('CLEARED','SETTLED','FINANCE_SETTLED')
    ),
    'jobs',v_rows
  );
end
$function$
;

-- Expose only collection keys from the stop in the existing assigned-job view.
do $readmodel$
declare definition text;
begin
 if to_regclass('public.be_v_rider_delivery_wayplan_jobs') is not null then
  definition:=pg_get_viewdef('public.be_v_rider_delivery_wayplan_jobs'::regclass,true);
  if position('jsonb_build_object(''source'',' in definition)=0 then raise exception 'Rider job collection projection did not match';end if;
  definition:=replace(definition,'jsonb_build_object(''source'',', 'jsonb_build_object(''payment_allocations'',s.metadata->''payment_allocations'',''payment_mode'',s.metadata->''payment_mode'',''payment_reference'',s.metadata->''payment_reference'') || jsonb_build_object(''source'',');
  execute 'create or replace view public.be_v_rider_delivery_wayplan_jobs as '||definition;
 end if;
end;
$readmodel$;


-- Existing field handover totals use the same allocation classification.
CREATE OR REPLACE FUNCTION public.be_finance_field_settlement_center_v1(p_work_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_date date := coalesce(p_work_date,(now() at time zone 'Asia/Yangon')::date);
  v_role text := public.be_current_role();
  v_rows jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok',false,'code','AUTH_REQUIRED');
  end if;
  if v_role not in ('finance','accountant','superadmin','super_admin','rider','driver','helper') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  insert into public.be_field_finance_settlements_v1(
    work_date,wayplan_id,vehicle_code,vehicle_name,
    rider_code,rider_name,driver_code,driver_name,helper_code,helper_name,
    total_ways,delivered_ways,failed_ways,remaining_ways,
    opening_cod_amount,expected_cod,actual_collected,cash_collected,digital_collected,variance_amount,
    status,updated_at
  )
  select
    v_date,
    w.wayplan_id,
    w.vehicle_code,w.vehicle_name,
    w.rider_code,w.rider_name,
    w.driver_code,w.driver_name,
    w.helper_code,w.helper_name,
    count(s.delivery_way_id)::int,
    count(*) filter(where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED'))::int,
    count(*) filter(where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('FAILED_DELIVERY','DELIVERY_FAILED','ATTEMPTED_FAILED','RETURN_TO_WAREHOUSE','RTO'))::int,
    count(*) filter(where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) not in (
      'DELIVERED','COMPLETED','FAILED_DELIVERY','DELIVERY_FAILED','ATTEMPTED_FAILED','RETURN_TO_WAREHOUSE','RTO','CANCELLED'
    ))::int,
    coalesce(sum(s.cod_amount),0),
    coalesce(sum(s.cod_amount) filter(where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED')),0),
    coalesce(sum(s.cod_collected) filter(where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED')),0),
    coalesce(sum((public.be_collection_payment_totals_v215(s.metadata,s.cod_collected)->>'cash_collected')::numeric) filter(where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED')),0),
    coalesce(sum((public.be_collection_payment_totals_v215(s.metadata,s.cod_collected)->>'digital_collected')::numeric) filter(where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED')),0),
    coalesce(sum(s.cod_collected) filter(where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED')),0)
      - coalesce(sum(s.cod_amount) filter(where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED')),0),
    case
      when count(*) filter(where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) not in (
        'DELIVERED','COMPLETED','FAILED_DELIVERY','DELIVERY_FAILED','ATTEMPTED_FAILED','RETURN_TO_WAREHOUSE','RTO','CANCELLED'
      ))=0 then 'READY_TO_SETTLE'
      else 'OPEN'
    end,
    now()
  from public.be_wayplan_dispatches w
  join public.be_wayplan_dispatch_stops s on s.wayplan_id=w.wayplan_id
  where (coalesce(w.dispatched_at,w.planned_at,w.created_at) at time zone 'Asia/Yangon')::date=v_date
  group by w.wayplan_id,w.vehicle_code,w.vehicle_name,w.rider_code,w.rider_name,w.driver_code,w.driver_name,w.helper_code,w.helper_name
  on conflict (work_date,wayplan_id) do update
  set vehicle_code=excluded.vehicle_code,
      vehicle_name=excluded.vehicle_name,
      rider_code=excluded.rider_code,
      rider_name=excluded.rider_name,
      driver_code=excluded.driver_code,
      driver_name=excluded.driver_name,
      helper_code=excluded.helper_code,
      helper_name=excluded.helper_name,
      total_ways=excluded.total_ways,
      delivered_ways=excluded.delivered_ways,
      failed_ways=excluded.failed_ways,
      remaining_ways=excluded.remaining_ways,
      opening_cod_amount=excluded.opening_cod_amount,
      expected_cod=excluded.expected_cod,
      actual_collected=excluded.actual_collected,
      cash_collected=excluded.cash_collected,
      digital_collected=excluded.digital_collected,
      variance_amount=excluded.variance_amount,
      status=case when be_field_finance_settlements_v1.status='CLEARED' then 'CLEARED' else excluded.status end,
      updated_at=now()
  where be_field_finance_settlements_v1.status<>'CLEARED';

  select coalesce(jsonb_agg(to_jsonb(q) order by q.vehicle_code,q.wayplan_id),'[]'::jsonb)
  into v_rows
  from (
    select f.*,
      jsonb_build_object(
        'finance', coalesce(f.party_signatures ? 'finance',false),
        'rider', case when nullif(f.rider_code,'') is null then true else f.party_signatures ? 'rider' end,
        'driver', case when nullif(f.driver_code,'') is null then true else f.party_signatures ? 'driver' end,
        'helper', case when nullif(f.helper_code,'') is null then true else f.party_signatures ? 'helper' end
      ) signature_status
    from public.be_field_finance_settlements_v1 f
    where f.work_date=v_date
      and (
        v_role in ('finance','accountant','superadmin','super_admin')
        or (v_role='rider' and upper(coalesce(f.rider_code,''))=upper(coalesce((public.be_current_field_team_identity()->>'worker_code'),'')))
        or (v_role='driver' and upper(coalesce(f.driver_code,''))=upper(coalesce((public.be_current_field_team_identity()->>'worker_code'),'')))
        or (v_role='helper' and upper(coalesce(f.helper_code,''))=upper(coalesce((public.be_current_field_team_identity()->>'worker_code'),'')))
      )
  ) q;

  return jsonb_build_object('ok',true,'work_date',v_date,'rows',v_rows,'build','FIELD_FINANCE_SETTLEMENT_V1');
end
$function$
;
