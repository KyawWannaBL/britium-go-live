-- Britium workflow fix pack: team acceptance + parcel photo review/re-upload + partial Data Entry
-- Run once in Supabase SQL Editor before deploying the fixed frontend files.

create extension if not exists pgcrypto;

alter table public.be_portal_pickup_requests
  add column if not exists driver_status text default 'WAITING_ACCEPTANCE',
  add column if not exists helper_status text default 'WAITING_ACCEPTANCE',
  add column if not exists rider_accepted_at timestamptz,
  add column if not exists driver_accepted_at timestamptz,
  add column if not exists helper_accepted_at timestamptz,
  add column if not exists rider_rejected_at timestamptz,
  add column if not exists driver_rejected_at timestamptz,
  add column if not exists helper_rejected_at timestamptz,
  add column if not exists photo_review_status text default 'PENDING',
  add column if not exists expected_parcel_count integer,
  add column if not exists registered_parcel_count integer default 0,
  add column if not exists rejected_photo_count integer default 0,
  add column if not exists pending_photo_count integer default 0;

create table if not exists public.be_parcel_photo_reviews (
  id uuid primary key default gen_random_uuid(),
  pickup_id text not null,
  parcel_sequence integer not null,
  delivery_way_id text,
  tracking_no text,
  current_photo_url text,
  previous_photo_url text,
  actual_weight_kg numeric,
  review_status text not null default 'PENDING_REVIEW',
  rejection_reason text,
  rejection_note text,
  uploaded_by text,
  uploaded_role text,
  reviewed_by text,
  reviewed_at timestamptz,
  reupload_count integer not null default 0,
  remarks text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pickup_id, parcel_sequence)
);

create index if not exists be_parcel_photo_reviews_pickup_idx on public.be_parcel_photo_reviews (pickup_id, parcel_sequence);
create index if not exists be_parcel_photo_reviews_status_idx on public.be_parcel_photo_reviews (review_status, updated_at desc);

grant select, insert, update on public.be_parcel_photo_reviews to authenticated;

create or replace function public.be_submit_parcel_photo_for_review(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pickup text := coalesce(p_payload->>'pickup_id', p_payload->>'pickup_way_id');
  v_seq integer := greatest(1, coalesce(nullif(p_payload->>'parcel_sequence','')::integer, nullif(p_payload->>'item_no','')::integer, 1));
  v_id uuid;
begin
  if nullif(v_pickup,'') is null then return jsonb_build_object('ok',false,'error','pickup_id is required'); end if;
  if nullif(p_payload->>'photo_url','') is null then return jsonb_build_object('ok',false,'error','photo_url is required'); end if;

  insert into public.be_parcel_photo_reviews (
    pickup_id, parcel_sequence, delivery_way_id, tracking_no, current_photo_url,
    actual_weight_kg, review_status, rejection_reason, rejection_note,
    uploaded_by, uploaded_role, remarks, payload, updated_at
  ) values (
    v_pickup, v_seq, p_payload->>'delivery_way_id', p_payload->>'tracking_no', p_payload->>'photo_url',
    nullif(p_payload->>'actual_weight_kg','')::numeric, 'PENDING_REVIEW', null, null,
    p_payload->>'uploaded_by', coalesce(p_payload->>'uploaded_role','RIDER'), p_payload->>'remarks', p_payload, now()
  )
  on conflict (pickup_id, parcel_sequence) do update set
    previous_photo_url = be_parcel_photo_reviews.current_photo_url,
    current_photo_url = excluded.current_photo_url,
    delivery_way_id = coalesce(excluded.delivery_way_id, be_parcel_photo_reviews.delivery_way_id),
    tracking_no = coalesce(excluded.tracking_no, be_parcel_photo_reviews.tracking_no),
    actual_weight_kg = coalesce(excluded.actual_weight_kg, be_parcel_photo_reviews.actual_weight_kg),
    review_status = 'PENDING_REVIEW', rejection_reason = null, rejection_note = null,
    uploaded_by = excluded.uploaded_by, uploaded_role = excluded.uploaded_role,
    remarks = excluded.remarks, payload = excluded.payload, updated_at = now()
  returning id into v_id;

  update public.be_portal_pickup_requests
  set photo_review_status = 'PARTIAL_REVIEW', updated_at = now()
  where pickup_way_id = v_pickup;

  return jsonb_build_object('ok',true,'source','be_submit_parcel_photo_for_review','review_id',v_id,'pickup_id',v_pickup,'parcel_sequence',v_seq,'review_status','PENDING_REVIEW');
end $$;

create or replace function public.be_review_parcel_photo(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p_payload->>'review_id','')::uuid;
  v_action text := upper(coalesce(p_payload->>'action',''));
  v_status text;
  v_row public.be_parcel_photo_reviews%rowtype;
begin
  if v_action not in ('APPROVE','REJECT') then return jsonb_build_object('ok',false,'error','action must be APPROVE or REJECT'); end if;
  v_status := case when v_action='APPROVE' then 'APPROVED' else 'REUPLOAD_REQUIRED' end;

  update public.be_parcel_photo_reviews set
    review_status = v_status,
    rejection_reason = case when v_action='REJECT' then coalesce(p_payload->>'rejection_reason','OTHER') else null end,
    rejection_note = case when v_action='REJECT' then p_payload->>'rejection_note' else null end,
    reviewed_by = p_payload->>'reviewed_by', reviewed_at = now(), updated_at = now()
  where id = v_id
  returning * into v_row;

  if not found then return jsonb_build_object('ok',false,'error','photo review row not found'); end if;

  if to_regclass('public.be_rider_pickup_parcel_verifications') is not null then
    execute 'update public.be_rider_pickup_parcel_verifications set status=$1, verified=$2, remarks=coalesce($3,remarks) where pickup_id=$4 and parcel_sequence=$5'
      using v_status, (v_action='APPROVE'), v_row.rejection_note, v_row.pickup_id, v_row.parcel_sequence;
  end if;

  update public.be_portal_pickup_requests p set
    rejected_photo_count = (select count(*) from public.be_parcel_photo_reviews r where r.pickup_id=v_row.pickup_id and r.review_status in ('PHOTO_REJECTED','REUPLOAD_REQUIRED')),
    pending_photo_count = (select count(*) from public.be_parcel_photo_reviews r where r.pickup_id=v_row.pickup_id and r.review_status='PENDING_REVIEW'),
    photo_review_status = case when exists(select 1 from public.be_parcel_photo_reviews r where r.pickup_id=v_row.pickup_id and r.review_status in ('PHOTO_REJECTED','REUPLOAD_REQUIRED')) then 'REUPLOAD_REQUIRED' else 'PARTIAL_REVIEW' end,
    updated_at = now()
  where p.pickup_way_id=v_row.pickup_id;

  if v_action='REJECT' and to_regclass('public.be_app_notifications') is not null then
    begin
      insert into public.be_app_notifications(notification_type,title,message,target_role,target_user_code,pickup_id,is_read,created_at)
      select 'PARCEL_PHOTO_REUPLOAD','Photo re-upload required',
             'Parcel '||v_row.parcel_sequence||' photo was rejected: '||coalesce(v_row.rejection_reason,'unclear photo'),
             'rider',p.assigned_rider_code,v_row.pickup_id,false,now()
      from public.be_portal_pickup_requests p where p.pickup_way_id=v_row.pickup_id;
    exception when others then
      raise notice 'Notification insert skipped: %', sqlerrm;
    end;
  end if;

  return jsonb_build_object('ok',true,'source','be_review_parcel_photo','review_id',v_row.id,'pickup_id',v_row.pickup_id,'parcel_sequence',v_row.parcel_sequence,'review_status',v_status);
end $$;

create or replace function public.be_parcel_photo_reupload(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p_payload->>'review_id','')::uuid;
  v_row public.be_parcel_photo_reviews%rowtype;
begin
  update public.be_parcel_photo_reviews set
    previous_photo_url = current_photo_url,
    current_photo_url = p_payload->>'photo_url',
    review_status = 'PENDING_REVIEW',
    rejection_reason = null, rejection_note = null,
    uploaded_by = p_payload->>'uploaded_by', uploaded_role = coalesce(p_payload->>'uploaded_role','WAREHOUSE'),
    reviewed_by = null, reviewed_at = null,
    reupload_count = reupload_count + 1,
    payload = payload || p_payload,
    updated_at = now()
  where id=v_id
  returning * into v_row;

  if not found then return jsonb_build_object('ok',false,'error','photo review row not found'); end if;
  return jsonb_build_object('ok',true,'source','be_parcel_photo_reupload','review_id',v_row.id,'pickup_id',v_row.pickup_id,'parcel_sequence',v_row.parcel_sequence,'review_status','PENDING_REVIEW','reupload_count',v_row.reupload_count);
end $$;

create or replace function public.be_rider_submit_partial_pickup_verification(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pickup text := coalesce(p_payload->>'pickup_id',p_payload->>'pickup_way_id');
  v_expected integer := greatest(1,coalesce(nullif(p_payload->>'parcel_count','')::integer,1));
  v_submitted integer := greatest(0,coalesce(nullif(p_payload->>'submitted_count','')::integer,0));
  v_verified integer := greatest(0,coalesce(nullif(p_payload->>'verified_count','')::integer,0));
  v_rejected integer := greatest(0,coalesce(nullif(p_payload->>'rejected_count','')::integer,0));
  v_stage text;
begin
  if nullif(v_pickup,'') is null then return jsonb_build_object('ok',false,'error','pickup_id is required'); end if;
  v_stage := case when v_verified >= v_expected then 'PICKUP_VERIFIED' else 'PARTIAL_PICKUP_VERIFICATION' end;

  update public.be_portal_pickup_requests set
    expected_parcel_count = v_expected,
    registered_parcel_count = v_verified,
    rejected_photo_count = v_rejected,
    pending_photo_count = greatest(0,v_expected-v_verified-v_rejected),
    photo_review_status = case when v_rejected>0 then 'REUPLOAD_REQUIRED' when v_verified>=v_expected then 'APPROVED' else 'PARTIAL_REVIEW' end,
    pickup_status = case when v_verified>=v_expected then 'PICKUP_VERIFIED' else pickup_status end,
    workflow_stage = v_stage,
    rider_status = case when v_verified>=v_expected then 'PICKUP_VERIFIED' else 'PARTIAL_VERIFICATION_SAVED' end,
    data_entry_status = case when v_verified>0 then 'PARTIAL_DATA_ENTRY_READY' else data_entry_status end,
    updated_at = now()
  where pickup_way_id=v_pickup;

  return jsonb_build_object('ok',true,'source','be_rider_submit_partial_pickup_verification','pickup_id',v_pickup,'expected_count',v_expected,'submitted_count',v_submitted,'verified_count',v_verified,'rejected_count',v_rejected,'workflow_stage',v_stage,'partial',v_verified<v_expected);
end $$;

create or replace function public.be_data_entry_mark_partial_registration(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pickup text := coalesce(p_payload->>'pickup_id',p_payload->>'pickup_way_id');
  v_expected integer := greatest(1,coalesce(nullif(p_payload->>'expected_count','')::integer,1));
  v_registered integer := greatest(0,coalesce(nullif(p_payload->>'registered_count','')::integer,0));
  v_rejected integer := greatest(0,coalesce(nullif(p_payload->>'rejected_count','')::integer,0));
  v_pending integer := greatest(0,coalesce(nullif(p_payload->>'pending_count','')::integer,v_expected-v_registered-v_rejected));
begin
  update public.be_portal_pickup_requests set
    expected_parcel_count=v_expected, registered_parcel_count=v_registered,
    rejected_photo_count=v_rejected, pending_photo_count=v_pending,
    data_entry_status=case when v_registered>=v_expected then 'PARCEL_BULK_LOADED' else 'PARTIAL_PARCEL_REGISTERED' end,
    workflow_stage=case when v_registered>=v_expected then 'WAITING_WAREHOUSE_RECEIVE' else 'PARTIAL_DATA_ENTRY' end,
    warehouse_status=case when v_registered>0 then 'PARTIAL_WAREHOUSE_RECEIVE_ALLOWED' else warehouse_status end,
    updated_at=now()
  where pickup_way_id=v_pickup;
  return jsonb_build_object('ok',true,'source','be_data_entry_mark_partial_registration','pickup_id',v_pickup,'expected_count',v_expected,'registered_count',v_registered,'rejected_count',v_rejected,'pending_count',v_pending,'partial',v_registered<v_expected);
end $$;

create or replace function public.be_field_team_assignment_action(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pickup text := coalesce(p_payload->>'pickup_id',p_payload->>'pickup_way_id');
  v_role text := upper(coalesce(p_payload->>'role',p_payload->>'user_role'));
  v_action text := upper(coalesce(p_payload->>'action','ACCEPT'));
  v_status text;
  v_updated integer;
begin
  if v_role not in ('RIDER','DRIVER','HELPER') then return jsonb_build_object('ok',false,'error','role must be RIDER, DRIVER, or HELPER'); end if;
  if v_action not in ('ACCEPT','REJECT') then return jsonb_build_object('ok',false,'error','action must be ACCEPT or REJECT'); end if;
  v_status := case when v_action='ACCEPT' then 'ACCEPTED' else 'REJECTED' end;

  if v_role='RIDER' then
    update public.be_portal_pickup_requests set rider_status=v_status,
      rider_accepted_at=case when v_action='ACCEPT' then now() else rider_accepted_at end,
      rider_rejected_at=case when v_action='REJECT' then now() else rider_rejected_at end,
      updated_at=now() where pickup_way_id=v_pickup;
  elsif v_role='DRIVER' then
    update public.be_portal_pickup_requests set driver_status=v_status,
      driver_accepted_at=case when v_action='ACCEPT' then now() else driver_accepted_at end,
      driver_rejected_at=case when v_action='REJECT' then now() else driver_rejected_at end,
      updated_at=now() where pickup_way_id=v_pickup;
  else
    update public.be_portal_pickup_requests set helper_status=v_status,
      helper_accepted_at=case when v_action='ACCEPT' then now() else helper_accepted_at end,
      helper_rejected_at=case when v_action='REJECT' then now() else helper_rejected_at end,
      updated_at=now() where pickup_way_id=v_pickup;
  end if;
  get diagnostics v_updated=row_count;
  return jsonb_build_object('ok',true,'source','be_field_team_assignment_action','pickup_id',v_pickup,'role',v_role,'action',v_action,'status',v_status,'updated_rows',v_updated);
end $$;

grant execute on function public.be_submit_parcel_photo_for_review(jsonb) to authenticated;
grant execute on function public.be_review_parcel_photo(jsonb) to authenticated;
grant execute on function public.be_parcel_photo_reupload(jsonb) to authenticated;
grant execute on function public.be_rider_submit_partial_pickup_verification(jsonb) to authenticated;
grant execute on function public.be_data_entry_mark_partial_registration(jsonb) to authenticated;
grant execute on function public.be_field_team_assignment_action(jsonb) to authenticated;
