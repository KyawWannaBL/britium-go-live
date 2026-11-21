-- HOSTED UAT ONLY: Original Waybill readiness and Data Entry registration status (read-only).
-- Requires protected, empty waybill ledger and synthetic parcel fixture; no write functions enabled.
BEGIN;
SET LOCAL statement_timeout='35s';
DO $guard$ BEGIN
IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT count(*) FROM public.be_user_account_registry)<>18 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16 THEN RAISE EXCEPTION 'Wrong UAT target'; END IF;
IF (SELECT count(*) FROM public.be_waybill_ledger)<>0 OR (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW' THEN RAISE EXCEPTION 'Unsafe Waybill state'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_data_entry_financial_v2_ready_sequences_v137') THEN RAISE EXCEPTION 'Existing be_data_entry_financial_v2_ready_sequences_v137'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_data_entry_registration_state_v1') THEN RAISE EXCEPTION 'Existing be_data_entry_registration_state_v1'; END IF;
END $guard$;
CREATE FUNCTION public.be_data_entry_financial_v2_ready_sequences_v137(p_pickup_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  PERFORM public.be_data_entry_manager_assert_pickup_v1(v_pickup_id,'read');

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
      'message', 'Canonical UAT pickup was not found.',
      'access', v_access
    );
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where upper(coalesce(d.financial_validation_status,'')) <> 'OK'
    )::integer,
    count(*) filter (
      where not exists (
        select 1 from public.parcels authoritative
        where upper(btrim(coalesce(authoritative.way_id,'')))=upper(btrim(coalesce(d.delivery_way_id,'')))
          and authoritative.parcel_sequence=d.parcel_sequence
          and upper(coalesce(authoritative.validation_status,''))='OK'
      )
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
    and d.saved_at is not null
    and upper(coalesce(d.financial_validation_status,''))='OK'
    and nullif(btrim(d.recipient_name),'') is not null
    and nullif(btrim(d.contact_no_1),'') is not null
    and nullif(btrim(d.recipient_address),'') is not null
    and nullif(btrim(d.township),'') is not null
    and lower(btrim(d.township)) <> 'unknown'
    and exists (
      select 1 from public.parcels canonical
      where upper(btrim(coalesce(canonical.way_id,'')))=upper(btrim(coalesce(d.delivery_way_id,'')))
        and canonical.parcel_sequence=d.parcel_sequence
        and upper(coalesce(canonical.validation_status,''))='OK'
    )
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
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_financial_v2_ready_sequences_v137(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.be_data_entry_financial_v2_ready_sequences_v137(text) TO authenticated;
CREATE FUNCTION public.be_data_entry_registration_state_v1(p_pickup_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rows jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 perform public.be_data_entry_require_access_v57('view',false);
 perform public.be_data_entry_manager_assert_pickup_v1(p_pickup_id,'read');
 select coalesce(jsonb_agg(jsonb_build_object('parcel_sequence',d.parcel_sequence,'updated_at',d.updated_at,
 'published',coalesce(d.is_printed,false) or d.printed_at is not null or upper(coalesce(d.print_status,'')) in ('PRINTED','PUBLISHED','CREATED')
 or exists(select 1 from public.parcels p where p.way_id=d.delivery_way_id and p.financial_locked_at is not null)
 or exists(select 1 from public.be_waybill_ledger w where w.delivery_way_id=d.delivery_way_id))),'[]'::jsonb) into v_rows
 from public.be_data_entry_parcel_details d where d.pickup_id=p_pickup_id;
 return jsonb_build_object('ok',true,'rows',v_rows);
end $function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_registration_state_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.be_data_entry_registration_state_v1(text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
