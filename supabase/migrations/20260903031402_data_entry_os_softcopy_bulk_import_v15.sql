begin;

-- Data Entry V15 records OS spreadsheet lineage, permits an explicit and
-- audited softcopy-evidence path, and refuses imported rows until their exact
-- delivery address has an accepted location-registry entry.

alter table public.be_data_entry_parcel_details
  add column if not exists service_type text not null default 'STANDARD',
  add column if not exists source_file_name text,
  add column if not exists source_row_number integer,
  add column if not exists source_row_count integer,
  add column if not exists photo_evidence_mode text not null default 'PICKER_PHOTO',
  add column if not exists photo_bypass_reason text,
  add column if not exists os_imported_at timestamptz,
  add column if not exists os_imported_by uuid;

alter table public.be_data_entry_parcel_details
  drop constraint if exists be_data_entry_service_type_v15_ck,
  drop constraint if exists be_data_entry_source_row_v15_ck,
  drop constraint if exists be_data_entry_photo_evidence_v15_ck;

alter table public.be_data_entry_parcel_details
  add constraint be_data_entry_service_type_v15_ck check (
    service_type in ('STANDARD','EXPRESS','SAME_DAY','NEXT_DAY','ECONOMY')
  ),
  add constraint be_data_entry_source_row_v15_ck check (
    (source_row_number is null and source_row_count is null)
    or (
      source_row_number is not null and source_row_count is not null
      and source_row_number > 0 and source_row_count > 0
      and source_row_number <= source_row_count + 25
    )
  ),
  add constraint be_data_entry_photo_evidence_v15_ck check (
    photo_evidence_mode in ('PICKER_PHOTO','OS_SOFTCOPY')
    and (photo_evidence_mode <> 'OS_SOFTCOPY' or length(btrim(coalesce(photo_bypass_reason,''))) >= 10)
  );

create index if not exists be_data_entry_os_imported_at_v15_idx
  on public.be_data_entry_parcel_details(os_imported_at desc)
  where os_imported_at is not null;

create or replace function public.be_data_entry_financial_v2_save(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_access jsonb;
  v_upload_access jsonb;
  v_pickup_id text := nullif(btrim(coalesce(p_payload->>'pickup_id','')),'');
  v_sequence_text text := nullif(btrim(coalesce(p_payload->>'parcel_sequence','')),'');
  v_sequence integer;
  v_delivery_way_id text;
  v_service_type text := upper(coalesce(nullif(btrim(p_payload->>'service_type'),''),'STANDARD'));
  v_requested_count integer := 0;
  v_verified_count integer := 0;
  v_authorized_count integer := 0;
  v_result jsonb;
  v_is_addition boolean := false;
  v_os_import boolean := lower(coalesce(p_payload->>'os_softcopy_import','false')) in ('true','1','yes','on');
  v_photo_bypass boolean := lower(coalesce(p_payload->>'photo_bypass','false')) in ('true','1','yes','on');
  v_photo_mode text := upper(coalesce(nullif(btrim(p_payload->>'photo_evidence_mode'),''),'PICKER_PHOTO'));
  v_photo_reason text := nullif(btrim(coalesce(p_payload->>'photo_bypass_reason','')),'');
  v_source_file text := nullif(btrim(coalesce(p_payload->>'os_source_file_name',p_payload->>'source_file_name','')),'');
  v_source_row_text text := nullif(btrim(coalesce(p_payload->>'source_row_number','')),'');
  v_source_count_text text := nullif(btrim(coalesce(p_payload->>'source_row_count','')),'');
  v_source_row integer;
  v_source_count integer;
  v_actor_id uuid;
  v_actor_email text;
  v_actor_role text;
  v_payload_address text := btrim(coalesce(p_payload->>'delivery_address',''));
  v_payload_address_key text;
  v_location_address text;
  v_location_address_key text;
begin
  v_access := public.be_data_entry_require_access_v57('create',false);
  if nullif(v_access->>'actor_user_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_actor_id := (v_access->>'actor_user_id')::uuid;
  end if;
  v_actor_email := nullif(lower(btrim(v_access->>'actor_email')),'');
  v_actor_role := nullif(btrim(v_access->>'actor_role'),'');

  if v_pickup_id is null then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_OS_SOFTCOPY_BULK_IMPORT_V15_20260902',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','PICKUP_REQUIRED','field','pickup_id','message','pickup_id is required.'
      )),'access',v_access
    );
  end if;
  if v_sequence_text is null or v_sequence_text !~ '^[1-9][0-9]*$' then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_OS_SOFTCOPY_BULK_IMPORT_V15_20260902',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','PARCEL_SEQUENCE_REQUIRED','field','parcel_sequence','message','parcel_sequence must be a positive integer.'
      )),'access',v_access
    );
  end if;
  v_sequence := v_sequence_text::integer;
  v_delivery_way_id := v_pickup_id||'-'||lpad(v_sequence::text,3,'0');

  if v_service_type not in ('STANDARD','EXPRESS','SAME_DAY','NEXT_DAY','ECONOMY') then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_OS_SOFTCOPY_BULK_IMPORT_V15_20260902',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','INVALID_SERVICE_TYPE','field','service_type','message','Choose Standard, Express, Same Day, Next Day, or Economy.'
      )),'access',v_access
    );
  end if;

  if v_os_import then
    v_upload_access := public.be_data_entry_require_access_v57('upload',false);
    if v_source_file is null or v_source_file !~* '^[^/\\]{1,180}\.(csv|xlsx|xls)$' then
      return jsonb_build_object(
        'ok',false,'operation','SAVE','build','DATA_ENTRY_OS_SOFTCOPY_BULK_IMPORT_V15_20260902',
        'errors',jsonb_build_array(jsonb_build_object(
          'code','OS_SOURCE_FILE_REQUIRED','field','os_source_file_name','message','A safe CSV/XLS/XLSX source filename is required for OS imports.'
        )),'access',v_access,'upload_access',v_upload_access
      );
    end if;
    if v_source_row_text is null or v_source_row_text !~ '^[1-9][0-9]*$'
       or v_source_count_text is null or v_source_count_text !~ '^[1-9][0-9]*$' then
      return jsonb_build_object(
        'ok',false,'operation','SAVE','build','DATA_ENTRY_OS_SOFTCOPY_BULK_IMPORT_V15_20260902',
        'errors',jsonb_build_array(jsonb_build_object(
          'code','OS_SOURCE_ROW_REQUIRED','field','source_row_number','message','Positive source row number and source row count are required for OS imports.'
        )),'access',v_access,'upload_access',v_upload_access
      );
    end if;
    v_source_row := v_source_row_text::integer;
    v_source_count := v_source_count_text::integer;
    if v_source_row > v_source_count + 25 then
      return jsonb_build_object(
        'ok',false,'operation','SAVE','build','DATA_ENTRY_OS_SOFTCOPY_BULK_IMPORT_V15_20260902',
        'errors',jsonb_build_array(jsonb_build_object(
          'code','OS_SOURCE_ROW_OUT_OF_RANGE','field','source_row_number','message','The spreadsheet row exceeds its declared row count and header allowance.'
        )),'access',v_access,'upload_access',v_upload_access
      );
    end if;
    if v_payload_address = '' then
      return jsonb_build_object(
        'ok',false,'operation','SAVE','build','DATA_ENTRY_OS_SOFTCOPY_BULK_IMPORT_V15_20260902',
        'errors',jsonb_build_array(jsonb_build_object(
          'code','IMPORTED_ADDRESS_REQUIRED','field','delivery_address','message','An imported receiver address is required before resolving its drop point.'
        )),'access',v_access,'upload_access',v_upload_access
      );
    end if;

    select r.address_original into v_location_address
    from public.be_delivery_location_registry r
    where r.delivery_way_id=v_delivery_way_id
      and r.review_status='ACCEPTED'
      and r.latitude between 9 and 29
      and r.longitude between 92 and 102
    limit 1;
    if not found then
      return jsonb_build_object(
        'ok',false,'operation','SAVE','build','DATA_ENTRY_OS_SOFTCOPY_BULK_IMPORT_V15_20260902',
        'errors',jsonb_build_array(jsonb_build_object(
          'code','IMPORTED_LOCATION_NOT_SYNCED','field','delivery_address','message','Review this imported drop point and Apply coordinates before saving.'
        )),'access',v_access,'upload_access',v_upload_access
      );
    end if;
    v_payload_address_key := lower(regexp_replace(v_payload_address,'[[:space:][:punct:]]+','','g'));
    v_location_address_key := lower(regexp_replace(btrim(coalesce(v_location_address,'')),'[[:space:][:punct:]]+','','g'));
    if v_payload_address_key='' or v_location_address_key<>v_payload_address_key then
      return jsonb_build_object(
        'ok',false,'operation','SAVE','build','DATA_ENTRY_OS_SOFTCOPY_BULK_IMPORT_V15_20260902',
        'errors',jsonb_build_array(jsonb_build_object(
          'code','IMPORTED_LOCATION_ADDRESS_MISMATCH','field','delivery_address','message','The accepted pin belongs to a different address. Check or Apply coordinates for the current imported address.'
        )),'access',v_access,'upload_access',v_upload_access
      );
    end if;
  elsif v_photo_bypass or v_photo_mode='OS_SOFTCOPY' then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_OS_SOFTCOPY_BULK_IMPORT_V15_20260902',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','PHOTO_BYPASS_REQUIRES_OS_IMPORT','field','photo_bypass','message','Photo bypass is only available for a traced OS spreadsheet import.'
      )),'access',v_access
    );
  end if;

  if v_photo_bypass and (v_photo_mode<>'OS_SOFTCOPY' or v_photo_reason is null or length(v_photo_reason)<10) then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_OS_SOFTCOPY_BULK_IMPORT_V15_20260902',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','PHOTO_BYPASS_REASON_REQUIRED','field','photo_bypass_reason','message','OS-softcopy photo bypass requires a clear reason of at least 10 characters.'
      )),'access',v_access,'upload_access',v_upload_access
    );
  end if;
  if not v_photo_bypass and v_photo_mode<>'PICKER_PHOTO' then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_OS_SOFTCOPY_BULK_IMPORT_V15_20260902',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','INVALID_PHOTO_EVIDENCE_MODE','field','photo_evidence_mode','message','Use picker-photo evidence unless an explicit OS-softcopy bypass is authorized.'
      )),'access',v_access,'upload_access',v_upload_access
    );
  end if;

  select
    greatest(coalesce(p.expected_parcels,0),coalesce(p.expected_parcel_count,0),coalesce(p.parcel_count,0),0),
    greatest(coalesce(p.verified_parcels,0),0)
  into v_requested_count,v_verified_count
  from public.be_portal_pickup_requests p
  where p.pickup_id=v_pickup_id
  for update;
  if not found then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','build','DATA_ENTRY_OS_SOFTCOPY_BULK_IMPORT_V15_20260902',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','PICKUP_NOT_FOUND','field','pickup_id','message','Canonical production pickup was not found.'
      )),'access',v_access
    );
  end if;
  v_authorized_count := greatest(v_requested_count,v_verified_count);
  v_is_addition := v_sequence>v_requested_count;
  if v_sequence>v_authorized_count then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','pickup_id',v_pickup_id,'build','DATA_ENTRY_OS_SOFTCOPY_BULK_IMPORT_V15_20260902',
      'requested_parcels',v_requested_count,'authorized_parcels',v_authorized_count,
      'errors',jsonb_build_array(jsonb_build_object(
        'code','UNAUTHORIZED_EXTRA_REGISTRATION','field','parcel_sequence','message','Authorize the merchant-requested additional registration before saving this parcel sequence.'
      )),'access',v_access
    );
  end if;

  if v_is_addition
     and not exists (
       select 1 from public.be_audit_events a
       where a.action='DATA_ENTRY_EXTRA_REGISTRATIONS_AUTHORIZED'
         and a.resource_type='PICKUP' and a.resource_id=v_pickup_id
         and coalesce(a.details#>>'{after_value,authorized_parcels}','') ~ '^[0-9]+$'
         and (a.details#>>'{after_value,authorized_parcels}')::integer>=v_sequence
     )
     and not exists (
       select 1 from public.be_pickup_parcel_verifications v
       where v.pickup_id=v_pickup_id and v.parcel_sequence=v_sequence
     ) then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','pickup_id',v_pickup_id,'build','DATA_ENTRY_OS_SOFTCOPY_BULK_IMPORT_V15_20260902',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','EXTRA_REGISTRATION_AUDIT_REQUIRED','field','parcel_sequence','message','This additional parcel has no audited Data Entry authorization or Rider verification.'
      )),'access',v_access
    );
  end if;

  if (not v_is_addition or v_os_import) and not v_photo_bypass and not exists (
    select 1 from public.be_pickup_parcel_verifications v
    where v.pickup_id=v_pickup_id and v.parcel_sequence=v_sequence
      and upper(coalesce(nullif(v.proof_check_status,''),nullif(v.verification_status,''),nullif(v.status,''),''))
        in ('APPROVED','APPROVED_AFTER_REUPLOAD','PHOTO_APPROVED','VERIFIED','RIDER_VERIFIED')
  ) then
    return jsonb_build_object(
      'ok',false,'operation','SAVE','pickup_id',v_pickup_id,'build','DATA_ENTRY_OS_SOFTCOPY_BULK_IMPORT_V15_20260902',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','PARCEL_PHOTO_APPROVAL_REQUIRED','field','parcel_sequence','message','Approve the Rider or Driver parcel photo, or explicitly authorize the traced OS-softcopy evidence option.'
      )),'access',v_access
    );
  end if;

  v_payload := v_payload || jsonb_build_object(
    'delivery_way_id',v_delivery_way_id,
    'service_type',v_service_type,
    'source_file_name',case when v_os_import then v_source_file else coalesce(v_source_file,'PORTAL_FINANCIAL_V2_LIVE') end
  );
  v_result := public.be_data_entry_financial_v2_save_v13_2_unbounded(v_payload);

  if coalesce((v_result->>'persisted')::boolean,false) then
    update public.be_data_entry_parcel_details d
    set service_type=v_service_type,
        source_file_name=case when v_os_import then v_source_file else d.source_file_name end,
        source_row_number=case when v_os_import then v_source_row else d.source_row_number end,
        source_row_count=case when v_os_import then v_source_count else d.source_row_count end,
        photo_evidence_mode=v_photo_mode,
        photo_bypass_reason=case when v_photo_bypass then v_photo_reason else null end,
        os_imported_at=case when v_os_import then now() else d.os_imported_at end,
        os_imported_by=case when v_os_import then v_actor_id else d.os_imported_by end,
        financial_quote=coalesce(d.financial_quote,'{}'::jsonb)||jsonb_build_object(
          'service_type',v_service_type,
          'os_softcopy_import',v_os_import,
          'os_source_file_name',case when v_os_import then v_source_file else null end,
          'source_row_number',case when v_os_import then v_source_row else null end,
          'source_row_count',case when v_os_import then v_source_count else null end,
          'photo_evidence_mode',v_photo_mode,
          'photo_bypass_reason',case when v_photo_bypass then v_photo_reason else null end
        ),
        updated_at=now()
    where d.pickup_id=v_pickup_id and d.parcel_sequence=v_sequence;

    update public.be_portal_pickup_requests p
    set registered_parcel_count=(
          select count(*)::integer from public.be_data_entry_parcel_details d where d.pickup_id=v_pickup_id
        ),updated_at=now()
    where p.pickup_id=v_pickup_id;

    if v_os_import then
      insert into public.be_audit_events(
        actor_id,actor_email,actor_role,action,resource_type,resource_id,details,
        upload_code,event_type,entity_type,entity_id,payload
      ) values (
        v_actor_id,v_actor_email,v_actor_role,
        'DATA_ENTRY_OS_SOFTCOPY_IMPORTED','DELIVERY_WAY',v_delivery_way_id,
        jsonb_build_object(
          'pickup_id',v_pickup_id,'parcel_sequence',v_sequence,'service_type',v_service_type,
          'source_file_name',v_source_file,'source_row_number',v_source_row,'source_row_count',v_source_count,
          'photo_evidence_mode',v_photo_mode,'location_address',v_location_address
        ),
        'DATA_ENTRY_OS_SOFTCOPY_BULK_IMPORT_V15_20260902',
        'DATA_ENTRY_OS_SOFTCOPY_IMPORTED','DELIVERY_WAY',v_delivery_way_id,
        jsonb_build_object('result',v_result,'access',v_access,'upload_access',v_upload_access)
      );
      if v_photo_bypass then
        insert into public.be_audit_events(
          actor_id,actor_email,actor_role,action,resource_type,resource_id,details,
          upload_code,event_type,entity_type,entity_id,payload
        ) values (
          v_actor_id,v_actor_email,v_actor_role,
          'DATA_ENTRY_OS_SOFTCOPY_PHOTO_BYPASS_AUTHORIZED','DELIVERY_WAY',v_delivery_way_id,
          jsonb_build_object(
            'pickup_id',v_pickup_id,'parcel_sequence',v_sequence,'source_file_name',v_source_file,
            'source_row_number',v_source_row,'reason',v_photo_reason
          ),
          'DATA_ENTRY_OS_SOFTCOPY_BULK_IMPORT_V15_20260902',
          'DATA_ENTRY_OS_SOFTCOPY_PHOTO_BYPASS_AUTHORIZED','DELIVERY_WAY',v_delivery_way_id,
          jsonb_build_object('reason',v_photo_reason,'actor_user_id',v_actor_id)
        );
      end if;
    end if;
  end if;

  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'build','DATA_ENTRY_OS_SOFTCOPY_BULK_IMPORT_V15_20260902',
    'registration_scope',case when v_is_addition then 'AUTHORIZED_MERCHANT_ADDITION' else 'PICKUP_REQUEST' end,
    'requested_parcels',v_requested_count,'authorized_parcels',v_authorized_count,
    'additional_registration',v_is_addition,'os_softcopy_import',v_os_import,
    'photo_evidence_mode',v_photo_mode,'canonical_way_id',v_delivery_way_id
  );
end
$function$;

revoke all on function public.be_data_entry_financial_v2_save(jsonb) from public, anon;
grant execute on function public.be_data_entry_financial_v2_save(jsonb) to authenticated, service_role;

comment on function public.be_data_entry_financial_v2_save(jsonb) is
  'V15 bounded Data Entry save with upload permission, OS-source lineage, explicit photo-evidence authorization, and accepted current-address location gating.';

comment on column public.be_data_entry_parcel_details.source_file_name is
  'Original OS CSV/XLS/XLSX browser filename for a traced Data Entry import.';
comment on column public.be_data_entry_parcel_details.photo_evidence_mode is
  'PICKER_PHOTO or an explicitly audited OS_SOFTCOPY evidence decision.';

commit;
