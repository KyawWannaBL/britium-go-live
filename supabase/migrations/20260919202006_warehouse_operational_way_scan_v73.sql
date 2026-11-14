-- V73: Warehouse scanners operate on the visible Way ID / Waybill only.
-- Pickup IDs and hidden consolidated BLK delivery-way IDs are linkage fields, not scan keys.

create or replace function public.be_warehouse_resolve_scan_v3(p_scan text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_code text := btrim(coalesce(p_scan,''));
  v_way text;
  v_pickup text;
  v_waybill text;
  v_candidate_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  perform public.be_warehouse_assert_internal();

  if v_code !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' then
    return jsonb_build_object(
      'ok',false,'error','INVALID_SCAN',
      'message','Invalid Way ID / Waybill code.'
    );
  end if;

  -- Prefer the active Wayplan parcel for the visible operational Way ID.
  with candidates as (
    select
      d.delivery_way_id as canonical_id,
      d.pickup_id,
      coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id) as waybill_no,
      row_number() over (
        order by
          case when upper(d.delivery_way_id)=upper(v_code) then 0 else 1 end,
          m.updated_at desc nulls last,
          d.updated_at desc nulls last,
          d.created_at desc nulls last,
          d.delivery_way_id
      ) as rn,
      count(*) over()::integer as candidate_count
    from public.be_wayplan_membership_v40 m
    join public.be_wayplan_dispatches w
      on w.wayplan_id=m.wayplan_id
    join public.be_data_entry_parcel_details d
      on d.delivery_way_id=m.delivery_way_id
    where m.membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED')
      and upper(coalesce(w.wayplan_status,'')) not in ('COMPLETED','CANCELLED')
      and coalesce(d.parcel_status,'') <> 'duplicate_archived'
      and upper(coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id))=upper(v_code)
  )
  select canonical_id,pickup_id,waybill_no,candidate_count
    into v_way,v_pickup,v_waybill,v_candidate_count
  from candidates
  where rn=1;

  if v_way is null then
    -- Before/without an active Wayplan, resolve the visible operational Way ID
    -- to the current parcel and keep consolidated internal IDs hidden.
    with candidates as (
      select
        d.delivery_way_id as canonical_id,
        d.pickup_id,
        coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id) as waybill_no,
        row_number() over (
          order by
            case when upper(d.delivery_way_id)=upper(v_code) then 0 else 1 end,
            case when coalesce(d.parcel_status,'')='duplicate_archived' then 1 else 0 end,
            d.updated_at desc nulls last,
            d.created_at desc nulls last,
            d.delivery_way_id
        ) as rn,
        count(*) over()::integer as candidate_count
      from public.be_data_entry_parcel_details d
      where upper(coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id))=upper(v_code)
    )
    select canonical_id,pickup_id,waybill_no,candidate_count
      into v_way,v_pickup,v_waybill,v_candidate_count
    from candidates
    where rn=1;
  end if;

  if v_way is null then
    if exists (
      select 1
      from public.be_data_entry_parcel_details d
      where upper(coalesce(d.pickup_id,''))=upper(v_code)
    ) then
      return jsonb_build_object(
        'ok',false,
        'error','PICKUP_CODE_NOT_ALLOWED',
        'message','Scan the Way ID / Waybill shown in the first Warehouse Queue column, not the Pickup code.',
        'input_scan',v_code
      );
    end if;

    return jsonb_build_object(
      'ok',false,
      'error','WAYBILL_NOT_FOUND',
      'message','Way ID / Waybill not found: '||v_code,
      'input_scan',v_code
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'build','WAREHOUSE_RESOLVE_OPERATIONAL_WAY_V73',
    'input_scan',v_code,
    'display_id',v_waybill,
    'resolved_candidate_count',v_candidate_count,
    'matches',jsonb_build_array(jsonb_build_object(
      'canonical_id',v_way,
      'pickup_id',v_pickup,
      'waybill_no',v_waybill,
      'display_id',v_waybill
    ))
  );
end;
$function$;

grant execute on function public.be_warehouse_resolve_scan_v3(text) to authenticated;

create or replace function public.be_warehouse_dispatch_scan_fast_v64(
  p_scan text,
  p_warehouse_code text default 'YGN-MAIN'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_raw text := btrim(coalesce(p_scan,''));
  v_actor text;
  v_role text;
  v_way text;
  v_waybill text;
  v_pickup text;
  v_candidate_count integer := 0;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_role := public.be_warehouse_assert_internal();
  v_actor := public.be_warehouse_actor_email();

  if v_raw !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' then
    return jsonb_build_object(
      'ok',false,'error','INVALID_SCAN','message','Invalid Way ID / Waybill code.'
    );
  end if;

  -- Resolve only the visible operational Way ID / Waybill. Pickup IDs and
  -- consolidated internal P...-BLK... row IDs are deliberately not scan keys.
  with candidates as (
    select
      d.delivery_way_id as canonical_id,
      d.pickup_id,
      coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id) as waybill_no,
      row_number() over (
        order by
          case when upper(d.delivery_way_id)=upper(v_raw) then 0 else 1 end,
          m.updated_at desc nulls last,
          d.updated_at desc nulls last,
          d.created_at desc nulls last,
          d.delivery_way_id
      ) as rn,
      count(*) over()::integer as candidate_count
    from public.be_wayplan_membership_v40 m
    join public.be_data_entry_parcel_details d
      on d.delivery_way_id=m.delivery_way_id
    join public.be_wayplan_dispatches w
      on w.wayplan_id=m.wayplan_id
    where m.membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED')
      and upper(coalesce(w.wayplan_status,'')) not in ('COMPLETED','CANCELLED')
      and coalesce(d.parcel_status,'') <> 'duplicate_archived'
      and upper(coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id))=upper(v_raw)
  )
  select canonical_id,pickup_id,waybill_no,candidate_count
    into v_way,v_pickup,v_waybill,v_candidate_count
  from candidates
  where rn=1;

  if v_way is null then
    with candidates as (
      select
        d.delivery_way_id as canonical_id,
        d.pickup_id,
        coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id) as waybill_no,
        row_number() over (
          order by
            case when upper(d.delivery_way_id)=upper(v_raw) then 0 else 1 end,
            case when coalesce(d.parcel_status,'')='duplicate_archived' then 1 else 0 end,
            d.updated_at desc nulls last,
            d.created_at desc nulls last,
            d.delivery_way_id
        ) as rn,
        count(*) over()::integer as candidate_count
      from public.be_data_entry_parcel_details d
      where upper(coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id))=upper(v_raw)
    )
    select canonical_id,pickup_id,waybill_no,candidate_count
      into v_way,v_pickup,v_waybill,v_candidate_count
    from candidates
    where rn=1;
  end if;

  if v_way is null then
    if exists (
      select 1
      from public.be_data_entry_parcel_details d
      where upper(coalesce(d.pickup_id,''))=upper(v_raw)
    ) then
      return jsonb_build_object(
        'ok',false,
        'error','PICKUP_CODE_NOT_ALLOWED',
        'message','Scan the Way ID / Waybill shown in the first Warehouse Queue column, not the Pickup code.',
        'input_scan',v_raw
      );
    end if;

    return jsonb_build_object(
      'ok',false,'error','WAYBILL_NOT_FOUND',
      'message','Way ID / Waybill not found: '||v_raw,
      'input_scan',v_raw
    );
  end if;

  v_result := public.be_warehouse_dispatch_scan(
    v_way,
    v_actor,
    coalesce(nullif(p_warehouse_code,''),'YGN-MAIN')
  );

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
    'ok',true,
    'build','WAREHOUSE_DISPATCH_OPERATIONAL_WAY_V73',
    'canonical_id',v_way,
    'pickup_id',v_pickup,
    'waybill_no',v_waybill,
    'display_id',v_waybill,
    'input_scan',v_raw,
    'resolved_candidate_count',v_candidate_count,
    'duplicate_auto_resolved',v_candidate_count>1,
    'actor_email',v_actor,
    'authorized_role',v_role
  );
end;
$function$;

grant execute on function public.be_warehouse_dispatch_scan_fast_v64(text,text) to authenticated;
