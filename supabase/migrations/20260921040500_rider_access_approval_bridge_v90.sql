-- V90: Rider access request bridge into Enterprise approval queue.
create or replace function public.be_rider_access_request_ensure()
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
  v_row public.approval_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'AUTHENTICATED_SESSION_REQUIRED' using errcode='42501';
  end if;

  -- If already mapped to an active field-team account, no pending request is needed.
  if exists(
    select 1
    from public.be_mobile_workforce_accounts w
    where w.auth_user_id=v_uid
      and coalesce(w.active,true)
      and coalesce(w.is_active,true)
  ) then
    return jsonb_build_object('ok',true,'status','APPROVED','already_mapped',true);
  end if;

  select a.*
  into v_row
  from public.approval_requests a
  where a.requested_by=v_uid
    and coalesce(a.entity_type,'')='mobile_workforce_account'
    and lower(coalesce(a.requested_role,'')) in ('rider','driver','helper')
    and lower(coalesce(a.status,'pending')) in ('pending','submitted','open')
  order by a.created_at desc
  limit 1;

  if not found then
    insert into public.approval_requests(
      id,table_name,record_id,requested_by,status,created_at,request_type,
      entity_type,entity_id,requested_role,payload
    ) values (
      gen_random_uuid(),
      'be_mobile_workforce_accounts',
      null,
      v_uid,
      'pending',
      now(),
      'RIDER_APP_ACCESS',
      'mobile_workforce_account',
      v_uid::text,
      'rider',
      jsonb_build_object(
        'email',v_email,
        'auth_user_id',v_uid,
        'requested_app','rider_app',
        'source','RIDER_APP_V90'
      )
    )
    returning * into v_row;

    insert into public.be_app_notifications(
      target_role,title,message,notification_type,category,status,created_at,metadata
    ) values (
      'operations',
      'Rider App access request',
      coalesce(v_email,v_uid::text)||' requested Rider App workforce access.',
      'RIDER_ACCESS_REQUEST',
      'WORKFORCE_APPROVAL',
      'OPEN',
      now(),
      jsonb_build_object('approval_request_id',v_row.id,'auth_user_id',v_uid,'email',v_email,'source','RIDER_APP_V90')
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'request_id',v_row.id,
    'status',upper(coalesce(v_row.status,'PENDING')),
    'requested_role',v_row.requested_role,
    'created_at',v_row.created_at,
    'approved_at',v_row.approved_at,
    'rejected_at',v_row.rejected_at
  );
end;
$$;

revoke all on function public.be_rider_access_request_ensure() from public,anon;
grant execute on function public.be_rider_access_request_ensure() to authenticated;

create or replace function public.be_rider_access_request_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_row public.approval_requests%rowtype;
  v_mapped boolean:=false;
begin
  if v_uid is null then
    raise exception 'AUTHENTICATED_SESSION_REQUIRED' using errcode='42501';
  end if;

  select exists(
    select 1
    from public.be_mobile_workforce_accounts w
    where w.auth_user_id=v_uid
      and coalesce(w.active,true)
      and coalesce(w.is_active,true)
  ) into v_mapped;

  if v_mapped then
    return jsonb_build_object('ok',true,'status','APPROVED','already_mapped',true);
  end if;

  select a.*
  into v_row
  from public.approval_requests a
  where a.requested_by=v_uid
    and coalesce(a.entity_type,'')='mobile_workforce_account'
  order by a.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok',true,'status','NOT_REQUESTED','already_mapped',false);
  end if;

  return jsonb_build_object(
    'ok',true,
    'request_id',v_row.id,
    'status',upper(coalesce(v_row.status,'PENDING')),
    'requested_role',v_row.requested_role,
    'created_at',v_row.created_at,
    'approved_at',v_row.approved_at,
    'rejected_at',v_row.rejected_at,
    'already_mapped',false
  );
end;
$$;

revoke all on function public.be_rider_access_request_snapshot() from public,anon;
grant execute on function public.be_rider_access_request_snapshot() to authenticated;
