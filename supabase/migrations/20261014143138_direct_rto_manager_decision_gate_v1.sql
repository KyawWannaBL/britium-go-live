create or replace function public.be_decide_direct_rto_request_v1(p_request_id uuid,p_approve boolean,p_note text default null)
returns jsonb language plpgsql security definer set search_path='public','auth','pg_temp' as $$
declare v_role text; v_req public.be_direct_rto_requests_v1%rowtype;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
 v_role:=lower(coalesce(public.be_current_role(),''));
 if v_role not in ('operation_manager','operations_manager','operationmanager') then raise exception 'OPERATION_MANAGER_ONLY'; end if;
 select * into v_req from public.be_direct_rto_requests_v1 where id=p_request_id for update;
 if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
 if v_req.decision<>'PENDING' then raise exception 'REQUEST_ALREADY_DECIDED'; end if;
 if p_approve and not exists(select 1 from public.be_data_entry_parcel_details where delivery_way_id=v_req.delivery_way_id) then raise exception 'WAY_NOT_FOUND'; end if;
 update public.be_direct_rto_requests_v1 set decision=case when p_approve then 'APPROVED' else 'REJECTED' end,
 decided_by=auth.uid(),decided_at=now(),decision_note=p_note where id=p_request_id;
 return jsonb_build_object('ok',true,'request_id',p_request_id,'decision',case when p_approve then 'APPROVED' else 'REJECTED' end,'rto_transition_required',p_approve);
end $$;
revoke all on function public.be_decide_direct_rto_request_v1(uuid,boolean,text) from public,anon;
grant execute on function public.be_decide_direct_rto_request_v1(uuid,boolean,text) to authenticated;