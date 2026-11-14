
create or replace function public.be_rider_delivery_stop_status_v217(
  p_wayplan_id text,
  p_delivery_way_id text
) returns jsonb
language plpgsql stable security definer
set search_path = public,auth,pg_temp
as $fn$
declare
  v_identity jsonb;
  v_role text;
  v_code text;
  v_stop public.be_wayplan_dispatch_stops%rowtype;
  v_wayplan public.be_wayplan_dispatches%rowtype;
  v_member public.be_wayplan_membership_v40%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATED_FIELD_SESSION_REQUIRED' using errcode='42501';
  end if;
  if nullif(btrim(p_wayplan_id),'') is null
    or nullif(btrim(p_delivery_way_id),'') is null then
    raise exception 'WAYPLAN_AND_WAY_REQUIRED';
  end if;
  v_identity := public.be_current_field_team_identity();
  v_role := lower(coalesce(v_identity->>'role',''));
  v_code := upper(coalesce(v_identity->>'worker_code',''));
  if v_code='' or v_role not in ('rider','driver','helper') then
    raise exception 'ASSIGNED_FIELD_WORKER_REQUIRED' using errcode='42501';
  end if;
  select * into v_stop
  from public.be_wayplan_dispatch_stops s
  where s.wayplan_id=p_wayplan_id
    and upper(s.delivery_way_id)=upper(trim(p_delivery_way_id))
  limit 1;
  if not found then
    return jsonb_build_object('ok',false,'error','DELIVERY_STOP_NOT_FOUND');
  end if;
  select * into v_wayplan from public.be_wayplan_dispatches w
  where w.wayplan_id=v_stop.wayplan_id limit 1;
  select * into v_member from public.be_wayplan_membership_v40 m
  where m.wayplan_id=v_stop.wayplan_id
    and m.delivery_way_id=v_stop.delivery_way_id
  order by m.updated_at desc nulls last limit 1;
  if not (
    (v_role='rider' and upper(coalesce(v_member.rider_code,v_wayplan.rider_code,v_stop.rider_code,''))=v_code)
    or (v_role='driver' and upper(coalesce(v_member.driver_code,v_wayplan.driver_code,''))=v_code)
    or (v_role='helper' and upper(coalesce(v_member.helper_code,v_wayplan.helper_code,''))=v_code)
  ) then
    raise exception 'NOT_ASSIGNED_TO_THIS_WAYPLAN_STOP' using errcode='42501';
  end if;
  return jsonb_build_object(
    'ok',true,'wayplan_id',v_stop.wayplan_id,'delivery_way_id',v_stop.delivery_way_id,
    'stop_status',v_stop.stop_status,'rider_status',v_stop.rider_status,
    'updated_at',v_stop.updated_at,
    'proof_url_present',coalesce(nullif(v_stop.rider_proof_url,''),nullif(v_stop.proof_url,'')) is not null,
    'delivery_completed',upper(coalesce(v_stop.stop_status,'')) in ('DELIVERED','COMPLETED'),
    'source','be_wayplan_dispatch_stops');
end
$fn$;
revoke all on function public.be_rider_delivery_stop_status_v217(text,text) from public,anon;
grant execute on function public.be_rider_delivery_stop_status_v217(text,text) to authenticated;
