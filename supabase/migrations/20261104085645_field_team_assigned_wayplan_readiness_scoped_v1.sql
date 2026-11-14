create or replace function public.be_field_assigned_wayplan_readiness_v1(p_limit integer default 20)
returns jsonb language plpgsql stable security definer
set search_path to 'public','auth','pg_temp'
as $fn$
declare
 v_identity jsonb;
 v_code text;
 v_role text;
 v_rows jsonb := '[]'::jsonb;
begin
 if auth.uid() is null then
  raise exception 'AUTHENTICATED_FIELD_SESSION_REQUIRED' using errcode='42501';
 end if;
 v_identity:=public.be_current_field_team_identity();
 v_code:=upper(nullif(trim(coalesce(v_identity->>'worker_code','')),''));
 v_role:=lower(coalesce(v_identity->>'role',''));
 if v_code is null or v_role not in ('rider','driver','helper') then
  raise exception 'ASSIGNED_FIELD_TEAM_IDENTITY_REQUIRED' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
 into v_rows
 from (
   select w.wayplan_id,w.wayplan_status,w.created_at,
     w.total_stops,w.dispatched_at,
     r.review_status supervisor_review_status,
     count(s.id)::integer registered_stops,
     count(s.id) filter (where s.warehouse_status='DISPATCH_SCANNED')::integer scanned_stops,
     count(s.id) filter (where s.warehouse_status is distinct from 'DISPATCH_SCANNED')::integer pending_scans,
     coalesce(jsonb_agg(s.delivery_way_id order by s.delivery_way_id)
      filter(where s.id is not null and s.warehouse_status is distinct from 'DISPATCH_SCANNED'),'[]'::jsonb) pending_way_ids,
     case when upper(coalesce(w.wayplan_status,''))='DISPATCHED' then 'RELEASED'
       when coalesce(r.review_status,'')<>'DISPATCH_READY' then 'SUPERVISOR_CONFIRMATION_REQUIRED'
       when count(s.id) filter(where s.warehouse_status is distinct from 'DISPATCH_SCANNED')>0 then 'WAREHOUSE_DISPATCH_SCANS_PENDING'
       when w.dispatched_at is null then 'WAREHOUSE_FINAL_PUBLISH_PENDING'
       else 'RELEASE_PENDING' end readiness_code
   from public.be_wayplan_dispatches w
   left join public.be_wayplan_dispatch_stops s on s.wayplan_id=w.wayplan_id
   left join public.be_wayplan_review_v43 r on r.wayplan_id=w.wayplan_id
   where upper(coalesce(w.wayplan_status,'')) not in ('COMPLETED','CANCELLED','REJECTED')
    and case v_role
      when 'driver' then upper(coalesce(w.driver_code,''))=v_code
      when 'helper' then upper(coalesce(w.helper_code,''))=v_code
      else upper(coalesce(w.rider_code,''))=v_code
    end
   group by w.wayplan_id,w.wayplan_status,w.created_at,w.total_stops,w.dispatched_at,r.review_status
   order by w.created_at desc
   limit least(greatest(coalesce(p_limit,20),1),20)
 ) x;
 return jsonb_build_object('ok',true,
   'identity',jsonb_build_object('worker_code',v_code,'role',v_role),
   'count',jsonb_array_length(v_rows),'wayplans',v_rows,
   'information_only',true,
   'message','Assigned wayplan readiness; no dispatch, scan, or financial mutation.');
end;
$fn$;
revoke all on function public.be_field_assigned_wayplan_readiness_v1(integer) from public,anon;
grant execute on function public.be_field_assigned_wayplan_readiness_v1(integer) to authenticated;