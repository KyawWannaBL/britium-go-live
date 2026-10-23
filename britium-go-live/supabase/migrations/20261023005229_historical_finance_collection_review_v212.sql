CREATE OR REPLACE FUNCTION public.be_finance_settle_wayplan_cod(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_wayplan_id text:=nullif(btrim(p_payload->>'wayplan_id'),'');
  v_delivery_way_id text:=nullif(upper(btrim(p_payload->>'delivery_way_id')),'');
  v_reference text:=coalesce(
    nullif(btrim(p_payload->>'settlement_reference'),''),
    'SET-'||to_char(now(),'YYYYMMDD-HH24MISS')
  );
  v_actor text:=coalesce(
    nullif(btrim(p_payload->>'actor'),''),
    lower(auth.jwt()->>'email'),
    'finance'
  );
  v_count integer:=0;
  v_v48_count integer:=0;
  v_hold_count integer:=0;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok',false,'error','AUTH_REQUIRED');
  end if;
  if coalesce(public.be_current_role(),'') not in ('finance','accountant','superadmin','super_admin') then
    return jsonb_build_object('ok',false,'error','FINANCE_REQUIRED');
  end if;
  v_actor := coalesce(nullif(lower(auth.jwt()->>'email'),''),'finance:'||auth.uid()::text);
  -- Historical expected amounts do not establish receipt of customer funds.
  if exists (
    select 1 from public.be_wayplan_cod_settlements w
    where (v_wayplan_id is null or w.wayplan_id=v_wayplan_id)
      and (v_delivery_way_id is null or upper(w.delivery_way_id)=v_delivery_way_id)
      and upper(coalesce(w.settlement_status,''))<>'SETTLED'
      and w.metadata->>'historical_source_review'='true'
      and w.cod_collected is null
  ) then
    return jsonb_build_object('ok',false,'error','COLLECTION_EVIDENCE_REQUIRED',
      'message','Finance must reconcile and record the actual collection before settlement.');
  end if;
  if v_wayplan_id is null and v_delivery_way_id is null then
    return jsonb_build_object('ok',false,'error','wayplan_id or delivery_way_id is required');
  end if;

  select count(*)::integer
  into v_hold_count
  from public.be_finance_cod_settlements_v48 f
  where upper(coalesce(f.settlement_status,''))='HOLD_EXCEPTION'
    and (v_wayplan_id is null or f.wayplan_id=v_wayplan_id)
    and (v_delivery_way_id is null or upper(f.delivery_way_id)=v_delivery_way_id);

  if v_hold_count>0 then
    return jsonb_build_object(
      'ok',false,
      'error','FIELD_EXCEPTION_HOLD',
      'message','One or more COD rows are on field-exception hold. Resolve the failed-way / RTO exception before settlement.',
      'hold_count',v_hold_count
    );
  end if;

  update public.be_wayplan_cod_settlements w
  set settlement_status='SETTLED',
      settlement_reference=v_reference,
      settled_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'settled_by',v_actor,
        'settled_at',now(),
        'settlement_reference',v_reference,
        'finance_sync','V93'
      ),
      updated_at=now()
  where (v_wayplan_id is null or w.wayplan_id=v_wayplan_id)
    and (v_delivery_way_id is null or upper(w.delivery_way_id)=v_delivery_way_id)
    and upper(coalesce(w.settlement_status,''))<>'SETTLED';

  get diagnostics v_count=row_count;

  update public.be_finance_cod_settlements_v48 f
  set settlement_status='SETTLED',
      settled_amount=coalesce(nullif(f.rider_remittance,0),nullif(f.reported_collected,0),f.expected_cod,0),
      settlement_reference=v_reference,
      settlement_receiver=coalesce(nullif(p_payload->>'settlement_receiver',''),'Finance'),
      settlement_note=coalesce(nullif(p_payload->>'settlement_note',''),'Settled from Finance COD Center'),
      settled_by=v_actor,
      settled_at=now(),
      hold_code=null,
      hold_note=null,
      held_by=null,
      held_at=null,
      metadata=coalesce(f.metadata,'{}'::jsonb)||jsonb_build_object(
        'settled_by',v_actor,
        'settled_at',now(),
        'settlement_reference',v_reference,
        'finance_sync','V93'
      ),
      updated_at=now()
  where (v_wayplan_id is null or f.wayplan_id=v_wayplan_id)
    and (v_delivery_way_id is null or upper(f.delivery_way_id)=v_delivery_way_id)
    and upper(coalesce(f.settlement_status,''))<>'SETTLED'
    and upper(coalesce(f.settlement_status,''))<>'HOLD_EXCEPTION';

  get diagnostics v_v48_count=row_count;

  return jsonb_build_object(
    'ok',true,
    'settled_count',v_count,
    'finance_v48_settled_count',v_v48_count,
    'settlement_reference',v_reference,
    'status','SETTLED',
    'sync_build','V93'
  );
end;
$function$

