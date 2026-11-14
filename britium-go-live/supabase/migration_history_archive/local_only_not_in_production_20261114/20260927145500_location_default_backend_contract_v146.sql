-- V146: close the Data Entry location fallback/backend contract gap.
-- V136 already treats postal/ward and township defaults as route-ready.
-- This migration makes the location write RPC accept those same defaults and
-- validates review actions against the canonical Delivery Way registry (D...),
-- rather than the obsolete PickupID-001 convention.

do $migration$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_delivery_location_upsert_v11'
  limit 1;

  if v_def is null then
    raise exception 'be_delivery_location_upsert_v11 not found';
  end if;

  if position('v_trusted_default boolean' in v_def)=0 then
    v_old := '  v_trusted_google_exact boolean :=
    v_match in (''ADDRESS_EXACT'',''POI_EXACT'')
    and v_confidence >= 0.95
    and v_address <> ''''
    and v_township <> ''''
    and v_source ~ ''^GOOGLE_(PLACES|GEOCODING)_TOWNSHIP(_EXACT)?_VALIDATED_(ADDRESS_EXACT|POI_EXACT)$''
    and v_source like ''%'' || v_match;
  v_row public.be_delivery_location_registry;';

    v_new := '  v_trusted_google_exact boolean :=
    v_match in (''ADDRESS_EXACT'',''POI_EXACT'')
    and v_confidence >= 0.95
    and v_address <> ''''
    and v_township <> ''''
    and v_source ~ ''^GOOGLE_(PLACES|GEOCODING)_TOWNSHIP(_EXACT)?_VALIDATED_(ADDRESS_EXACT|POI_EXACT)$''
    and v_source like ''%'' || v_match;
  v_trusted_default boolean :=
    (v_match = ''POSTAL_DEFAULT'' and v_source = ''POSTAL_WARD_DEFAULT_V136'' and v_postal_match = ''EXACT_QUARTER'')
    or (v_match = ''TOWNSHIP_DEFAULT'' and v_source = ''TOWNSHIP_DEFAULT_V136'');
  v_row public.be_delivery_location_registry;';

    if position(v_old in v_def)=0 then
      raise exception 'upsert v11 declaration contract changed; migration stopped safely';
    end if;
    v_def := replace(v_def,v_old,v_new);
  end if;

  if position('''POSTAL_DEFAULT'',''TOWNSHIP_DEFAULT''' in v_def)=0 then
    v_old := '  if v_match not in (''ADDRESS_EXACT'',''POI_EXACT'',''STREET_APPROXIMATE'',''WARD_APPROXIMATE'',''MANUAL'') then
    raise exception ''Unsupported location precision: %'', v_match;
  end if;';
    v_new := '  if v_match not in (''ADDRESS_EXACT'',''POI_EXACT'',''STREET_APPROXIMATE'',''WARD_APPROXIMATE'',''POSTAL_DEFAULT'',''TOWNSHIP_DEFAULT'',''MANUAL'') then
    raise exception ''Unsupported location precision: %'', v_match;
  end if;';
    if position(v_old in v_def)=0 then
      raise exception 'upsert v11 precision contract changed; migration stopped safely';
    end if;
    v_def := replace(v_def,v_old,v_new);
  end if;

  if position('and not v_trusted_default then' in v_def)=0 then
    v_old := '  if v_review = ''ACCEPTED''
     and v_match <> ''MANUAL''
     and v_source not like ''%POSTAL_VALIDATED%''
     and not v_trusted_google_exact then
    raise exception ''Automatic coordinates must pass postal validation or the exact Google township validation contract before acceptance.'';
  end if;';
    v_new := '  if v_review = ''ACCEPTED''
     and v_match <> ''MANUAL''
     and v_source not like ''%POSTAL_VALIDATED%''
     and not v_trusted_google_exact
     and not v_trusted_default then
    raise exception ''Automatic coordinates must pass postal validation, the exact Google township validation contract, or the approved V136 postal/township fallback contract before acceptance.'';
  end if;';
    if position(v_old in v_def)=0 then
      raise exception 'upsert v11 acceptance contract changed; migration stopped safely';
    end if;
    v_def := replace(v_def,v_old,v_new);
  end if;

  execute v_def;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_delivery_location_review_batch_v29'
  limit 1;

  if v_def is null then
    raise exception 'be_delivery_location_review_batch_v29 not found';
  end if;

  if position('be_delivery_way_id_registry' in v_def)=0 then
    v_old := '    if v_delivery_way_id is null or v_pickup_id is null or v_delivery_way_id<>(v_pickup_id||''-''||lpad(v_sequence::text,3,''0'')) then raise exception ''Row % does not match its canonical pickup and Delivery Way ID.'',v_index+1; end if;';

    v_new := '    if v_delivery_way_id is null or v_pickup_id is null then
      raise exception ''Row % requires both pickup_id and Delivery Way ID.'',v_index+1;
    end if;
    if exists (
      select 1 from public.be_delivery_way_id_registry r
      where r.delivery_way_id=v_delivery_way_id
    ) then
      if not exists (
        select 1 from public.be_delivery_way_id_registry r
        where r.delivery_way_id=v_delivery_way_id
          and r.pickup_id=v_pickup_id
          and r.parcel_sequence=v_sequence
      ) then
        raise exception ''Row % does not match the canonical Delivery Way registry mapping.'',v_index+1;
      end if;
    elsif not exists (
      select 1 from public.be_data_entry_parcel_details d
      where d.delivery_way_id=v_delivery_way_id
        and d.pickup_id=v_pickup_id
        and d.parcel_sequence=v_sequence
    ) and v_delivery_way_id<>(v_pickup_id||''-''||lpad(v_sequence::text,3,''0'')) then
      raise exception ''Row % does not match its pickup and Delivery Way mapping.'',v_index+1;
    end if;';

    if position(v_old in v_def)=0 then
      raise exception 'review batch v29 Delivery Way contract changed; migration stopped safely';
    end if;
    execute replace(v_def,v_old,v_new);
  end if;
end
$migration$;

comment on function public.be_delivery_location_upsert_v11(jsonb)
is 'V146: accepts exact provider coordinates plus the approved V136 postal/ward and township fallback coordinates without forcing manual review.';

comment on function public.be_delivery_location_review_batch_v29(jsonb)
is 'V146: review actions validate canonical D-series Delivery Way IDs through be_delivery_way_id_registry, with compatibility fallback for legacy rows.';
