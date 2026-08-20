begin;

create or replace function public.be_finance_confirm_data_entry_financial_v4(
  p_way_id text,
  p_changes jsonb default '{}'::jsonb,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_way text := upper(nullif(btrim(coalesce(p_way_id,'')),''));
  v_role text;
  v_mode text;
  v_before public.parcels%rowtype;
  v_type text;
  v_item bigint;
  v_delivery bigint;
  v_total bigint;
  v_add bigint;
  v_cbm bigint;
  v_other bigint;
  v_payable bigint;
  v_credits bigint;
  v_weight numeric;
  v_calc jsonb;
  v_new jsonb;
  v_headers jsonb := '{}'::jsonb;
  v_ip text;
begin
  if v_way is null then
    return jsonb_build_object('ok',false,'code','WAY_ID_REQUIRED');
  end if;

  v_role := public.be_finance_assert_internal_v3();
  select mutation_mode into v_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton;

  if not p_dry_run and upper(coalesce(v_role,'')) not in (
    'FINANCE_REVIEWER','FINANCE_APPROVER','FINANCE_ADMIN','FINANCE_MANAGER',
    'FINANCE','ACCOUNTS','ADMIN','SUPERADMIN'
  ) then
    raise exception 'Finance reviewer/approver permission is required';
  end if;

  select * into v_before
  from public.parcels
  where upper(btrim(coalesce(way_id,'')))=v_way
  for update;

  if not found then
    return jsonb_build_object('ok',false,'code','PARCEL_NOT_FOUND','way_id',v_way);
  end if;

  if v_before.financial_locked_at is not null
     or v_before.financial_settlement_batch_id is not null
     or v_before.financial_settled_at is not null then
    return jsonb_build_object(
      'ok',false,'code','FINANCIAL_RECORD_LOCKED',
      'message','Use the Finance adjustment workflow for locked/batched/settled parcels.'
    );
  end if;

  v_type := upper(btrim(coalesce(
    nullif(p_changes->>'amount_entry_type',''),
    v_before.amount_entry_type,
    'ITEM_PRICE_PLUS_DECLARED_DELIVERY'
  )));

  if v_type not in (
    'ITEM_PRICE_PLUS_DECLARED_DELIVERY',
    'DELIVERY_CHARGE_ONLY',
    'EXACT_COLLECTION_AMOUNT',
    'OPAQUE_COD_COLLECTION'
  ) then
    return jsonb_build_object('ok',false,'code','COLLECTION_METHOD_NOT_ALLOWED');
  end if;

  v_item := case when p_changes ? 'item_price' then nullif(p_changes->>'item_price','')::bigint else v_before.item_price::bigint end;
  v_delivery := case when p_changes ? 'delivery_charges' then nullif(p_changes->>'delivery_charges','')::bigint else v_before.delivery_charges::bigint end;
  v_total := case when p_changes ? 'merchant_stated_total_amount' then nullif(p_changes->>'merchant_stated_total_amount','')::bigint else v_before.merchant_stated_total_amount end;
  v_add := coalesce(case when p_changes ? 'additional_customer_charge' then nullif(p_changes->>'additional_customer_charge','')::bigint end,v_before.additional_customer_charge,0);
  v_cbm := coalesce(case when p_changes ? 'cbm_surcharge' then nullif(p_changes->>'cbm_surcharge','')::bigint end,v_before.cbm_surcharge,0);
  v_other := coalesce(case when p_changes ? 'other_surcharge' then nullif(p_changes->>'other_surcharge','')::bigint end,v_before.other_surcharge,0);
  v_payable := coalesce(case when p_changes ? 'merchant_payable_charges' then nullif(p_changes->>'merchant_payable_charges','')::bigint end,v_before.merchant_payable_charges,0);
  v_credits := coalesce(case when p_changes ? 'other_merchant_credits' then nullif(p_changes->>'other_merchant_credits','')::bigint end,v_before.other_merchant_credits,0);
  v_weight := coalesce(case when p_changes ? 'weight_kg' then nullif(p_changes->>'weight_kg','')::numeric end,v_before.weight_kg,0);

  if v_type='DELIVERY_CHARGE_ONLY' then
    v_item := null; v_total := null;
  elsif v_type in ('EXACT_COLLECTION_AMOUNT','OPAQUE_COD_COLLECTION') then
    v_item := null; v_delivery := null;
  else
    v_total := null;
  end if;

  v_calc := public.be_calculate_parcel_financial_v2(
    coalesce(nullif(p_changes->>'township',''),v_before.township),
    upper(coalesce(nullif(p_changes->>'customer_tier',''),v_before.customer_tier,'STANDARD')),
    v_type,v_item,v_delivery,v_total,v_add,v_cbm,v_other,v_payable,v_credits,v_weight,coalesce(v_before.monthly_ways,0)
  );

  if upper(coalesce(v_calc->>'validation_status','ERROR')) <> 'OK' then
    return jsonb_build_object('ok',false,'code','CALCULATION_NOT_VALID','data',v_calc);
  end if;

  begin
    v_headers := coalesce(current_setting('request.headers',true)::jsonb,'{}'::jsonb);
  exception when others then
    v_headers := '{}'::jsonb;
  end;
  v_ip := coalesce(nullif(v_headers->>'cf-connecting-ip',''),nullif(v_headers->>'x-forwarded-for',''),nullif(v_headers->>'x-real-ip',''));

  v_new := jsonb_build_object(
    'way_id',v_way,
    'amount_entry_type',v_type,
    'item_price',v_item,
    'delivery_charges',v_delivery,
    'merchant_stated_total_amount',v_total,
    'finance_review',jsonb_build_object(
      'status',case when p_dry_run then 'PREVIEW' else 'CONFIRMED' end,
      'actor_uid',auth.uid(),
      'actor_email',public.be_finance_actor_email_v3(),
      'actor_role',v_role,
      'device_id',nullif(p_changes->>'client_device_id',''),
      'user_agent',nullif(p_changes->>'client_user_agent',''),
      'timezone',nullif(p_changes->>'client_timezone',''),
      'request_ip',v_ip,
      'reviewed_at',now()
    )
  ) || v_calc;

  if p_dry_run then
    return jsonb_build_object('ok',true,'persisted',false,'mutation_mode',coalesce(v_mode,'MUTATION_SHADOW'),'data',v_new);
  end if;

  if coalesce(v_mode,'MUTATION_SHADOW') <> 'ACTIVE' then
    return jsonb_build_object(
      'ok',false,'persisted',false,'code','MUTATION_NOT_ACTIVE',
      'message','Finance confirmation is installed, but live Financial V2 writes remain MUTATION_SHADOW until UAT activation.',
      'preview',v_new
    );
  end if;

  update public.parcels p set
    amount_entry_type=v_type,
    item_price=v_item,
    delivery_charges=v_delivery,
    merchant_stated_total_amount=v_total,
    additional_customer_charge=v_add,
    cbm_surcharge=v_cbm,
    other_surcharge=v_other,
    merchant_payable_charges=v_payable,
    other_merchant_credits=v_credits,
    weight_kg=v_weight,
    cod_amount=(v_calc->>'cod_amount')::integer,
    collect_amount=(v_calc->>'cod_amount')::numeric,
    base_tariff=nullif(v_calc->>'base_tariff','')::bigint,
    weight_surcharge=nullif(v_calc->>'weight_surcharge','')::bigint,
    gross_system_delivery_charge=nullif(v_calc->>'gross_system_delivery_charge','')::bigint,
    commitment_refund=nullif(v_calc->>'commitment_refund','')::bigint,
    net_system_delivery_charge=nullif(v_calc->>'net_system_delivery_charge','')::bigint,
    effective_declared_delivery_charge=nullif(v_calc->>'effective_declared_delivery_charge','')::bigint,
    delivery_difference=nullif(v_calc->>'delivery_difference','')::bigint,
    settlement_direction=v_calc->>'settlement_direction',
    merchant_settlement_adjustment=nullif(v_calc->>'merchant_settlement_adjustment','')::bigint,
    merchant_final_settlement_amount=nullif(v_calc->>'merchant_final_settlement_amount','')::bigint,
    validation_status=v_calc->>'validation_status',
    validation_message=v_calc->>'validation_message',
    calculation_version=v_calc->>'calculation_version',
    calculated_at=nullif(v_calc->>'calculated_at','')::timestamptz,
    authorized_by=auth.uid(),
    updated_at=now()
  where p.id=v_before.id;

  update public.be_data_entry_parcel_details d set
    amount_entry_type=v_type,
    item_price=coalesce(v_item,0),
    delivery_charges=v_delivery,
    merchant_stated_total_amount=v_total,
    cod_amount=(v_calc->>'cod_amount')::numeric,
    net_system_delivery_charge=nullif(v_calc->>'net_system_delivery_charge','')::bigint,
    delivery_difference=nullif(v_calc->>'delivery_difference','')::bigint,
    settlement_direction=v_calc->>'settlement_direction',
    merchant_final_settlement_amount=nullif(v_calc->>'merchant_final_settlement_amount','')::bigint,
    financial_validation_status=v_calc->>'validation_status',
    financial_validation_message=v_calc->>'validation_message',
    financial_calculation_version=v_calc->>'calculation_version',
    financial_calculated_at=nullif(v_calc->>'calculated_at','')::timestamptz,
    financial_quote=v_new,
    finance_status='FINANCE_CONFIRMED',
    updated_at=now()
  where upper(btrim(coalesce(d.delivery_way_id,d.way_id,'')))=v_way;

  update public.be_data_entry_register_rows r set
    item_price=coalesce(v_item,0),
    delivery_fee_os=coalesce(v_delivery,0),
    cod_os=(v_calc->>'cod_amount')::numeric,
    std_deli=coalesce(nullif(v_calc->>'net_system_delivery_charge','')::numeric,0),
    final_cod=(v_calc->>'cod_amount')::numeric,
    finance_deli=coalesce(nullif(v_calc->>'net_system_delivery_charge','')::numeric,0),
    finance_cod=(v_calc->>'cod_amount')::numeric,
    finance_status='FINANCE_CONFIRMED',
    financial_status='FINANCE_CONFIRMED',
    raw_row=coalesce(r.raw_row,'{}'::jsonb) || v_new,
    updated_at=now()
  where upper(btrim(coalesce(r.delivery_way_id,'')))=v_way;

  perform public.be_finance_audit_v3(
    'FINANCE_DATA_ENTRY_CONFIRMED','PARCEL',v_way,to_jsonb(v_before),v_new,
    coalesce(nullif(p_changes->>'reason',''),'FINANCE_DATA_ENTRY_CONFIRMATION')
  );

  return jsonb_build_object('ok',true,'persisted',true,'way_id',v_way,'authorized_by',auth.uid(),'data',v_new);
end;
$function$;

revoke all on function public.be_finance_confirm_data_entry_financial_v4(text,jsonb,boolean) from public;
revoke all on function public.be_finance_confirm_data_entry_financial_v4(text,jsonb,boolean) from anon;
grant execute on function public.be_finance_confirm_data_entry_financial_v4(text,jsonb,boolean) to authenticated;
grant execute on function public.be_finance_confirm_data_entry_financial_v4(text,jsonb,boolean) to service_role;

commit;
