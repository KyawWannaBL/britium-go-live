-- V98: correct Data Entry staff progress for active overnight work and authoritative Auth roster.

create or replace function public.be_data_entry_staff_progress_v98(
  p_work_date date default null,
  p_selected_pickup_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_date date:=coalesce(p_work_date,(now() at time zone 'Asia/Yangon')::date);
  v_selected text:=nullif(btrim(coalesce(p_selected_pickup_id,'')),'');
  v_uid uuid:=auth.uid();
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
  v_branch text:='';
  v_pickups jsonb:='[]'::jsonb;
  v_staff jsonb:='[]'::jsonb;
  v_merchants jsonb:='[]'::jsonb;
  v_summary jsonb:='{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'AUTHENTICATED_SESSION_REQUIRED' using errcode='42501';
  end if;

  select upper(coalesce(u.raw_user_meta_data->>'branch_code',''))
    into v_branch
  from auth.users u
  where u.id=v_uid;

  with relevant as (
    select
      p.pickup_id,
      p.pickup_date,
      coalesce(nullif(p.merchant_code,''),nullif(p.merchant_id,''),'UNKNOWN') merchant_code,
      coalesce(nullif(p.merchant_name,''),nullif(p.merchant_code,''),nullif(p.merchant_id,''),'Unknown Merchant') merchant_name,
      greatest(coalesce(p.expected_parcels,p.expected_parcel_count,p.parcel_count,p.registered_parcel_count,0),0)::integer expected_count,
      p.created_at
    from public.be_portal_pickup_requests p
    where nullif(btrim(coalesce(p.pickup_id,'')),'') is not null
      and upper(coalesce(p.status,'')) not in ('CANCELLED','ARCHIVED_TEST_DATA')
      and (
        p.pickup_date=v_date
        or (v_selected is not null and p.pickup_id=v_selected)
        or exists (
          select 1
          from public.be_data_entry_parcel_details d
          where d.pickup_id=p.pickup_id
            and (coalesce(d.saved_at,d.updated_at,d.created_at) at time zone 'Asia/Yangon')::date=v_date
        )
        or exists (
          select 1
          from public.be_data_entry_pending_drafts d
          where d.pickup_id=p.pickup_id
            and (d.updated_at at time zone 'Asia/Yangon')::date=v_date
        )
      )
  ),
  saved as (
    select
      d.pickup_id,
      lower(coalesce(nullif(btrim(d.saved_by_email),''),'UNKNOWN')) email,
      count(distinct d.parcel_sequence)::integer saved_rows,
      max(coalesce(d.saved_at,d.updated_at,d.created_at)) last_saved_at
    from public.be_data_entry_parcel_details d
    join relevant r on r.pickup_id=d.pickup_id
    group by d.pickup_id,lower(coalesce(nullif(btrim(d.saved_by_email),''),'UNKNOWN'))
  ),
  drafts as (
    select
      d.pickup_id,
      lower(coalesce(nullif(btrim(u.email::text),''),nullif(btrim(p.email),''),'UNKNOWN')) email,
      count(distinct d.parcel_sequence)::integer draft_rows,
      count(distinct d.parcel_sequence) filter (where coalesce(d.skipped,false))::integer skipped_rows,
      max(d.updated_at) last_draft_at
    from public.be_data_entry_pending_drafts d
    join relevant r on r.pickup_id=d.pickup_id
    left join auth.users u on u.id=d.owner_id
    left join public.profiles p on p.id=d.owner_id
    group by d.pickup_id,lower(coalesce(nullif(btrim(u.email::text),''),nullif(btrim(p.email),''),'UNKNOWN'))
  ),
  saved_totals as (
    select d.pickup_id,count(distinct d.parcel_sequence)::integer registered_count
    from public.be_data_entry_parcel_details d
    join relevant r on r.pickup_id=d.pickup_id
    group by d.pickup_id
  ),
  draft_totals as (
    select d.pickup_id,count(distinct d.parcel_sequence)::integer draft_count
    from public.be_data_entry_pending_drafts d
    join relevant r on r.pickup_id=d.pickup_id
    group by d.pickup_id
  ),
  contributor_email as (
    select pickup_id,email from saved
    union
    select pickup_id,email from drafts
  ),
  pickup_rows as (
    select
      r.pickup_id,
      r.pickup_date,
      r.merchant_code,
      r.merchant_name,
      r.expected_count,
      coalesce(st.registered_count,0) registered_count,
      greatest(r.expected_count-coalesce(st.registered_count,0),0) remaining_count,
      coalesce(dt.draft_count,0) draft_count,
      case
        when r.expected_count>0 and coalesce(st.registered_count,0)>=r.expected_count then 'COMPLETED'
        when coalesce(st.registered_count,0)>0 then 'IN_PROGRESS'
        when coalesce(dt.draft_count,0)>0 then 'DRAFTING'
        else 'NOT_STARTED'
      end progress_status,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'email',ce.email,
          'name',coalesce(
            nullif(u.raw_user_meta_data->>'full_name',''),
            nullif(u.raw_user_meta_data->>'display_name',''),
            nullif(pr.full_name,''),
            ce.email
          ),
          'saved_rows',coalesce(s.saved_rows,0),
          'draft_rows',coalesce(d.draft_rows,0),
          'skipped_rows',coalesce(d.skipped_rows,0),
          'last_activity',greatest(s.last_saved_at,d.last_draft_at)
        ) order by coalesce(s.saved_rows,0) desc,coalesce(d.draft_rows,0) desc,ce.email)
        from contributor_email ce
        left join saved s on s.pickup_id=ce.pickup_id and s.email=ce.email
        left join drafts d on d.pickup_id=ce.pickup_id and d.email=ce.email
        left join auth.users u on lower(u.email::text)=ce.email
        left join public.profiles pr on lower(pr.email)=ce.email
        where ce.pickup_id=r.pickup_id
      ),'[]'::jsonb) contributors,
      greatest(
        (select max(s.last_saved_at) from saved s where s.pickup_id=r.pickup_id),
        (select max(d.last_draft_at) from drafts d where d.pickup_id=r.pickup_id),
        r.created_at
      ) last_activity
    from relevant r
    left join saved_totals st on st.pickup_id=r.pickup_id
    left join draft_totals dt on dt.pickup_id=r.pickup_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'pickup_id',pickup_id,
    'pickup_date',pickup_date,
    'merchant_code',merchant_code,
    'merchant_name',merchant_name,
    'expected',expected_count,
    'registered',registered_count,
    'remaining',remaining_count,
    'drafts',draft_count,
    'status',progress_status,
    'contributors',contributors,
    'last_activity',last_activity,
    'selected',pickup_id=v_selected
  ) order by
    (pickup_id=v_selected) desc,
    case progress_status when 'IN_PROGRESS' then 1 when 'DRAFTING' then 2 when 'NOT_STARTED' then 3 else 4 end,
    remaining_count desc,
    pickup_id
  ),'[]'::jsonb)
  into v_pickups
  from pickup_rows;

  with relevant_ids as (
    select item->>'pickup_id' pickup_id
    from jsonb_array_elements(v_pickups) x(item)
  ),
  saved as (
    select
      d.pickup_id,
      lower(coalesce(nullif(btrim(d.saved_by_email),''),'UNKNOWN')) email,
      count(distinct d.parcel_sequence)::integer saved_rows,
      max(coalesce(d.saved_at,d.updated_at,d.created_at)) last_saved_at
    from public.be_data_entry_parcel_details d
    join relevant_ids r on r.pickup_id=d.pickup_id
    group by d.pickup_id,lower(coalesce(nullif(btrim(d.saved_by_email),''),'UNKNOWN'))
  ),
  drafts as (
    select
      d.pickup_id,
      lower(coalesce(nullif(btrim(u.email::text),''),nullif(btrim(p.email),''),'UNKNOWN')) email,
      count(distinct d.parcel_sequence)::integer draft_rows,
      max(d.updated_at) last_draft_at
    from public.be_data_entry_pending_drafts d
    join relevant_ids r on r.pickup_id=d.pickup_id
    left join auth.users u on u.id=d.owner_id
    left join public.profiles p on p.id=d.owner_id
    group by d.pickup_id,lower(coalesce(nullif(btrim(u.email::text),''),nullif(btrim(p.email),''),'UNKNOWN'))
  ),
  observed as (
    select email from saved where email<>'UNKNOWN'
    union
    select email from drafts where email<>'UNKNOWN'
  ),
  roster as (
    select
      lower(u.email::text) email,
      coalesce(
        nullif(u.raw_user_meta_data->>'full_name',''),
        nullif(u.raw_user_meta_data->>'display_name',''),
        u.email::text
      ) display_name,
      upper(coalesce(u.raw_user_meta_data->>'branch_code','')) branch_code
    from auth.users u
    where lower(replace(coalesce(u.raw_user_meta_data->>'role',''),'_','-'))='data-entry'
      and (
        v_branch=''
        or upper(coalesce(u.raw_user_meta_data->>'branch_code',''))=v_branch
      )
    union
    select
      o.email,
      coalesce(
        nullif(u.raw_user_meta_data->>'full_name',''),
        nullif(u.raw_user_meta_data->>'display_name',''),
        nullif(p.full_name,''),
        o.email
      ),
      upper(coalesce(u.raw_user_meta_data->>'branch_code',''))
    from observed o
    left join auth.users u on lower(u.email::text)=o.email
    left join public.profiles p on lower(p.email)=o.email
  ),
  staff_rows as (
    select
      r.email,
      max(r.display_name) display_name,
      max(r.branch_code) branch_code,
      coalesce(sum(s.saved_rows),0)::integer saved_rows,
      coalesce(sum(d.draft_rows),0)::integer draft_rows,
      count(distinct s.pickup_id) filter (where coalesce(s.saved_rows,0)>0)::integer pickups_saved,
      count(distinct coalesce(s.pickup_id,d.pickup_id)) filter (where coalesce(s.saved_rows,0)>0 or coalesce(d.draft_rows,0)>0)::integer pickups_touched,
      greatest(max(s.last_saved_at),max(d.last_draft_at)) last_activity
    from roster r
    left join saved s on s.email=r.email
    left join drafts d on d.email=r.email
    group by r.email
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'email',email,
    'name',display_name,
    'branch_code',branch_code,
    'saved_rows',saved_rows,
    'draft_rows',draft_rows,
    'pickups_saved',pickups_saved,
    'pickups_touched',pickups_touched,
    'last_activity',last_activity,
    'is_current_user',email=v_email
  ) order by
    (email=v_email) desc,
    (coalesce(saved_rows,0)+coalesce(draft_rows,0)>0) desc,
    saved_rows desc,
    draft_rows desc,
    display_name
  ),'[]'::jsonb)
  into v_staff
  from staff_rows;

  with pickup_json as (
    select value item from jsonb_array_elements(v_pickups)
  ),
  merchant_groups as (
    select
      item->>'merchant_code' merchant_code,
      max(item->>'merchant_name') merchant_name,
      sum(coalesce((item->>'expected')::integer,0)) expected,
      sum(coalesce((item->>'registered')::integer,0)) registered,
      sum(coalesce((item->>'remaining')::integer,0)) remaining,
      count(*) pickups
    from pickup_json
    group by item->>'merchant_code'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'merchant_code',merchant_code,
    'merchant_name',merchant_name,
    'pickups',pickups,
    'expected',expected,
    'registered',registered,
    'remaining',remaining,
    'status',case when expected>0 and registered>=expected then 'COMPLETED' when registered>0 then 'IN_PROGRESS' else 'NOT_STARTED' end
  ) order by remaining desc,merchant_code),'[]'::jsonb)
  into v_merchants
  from merchant_groups;

  select jsonb_build_object(
    'work_date',v_date,
    'selected_pickup_id',v_selected,
    'pickups',jsonb_array_length(v_pickups),
    'merchants',jsonb_array_length(v_merchants),
    'expected',coalesce(sum((item->>'expected')::integer),0),
    'registered',coalesce(sum((item->>'registered')::integer),0),
    'drafts',coalesce(sum((item->>'drafts')::integer),0),
    'remaining',coalesce(sum((item->>'remaining')::integer),0),
    'completed_pickups',count(*) filter (where item->>'status'='COMPLETED'),
    'in_progress_pickups',count(*) filter (where item->>'status' in ('IN_PROGRESS','DRAFTING')),
    'not_started_pickups',count(*) filter (where item->>'status'='NOT_STARTED')
  )
  into v_summary
  from jsonb_array_elements(v_pickups) x(item);

  return jsonb_build_object(
    'ok',true,
    'work_date',v_date,
    'selected_pickup_id',v_selected,
    'summary',coalesce(v_summary,'{}'::jsonb),
    'pickups',v_pickups,
    'merchants',v_merchants,
    'staff',v_staff,
    'generated_at',now(),
    'build','DATA_ENTRY_STAFF_PROGRESS_V98'
  );
end;
$$;

revoke all on function public.be_data_entry_staff_progress_v98(date,text) from public,anon;
grant execute on function public.be_data_entry_staff_progress_v98(date,text) to authenticated;
