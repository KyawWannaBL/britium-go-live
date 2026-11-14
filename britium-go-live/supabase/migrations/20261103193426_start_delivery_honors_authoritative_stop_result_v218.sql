do $patch$
declare s text;
old_part text := $old$
    v_result:=public.be_field_team_delivery_action(
      p_payload||jsonb_build_object('delivery_way_id',v_way,'wayplan_id',v_wayplan,'operation_id',v_operation)
    );

    update public.be_rider_route_runs_v46
$old$;
new_part text := $new$
    v_result:=public.be_field_team_delivery_action(
      p_payload||jsonb_build_object('delivery_way_id',v_way,'wayplan_id',v_wayplan,'operation_id',v_operation)
    );
    -- Do not advance route progress if the authoritative stop update failed.
    if coalesce((v_result->>'ok')::boolean,false) is distinct from true then
      return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
        'ok',false,'error',coalesce(nullif(v_result->>'error',''),'START_DELIVERY_NOT_ACCEPTED'));
    end if;

    update public.be_rider_route_runs_v46
$new$;
begin
 select pg_get_functiondef(oid) into s from pg_proc where proname='be_field_team_delivery_action_v77';
 if s is null or (length(s)-length(replace(s,old_part,'')))/length(old_part)<>1 then raise exception 'V77_PATCH_GUARD_FAILED';end if;
 execute replace(s,old_part,new_part);
end $patch$;