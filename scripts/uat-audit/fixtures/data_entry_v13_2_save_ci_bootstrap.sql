-- CI-ONLY. Extracted from the existing enterprise V13.2 unbounded implementation.
-- Diagnostic migration replay only: install the full function body before V14 renames it.
-- Do not use to enable Data Entry writes or grant API access.
CREATE OR REPLACE FUNCTION public.be_data_entry_financial_v2_save(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_access jsonb;
  v_mode text;
  v_dry_run boolean := lower(coalesce(p_payload ->> 'dry_run','false')) in ('true','1','yes','on');
  v_request_id text := nullif(btrim(coalesce(p_payload ->> 'request_id','')), '');
  v_pickup_id text := nullif(btrim(coalesce(p_payload ->> 'pickup_id','')), '');
  v_sequence_text text := nullif(btrim(coalesce(p_payload ->> 'parcel_sequence','')), '');
  v_sequence integer;
  v_way_id text;
  v_client_way_id text := nullif(btrim(coalesce(p_payload ->> 'way_id', p_payload ->> 'delivery_way_id','')), '');
  v_actor_id uuid;
  v_actor_email text;
  v_batch_id uuid;
  v_batch_text text := nullif(btrim(coalesce(p_payload ->> 'batch_id','')), '');
  v_source_file text := nullif(btrim(coalesce(p_payload ->> 'source_file_name','')), '');
  v_reason text := coalesce(nullif(btrim(p_payload ->> 'reason'), ''), 'DATA_ENTRY_FINANCIAL_V2_SAVE');
  v_calc jsonb;
  v_data jsonb;
  v_validation_status text;
  v_profile_name text;
  v_payload_hash text;
  v_inserted integer;
  v_request public.be_data_entry_financial_v2_requests_v58%rowtype;
  v_parcel public.parcels%rowtype;
  v_detail public.be_data_entry_parcel_details%rowtype;
  v_register public.be_data_entry_register_rows%rowtype;
  v_parcel_found boolean := false;
  v_detail_found boolean := false;
  v_register_found boolean := false;
  v_parcel_id uuid;
  v_response jsonb;
  v_before_input jsonb := '{}'::jsonb;
  v_before_calc jsonb := '{}'::jsonb;
  v_after_input jsonb := '{}'::jsonb;
  v_after_calc jsonb := '{}'::jsonb;
  v_recipient_name text := nullif(btrim(coalesce(p_payload ->> 'recipient_name','')), '');
  v_recipient_phone text := nullif(btrim(coalesce(p_payload ->> 'recipient_phone','')), '');
  v_delivery_address text := nullif(btrim(coalesce(p_payload ->> 'delivery_address','')), '');
  v_merchant_id text := upper(nullif(btrim(coalesce(p_payload ->> 'merchant_id','')), ''));
  v_customer_id text := nullif(btrim(coalesce(p_payload ->> 'customer_id','')), '');
  v_cod numeric;
  v_item numeric;
  v_base numeric;
  v_weight_surcharge numeric;
begin
  v_access := public.be_data_entry_require_access_v57('create', false);

  if nullif(v_access ->> 'actor_user_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_actor_id := (v_access ->> 'actor_user_id')::uuid;
  end if;
  v_actor_email := nullif(lower(btrim(v_access ->> 'actor_email')), '');

  select mutation_mode into v_mode
  from public.be_data_entry_financial_v2_runtime_v58
  where singleton;

  if coalesce(v_mode,'MUTATION_SHADOW') <> 'ACTIVE' and not v_dry_run then
    return jsonb_build_object(
      'ok', false,
      'build', 'DATA_ENTRY_FINANCIAL_V2_MUTATION_SHADOW_V58_2B_2026_08_01',
      'generated_at', now(),
      'operation', 'SAVE',
      'mutation_mode', coalesce(v_mode,'MUTATION_SHADOW'),
      'errors', jsonb_build_array(jsonb_build_object(
        'code','MUTATION_NOT_ACTIVE',
        'message','Financial V2 mutation RPCs are deployed in shadow mode. Use dry_run=true until activation.'
      )),
      'access', v_access
    );
  end if;

  if v_request_id is null then
    return jsonb_build_object('ok',false,'operation','SAVE','errors',jsonb_build_array(jsonb_build_object(
      'code','REQUEST_ID_REQUIRED','field','request_id','message','A stable idempotency request_id is required.'
    )),'access',v_access);
  end if;

  if v_pickup_id is null then
    return jsonb_build_object('ok',false,'operation','SAVE','errors',jsonb_build_array(jsonb_build_object(
      'code','PICKUP_ID_REQUIRED','field','pickup_id','message','Canonical Pickup ID is required.'
    )),'access',v_access);
  end if;

  if v_sequence_text is null or v_sequence_text !~ '^[1-9][0-9]*$' then
    return jsonb_build_object('ok',false,'operation','SAVE','errors',jsonb_build_array(jsonb_build_object(
      'code','PARCEL_SEQUENCE_REQUIRED','field','parcel_sequence','message','parcel_sequence must be a positive integer.'
    )),'access',v_access);
  end if;
  v_sequence := v_sequence_text::integer;
  v_way_id := public.be_allocate_delivery_way_id(v_pickup_id,v_sequence);

  if v_client_way_id is not null and upper(v_client_way_id) <> upper(v_way_id) then
    return jsonb_build_object('ok',false,'operation','SAVE','errors',jsonb_build_array(jsonb_build_object(
      'code','WAY_ID_SERVER_CONTROLLED','field','way_id',
      'message','Client Way ID does not match the canonical server-generated Pickup ID and parcel sequence.',
      'canonical_way_id',v_way_id
    )),'access',v_access);
  end if;

  if v_recipient_name is null or v_recipient_phone is null or v_delivery_address is null then
    return jsonb_build_object('ok',false,'operation','SAVE','errors',jsonb_build_array(jsonb_build_object(
      'code','RECIPIENT_FIELDS_REQUIRED','message','Recipient name, phone, township, and delivery address are required.'
    )),'access',v_access);
  end if;

  if v_batch_text is not null then
    if v_batch_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      return jsonb_build_object('ok',false,'operation','SAVE','errors',jsonb_build_array(jsonb_build_object(
        'code','INVALID_BATCH_ID','field','batch_id','message','batch_id must be a UUID.'
      )),'access',v_access);
    end if;
    v_batch_id := v_batch_text::uuid;
    if not exists (select 1 from public.be_data_entry_register_batches where batch_id=v_batch_id) then
      return jsonb_build_object('ok',false,'operation','SAVE','errors',jsonb_build_array(jsonb_build_object(
        'code','BATCH_NOT_FOUND','field','batch_id','message','The supplied import batch does not exist.'
      )),'access',v_access);
    end if;
  end if;

  perform 1
  from public.be_portal_pickup_requests p
  where p.pickup_id = v_pickup_id;
  if not found then
    return jsonb_build_object('ok',false,'operation','SAVE','errors',jsonb_build_array(jsonb_build_object(
      'code','PICKUP_NOT_FOUND','field','pickup_id','message','Canonical production pickup was not found.'
    )),'access',v_access);
  end if;

  v_calc := public.be_data_entry_financial_v2_calculate(
    v_payload || jsonb_build_object(
      'way_id', v_way_id,
      'environment', 'PRODUCTION'
    )
  );

  if not coalesce((v_calc ->> 'ok')::boolean,false) then
    return v_calc || jsonb_build_object(
      'operation','SAVE',
      'pickup_id',v_pickup_id,
      'parcel_sequence',v_sequence,
      'canonical_way_id',v_way_id,
      'dry_run',v_dry_run
    );
  end if;

  v_data := v_calc -> 'data';
  v_validation_status := upper(coalesce(v_data ->> 'validation_status','ERROR'));
  v_merchant_id := upper(nullif(btrim(v_data ->> 'merchant_id'),''));

  select m.merchant_name into v_profile_name
  from public.be_merchant_financial_profiles_v2 m
  where upper(btrim(m.merchant_id))=v_merchant_id
    and m.is_active
    and m.effective_from <= public.be_business_date()
    and (m.effective_to is null or m.effective_to >= public.be_business_date())
  order by m.effective_from desc
  limit 1;

  v_cod := coalesce(nullif(v_data ->> 'cod_amount','')::numeric,0);
  v_item := coalesce(nullif(v_data ->> 'item_price','')::numeric,0);
  v_base := coalesce(nullif(v_data ->> 'base_tariff','')::numeric,0);
  v_weight_surcharge := coalesce(nullif(v_data ->> 'weight_surcharge','')::numeric,0);

  if greatest(v_cod,v_item,v_base,v_weight_surcharge) > 2147483647 then
    return jsonb_build_object('ok',false,'operation','SAVE','errors',jsonb_build_array(jsonb_build_object(
      'code','LEGACY_INTEGER_RANGE_EXCEEDED','message','A calculated amount exceeds the current parcels integer compatibility range.'
    )),'access',v_access);
  end if;

  v_response := jsonb_build_object(
    'ok', true,
    'build', 'DATA_ENTRY_FINANCIAL_V2_MUTATION_SHADOW_V58_2B_2026_08_01',
    'generated_at', now(),
    'operation', 'SAVE',
    'dry_run', v_dry_run,
    'mutation_mode', coalesce(v_mode,'MUTATION_SHADOW'),
    'request_id', v_request_id,
    'pickup_id', v_pickup_id,
    'parcel_sequence', v_sequence,
    'way_id', v_way_id,
    'data', v_data || jsonb_build_object(
      'way_id',v_way_id,
      'environment','PRODUCTION',
      'entered_by',v_actor_id
    ),
    'server_resolution', coalesce(v_calc -> 'server_resolution','{}'::jsonb) || jsonb_build_object(
      'canonical_way_id_source','pickup_id + parcel_sequence',
      'client_way_id_ignored',v_client_way_id is not null,
      'mutation_mode',coalesce(v_mode,'MUTATION_SHADOW')
    ),
    'access', v_access
  );

  if v_dry_run then
    return v_response || jsonb_build_object(
      'persisted',false,
      'audit_written',false,
      'idempotency_written',false
    );
  end if;

  v_payload_hash := md5((v_payload - 'dry_run')::text);
  insert into public.be_data_entry_financial_v2_requests_v58(
    request_id, operation, actor_id, payload_hash, status
  )
  values (v_request_id,'SAVE',v_actor_id,v_payload_hash,'IN_PROGRESS')
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select * into v_request
    from public.be_data_entry_financial_v2_requests_v58
    where request_id=v_request_id;

    if v_request.operation <> 'SAVE' or v_request.payload_hash <> v_payload_hash then
      return jsonb_build_object('ok',false,'operation','SAVE','errors',jsonb_build_array(jsonb_build_object(
        'code','IDEMPOTENCY_CONFLICT','message','request_id was already used with a different operation or payload.'
      )),'access',v_access);
    end if;

    if v_request.status='COMPLETE' and v_request.response is not null then
      return v_request.response || jsonb_build_object('idempotent_replay',true);
    end if;

    return jsonb_build_object('ok',false,'operation','SAVE','errors',jsonb_build_array(jsonb_build_object(
      'code','REQUEST_IN_PROGRESS','message','An identical request is already in progress.'
    )),'access',v_access);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_way_id, 0));

  select * into v_parcel
  from public.parcels p
  where upper(btrim(coalesce(p.way_id,'')))=upper(v_way_id)
  for update;
  v_parcel_found := found;

  if v_parcel_found and v_parcel.financial_locked_at is not null then
    raise exception using
      errcode='55000',
      message='Financial values are locked because a waybill has already been created.',
      detail=jsonb_build_object('way_id',v_way_id,'financial_locked_at',v_parcel.financial_locked_at)::text;
  end if;

  if v_parcel_found
     and upper(btrim(coalesce(v_parcel.merchant_id,''))) is distinct from v_merchant_id then
    raise exception using
      errcode='23514',
      message='Way ID merchant lineage mismatch.',
      detail=jsonb_build_object('way_id',v_way_id,'existing_merchant_id',v_parcel.merchant_id,'requested_merchant_id',v_merchant_id)::text;
  end if;

  select * into v_detail
  from public.be_data_entry_parcel_details d
  where d.pickup_id=v_pickup_id and d.parcel_sequence=v_sequence
  for update;
  v_detail_found := found;

  if v_detail_found and upper(btrim(v_detail.delivery_way_id)) <> upper(v_way_id) then
    raise exception using
      errcode='23514',
      message='Pickup and parcel sequence already map to another delivery Way ID.',
      detail=jsonb_build_object('pickup_id',v_pickup_id,'parcel_sequence',v_sequence,'existing_way_id',v_detail.delivery_way_id,'canonical_way_id',v_way_id)::text;
  end if;

  if exists (
    select 1 from public.be_data_entry_parcel_details d
    where upper(btrim(d.delivery_way_id))=upper(v_way_id)
      and (d.pickup_id<>v_pickup_id or d.parcel_sequence<>v_sequence)
  ) then
    raise exception using
      errcode='23505',
      message='Delivery Way ID is already linked to a different Data Entry pickup row.';
  end if;

  select * into v_register
  from public.be_data_entry_register_rows r
  where upper(btrim(coalesce(r.delivery_way_id,'')))=upper(v_way_id)
  for update;
  v_register_found := found;

  if v_register_found and (
       upper(btrim(coalesce(v_register.pickup_way_id,''))) is distinct from upper(v_pickup_id)
       or upper(btrim(coalesce(v_register.merchant_code,''))) is distinct from v_merchant_id
     ) then
    raise exception using
      errcode='23514',
      message='Register-row pickup or merchant lineage mismatch.',
      detail=jsonb_build_object(
        'way_id',v_way_id,
        'existing_pickup_id',v_register.pickup_way_id,
        'existing_merchant_id',v_register.merchant_code,
        'requested_pickup_id',v_pickup_id,
        'requested_merchant_id',v_merchant_id
      )::text;
  end if;

  if v_parcel_found then
    v_parcel_id := v_parcel.id;
    v_before_input := jsonb_build_object(
      'customer_id',v_parcel.customer_id,'merchant_id',v_parcel.merchant_id,
      'recipient_name',v_parcel.recipient_name,'recipient_phone',v_parcel.recipient_phone,
      'township',v_parcel.township,'delivery_address',v_parcel.delivery_address,
      'item_price',v_parcel.item_price,'delivery_charges',v_parcel.delivery_charges,
      'weight_kg',v_parcel.weight_kg,'amount_entry_type',v_parcel.amount_entry_type,
      'merchant_stated_total_amount',v_parcel.merchant_stated_total_amount,
      'additional_customer_charge',v_parcel.additional_customer_charge,
      'cbm_surcharge',v_parcel.cbm_surcharge,'other_surcharge',v_parcel.other_surcharge,
      'merchant_payable_charges',v_parcel.merchant_payable_charges,
      'other_merchant_credits',v_parcel.other_merchant_credits,'remarks',v_parcel.remarks
    );
    v_before_calc := jsonb_build_object(
      'customer_tier',v_parcel.customer_tier,'monthly_ways',v_parcel.monthly_ways,
      'cod_amount',v_parcel.cod_amount,'tariff_zone',v_parcel.tariff_zone,
      'tariff_zone_code',v_parcel.tariff_zone_code,'base_tariff',v_parcel.base_tariff,
      'included_kg',v_parcel.included_kg,'extra_per_kg',v_parcel.extra_per_kg,
      'chargeable_weight_kg',v_parcel.chargeable_weight_kg,'extra_kg',v_parcel.extra_kg,
      'weight_surcharge',v_parcel.weight_surcharge,
      'gross_system_delivery_charge',v_parcel.gross_system_delivery_charge,
      'commitment_refund',v_parcel.commitment_refund,
      'net_system_delivery_charge',v_parcel.net_system_delivery_charge,
      'delivery_difference',v_parcel.delivery_difference,
      'settlement_direction',v_parcel.settlement_direction,
      'merchant_final_settlement_amount',v_parcel.merchant_final_settlement_amount,
      'validation_status',v_parcel.validation_status,
      'calculation_version',v_parcel.calculation_version
    );

    update public.parcels p set
      sender_name=coalesce(v_profile_name,p.sender_name),
      recipient_name=v_recipient_name,
      recipient_phone=v_recipient_phone,
      recipient_address=v_delivery_address,
      recipient_township=v_data ->> 'township',
      way_id=v_way_id,
      customer_id=v_customer_id,
      merchant_id=v_merchant_id,
      township=v_data ->> 'township',
      delivery_address=v_delivery_address,
      item_price=nullif(v_data ->> 'item_price','')::numeric,
      delivery_charges=nullif(v_data ->> 'delivery_charges','')::numeric,
      cod_amount=v_cod::integer,
      weight_kg=nullif(v_data ->> 'weight_kg','')::numeric,
      environment='production',
      parcel_sequence=v_sequence,
      extra_weight_charge=coalesce(nullif(v_data ->> 'weight_surcharge','')::numeric,0),
      collect_amount=v_cod,
      remarks=nullif(btrim(v_data ->> 'remarks'),''),
      declared_value=v_item::integer,
      base_price=v_base::integer,
      overweight_fee=v_weight_surcharge::integer,
      total_price=v_cod::integer,
      customer_tier=v_data ->> 'customer_tier',
      monthly_ways=nullif(v_data ->> 'monthly_ways','')::integer,
      amount_entry_type=v_data ->> 'amount_entry_type',
      merchant_stated_total_amount=nullif(v_data ->> 'merchant_stated_total_amount','')::bigint,
      additional_customer_charge=coalesce(nullif(v_data ->> 'additional_customer_charge','')::bigint,0),
      cbm_surcharge=coalesce(nullif(v_data ->> 'cbm_surcharge','')::bigint,0),
      other_surcharge=coalesce(nullif(v_data ->> 'other_surcharge','')::bigint,0),
      merchant_payable_charges=coalesce(nullif(v_data ->> 'merchant_payable_charges','')::bigint,0),
      other_merchant_credits=coalesce(nullif(v_data ->> 'other_merchant_credits','')::bigint,0),
      entered_by=coalesce(p.entered_by,v_actor_id),
      tariff_zone=v_data ->> 'tariff_zone',
      tariff_zone_code=v_data ->> 'tariff_zone_code',
      base_tariff=nullif(v_data ->> 'base_tariff','')::bigint,
      included_kg=nullif(v_data ->> 'included_kg','')::numeric,
      extra_per_kg=nullif(v_data ->> 'extra_per_kg','')::bigint,
      commitment_min_ways=nullif(v_data ->> 'commitment_min_ways','')::integer,
      commitment_refund_per_way=nullif(v_data ->> 'commitment_refund_per_way','')::bigint,
      chargeable_weight_kg=nullif(v_data ->> 'chargeable_weight_kg','')::numeric,
      extra_kg=nullif(v_data ->> 'extra_kg','')::numeric,
      weight_surcharge=nullif(v_data ->> 'weight_surcharge','')::bigint,
      gross_system_delivery_charge=nullif(v_data ->> 'gross_system_delivery_charge','')::bigint,
      commitment_refund=nullif(v_data ->> 'commitment_refund','')::bigint,
      net_system_delivery_charge=nullif(v_data ->> 'net_system_delivery_charge','')::bigint,
      effective_declared_delivery_charge=nullif(v_data ->> 'effective_declared_delivery_charge','')::bigint,
      delivery_difference=nullif(v_data ->> 'delivery_difference','')::bigint,
      settlement_direction=v_data ->> 'settlement_direction',
      merchant_settlement_adjustment=nullif(v_data ->> 'merchant_settlement_adjustment','')::bigint,
      merchant_final_settlement_amount=nullif(v_data ->> 'merchant_final_settlement_amount','')::bigint,
      validation_status=v_validation_status,
      validation_message=v_data ->> 'validation_message',
      calculation_version=v_data ->> 'calculation_version',
      calculated_at=nullif(v_data ->> 'calculated_at','')::timestamptz,
      updated_at=now()
    where p.id=v_parcel_id;
  else
    insert into public.parcels(
      tracking_code,sender_name,recipient_name,recipient_phone,recipient_address,
      recipient_township,weight_kg,cod_amount,declared_value,base_price,overweight_fee,
      total_price,status,way_id,customer_id,merchant_id,township,delivery_address,
      item_price,delivery_charges,environment,parcel_sequence,extra_weight_charge,
      collect_amount,remarks,customer_tier,monthly_ways,amount_entry_type,
      merchant_stated_total_amount,additional_customer_charge,cbm_surcharge,other_surcharge,
      merchant_payable_charges,other_merchant_credits,entered_by,tariff_zone,
      tariff_zone_code,base_tariff,included_kg,extra_per_kg,commitment_min_ways,
      commitment_refund_per_way,chargeable_weight_kg,extra_kg,weight_surcharge,
      gross_system_delivery_charge,commitment_refund,net_system_delivery_charge,
      effective_declared_delivery_charge,delivery_difference,settlement_direction,
      merchant_settlement_adjustment,merchant_final_settlement_amount,validation_status,
      validation_message,calculation_version,calculated_at
    ) values (
      v_way_id,coalesce(v_profile_name,v_merchant_id),v_recipient_name,v_recipient_phone,
      v_delivery_address,v_data ->> 'township',nullif(v_data ->> 'weight_kg','')::numeric,
      v_cod::integer,v_item::integer,v_base::integer,v_weight_surcharge::integer,
      v_cod::integer,'registered',v_way_id,v_customer_id,v_merchant_id,
      v_data ->> 'township',v_delivery_address,nullif(v_data ->> 'item_price','')::numeric,
      nullif(v_data ->> 'delivery_charges','')::numeric,'production',v_sequence,
      coalesce(nullif(v_data ->> 'weight_surcharge','')::numeric,0),v_cod,
      nullif(btrim(v_data ->> 'remarks'),''),v_data ->> 'customer_tier',
      nullif(v_data ->> 'monthly_ways','')::integer,v_data ->> 'amount_entry_type',
      nullif(v_data ->> 'merchant_stated_total_amount','')::bigint,
      coalesce(nullif(v_data ->> 'additional_customer_charge','')::bigint,0),
      coalesce(nullif(v_data ->> 'cbm_surcharge','')::bigint,0),
      coalesce(nullif(v_data ->> 'other_surcharge','')::bigint,0),
      coalesce(nullif(v_data ->> 'merchant_payable_charges','')::bigint,0),
      coalesce(nullif(v_data ->> 'other_merchant_credits','')::bigint,0),v_actor_id,
      v_data ->> 'tariff_zone',v_data ->> 'tariff_zone_code',
      nullif(v_data ->> 'base_tariff','')::bigint,nullif(v_data ->> 'included_kg','')::numeric,
      nullif(v_data ->> 'extra_per_kg','')::bigint,nullif(v_data ->> 'commitment_min_ways','')::integer,
      nullif(v_data ->> 'commitment_refund_per_way','')::bigint,
      nullif(v_data ->> 'chargeable_weight_kg','')::numeric,
      nullif(v_data ->> 'extra_kg','')::numeric,nullif(v_data ->> 'weight_surcharge','')::bigint,
      nullif(v_data ->> 'gross_system_delivery_charge','')::bigint,
      nullif(v_data ->> 'commitment_refund','')::bigint,
      nullif(v_data ->> 'net_system_delivery_charge','')::bigint,
      nullif(v_data ->> 'effective_declared_delivery_charge','')::bigint,
      nullif(v_data ->> 'delivery_difference','')::bigint,v_data ->> 'settlement_direction',
      nullif(v_data ->> 'merchant_settlement_adjustment','')::bigint,
      nullif(v_data ->> 'merchant_final_settlement_amount','')::bigint,
      v_validation_status,v_data ->> 'validation_message',v_data ->> 'calculation_version',
      nullif(v_data ->> 'calculated_at','')::timestamptz
    ) returning id into v_parcel_id;
  end if;

  if v_detail_found then
    update public.be_data_entry_parcel_details d set
      delivery_way_id=v_way_id,
      recipient_name=v_recipient_name,
      contact_no_1=v_recipient_phone,
      township=v_data ->> 'township',
      recipient_address=v_delivery_address,
      customer_tier=v_data ->> 'customer_tier',
      item_price=coalesce(nullif(v_data ->> 'item_price','')::numeric,0),
      weight_kg=coalesce(nullif(v_data ->> 'weight_kg','')::numeric,0),
      surcharge=coalesce(nullif(v_data ->> 'weight_surcharge','')::numeric,0)
        + coalesce(nullif(v_data ->> 'cbm_surcharge','')::numeric,0)
        + coalesce(nullif(v_data ->> 'other_surcharge','')::numeric,0),
      delivery_fee=coalesce(nullif(v_data ->> 'net_system_delivery_charge','')::numeric,0),
      cod_amount=v_cod,
      destination=nullif(btrim(v_payload ->> 'destination'),''),
      pickup_by='DATA_ENTRY_FINANCIAL_V2',
      remark=nullif(btrim(v_data ->> 'remarks'),''),
      saved_by_email=v_actor_email,
      saved_at=coalesce(d.saved_at,now()),
      way_id=v_way_id,
      customer_id=v_customer_id,
      merchant_id=v_merchant_id,
      parcel_status='registered',
      environment='PRODUCTION',
      amount_entry_type=v_data ->> 'amount_entry_type',
      delivery_charges=nullif(v_data ->> 'delivery_charges','')::bigint,
      merchant_stated_total_amount=nullif(v_data ->> 'merchant_stated_total_amount','')::bigint,
      additional_customer_charge=coalesce(nullif(v_data ->> 'additional_customer_charge','')::bigint,0),
      cbm_surcharge=coalesce(nullif(v_data ->> 'cbm_surcharge','')::bigint,0),
      other_surcharge=coalesce(nullif(v_data ->> 'other_surcharge','')::bigint,0),
      merchant_payable_charges=coalesce(nullif(v_data ->> 'merchant_payable_charges','')::bigint,0),
      other_merchant_credits=coalesce(nullif(v_data ->> 'other_merchant_credits','')::bigint,0),
      base_tariff=nullif(v_data ->> 'base_tariff','')::bigint,
      included_kg=nullif(v_data ->> 'included_kg','')::numeric,
      chargeable_weight_kg=nullif(v_data ->> 'chargeable_weight_kg','')::numeric,
      extra_kg=nullif(v_data ->> 'extra_kg','')::numeric,
      weight_surcharge=nullif(v_data ->> 'weight_surcharge','')::bigint,
      gross_system_delivery_charge=nullif(v_data ->> 'gross_system_delivery_charge','')::bigint,
      commitment_refund=nullif(v_data ->> 'commitment_refund','')::bigint,
      net_system_delivery_charge=nullif(v_data ->> 'net_system_delivery_charge','')::bigint,
      effective_declared_delivery_charge=nullif(v_data ->> 'effective_declared_delivery_charge','')::bigint,
      delivery_difference=nullif(v_data ->> 'delivery_difference','')::bigint,
      settlement_direction=v_data ->> 'settlement_direction',
      merchant_settlement_adjustment=nullif(v_data ->> 'merchant_settlement_adjustment','')::bigint,
      merchant_final_settlement_amount=nullif(v_data ->> 'merchant_final_settlement_amount','')::bigint,
      financial_validation_status=v_validation_status,
      financial_validation_message=v_data ->> 'validation_message',
      financial_calculation_version=v_data ->> 'calculation_version',
      financial_calculated_at=nullif(v_data ->> 'calculated_at','')::timestamptz,
      financial_quote=v_data,
      updated_at=now()
    where d.id=v_detail.id;
  else
    insert into public.be_data_entry_parcel_details(
      pickup_id,parcel_sequence,delivery_way_id,recipient_name,contact_no_1,township,
      recipient_address,customer_tier,item_price,weight_kg,surcharge,delivery_fee,cod_amount,
      destination,pickup_by,remark,saved_by_email,saved_at,way_id,customer_id,merchant_id,
      parcel_status,environment,amount_entry_type,delivery_charges,
      merchant_stated_total_amount,additional_customer_charge,cbm_surcharge,other_surcharge,
      merchant_payable_charges,other_merchant_credits,base_tariff,included_kg,
      chargeable_weight_kg,extra_kg,weight_surcharge,gross_system_delivery_charge,
      commitment_refund,net_system_delivery_charge,effective_declared_delivery_charge,
      delivery_difference,settlement_direction,merchant_settlement_adjustment,
      merchant_final_settlement_amount,financial_validation_status,
      financial_validation_message,financial_calculation_version,financial_calculated_at,
      financial_quote
    ) values (
      v_pickup_id,v_sequence,v_way_id,v_recipient_name,v_recipient_phone,v_data ->> 'township',
      v_delivery_address,v_data ->> 'customer_tier',
      coalesce(nullif(v_data ->> 'item_price','')::numeric,0),
      coalesce(nullif(v_data ->> 'weight_kg','')::numeric,0),
      coalesce(nullif(v_data ->> 'weight_surcharge','')::numeric,0)
        + coalesce(nullif(v_data ->> 'cbm_surcharge','')::numeric,0)
        + coalesce(nullif(v_data ->> 'other_surcharge','')::numeric,0),
      coalesce(nullif(v_data ->> 'net_system_delivery_charge','')::numeric,0),v_cod,
      nullif(btrim(v_payload ->> 'destination'),''),'DATA_ENTRY_FINANCIAL_V2',
      nullif(btrim(v_data ->> 'remarks'),''),v_actor_email,now(),v_way_id,v_customer_id,
      v_merchant_id,'registered','PRODUCTION',v_data ->> 'amount_entry_type',
      nullif(v_data ->> 'delivery_charges','')::bigint,
      nullif(v_data ->> 'merchant_stated_total_amount','')::bigint,
      coalesce(nullif(v_data ->> 'additional_customer_charge','')::bigint,0),
      coalesce(nullif(v_data ->> 'cbm_surcharge','')::bigint,0),
      coalesce(nullif(v_data ->> 'other_surcharge','')::bigint,0),
      coalesce(nullif(v_data ->> 'merchant_payable_charges','')::bigint,0),
      coalesce(nullif(v_data ->> 'other_merchant_credits','')::bigint,0),
      nullif(v_data ->> 'base_tariff','')::bigint,nullif(v_data ->> 'included_kg','')::numeric,
      nullif(v_data ->> 'chargeable_weight_kg','')::numeric,
      nullif(v_data ->> 'extra_kg','')::numeric,nullif(v_data ->> 'weight_surcharge','')::bigint,
      nullif(v_data ->> 'gross_system_delivery_charge','')::bigint,
      nullif(v_data ->> 'commitment_refund','')::bigint,
      nullif(v_data ->> 'net_system_delivery_charge','')::bigint,
      nullif(v_data ->> 'effective_declared_delivery_charge','')::bigint,
      nullif(v_data ->> 'delivery_difference','')::bigint,v_data ->> 'settlement_direction',
      nullif(v_data ->> 'merchant_settlement_adjustment','')::bigint,
      nullif(v_data ->> 'merchant_final_settlement_amount','')::bigint,
      v_validation_status,v_data ->> 'validation_message',v_data ->> 'calculation_version',
      nullif(v_data ->> 'calculated_at','')::timestamptz,v_data
    );
  end if;

  if v_register_found then
    update public.be_data_entry_register_rows r set
      batch_id=coalesce(v_batch_id,r.batch_id),
      row_no=coalesce(r.row_no,v_sequence),
      source_file_name=coalesce(v_source_file,r.source_file_name),
      overall_status='registered',
      operation_status='data_entry_financial_v2_saved',
      financial_status=case when v_validation_status='OK' then 'ready_for_finance' else 'review_required' end,
      pickup_date=public.be_business_date(),
      pickup_way_id=v_pickup_id,
      delivery_way_id=v_way_id,
      merchant_code=v_merchant_id,
      merchant_name=v_profile_name,
      recipient_name=v_recipient_name,
      recipient_phone=v_recipient_phone,
      recipient_township=v_data ->> 'township',
      recipient_address=v_delivery_address,
      item_price=coalesce(nullif(v_data ->> 'item_price','')::numeric,0),
      delivery_fee_os=coalesce(nullif(v_data ->> 'delivery_charges','')::numeric,0),
      cod_os=v_cod,
      std_deli=coalesce(nullif(v_data ->> 'net_system_delivery_charge','')::numeric,0),
      max_deli=coalesce(nullif(v_data ->> 'gross_system_delivery_charge','')::numeric,0),
      weight_kg=coalesce(nullif(v_data ->> 'weight_kg','')::numeric,0),
      surcharge=coalesce(nullif(v_data ->> 'weight_surcharge','')::numeric,0)
        + coalesce(nullif(v_data ->> 'cbm_surcharge','')::numeric,0)
        + coalesce(nullif(v_data ->> 'other_surcharge','')::numeric,0),
      final_cod=v_cod,
      destination=nullif(btrim(v_payload ->> 'destination'),''),
      pickup_by_1=v_actor_email,
      general_remarks=nullif(btrim(v_data ->> 'remarks'),''),
      finance_deli=coalesce(nullif(v_data ->> 'net_system_delivery_charge','')::numeric,0),
      finance_cod=v_cod,
      finance_status=case when v_validation_status='OK' then 'ready_for_finance' else 'review_required' end,
      validation_status='valid',
      validation_errors='[]'::jsonb,
      raw_row=v_data || jsonb_build_object(
        'pickup_id',v_pickup_id,'parcel_sequence',v_sequence,'request_id',v_request_id
      ),
      updated_at=now()
    where r.row_id=v_register.row_id;
  else
    insert into public.be_data_entry_register_rows(
      batch_id,row_no,source_file_name,overall_status,operation_status,financial_status,
      pickup_date,pickup_way_id,delivery_way_id,merchant_code,merchant_name,recipient_name,
      recipient_phone,recipient_township,recipient_address,item_price,delivery_fee_os,cod_os,
      std_deli,max_deli,weight_kg,surcharge,final_cod,destination,pickup_by_1,
      general_remarks,finance_deli,finance_cod,finance_status,validation_status,
      validation_errors,raw_row,created_by,created_by_name
    ) values (
      v_batch_id,v_sequence,v_source_file,'registered','data_entry_financial_v2_saved',
      case when v_validation_status='OK' then 'ready_for_finance' else 'review_required' end,
      public.be_business_date(),v_pickup_id,v_way_id,v_merchant_id,v_profile_name,
      v_recipient_name,v_recipient_phone,v_data ->> 'township',v_delivery_address,
      coalesce(nullif(v_data ->> 'item_price','')::numeric,0),
      coalesce(nullif(v_data ->> 'delivery_charges','')::numeric,0),v_cod,
      coalesce(nullif(v_data ->> 'net_system_delivery_charge','')::numeric,0),
      coalesce(nullif(v_data ->> 'gross_system_delivery_charge','')::numeric,0),
      coalesce(nullif(v_data ->> 'weight_kg','')::numeric,0),
      coalesce(nullif(v_data ->> 'weight_surcharge','')::numeric,0)
        + coalesce(nullif(v_data ->> 'cbm_surcharge','')::numeric,0)
        + coalesce(nullif(v_data ->> 'other_surcharge','')::numeric,0),
      v_cod,nullif(btrim(v_payload ->> 'destination'),''),v_actor_email,
      nullif(btrim(v_data ->> 'remarks'),''),
      coalesce(nullif(v_data ->> 'net_system_delivery_charge','')::numeric,0),v_cod,
      case when v_validation_status='OK' then 'ready_for_finance' else 'review_required' end,
      'valid','[]'::jsonb,
      v_data || jsonb_build_object(
        'pickup_id',v_pickup_id,'parcel_sequence',v_sequence,'request_id',v_request_id
      ),
      coalesce(v_actor_email,v_actor_id::text),v_actor_email
    );
  end if;

  v_after_input := jsonb_build_object(
    'customer_id',v_customer_id,'merchant_id',v_merchant_id,
    'recipient_name',v_recipient_name,'recipient_phone',v_recipient_phone,
    'township',v_data ->> 'township','delivery_address',v_delivery_address,
    'item_price',v_data -> 'item_price','delivery_charges',v_data -> 'delivery_charges',
    'weight_kg',v_data -> 'weight_kg','amount_entry_type',v_data ->> 'amount_entry_type',
    'merchant_stated_total_amount',v_data -> 'merchant_stated_total_amount',
    'additional_customer_charge',v_data -> 'additional_customer_charge',
    'cbm_surcharge',v_data -> 'cbm_surcharge','other_surcharge',v_data -> 'other_surcharge',
    'merchant_payable_charges',v_data -> 'merchant_payable_charges',
    'other_merchant_credits',v_data -> 'other_merchant_credits','remarks',v_data ->> 'remarks'
  );
  v_after_calc := v_data - array[
    'customer_id','merchant_id','recipient_name','recipient_phone','township','delivery_address',
    'item_price','delivery_charges','weight_kg','amount_entry_type','merchant_stated_total_amount',
    'additional_customer_charge','cbm_surcharge','other_surcharge','merchant_payable_charges',
    'other_merchant_credits','remarks'
  ]::text[];

  insert into public.be_parcel_financial_audit_v2(
    parcel_id,way_id,previous_input_values,new_input_values,
    previous_calculated_values,new_calculated_values,employee_id,
    authorization_employee_id,reason,calculation_version
  ) values (
    v_parcel_id::text,v_way_id,v_before_input,v_after_input,v_before_calc,v_after_calc,
    v_actor_id,null,v_reason,coalesce(v_data ->> 'calculation_version','PARCEL_FINANCIAL_V2')
  );

  v_response := v_response || jsonb_build_object(
    'persisted',true,
    'parcel_id',v_parcel_id,
    'register_lineage_written',true,
    'financial_audit_written',true,
    'idempotency_written',true
  );

  insert into public.be_audit_events(
    actor_id,actor_email,actor_role,action,resource_type,resource_id,details,
    upload_code,event_type,entity_type,entity_id,payload
  ) values (
    v_actor_id,v_actor_email,v_access ->> 'actor_role',
    'DATA_ENTRY_FINANCIAL_V2_SAVED','PARCEL',v_way_id,
    jsonb_build_object(
      'request_id',v_request_id,'pickup_id',v_pickup_id,'parcel_sequence',v_sequence,
      'before_value',v_before_input || v_before_calc,
      'after_value',v_after_input || v_after_calc,'reason',v_reason
    ),
    'DATA_ENTRY_FINANCIAL_V2_MUTATION_SHADOW_V58_2B_2026_08_01',
    'DATA_ENTRY_FINANCIAL_V2_SAVE','PARCEL',v_way_id,v_response
  );

  update public.be_data_entry_financial_v2_requests_v58
  set status='COMPLETE',response=v_response,completed_at=now()
  where request_id=v_request_id;

  return v_response;
end
$function$;
REVOKE ALL ON FUNCTION public.be_data_entry_financial_v2_save(jsonb) FROM PUBLIC, anon, authenticated, service_role;
