-- V64: low-latency continuous Dispatch scanning.
-- One RPC resolves the scanned code and records the dispatch scan.
-- Adds functional indexes used by source-waybill / alias scanner lookups.

create index if not exists be_data_entry_source_waybill_upper_v64_idx
  on public.be_data_entry_parcel_details
  (upper((financial_quote->>'source_waybill_no')))
  where nullif(financial_quote->>'source_waybill_no','') is not null;

create index if not exists be_delivery_way_alias_upper_v64_idx
  on public.be_delivery_way_id_aliases_v33(upper(alias_way_id));

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
  v_lookup text;
  v_actor text;
  v_role text;
  v_matches jsonb;
  v_count integer := 0;
  v_way text;
  v_waybill text;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_role := public.be_warehouse_assert_internal();
  v_actor := public.be_warehouse_actor_email();

  if v_raw !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' then
    return jsonb_build_object('ok',false,'error','INVALID_SCAN','message','Invalid waybill code');
  end if;

  select coalesce(
    (
      select a.canonical_way_id
      from public.be_delivery_way_id_aliases_v33 a
      where upper(a.alias_way_id)=upper(v_raw)
      limit 1
    ),
    upper(v_raw)
  ) into v_lookup;

  -- Prefer an exact canonical ID in the active Wayplan. This prevents a
  -- historical/source alias with the same display value from forcing a choice.
  with exact_active as (
    select
      d.delivery_way_id as canonical_id,
      d.pickup_id,
      coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id) as waybill_no
    from public.be_wayplan_membership_v40 m
    join public.be_data_entry_parcel_details d on d.delivery_way_id=m.delivery_way_id
    where m.membership_status in ('READY_FOR_DISPATCH','PLANNED','DISPATCHED')
      and upper(d.delivery_way_id)=upper(v_raw)
    order by m.updated_at desc nulls last
    limit 1
  )
  select count(*)::integer,
         coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb)
    into v_count,v_matches
  from exact_active e;

  if v_count=0 then
    -- Dispatch scanning should resolve against the currently active Wayplan
    -- before considering historical rows with the same printed Way ID.
    with active_candidates as (
    select distinct
      d.delivery_way_id as canonical_id,
      d.pickup_id,
      coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id) as waybill_no
    from public.be_wayplan_membership_v40 m
    join public.be_data_entry_parcel_details d on d.delivery_way_id=m.delivery_way_id
    where m.membership_status in ('READY_FOR_DISPATCH','PLANNED','DISPATCHED')
      and (
        upper(d.delivery_way_id)=upper(v_lookup)
        or upper(coalesce(d.financial_quote->>'source_waybill_no',''))=upper(v_raw)
      )
  )
  select count(*)::integer,
         coalesce(jsonb_agg(to_jsonb(c) order by c.pickup_id,c.canonical_id),'[]'::jsonb)
    into v_count,v_matches
  from active_candidates c;
  end if;

  if v_count=0 then
    with candidates as (
      select distinct
        d.delivery_way_id as canonical_id,
        d.pickup_id,
        coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id) as waybill_no
      from public.be_data_entry_parcel_details d
      where upper(d.delivery_way_id)=upper(v_lookup)
         or upper(coalesce(d.financial_quote->>'source_waybill_no',''))=upper(v_raw)
    )
    select count(*)::integer,
           coalesce(jsonb_agg(to_jsonb(c) order by c.pickup_id,c.canonical_id),'[]'::jsonb)
      into v_count,v_matches
    from candidates c;
  end if;

  if v_count=0 then
    return jsonb_build_object(
      'ok',false,'error','WAYBILL_NOT_FOUND','message','Waybill not found: '||v_raw,
      'scan',v_raw
    );
  end if;

  if v_count>1 then
    return jsonb_build_object(
      'ok',false,'error','AMBIGUOUS_SCAN',
      'message','This Way ID belongs to more than one pickup.',
      'matches',v_matches
    );
  end if;

  v_way := v_matches->0->>'canonical_id';
  v_waybill := v_matches->0->>'waybill_no';

  v_result := public.be_warehouse_dispatch_scan(
    v_way,
    v_actor,
    coalesce(nullif(p_warehouse_code,''),'YGN-MAIN')
  );

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
    'ok',true,
    'build','WAREHOUSE_DISPATCH_SCAN_FAST_V64',
    'canonical_id',v_way,
    'waybill_no',v_waybill,
    'display_id',v_waybill,
    'input_scan',v_raw,
    'actor_email',v_actor,
    'authorized_role',v_role
  );
end;
$function$;

grant execute on function public.be_warehouse_dispatch_scan_fast_v64(text,text) to authenticated;
