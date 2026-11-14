create or replace function public.be_operation_manager_direct_rto_queue_v1()
returns jsonb language plpgsql stable security definer set search_path='public','auth','pg_temp' as $$
declare v_role text;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 v_role:=lower(coalesce(public.be_current_role(),''));
 if v_role not in ('operation_manager','operations_manager','operationmanager') then raise exception 'OPERATION_MANAGER_ONLY'; end if;
 return jsonb_build_object('ok',true,'requests',coalesce((select jsonb_agg(jsonb_build_object(
 'id',r.id,'delivery_way_id',r.delivery_way_id,'reason_code',r.reason_code,
 'evidence_note',r.evidence_note,'evidence_url',r.evidence_url,
 'requested_at',r.requested_at,'decision',r.decision
 ) order by r.requested_at) from public.be_direct_rto_requests_v1 r where r.decision='PENDING'),'[]'::jsonb));
end $$;
revoke all on function public.be_operation_manager_direct_rto_queue_v1() from public,anon;
grant execute on function public.be_operation_manager_direct_rto_queue_v1() to authenticated;