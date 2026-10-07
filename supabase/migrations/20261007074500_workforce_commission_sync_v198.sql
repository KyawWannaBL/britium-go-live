create or replace function public.be_workforce_commission_sync_v198(p_work_date date default current_date)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $function$
declare
  v_work_date date:=coalesce(p_work_date,current_date);
  v_actor text:=coalesce(lower(auth.jwt()->>'email'),'system');
  v_touched integer:=0;
  v_wallet jsonb;
  v_snapshot jsonb;
begin
  if auth.uid() is null and session_user<>'postgres' then
    raise exception 'Authenticated user is required' using errcode='42501';
  end if;

  update public.be_wayplan_dispatch_stops s
  set stop_status=s.stop_status
  where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED')
    and coalesce(s.delivered_at,s.updated_at,s.created_at)::date=v_work_date;

  get diagnostics v_touched=row_count;

  v_wallet:=public.be_refresh_party_wallets_v1();
  v_snapshot:=public.be_commission_settlement_snapshot(v_work_date,v_actor,false);

  return v_snapshot||jsonb_build_object(
    'sync_build','WORKFORCE_COMMISSION_V198',
    'delivered_stops_synced',v_touched,
    'wallet_refresh',v_wallet
  );
end;
$function$;

revoke all on function public.be_workforce_commission_sync_v198(date) from public,anon;
grant execute on function public.be_workforce_commission_sync_v198(date) to authenticated,service_role;
