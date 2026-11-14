create or replace function public.be_reject_provider_change_request_v1(p_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='public','auth','pg_temp' as $f$
declare v_role text; v_count integer;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 v_role:=lower(coalesce(public.be_current_role(),''));
 if v_role not in ('superadmin','operation_manager','operations_manager','operation_supervisor') then raise exception 'MANAGER_REQUIRED'; end if;
 if length(btrim(coalesce(p_note,''))) < 10 then raise exception 'REASON_REQUIRED'; end if;
 update public.be_parcel_provider_change_requests_v1
 set status='REJECTED',reviewed_by=auth.uid(),reviewed_at=now(),review_note=btrim(p_note)
 where id=p_id and status='PENDING_REVIEW';
 get diagnostics v_count=row_count;
 if v_count <> 1 then raise exception 'REQUEST_NOT_PENDING'; end if;
 return jsonb_build_object('ok',true,'status','REJECTED','request_id',p_id);
end $f$;
revoke execute on function public.be_reject_provider_change_request_v1(uuid,text) from public,anon;
grant execute on function public.be_reject_provider_change_request_v1(uuid,text) to authenticated;