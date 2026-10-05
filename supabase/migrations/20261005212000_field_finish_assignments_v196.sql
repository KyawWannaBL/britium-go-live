create or replace function public.be_field_finish_assignments_v196()
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $function$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_code text:=upper(coalesce(v_identity->>'worker_code',''));
  v_role text:=lower(coalesce(v_identity->>'role',''));
  v_closed text[]:='{}'::text[];
  v_blocked jsonb:='[]'::jsonb;
  v_wayplan record;
  v_open_count integer;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATED_FIELD_SESSION_REQUIRED' using errcode='42501';
  end if;
  if v_role not in ('rider','driver','helper') or v_code='' then
    raise exception 'FIELD_WORKFORCE_IDENTITY_REQUIRED' using errcode='42501';
  end if;

  for v_wayplan in
    select d.wayplan_id
    from public.be_wayplan_dispatches d
    where upper(coalesce(d.wayplan_status,'')) in ('DISPATCHED','ON_HOLD')
      and case v_role
        when 'driver' then upper(coalesce(d.driver_code,''))=v_code
        when 'helper' then upper(coalesce(d.helper_code,''))=v_code
        else upper(coalesce(d.rider_code,''))=v_code
      end
  loop
    select count(*) into v_open_count
    from public.be_wayplan_dispatch_stops s
    where s.wayplan_id=v_wayplan.wayplan_id
      and upper(coalesce(s.stop_status,s.rider_status,'')) not in (
        'DELIVERED','COMPLETED','FAILED_DELIVERY','DELIVERY_FAILED',
        'ATTEMPTED_FAILED','RETURN_TO_WAREHOUSE','RTO','CANCELLED'
      );

    if v_open_count=0 then
      update public.be_wayplan_dispatches
      set wayplan_status='COMPLETED',
          completed_at=coalesce(completed_at,now()),
          updated_at=now(),
          metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
            'assignment_finished_by',v_code,
            'assignment_finished_role',v_role,
            'assignment_finished_at',now(),
            'assignment_finish_source','RIDER_APP_V196'
          )
      where wayplan_id=v_wayplan.wayplan_id;

      update public.be_wayplan_membership_v40
      set membership_status=case
            when upper(coalesce(membership_status,'')) in ('DISPATCHED','READY_FOR_DISPATCH','PLANNED') then 'COMPLETED'
            else membership_status
          end,
          updated_at=now()
      where wayplan_id=v_wayplan.wayplan_id;

      v_closed:=array_append(v_closed,v_wayplan.wayplan_id);
    else
      v_blocked:=v_blocked||jsonb_build_array(
        jsonb_build_object('wayplan_id',v_wayplan.wayplan_id,'open_stops',v_open_count)
      );
    end if;
  end loop;

  update public.be_mobile_workforce_accounts
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'assignment_availability',case when jsonb_array_length(v_blocked)=0 then 'AVAILABLE' else 'BUSY' end,
        'assignment_finish_source','RIDER_APP_V196'
      ),
      updated_at=now()
  where auth_user_id=auth.uid();

  return jsonb_build_object(
    'ok',jsonb_array_length(v_blocked)=0,
    'worker_code',v_code,
    'role',v_role,
    'availability',case when jsonb_array_length(v_blocked)=0 then 'AVAILABLE' else 'BUSY' end,
    'closed_wayplans',to_jsonb(v_closed),
    'closed_count',cardinality(v_closed),
    'blocked_wayplans',v_blocked
  );
end;
$function$;

revoke all on function public.be_field_finish_assignments_v196() from public,anon;
grant execute on function public.be_field_finish_assignments_v196() to authenticated,service_role;
