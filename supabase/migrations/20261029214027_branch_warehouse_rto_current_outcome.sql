create or replace function public.be_branch_warehouse_rto_confirmed_v1(p_way text)
returns boolean language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare outcome text;
begin
 if not public.be_branch_warehouse_visible_v1(p_way) then return false;end if;
 select x.status into outcome from (
  select upper(last_status) as status,updated_at as event_at,1 as priority from be_delivery_attempt_state_v39 where delivery_way_id=p_way
  union all select upper(delivery_status),updated_at,2 from be_dispatch_job_assignments where tracking_no=p_way
  union all select upper(coalesce(nullif(rider_status,''),nullif(stop_status,''),nullif(dispatch_status,''))),coalesce(updated_at,created_at),3 from be_wayplan_dispatch_stops where delivery_way_id=p_way
 ) x where nullif(x.status,'') is not null order by x.event_at desc nulls last,x.priority limit 1;
 return coalesce(outcome in('RTO','RETURN_TO_SENDER'),false);
end $$;
revoke all on function public.be_branch_warehouse_rto_confirmed_v1(text) from public,anon,authenticated;
