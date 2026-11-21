-- HOSTED UAT ONLY: printable parcel storage + private Waybill publication helpers, execution locked.
-- Production be_v32_parcels epoch guard triggers intentionally NOT restored; ledger integration pending.
-- Do not enable user-facing publication or settlement on the basis of these schema structures alone.
BEGIN;
SET LOCAL statement_timeout='55s';
DO $gate$ BEGIN
IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16 THEN RAISE EXCEPTION 'Wrong UAT project'; END IF;
IF (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW' OR (SELECT count(*) FROM public.parcels)<>0 OR (SELECT count(*) FROM public.be_waybill_ledger)<>0 THEN RAISE EXCEPTION 'Unsafe Waybill baseline'; END IF;
IF to_regclass('public.be_v32_parcels') IS NOT NULL THEN RAISE EXCEPTION 'Printable parcels already restored'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname='be_reason_only_photo_skip_valid_v1') THEN RAISE EXCEPTION 'Private Waybill helper exists: be_reason_only_photo_skip_valid_v1'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname='be_waybill_sync_allowed_v12_2') THEN RAISE EXCEPTION 'Private Waybill helper exists: be_waybill_sync_allowed_v12_2'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname='be_data_entry_create_ready_waybill_rows_v1') THEN RAISE EXCEPTION 'Private Waybill helper exists: be_data_entry_create_ready_waybill_rows_v1'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname='be_data_entry_waybill_sync_ready_v1') THEN RAISE EXCEPTION 'Private Waybill helper exists: be_data_entry_waybill_sync_ready_v1'; END IF;
END $gate$;
CREATE TABLE public.be_v32_parcels (
 waybill_no text NOT NULL,
 pickup_id text,
 merchant_code text,
 merchant_name text,
 customer_name text,
 customer_phone text,
 recipient_name text,
 recipient_phone text,
 recipient_phone_2 text,
 township text,
 recipient_address text,
 customer_tier text DEFAULT 'STANDARD'::text NOT NULL,
 payment_type text DEFAULT 'COD'::text NOT NULL,
 item_price numeric DEFAULT 0 NOT NULL,
 weight_kg numeric DEFAULT 1 NOT NULL,
 surcharge numeric DEFAULT 0 NOT NULL,
 delivery_fee numeric DEFAULT 0 NOT NULL,
 cod_amount numeric DEFAULT 0 NOT NULL,
 actual_collect numeric DEFAULT 0 NOT NULL,
 branch_code text DEFAULT 'YGN'::text NOT NULL,
 route_zone text,
 status text DEFAULT 'REGISTERED'::text NOT NULL,
 wayplan_id text,
 wayplan_sequence integer,
 assigned_supervisor text,
 assigned_rider text,
 assigned_driver text,
 assigned_helper text,
 warehouse_status text,
 delivery_status text,
 finance_status text,
 proof_photo_url text,
 signature_data text,
 failure_reason text,
 last_lat numeric,
 last_lng numeric,
 last_event_at timestamp with time zone,
 created_by text,
 updated_by text,
 created_at timestamp with time zone DEFAULT now() NOT NULL,
 updated_at timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT be_v32_parcels_pkey PRIMARY KEY (waybill_no)
);
ALTER TABLE public.be_v32_parcels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.be_v32_parcels FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.be_reason_only_photo_skip_valid_v1(p_pickup_id text, p_sequence integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select exists(
 select 1 from public.be_pickup_parcel_verifications v
 join public.be_data_entry_parcel_details d using(pickup_id,parcel_sequence)
 where v.pickup_id=p_pickup_id and v.parcel_sequence=p_sequence and d.saved_at is not null
 and v.proof_check_status='APPROVED'
 and (v.raw_payload->>'photo_skipped'='true' or v.raw_payload->>'temporary_photo_waiver'='true')
 and nullif(btrim(coalesce(v.raw_payload->>'photo_skip_reason',v.raw_payload->>'temporary_photo_waiver_reason')),'') is not null
 and exists(select 1 from public.be_audit_events a
  where a.action in('DATA_ENTRY_PHOTO_SKIPPED_BY_REASON','DATA_ENTRY_TEMPORARY_PHOTO_WAIVER')
  and a.details->>'pickup_id'=p_pickup_id and a.details->>'parcel_sequence'=p_sequence::text
  and (a.actor_id::text=v.raw_payload->>'photo_skipped_by_user_id'
   or (v.raw_payload->>'photo_skipped_by_user_id' is null and lower(a.actor_email)=lower(v.raw_payload->>'temporary_photo_waiver_by')))
  and a.details->>'reason'=coalesce(v.raw_payload->>'photo_skip_reason',v.raw_payload->>'temporary_photo_waiver_reason')
 )
);
$function$
;
REVOKE ALL ON FUNCTION private.be_reason_only_photo_skip_valid_v1(text,integer) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.be_data_entry_create_ready_waybill_rows_v1(p_pickup_id text, p_rows jsonb, p_actor_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pickup public.be_portal_pickup_requests%rowtype;
  v_actor_email text;
  v_waybill_no text;
  v_parcel_count integer;
  v_expected_count integer;
  v_row jsonb;
  v_sequence integer;
  v_total_cod numeric := 0;
  v_total_weight numeric := 0;
  v_os_evidence boolean := false;
  v_superadmin_bulkload boolean := false; v_photo_exception boolean := false;
begin
  select u.email
  into v_actor_email
  from auth.users u
  where u.id = auth.uid();

  if v_actor_email is null then
    raise exception 'Authenticated Data Entry identity is required.';
  end if;

  if nullif(btrim(p_actor_email), '') is not null
     and lower(btrim(p_actor_email)) <> lower(v_actor_email) then
    raise exception 'Data Entry actor email does not match the authenticated user.';
  end if;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'At least one completed parcel row is required.';
  end if;

  select *
  into v_pickup
  from public.be_portal_pickup_requests p
  where p.pickup_id = nullif(btrim(p_pickup_id), '')
  for update;

  if not found then
    raise exception 'Pickup ID not found: %', p_pickup_id;
  end if;

  v_superadmin_bulkload := public.be_superadmin_bulkload_waybill_bypass_v34(v_pickup.pickup_id);

  if not v_superadmin_bulkload and v_pickup.assigned_rider_id::text = auth.uid()::text then
    raise exception
      'Segregation of duties: the Rider who submitted proof cannot approve it.';
  end if;

  v_os_evidence := private.be_ready_waybill_os_evidence_v1(v_pickup.pickup_id,
    array(select (r.item->>'parcel_sequence')::integer from jsonb_array_elements(p_rows) r(item)));
  if v_os_evidence then perform public.be_data_entry_require_access_v57('upload',false); end if;
  v_photo_exception := exists(select 1 from jsonb_array_elements(p_rows) r(item)
    where private.be_reason_only_photo_skip_valid_v1(v_pickup.pickup_id,(r.item->>'parcel_sequence')::integer))
   and not exists(select 1 from jsonb_array_elements(p_rows) r(item)
    where not exists(select 1 from public.be_pickup_parcel_verifications v
      where v.pickup_id=v_pickup.pickup_id and v.parcel_sequence=(r.item->>'parcel_sequence')::integer
      and v.proof_check_status='APPROVED'
      and (private.be_reason_only_photo_skip_valid_v1(v.pickup_id,v.parcel_sequence)
       or nullif(btrim(coalesce(v.proof_photo_url,v.proof_photo_path,v.proof_photo_data)), '') is not null)));
  

  if not v_os_evidence and not v_superadmin_bulkload and (
       v_pickup.pickup_verified_at is null
       or v_pickup.pickup_collected_at is null
       or not (
         upper(coalesce(v_pickup.pickup_status, '')) in (
           'PICKUP_COLLECTED',
           'DELIVERED_TO_WAREHOUSE'
         )
         or upper(coalesce(v_pickup.workflow_stage, '')) in (
           'PICKUP_COLLECTED',
           'TO_WAREHOUSE',
           'DELIVERED_TO_WAREHOUSE'
         )
         or upper(coalesce(v_pickup.rider_app_stage, '')) in (
           'COLLECTED_PICKUP',
           'WAREHOUSE_HANDOFF'
         )
       )
     ) then
    raise exception
      'Pickup % must be field-team verified and COLLECTED before Data Entry.',
      v_pickup.pickup_id;
  end if;

  if not v_os_evidence and not v_superadmin_bulkload and not v_photo_exception and nullif(v_pickup.pickup_proof_url, '') is null
     and not exists (
       select 1
       from jsonb_array_elements(p_rows) r(item)
       where nullif(btrim(r.item ->> 'proof_photo_path'), '') is not null
     ) then
    raise exception
      'Pickup % has no Rider proof photo to review.',
      v_pickup.pickup_id;
  end if;

  v_expected_count := greatest(
    coalesce(v_pickup.verified_parcels,0),
    coalesce(nullif(to_jsonb(v_pickup) ->> 'expected_parcels', '')::integer,0),
    coalesce(nullif(to_jsonb(v_pickup) ->> 'expected_parcel_count', '')::integer,0),
    coalesce(nullif(to_jsonb(v_pickup) ->> 'parcel_count', '')::integer,0),
    1
  );
  v_parcel_count := jsonb_array_length(p_rows);

  if v_parcel_count > v_expected_count then
    raise exception
      'Parcel count mismatch for %. Rider verified %, Data Entry supplied %.',
      v_pickup.pickup_id,
      v_expected_count,
      v_parcel_count;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) r(item)
    where coalesce((r.item ->> 'parcel_sequence')::integer, 0) <= 0
       or (r.item ->> 'parcel_sequence')::integer > v_expected_count
       or nullif(btrim(r.item ->> 'recipient_name'), '') is null
       or nullif(btrim(r.item ->> 'contact_no_1'), '') is null
       or nullif(btrim(r.item ->> 'township'), '') is null
       or nullif(btrim(r.item ->> 'recipient_address'), '') is null
  ) then
    raise exception
      'Every parcel requires sequence, recipient name, phone, township, and address.';
  end if;

  if (
    select count(distinct (r.item ->> 'parcel_sequence')::integer)
    from jsonb_array_elements(p_rows) r(item)
  ) <> v_parcel_count then
    raise exception 'Parcel sequence numbers must be unique.';
  end if;

  for v_row in
    select r.item
    from jsonb_array_elements(p_rows) r(item)
    order by (r.item ->> 'parcel_sequence')::integer
  loop
    v_sequence := (v_row ->> 'parcel_sequence')::integer;
    v_total_cod := v_total_cod + coalesce(
      nullif(v_row ->> 'cod_amount', '')::numeric,
      0
    );
    v_total_weight := v_total_weight + coalesce(
      nullif(v_row ->> 'weight_kg', '')::numeric,
      0
    );

    update public.be_data_entry_parcel_details
    set
      delivery_way_id = coalesce(
        nullif(btrim(v_row ->> 'delivery_way_id'), ''),
        v_pickup.pickup_id || '-' || lpad(v_sequence::text, 3, '0')
      ),
      recipient_name = nullif(btrim(v_row ->> 'recipient_name'), ''),
      contact_no_1 = nullif(btrim(v_row ->> 'contact_no_1'), ''),
      contact_no_2 = nullif(btrim(v_row ->> 'contact_no_2'), ''),
      township = nullif(btrim(v_row ->> 'township'), ''),
      recipient_address = nullif(btrim(v_row ->> 'recipient_address'), ''),
      customer_tier = coalesce(
        nullif(btrim(v_row ->> 'customer_tier'), ''),
        'Standard'
      ),
      item_price = coalesce(nullif(v_row ->> 'item_price', '')::numeric, 0),
      weight_kg = coalesce(nullif(v_row ->> 'weight_kg', '')::numeric, 0),
      surcharge = coalesce(nullif(v_row ->> 'surcharge', '')::numeric, 0),
      delivery_fee = coalesce(nullif(v_row ->> 'delivery_fee', '')::numeric, 0),
      cod_amount = coalesce(nullif(v_row ->> 'cod_amount', '')::numeric, 0),
      actual_collect = coalesce(
        nullif(v_row ->> 'actual_collect', '')::numeric,
        0
      ),
      destination = nullif(btrim(v_row ->> 'destination'), ''),
      pickup_by = coalesce(
        nullif(btrim(v_row ->> 'pickup_by'), ''),
        'DATA_ENTRY'
      ),
      remark = nullif(btrim(v_row ->> 'remark'), ''),
      saved_by_email = v_actor_email,
      saved_at = coalesce(saved_at, now()),
      updated_at = now()
    where pickup_id = v_pickup.pickup_id
      and parcel_sequence = v_sequence;

    if not found then
      insert into public.be_data_entry_parcel_details (
        pickup_id,
        parcel_sequence,
        delivery_way_id,
        recipient_name,
        contact_no_1,
        contact_no_2,
        township,
        recipient_address,
        customer_tier,
        item_price,
        weight_kg,
        surcharge,
        delivery_fee,
        cod_amount,
        actual_collect,
        destination,
        pickup_by,
        remark,
        saved_by_email,
        saved_at,
        updated_at
      )
      values (
        v_pickup.pickup_id,
        v_sequence,
        coalesce(
          nullif(btrim(v_row ->> 'delivery_way_id'), ''),
          v_pickup.pickup_id || '-' || lpad(v_sequence::text, 3, '0')
        ),
        nullif(btrim(v_row ->> 'recipient_name'), ''),
        nullif(btrim(v_row ->> 'contact_no_1'), ''),
        nullif(btrim(v_row ->> 'contact_no_2'), ''),
        nullif(btrim(v_row ->> 'township'), ''),
        nullif(btrim(v_row ->> 'recipient_address'), ''),
        coalesce(
          nullif(btrim(v_row ->> 'customer_tier'), ''),
          'Standard'
        ),
        coalesce(nullif(v_row ->> 'item_price', '')::numeric, 0),
        coalesce(nullif(v_row ->> 'weight_kg', '')::numeric, 0),
        coalesce(nullif(v_row ->> 'surcharge', '')::numeric, 0),
        coalesce(nullif(v_row ->> 'delivery_fee', '')::numeric, 0),
        coalesce(nullif(v_row ->> 'cod_amount', '')::numeric, 0),
        coalesce(nullif(v_row ->> 'actual_collect', '')::numeric, 0),
        nullif(btrim(v_row ->> 'destination'), ''),
        coalesce(
          nullif(btrim(v_row ->> 'pickup_by'), ''),
          'DATA_ENTRY'
        ),
        nullif(btrim(v_row ->> 'remark'), ''),
        v_actor_email,
        now(),
        now()
      );
    end if;

    update public.be_pickup_parcel_verifications
    set
      delivery_way_id = coalesce(
        nullif(btrim(v_row ->> 'delivery_way_id'), ''),
        v_pickup.pickup_id || '-' || lpad(v_sequence::text, 3, '0')
      ),
      verification_status = case when private.be_reason_only_photo_skip_valid_v1(v_pickup.pickup_id,v_sequence) then verification_status else 'DATA_ENTRY_APPROVED' end,
      proof_check_status = 'APPROVED',
      reviewed_by = case when private.be_reason_only_photo_skip_valid_v1(v_pickup.pickup_id,v_sequence) then reviewed_by else auth.uid()::text end,
      reviewed_by_email = case when private.be_reason_only_photo_skip_valid_v1(v_pickup.pickup_id,v_sequence) then reviewed_by_email else v_actor_email end,
      reviewed_at = case when private.be_reason_only_photo_skip_valid_v1(v_pickup.pickup_id,v_sequence) then reviewed_at else now() end,
      review_note = case when private.be_reason_only_photo_skip_valid_v1(v_pickup.pickup_id,v_sequence) then review_note else nullif(btrim(v_row ->> 'remark'), '') end,
      updated_at = now()
    where pickup_id = v_pickup.pickup_id
      and parcel_sequence = v_sequence and not v_os_evidence;
  end loop;

  v_waybill_no := coalesce(
    nullif(v_pickup.waybill_no, ''),
    'WB-' || v_pickup.pickup_id
  );

  update public.be_portal_pickup_requests
  set
    waybill_no = v_waybill_no,
    pickup_waybill_id = coalesce(
      nullif(pickup_waybill_id, ''),
      v_waybill_no
    ),
    registered_parcel_count = greatest(coalesce(registered_parcel_count,0),v_parcel_count),
    photo_review_status = case when v_photo_exception then 'PHOTO_SKIPPED' when v_parcel_count = v_expected_count and not v_os_evidence and not v_superadmin_bulkload then 'APPROVED' else photo_review_status end,
    data_entry_status = case when v_parcel_count = v_expected_count then 'WAYBILL_CREATED' else data_entry_status end,
    warehouse_status = case when v_parcel_count = v_expected_count then 'READY_FOR_INBOUND' else warehouse_status end,
    workflow_stage = case when v_parcel_count = v_expected_count then 'DATA_ENTRY_WAYBILL_CREATED' else workflow_stage end,
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'data_entry_review',
        jsonb_build_object(
          'status', case when v_parcel_count=v_expected_count then 'APPROVED' else 'PARTIAL' end,
          'pending_count', v_expected_count-v_parcel_count,
          'evidence_mode',case when v_photo_exception then 'REASON_ONLY_PHOTO_SKIP' when v_os_evidence then 'OS_SOFTCOPY' when v_superadmin_bulkload then 'SUPERADMIN_BULKLOAD_BYPASS' else 'RIDER_PROOF' end,
          'reviewer_id', auth.uid()::text,
          'reviewer_email', v_actor_email,
          'reviewed_at', now(),
          'parcel_count', v_parcel_count,
          'total_cod', v_total_cod,
          'total_weight_kg', v_total_weight,
          'waybill_no', v_waybill_no
        )
      ),
    last_event_at = now(),
    last_event_by = v_actor_email,
    last_event_note = case when v_photo_exception then 'Data Entry created waybill with an audited reason-only photo skip; no later photo required' when v_superadmin_bulkload then 'Super Admin authorized BLK bulkload Waybill creation without Rider verification' else 'Data Entry approved Rider proof and created waybill' end,
    updated_at = now()
  where pickup_id = v_pickup.pickup_id;

  insert into public.be_app_notifications (
    recipient_role,
    recipient_email,
    target_user_id,
    notification_type,
    title,
    message,
    entity_type,
    entity_id,
    pickup_id,
    priority,
    is_read,
    payload,
    created_at
  )
  select
    'warehouse',
    null,
    null,
    'WAYBILL_READY_FOR_WAREHOUSE',
    'Waybill ready for warehouse',
    'Waybill ' || v_waybill_no || ' is ready for inbound scan.',
    'pickup',
    v_pickup.pickup_id,
    v_pickup.pickup_id,
    'HIGH',
    false,
    jsonb_build_object(
      'pickup_id', v_pickup.pickup_id,
      'waybill_no', v_waybill_no,
      'parcel_count', v_parcel_count,
      'next_action', 'WAREHOUSE_INBOUND_SCAN'
    ),
    now()
  where not exists (
    select 1
    from public.be_app_notifications n
    where n.pickup_id = v_pickup.pickup_id
      and n.notification_type = 'WAYBILL_READY_FOR_WAREHOUSE'
      and lower(coalesce(n.recipient_role, '')) = 'warehouse'
  )
  on conflict do nothing;

  return jsonb_build_object(
    'ok', true,
    'pickup_id', v_pickup.pickup_id,
    'waybill_no', v_waybill_no,
    'parcel_count', v_parcel_count,
    'photo_review_status', case when v_photo_exception then 'PHOTO_SKIPPED' when v_os_evidence then 'OS_SOFTCOPY_AUTHORIZED' when v_superadmin_bulkload then 'SUPERADMIN_BULKLOAD_BYPASS' else 'APPROVED' end,
    'data_entry_status', 'WAYBILL_CREATED',
    'warehouse_status', 'READY_FOR_INBOUND',
    'canonical_pickup_preserved', true
  );
end
$function$
;
REVOKE ALL ON FUNCTION private.be_data_entry_create_ready_waybill_rows_v1(text,jsonb,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.be_data_entry_waybill_sync_ready_v1(p_pickup_id text, p_sequences integer[], p_merchant_code text DEFAULT NULL::text, p_merchant_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_pickup text := nullif(btrim(p_pickup_id), '');
  v_source_count integer := 0;
  v_printable_count integer := 0;
  v_missing_ids integer := 0;
begin
  if not private.be_waybill_sync_allowed_v12_2() then
    raise exception 'Data Entry waybill synchronization permission is required.' using errcode = '42501';
  end if;
  if v_pickup is null then
    raise exception 'Pickup ID is required.' using errcode = '22023';
  end if;

  select count(*), count(*) filter (where nullif(btrim(delivery_way_id), '') is null)
    into v_source_count, v_missing_ids
  from public.be_data_entry_parcel_details
  where pickup_id = v_pickup and parcel_sequence=any(p_sequences);

  if v_source_count = 0 then
    raise exception 'No registered parcel details exist for pickup %.', v_pickup using errcode = 'P0002';
  end if;
  if v_missing_ids > 0 then
    raise exception '% registered parcel(s) have no Delivery Way ID.', v_missing_ids using errcode = '23502';
  end if;

  insert into public.be_v32_parcels (
    waybill_no, pickup_id, merchant_code, merchant_name,
    recipient_name, recipient_phone, recipient_phone_2,
    township, recipient_address, customer_tier,
    item_price, weight_kg, surcharge, delivery_fee,
    cod_amount, actual_collect, branch_code, route_zone,
    status, created_by, updated_by, created_at, updated_at
  )
  select
    d.delivery_way_id, d.pickup_id,
    coalesce(nullif(btrim(p_merchant_code), ''), nullif(btrim(d.merchant_id), '')),
    nullif(btrim(p_merchant_name), ''),
    d.recipient_name, d.contact_no_1, d.contact_no_2,
    nullif(btrim(d.township), ''), d.recipient_address,
    upper(coalesce(nullif(btrim(d.customer_tier), ''), 'STANDARD')),
    coalesce(d.item_price, 0), greatest(coalesce(d.weight_kg, 0), 0),
    coalesce(d.surcharge, 0), coalesce(d.delivery_fee, 0),
    coalesce(d.cod_amount, d.actual_collect, 0), coalesce(d.actual_collect, d.cod_amount, 0),
    'YGN',
    nullif(btrim(d.township_key), ''),
    'REGISTERED', coalesce(nullif(btrim(d.saved_by_email), ''), auth.jwt()->>'email'),
    auth.jwt()->>'email', coalesce(d.created_at, now()), now()
  from public.be_data_entry_parcel_details d
  where d.pickup_id = v_pickup and d.parcel_sequence=any(p_sequences)
  on conflict (waybill_no) do update set
    pickup_id = excluded.pickup_id,
    merchant_code = coalesce(excluded.merchant_code, be_v32_parcels.merchant_code),
    merchant_name = coalesce(excluded.merchant_name, be_v32_parcels.merchant_name),
    recipient_name = excluded.recipient_name,
    recipient_phone = excluded.recipient_phone,
    recipient_phone_2 = excluded.recipient_phone_2,
    township = excluded.township,
    recipient_address = excluded.recipient_address,
    customer_tier = excluded.customer_tier,
    item_price = excluded.item_price,
    weight_kg = excluded.weight_kg,
    surcharge = excluded.surcharge,
    delivery_fee = excluded.delivery_fee,
    cod_amount = excluded.cod_amount,
    actual_collect = excluded.actual_collect,
    route_zone = excluded.route_zone,
    updated_by = excluded.updated_by,
    updated_at = now();

  select count(*) into v_printable_count
  from public.be_v32_parcels
  where pickup_id = v_pickup
    and waybill_no in (select delivery_way_id from public.be_data_entry_parcel_details where pickup_id=v_pickup and parcel_sequence=any(p_sequences))
    and nullif(btrim(waybill_no), '') is not null
    and nullif(btrim(township), '') is not null;

  if v_printable_count <> v_source_count then
    raise exception 'Waybill synchronization verification failed: % of % printable.', v_printable_count, v_source_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'pickup_id', v_pickup,
    'source_count', v_source_count,
    'printable_count', v_printable_count
  );
end;
$function$
;
REVOKE ALL ON FUNCTION private.be_data_entry_waybill_sync_ready_v1(text,integer[],text,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.be_waybill_sync_allowed_v12_2()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public','private','auth','pg_temp'
AS $function$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.be_user_account_registry u
  WHERE u.auth_user_id=auth.uid()
   AND coalesce(u.active,false) AND coalesce(u.is_active,false)
   AND lower(coalesce(u.status,''))='active'
   AND lower(replace(coalesce(u.role_code,''),'-','_'))='super_admin'
   AND EXISTS(
    SELECT 1 FROM public.be_employee_territory_assignments a
    WHERE a.user_id=auth.uid() AND a.active AND a.can_read AND a.scope_type='GLOBAL'
   )
 )
$function$;
REVOKE ALL ON FUNCTION private.be_waybill_sync_allowed_v12_2() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
