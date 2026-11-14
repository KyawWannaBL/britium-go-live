-- V87: secure Rider app wallet/profile snapshots.
create or replace function public.be_rider_wallet_snapshot(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_code text:=upper(coalesce(v_identity->>'worker_code',''));
  v_role text:=lower(coalesce(v_identity->>'role',''));
  v_collected numeric:=0;
  v_handed numeric:=0;
  v_completed integer:=0;
  v_ledger jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATED_FIELD_SESSION_REQUIRED' using errcode='42501';
  end if;

  select
    coalesce(sum(coalesce(f.reported_collected,0)),0),
    coalesce(sum(coalesce(f.settled_amount,0)),0),
    count(*) filter (where upper(coalesce(f.settlement_status,'')) in ('SETTLED','PAID','COMPLETED','POSTED'))
  into v_collected,v_handed,v_completed
  from public.be_finance_cod_settlements_v48 f
  where case v_role
    when 'driver' then upper(coalesce(f.driver_code,''))=v_code
    else upper(coalesce(f.rider_code,''))=v_code
  end;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into v_ledger
  from (
    select
      f.delivery_way_id as id,
      f.pickup_id,
      f.delivery_way_id,
      'COD_SETTLEMENT'::text as ledger_type,
      coalesce(f.reported_collected,0)::numeric as amount,
      coalesce(f.settlement_status,'PENDING')::text as status,
      f.created_at
    from public.be_finance_cod_settlements_v48 f
    where case v_role
      when 'driver' then upper(coalesce(f.driver_code,''))=v_code
      else upper(coalesce(f.rider_code,''))=v_code
    end
    order by f.created_at desc nulls last
    limit 100
  ) x;

  return jsonb_build_object(
    'ok',true,
    'identity',v_identity,
    'totals',jsonb_build_object(
      'cod_collected',v_collected,
      'cod_handed_over',v_handed,
      'cod_balance',greatest(v_collected-v_handed,0),
      'completed_jobs',v_completed
    ),
    'ledger',v_ledger
  );
end;
$$;

revoke all on function public.be_rider_wallet_snapshot(jsonb) from public,anon;
grant execute on function public.be_rider_wallet_snapshot(jsonb) to authenticated;

create or replace function public.be_rider_profile_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_uid uuid:=auth.uid();
  v_workforce jsonb:='{}'::jsonb;
  v_profile jsonb:='{}'::jsonb;
  v_mobile jsonb:='{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'AUTHENTICATED_FIELD_SESSION_REQUIRED' using errcode='42501';
  end if;

  select coalesce(to_jsonb(w),'{}'::jsonb)
  into v_workforce
  from public.be_mobile_workforce_accounts w
  where w.auth_user_id=v_uid
  order by w.updated_at desc nulls last
  limit 1;

  select coalesce(to_jsonb(p),'{}'::jsonb)
  into v_profile
  from public.profiles p
  where p.id=v_uid
  limit 1;

  v_mobile:=public.be_field_team_mobile_snapshot_v77('{}'::jsonb);

  return jsonb_build_object(
    'ok',true,
    'identity',v_identity,
    'workforce',v_workforce,
    'profile',v_profile,
    'counts',coalesce(v_mobile->'counts','{}'::jsonb)
  );
end;
$$;

revoke all on function public.be_rider_profile_snapshot() from public,anon;
grant execute on function public.be_rider_profile_snapshot() to authenticated;
