
create or replace function public.be_field_assigned_wayplan_readiness_v1()
returns jsonb
language plpgsql stable security definer
set search_path=public,auth,pg_temp
as $fn$
declare
 v_identity jsonb;
 v_code text;
 v_role text;
 v_rows jsonb;
begin
 if auth.uid() is null then
  raise exception 'AUTHENTICATED_FIELD_SESSION_REQUIRED' using errcode='42501';
 end if;
 v_identity:=public.be_current_field_team_identity();
 v_code:=upper(btrim(coalesce(v_identity->>'worker_code','')));
 v_role:=lower(btrim(coalesce(v_identity->>'role','')));
 if v_code='' or v_role not in ('rider','driver','helper') then
  return jsonb_build_object('ok',true,'rows','[]'::jsonb,'count',0,'identity_role',v_role);
 end if;
 select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc),'[]'::jsonb) into v_rows
 from (
  select w.wayplan_id,w.created_at,w.wayplan_status,w.rider_code,w.driver_code,w.helper_code,
   coalesce(rv.review_status,'NOT_SUBMITTED') supervisor_review_status,
   count(s.id)::integer total_stops,
   count(s.id) filter (where exists (
     select 1 from public.be_dispatch_scans_v39 ds
     where upper(ds.delivery_way_id)=upper(s.delivery_way_id)
       and ds.wayplan_code=w.wayplan_id and ds.scan_status='SCANNED'
   ))::integer dispatch_scanned_count,
   coalesce(jsonb_agg(s.delivery_way_id order by s.stop_sequence) filter (where s.id is not null and not exists (
     select 1 from public.be_dispatch_scans_v39 ds
     where upper(ds.delivery_way_id)=upper(s.delivery_way_id)
       and ds.wayplan_code=w.wayplan_id and ds.scan_status='SCANNED'
   )),'[]'::jsonb) missing_dispatch_way_ids,
   case
    when upper(coalesce(w.wayplan_status,''))='DISPATCHED' then 'READY_FOR_DELIVERY'
    when coalesce(rv.review_status,'')<>'DISPATCH_READY' then 'SUPERVISOR_REVIEW_REQUIRED'
    when count(s.id)=0 then 'NO_WAYPLAN_STOPS'
    when count(s.id) filter (where exists (
     select 1 from public.be_dispatch_scans_v39 ds where upper(ds.delivery_way_id)=upper(s.delivery_way_id)
      and ds.wayplan_code=w.wayplan_id and ds.scan_status='SCANNED'
    ))<count(s.id) then 'WAREHOUSE_DISPATCH_SCANS_REQUIRED'
    else 'AUTHORIZED_DISPATCH_PUBLISH_REQUIRED'
   end readiness_status
  from public.be_wayplan_dispatches w
  left join public.be_wayplan_review_v43 rv on rv.wayplan_id=w.wayplan_id
  left join public.be_wayplan_dispatch_stops s on s.wayplan_id=w.wayplan_id
  where (case v_role
   when 'rider' then upper(coalesce(w.rider_code,''))=v_code
   when 'driver' then upper(coalesce(w.driver_code,''))=v_code
   when 'helper' then upper(coalesce(w.helper_code,''))=v_code
   else false end)
  and upper(coalesce(w.wayplan_status,'')) not in ('COMPLETED','CANCELLED','REJECTED')
  and w.created_at>=now()-interval '14 days'
  group by w.wayplan_id,w.created_at,w.wayplan_status,w.rider_code,w.driver_code,w.helper_code,rv.review_status
  order by w.created_at desc limit 30
 ) p;
 return jsonb_build_object('ok',true,'identity_role',v_role,'worker_code',v_code,
   'rows',v_rows,'count',jsonb_array_length(v_rows),
   'instruction','Pending wayplans are visible for tracking only. Warehouse scanning and authorized publish are required before delivery actions.');
end $fn$;
revoke all on function public.be_field_assigned_wayplan_readiness_v1() from public,anon;
grant execute on function public.be_field_assigned_wayplan_readiness_v1() to authenticated;
