create or replace function public.be_review_parcel_photo(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare
  v_action text := upper(coalesce(p_payload->>'action', ''));
  v_pickup_id text := nullif(btrim(p_payload->>'pickup_id'), '');
  v_sequence integer := public.be_rider_safe_positive_integer(coalesce(
    p_payload->>'parcel_sequence',
    p_payload->>'item_no'
  ));
  v_reason text := upper(coalesce(nullif(btrim(p_payload->>'rejection_reason'), ''), 'OTHER'));
  v_note text := nullif(btrim(p_payload->>'rejection_note'), '');
  v_status text;
  v_reviewer text := coalesce(nullif(btrim(p_payload->>'reviewed_by'), ''), auth.uid()::text);
  v_reviewer_email text := nullif(btrim(p_payload->>'reviewed_by_email'), '');
  v_row public.be_pickup_parcel_verifications%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if v_action not in ('APPROVE', 'REJECT') then
    return jsonb_build_object('ok', false, 'error', 'action must be APPROVE or REJECT');
  end if;

  if v_pickup_id is null or coalesce(v_sequence, 0) < 1 then
    return jsonb_build_object('ok', false, 'error', 'pickup_id and parcel_sequence are required');
  end if;

  if v_action = 'REJECT' and nullif(v_reason, '') is null then
    return jsonb_build_object('ok', false, 'error', 'rejection_reason is required');
  end if;

  v_status := case when v_action = 'APPROVE' then 'APPROVED' else 'REUPLOAD_REQUIRED' end;

  update public.be_pickup_parcel_verifications v
  set verification_status = v_status,
      proof_check_status = v_status,
      reviewed_by = v_reviewer,
      reviewed_by_email = v_reviewer_email,
      reviewed_at = now(),
      review_note = case
        when v_action = 'REJECT' then concat_ws(': ', v_reason, v_note)
        else coalesce(v_note, 'Photo approved by Data Entry')
      end,
      last_rejected_at = case when v_action = 'REJECT' then now() else null end,
      updated_at = now()
  where v.pickup_id = v_pickup_id
    and v.parcel_sequence = v_sequence
  returning v.* into v_row;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'parcel photo verification row not found');
  end if;

  if to_regclass('public.be_parcel_photo_reviews') is not null then
    update public.be_parcel_photo_reviews r
    set review_status = v_status,
        rejection_reason = case when v_action = 'REJECT' then v_reason else null end,
        rejection_note = case when v_action = 'REJECT' then v_note else null end,
        reviewed_by = v_reviewer,
        reviewed_at = now(),
        updated_at = now()
    where r.pickup_id = v_pickup_id
      and r.parcel_sequence = v_sequence;
  end if;

  update public.be_portal_pickup_requests p
  set rejected_photo_count = (
        select count(*) from public.be_pickup_parcel_verifications x
        where x.pickup_id = v_pickup_id
          and upper(coalesce(x.proof_check_status, '')) = 'REUPLOAD_REQUIRED'
      ),
      pending_photo_count = (
        select count(*) from public.be_pickup_parcel_verifications x
        where x.pickup_id = v_pickup_id
          and upper(coalesce(x.proof_check_status, '')) in ('PENDING', 'PENDING_REVIEW', 'RIDER_SUBMITTED')
      ),
      photo_review_status = case
        when exists (
          select 1 from public.be_pickup_parcel_verifications x
          where x.pickup_id = v_pickup_id
            and upper(coalesce(x.proof_check_status, '')) = 'REUPLOAD_REQUIRED'
        ) then 'REUPLOAD_REQUIRED'
        when not exists (
          select 1 from public.be_pickup_parcel_verifications x
          where x.pickup_id = v_pickup_id
            and upper(coalesce(x.proof_check_status, '')) not in ('APPROVED', 'VERIFIED')
        ) then 'APPROVED'
        else 'PARTIAL_REVIEW'
      end,
      updated_at = now()
  where coalesce(p.pickup_id, p.pickup_way_id) = v_pickup_id;

  if v_action = 'REJECT' and to_regclass('public.be_app_notifications') is not null then
    begin
      insert into public.be_app_notifications (
        notification_type, title, message, target_role,
        target_user_code, pickup_id, is_read, created_at
      )
      select
        'PARCEL_PHOTO_REUPLOAD',
        'Photo re-upload required',
        'Parcel ' || v_sequence || ' photo was rejected: ' || v_reason,
        'rider',
        p.assigned_rider_code,
        v_pickup_id,
        false,
        now()
      from public.be_portal_pickup_requests p
      where coalesce(p.pickup_id, p.pickup_way_id) = v_pickup_id
        and nullif(p.assigned_rider_code, '') is not null;
    exception when others then
      raise notice 'Notification insert skipped: %', sqlerrm;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'source', 'be_review_parcel_photo',
    'pickup_id', v_pickup_id,
    'parcel_sequence', v_sequence,
    'review_status', v_status,
    'rejection_reason', case when v_action = 'REJECT' then v_reason else null end
  );
end;
$function$;

revoke all on function public.be_review_parcel_photo(jsonb) from public, anon;
grant execute on function public.be_review_parcel_photo(jsonb) to authenticated;;
