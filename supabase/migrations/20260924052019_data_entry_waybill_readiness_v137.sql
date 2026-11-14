create or replace function public.be_data_entry_financial_v2_ready_sequences_v137(p_pickup_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_pickup_id text := nullif(btrim(coalesce(p_pickup_id,'')), '');
  v_access jsonb;
  v_sequences integer[] := '{}'::integer[];
  v_total integer := 0;
  v_non_ok_financial integer := 0;
  v_noncanonical integer := 0;
  v_missing_ok_parcels integer := 0;
  v_missing_required_fields integer := 0;
begin
  v_access := public.be_data_entry_require_access_v57('update', true);

  if v_pickup_id is null then
    raise exception 'pickup_id is required' using errcode='22023';
  end if;

  if not exists (
    select 1
    from public.be_portal_pickup_requests p
    where p.pickup_id = v_pickup_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'pickup_id', v_pickup_id,
      'ready_sequences', '[]'::jsonb,
      'ready_count', 0,
      'code', 'PICKUP_NOT_FOUND',
      'message', 'Canonical production pickup was not found.',
      'access', v_access
    );
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where upper(coalesce(d.financial_validation_status,'')) <> 'OK'
    )::integer,
    count(*) filter (
      where upper(btrim(coalesce(d.delivery_way_id,''))) <>
            upper(btrim(coalesce(public.be_resolve_delivery_way_id(
              v_pickup_id || '-' || lpad(d.parcel_sequence::text,3,'0')
            ),'')))
    )::integer,
    count(*) filter (
      where not exists (
        select 1
        from public.parcels p
        where upper(btrim(coalesce(p.way_id,''))) = upper(btrim(coalesce(d.delivery_way_id,'')))
          and upper(coalesce(p.validation_status,'')) = 'OK'
      )
    )::integer,
    count(*) filter (
      where nullif(btrim(d.recipient_name),'') is null
         or nullif(btrim(d.contact_no_1),'') is null
         or nullif(btrim(d.recipient_address),'') is null
         or nullif(btrim(d.township),'') is null
         or lower(btrim(d.township)) = 'unknown'
    )::integer
  into
    v_total,
    v_non_ok_financial,
    v_noncanonical,
    v_missing_ok_parcels,
    v_missing_required_fields
  from public.be_data_entry_parcel_details d
  where d.pickup_id = v_pickup_id;

  select coalesce(array_agg(d.parcel_sequence order by d.parcel_sequence), '{}'::integer[])
  into v_sequences
  from public.be_data_entry_parcel_details d
  where d.pickup_id = v_pickup_id
    and nullif(btrim(d.recipient_name),'') is not null
    and nullif(btrim(d.contact_no_1),'') is not null
    and nullif(btrim(d.recipient_address),'') is not null
    and nullif(btrim(d.township),'') is not null
    and lower(btrim(d.township)) <> 'unknown'
    and upper(btrim(coalesce(d.delivery_way_id,''))) =
        upper(btrim(coalesce(public.be_resolve_delivery_way_id(
          v_pickup_id || '-' || lpad(d.parcel_sequence::text,3,'0')
        ),'')))
    and exists (
      select 1
      from public.parcels p
      where upper(btrim(coalesce(p.way_id,''))) = upper(btrim(d.delivery_way_id))
        and upper(coalesce(p.validation_status,'')) = 'OK'
    );

  return jsonb_build_object(
    'ok', true,
    'pickup_id', v_pickup_id,
    'ready_sequences', to_jsonb(v_sequences),
    'ready_count', cardinality(v_sequences),
    'total_detail_rows', v_total,
    'diagnostics', jsonb_build_object(
      'non_ok_financial_rows', v_non_ok_financial,
      'noncanonical_way_ids', v_noncanonical,
      'missing_ok_parcels', v_missing_ok_parcels,
      'missing_required_fields', v_missing_required_fields
    ),
    'message', case
      when cardinality(v_sequences) > 0 then 'Backend-authoritative waybill-ready parcel sequences resolved.'
      else 'No canonical parcel rows currently satisfy the backend waybill readiness gate.'
    end,
    'access', v_access
  );
end
$function$;

revoke execute on function public.be_data_entry_financial_v2_ready_sequences_v137(text) from public, anon;
grant execute on function public.be_data_entry_financial_v2_ready_sequences_v137(text) to authenticated;

comment on function public.be_data_entry_financial_v2_ready_sequences_v137(text) is
'V137 backend-authoritative waybill readiness snapshot. Uses the same authenticated Data Entry access gate as waybill creation and evaluates canonical detail/parcel rows under SECURITY DEFINER so RLS cannot silently hide valid cross-territory pickup rows from the Data Entry client.';
