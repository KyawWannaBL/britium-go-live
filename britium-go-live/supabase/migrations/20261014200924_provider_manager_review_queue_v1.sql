create or replace function public.be_review_provider_change_requests_v1()
returns jsonb language plpgsql stable security definer set search_path='public','auth','pg_temp' as $body$
declare v_role text;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 v_role:=lower(coalesce(public.be_current_role(),''));
 if v_role not in ('superadmin','operation_manager','operations_manager','operation_supervisor') then raise exception 'REVIEW_ROLE_REQUIRED'; end if;
 return jsonb_build_object('ok',true,'requests',coalesce((select jsonb_agg(jsonb_build_object('id',id,'way_id',delivery_way_id,'automatic_provider',automatic_provider_code,'requested_provider',requested_provider_code,'reason',reason,'requested_at',requested_at) order by requested_at) from public.be_parcel_provider_change_requests_v1 where status='PENDING_REVIEW'),'[]'::jsonb));
end $body$;
revoke execute on function public.be_review_provider_change_requests_v1() from public,anon;
grant execute on function public.be_review_provider_change_requests_v1() to authenticated;