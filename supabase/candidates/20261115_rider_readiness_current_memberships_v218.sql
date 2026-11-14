-- Do not show historical ON_HOLD or COMPLETED memberships as today's field assignments.
BEGIN;
CREATE OR REPLACE FUNCTION public.be_field_assigned_wayplan_readiness_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
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
    and exists (
      select 1 from public.be_wayplan_membership_v40 m
      where m.wayplan_id=s.wayplan_id
        and m.delivery_way_id=s.delivery_way_id
        and m.membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED')
        and public.be_delivery_schedule_allows_wayplan_v71(s.delivery_way_id)
    )
  where (case v_role
   when 'rider' then upper(coalesce(w.rider_code,''))=v_code
   when 'driver' then upper(coalesce(w.driver_code,''))=v_code
   when 'helper' then upper(coalesce(w.helper_code,''))=v_code
   else false end)
  and upper(coalesce(w.wayplan_status,'')) not in ('COMPLETED','CANCELLED','REJECTED')
  and w.created_at>=now()-interval '14 days'
  group by w.wayplan_id,w.created_at,w.wayplan_status,w.rider_code,w.driver_code,w.helper_code,rv.review_status
  having count(s.id)>0
  order by w.created_at desc limit 30
 ) p;
 return jsonb_build_object('ok',true,'identity_role',v_role,'worker_code',v_code,
   'rows',v_rows,'count',jsonb_array_length(v_rows),
   'instruction','Pending wayplans are visible for tracking only. Warehouse scanning and authorized publish are required before delivery actions.');
end $function$
;

CREATE OR REPLACE FUNCTION public.be_field_assigned_wayplan_readiness_v1(p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
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
    and exists (
      select 1 from public.be_wayplan_membership_v40 m
      where m.wayplan_id=s.wayplan_id
        and m.delivery_way_id=s.delivery_way_id
        and m.membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED')
        and public.be_delivery_schedule_allows_wayplan_v71(s.delivery_way_id)
    )
   left join public.be_wayplan_review_v43 r on r.wayplan_id=w.wayplan_id
   where upper(coalesce(w.wayplan_status,'')) not in ('COMPLETED','CANCELLED','REJECTED')
    and case v_role
      when 'driver' then upper(coalesce(w.driver_code,''))=v_code
      when 'helper' then upper(coalesce(w.helper_code,''))=v_code
      else upper(coalesce(w.rider_code,''))=v_code
    end
   group by w.wayplan_id,w.wayplan_status,w.created_at,w.total_stops,w.dispatched_at,r.review_status
  having count(s.id)>0
   order by w.created_at desc
   limit least(greatest(coalesce(p_limit,20),1),20)
 ) x;
 return jsonb_build_object('ok',true,
   'identity',jsonb_build_object('worker_code',v_code,'role',v_role),
   'count',jsonb_array_length(v_rows),'wayplans',v_rows,
   'information_only',true,
   'message','Assigned wayplan readiness; no dispatch, scan, or financial mutation.');
end;
$function$
;

COMMIT;
